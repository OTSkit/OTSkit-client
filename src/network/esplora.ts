/**
 * Cliente del explorador Esplora/Blockstream para verificación en cadena.
 */
import { verifyAgainstBlockheader, VerificationError } from '@otskit/core'
import type { Attestation, BlockHeader } from '@otskit/core'
import { ResilientNetworkLayer } from './resilience.js'
import { Logger } from '../types.js'
import { EsploraResponseError, ValidationError } from '../errors.js'

/** Explorador Esplora público por defecto (Bitcoin mainnet). */
export const PUBLIC_ESPLORA_URL = 'https://blockstream.info/api'

/** Límite de tamaño de una respuesta de Esplora (defensa DoS). Una cabecera JSON ronda los cientos de bytes. */
export const MAX_ESPLORA_RESPONSE_SIZE = 100_000

/** Hash de bloque / merkleroot: hex de 64 caracteres. */
const HEX64_RE = /^[0-9a-f]{64}$/i

export interface EsploraClientOptions {
  /** URL base del explorador (por defecto Blockstream). Útil para apuntar a un Esplora de Litecoin. */
  url?: string
  logger?: Logger
}

/** Cliente de un explorador Esplora remoto. */
export class EsploraClient {
  readonly #url: string
  readonly #networkLayer: ResilientNetworkLayer
  readonly #logger?: Logger

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

  /** Devuelve el hash (hex 64, minúsculas) del bloque a la altura dada. */
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

  /** Devuelve la cabecera del bloque (merkleroot + time) dado su hash. */
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
        cause: err instanceof Error ? err : undefined,
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

  /** Decodifica el cuerpo a texto aplicando el límite de tamaño (fail-closed). */
  #decode(data: Uint8Array): string {
    if (data.length > MAX_ESPLORA_RESPONSE_SIZE) {
      throw new EsploraResponseError(
        `esplora response of ${data.length} bytes exceeds limit ${MAX_ESPLORA_RESPONSE_SIZE}`,
      )
    }
    // fatal:true — la API de Esplora es ASCII puro; bytes no-UTF-8 indican
    // respuesta corrupta o servidor comprometido. Fail-closed explícito.
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(data)
    } catch (cause) {
      throw new EsploraResponseError('esplora response contains invalid UTF-8 bytes', {
        cause: cause instanceof Error ? cause : undefined,
      })
    }
  }
}

/**
 * Verifica una atestación Bitcoin/Litecoin contra la cabecera del bloque correspondiente.
 *
 * `digest` es el commitment final del árbol del timestamp en el punto de la atestación
 * (32 bytes, debe ser el merkleroot del bloque). `explorer` debe apuntar a la cadena de la
 * atestación (Blockstream para Bitcoin; un Esplora de Litecoin para Litecoin). Devuelve el
 * tiempo del bloque (epoch s) en éxito; lanza `VerificationError` si no coincide o si la
 * atestación no es verificable en cadena (`pending`/`unknown`). Fail-closed.
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
  const header = await explorer.block(hash, signal)
  return verifyAgainstBlockheader(digest, header)
}
