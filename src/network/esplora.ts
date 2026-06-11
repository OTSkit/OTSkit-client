/**
 * Esplora/Blockstream explorer client for on-chain verification.
 */
import { createHash } from 'node:crypto'
import { verifyAgainstRawHeader, VerificationError } from '@otskit/core'
import type { Attestation, BlockHeader } from '@otskit/core'
import { ResilientNetworkLayer } from './resilience.js'
import { Logger } from '../types.js'
import { EsploraResponseError, ValidationError } from '../errors.js'

/** Default public Esplora explorer (Bitcoin mainnet). */
export const PUBLIC_ESPLORA_URL = 'https://blockstream.info/api'

/** Maximum size of an Esplora response (DoS defense). A JSON block header is a few hundred bytes. */
export const MAX_ESPLORA_RESPONSE_SIZE = 100_000

/** Raw Bitcoin block header is always exactly 80 bytes. */
const RAW_HEADER_SIZE = 80

/** Block hash / merkle root: 64-character hex string. */
const HEX64_RE = /^[0-9a-f]{64}$/i

export interface EsploraClientOptions {
  /** Base URL of the explorer (defaults to Blockstream). Useful for pointing to a Litecoin Esplora. */
  url?: string
  logger?: Logger
}

/**
 * sha256d in Bitcoin display format: sha256(sha256(data)) reversed as lowercase hex.
 * Used to self-authenticate a raw block header against its block hash.
 */
function sha256dDisplayHex(data: Uint8Array): string {
  const first = createHash('sha256').update(data).digest()
  const second = createHash('sha256').update(first).digest()
  return Buffer.from(second).reverse().toString('hex')
}

/** Client for a remote Esplora explorer. */
export class EsploraClient {
  readonly #url: string
  readonly #networkLayer: ResilientNetworkLayer
  readonly #logger: Logger | undefined

  constructor(networkLayer: ResilientNetworkLayer, options: EsploraClientOptions = {}) {
    const raw = options.url ?? PUBLIC_ESPLORA_URL
    let parsed: URL
    try {
      parsed = new URL(raw)
    } catch {
      throw new ValidationError(`invalid Esplora URL: ${raw}`)
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new ValidationError(`Esplora URL must use http(s): ${raw}`)
    }
    this.#networkLayer = networkLayer
    this.#url = raw.replace(/\/+$/, '')
    this.#logger = options.logger
  }

  /** Returns the block hash (64-char hex, lowercase) at the given height. */
  async blockHash(height: number, signal?: AbortSignal): Promise<string> {
    if (!Number.isSafeInteger(height) || height < 0) {
      throw new ValidationError(`block height must be a non-negative safe integer; got ${height}`)
    }
    this.#logger?.debug(`Esplora block-height ${height}`)
    const response = await this.#networkLayer.request(
      this.#url,
      { url: `${this.#url}/block-height/${height}`, method: 'GET', headers: { Accept: 'text/plain' } },
      signal,
    )
    const text = this.#decode(response.data).trim()
    if (!HEX64_RE.test(text)) {
      throw new EsploraResponseError(`esplora returned an invalid block hash for height ${height}`)
    }
    return text.toLowerCase()
  }

  /** Returns the block header (merkle root + timestamp) for the given hash. */
  async block(hash: string, signal?: AbortSignal): Promise<BlockHeader> {
    if (typeof hash !== 'string' || !HEX64_RE.test(hash)) {
      throw new ValidationError('block hash must be a 64-char hex string')
    }
    this.#logger?.debug(`Esplora block ${hash}`)
    const response = await this.#networkLayer.request(
      this.#url,
      { url: `${this.#url}/block/${hash}`, method: 'GET', headers: { Accept: 'application/json' } },
      signal,
    )
    const text = this.#decode(response.data)
    let body: unknown
    try {
      body = JSON.parse(text)
    } catch (err) {
      throw new EsploraResponseError('esplora returned a non-JSON block response', {
        /* v8 ignore next */
        ...(err instanceof Error ? { cause: err } : {}),
      })
    }
    if (typeof body !== 'object' || body === null) {
      throw new EsploraResponseError('esplora block response is not an object')
    }
    const { merkle_root: merkleroot, timestamp: time } = body as Record<string, unknown>
    if (typeof merkleroot !== 'string' || !HEX64_RE.test(merkleroot)) {
      throw new EsploraResponseError('esplora block merkle_root is not a 64-char hex string')
    }
    if (typeof time !== 'number' || !Number.isInteger(time) || time <= 0) {
      throw new EsploraResponseError('esplora block timestamp is not a positive integer')
    }
    return { merkleroot, time }
  }

  /**
   * Fetches the raw 80-byte block header for `hash` and self-authenticates it:
   * sha256d(rawHeader) reversed must equal `hash`. This removes trust in the explorer's
   * JSON layer — the raw header is cryptographically bound to the block hash we requested.
   */
  async rawBlockHeader(hash: string, signal?: AbortSignal): Promise<Uint8Array> {
    if (typeof hash !== 'string' || !HEX64_RE.test(hash)) {
      throw new ValidationError('block hash must be a 64-char hex string')
    }
    this.#logger?.debug(`Esplora raw header ${hash}`)
    const response = await this.#networkLayer.request(
      this.#url,
      { url: `${this.#url}/block/${hash}/header`, method: 'GET', headers: { Accept: 'application/octet-stream' } },
      signal,
    )
    const data = response.data
    if (data.length !== RAW_HEADER_SIZE) {
      throw new EsploraResponseError(
        `raw block header must be ${RAW_HEADER_SIZE} bytes; got ${data.length}`,
      )
    }
    // Self-authenticate: sha256d(rawHeader) reversed == display block hash.
    const actualHash = sha256dDisplayHex(data)
    if (actualHash !== hash.toLowerCase()) {
      throw new EsploraResponseError(
        `raw block header hash mismatch: expected ${hash.toLowerCase()}, got ${actualHash}`,
      )
    }
    return data
  }

  /** Decodes the response body as text, enforcing the size limit (fail-closed). */
  #decode(data: Uint8Array): string {
    if (data.length > MAX_ESPLORA_RESPONSE_SIZE) {
      throw new EsploraResponseError(
        `esplora response of ${data.length} bytes exceeds limit ${MAX_ESPLORA_RESPONSE_SIZE}`,
      )
    }
    // fatal: true — the Esplora API is pure ASCII; non-UTF-8 bytes indicate a corrupted
    // or compromised response. Explicit fail-closed behavior.
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(data)
    } catch (cause) {
      throw new EsploraResponseError('esplora response contains invalid UTF-8 bytes', {
        ...(cause instanceof Error ? { cause } : {}),
      })
    }
  }
}

/**
 * Verifies a Bitcoin/Litecoin attestation against the corresponding block header.
 *
 * `digest` is the final tree commitment at the attestation point (32 bytes, must equal the
 * block's merkle root). `explorer` must point to the correct chain (Blockstream for Bitcoin;
 * a Litecoin Esplora for Litecoin). Returns the block time (epoch seconds) on success;
 * throws `VerificationError` if the digest does not match or the attestation is not
 * on-chain verifiable (`pending`/`unknown`). Fail-closed.
 */
export async function verifyTimestampAttestation(
  digest: Uint8Array,
  attestation: Attestation,
  explorer: EsploraClient,
  signal?: AbortSignal,
): Promise<number> {
  if (attestation.kind !== 'bitcoin' && attestation.kind !== 'litecoin') {
    throw new VerificationError(`cannot verify a '${attestation.kind}' attestation against the chain`)
  }
  const hash = await explorer.blockHash(attestation.height, signal)
  // Raw 80-byte header is self-authenticating: sha256d(header) == block hash.
  // This removes reliance on the explorer's JSON parsing of merkle_root.
  const rawHeader = await explorer.rawBlockHeader(hash, signal)
  return verifyAgainstRawHeader(digest, rawHeader)
}
