/**
 * Orquestación canónica de OpenTimestamps: stamp / upgrade / verify sobre el core canónico,
 * el CalendarClient (protocolo OTS real) y el EsploraClient. Fail-closed en todo.
 */
import {
  Timestamp,
  DetachedTimestampFile,
  OpSHA256,
  OpAppend,
  makeMerkleTree,
} from '@otskit/core'
import { ResilientNetworkLayer } from '../network/resilience.js'
import { CalendarClient, DEFAULT_CALENDAR_WHITELIST } from '../network/calendar.js'
import { EsploraClient, verifyTimestampAttestation } from '../network/esplora.js'
import { ValidationError, StampError, UpgradeError, CommitmentNotFoundError } from '../errors.js'
import { Logger, VerificationResult } from '../types.js'

/** Valida un hash SHA-256 y lo devuelve como Uint8Array de 32 bytes. */
function validateHash(hash: Buffer | string): Uint8Array {
  if (typeof hash === 'string') {
    const hex = hash.trim().toLowerCase()
    if (!/^[0-9a-f]{64}$/.test(hex)) {
      throw new ValidationError('Hash must be a 64-character hex string (SHA-256)')
    }
    return Uint8Array.from(Buffer.from(hex, 'hex'))
  }
  if (hash.length !== 32) {
    throw new ValidationError('Hash must be exactly 32 bytes (SHA-256)')
  }
  return Uint8Array.from(hash)
}

/** Nonce criptográficamente seguro (sin fallback a Math.random). */
function secureNonce(n: number): Uint8Array {
  const bytes = new Uint8Array(n)
  /* c8 ignore start */
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error('secure RNG unavailable: globalThis.crypto.getRandomValues is required')
  }
  /* c8 ignore stop */
  globalThis.crypto.getRandomValues(bytes)
  return bytes
}

const bytesEq = (a: Uint8Array, b: Uint8Array): boolean =>
  Buffer.compare(Buffer.from(a), Buffer.from(b)) === 0

/** Valida que una URL sea http(s) bien formada (fail-closed en la frontera). */
function assertHttpUrl(url: string, label: string): void {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new ValidationError(`${label} is not a valid URL: ${url}`)
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new ValidationError(`${label} must use http(s): ${url}`)
  }
}

/**
 * stamp: construye el árbol (digest → append(nonce) → SHA256 → merkle root), lo envía a los
 * calendarios y fusiona las respuestas. Exige ≥ M éxitos. Devuelve el `.ots` canónico.
 */
export async function orchestrateStamp(
  hash: Buffer | string,
  calendars: string[],
  networkLayer: ResilientNetworkLayer,
  logger?: Logger,
  signal?: AbortSignal,
  minimumSuccessfulSubmissions = 2
): Promise<Buffer> {
  if (calendars.length === 0) {
    throw new ValidationError('at least one calendar is required to stamp')
  }
  if (!Number.isInteger(minimumSuccessfulSubmissions) || minimumSuccessfulSubmissions < 1) {
    throw new ValidationError('minimumSuccessfulSubmissions must be an integer >= 1')
  }
  if (minimumSuccessfulSubmissions > calendars.length) {
    throw new ValidationError(
      `minimumSuccessfulSubmissions (${minimumSuccessfulSubmissions}) cannot exceed the number of calendars (${calendars.length})`
    )
  }
  for (const url of calendars) assertHttpUrl(url, 'calendar')

  const digest = validateHash(hash)
  logger?.info(`Starting stamp for ${Buffer.from(digest).toString('hex')}`)

  const detached = DetachedTimestampFile.fromHash(new OpSHA256(), digest)
  const nonceAppended = detached.timestamp.add(new OpAppend(secureNonce(16)))
  const merkleRoot = nonceAppended.add(new OpSHA256())
  const merkleTip = makeMerkleTree([merkleRoot])

  const results = await Promise.allSettled(
    calendars.map((url) => new CalendarClient(url, networkLayer, logger).submit(merkleTip.getDigest(), signal))
  )

  const successful: Array<{ calendar: string }> = []
  const failed: Array<{ calendar: string; error: Error }> = []
  results.forEach((r, i) => {
    const calendar = calendars[i]!
    if (r.status === 'fulfilled') {
      merkleTip.merge(r.value)
      successful.push({ calendar })
      logger?.info(`Submitted to ${calendar}`)
    } else {
      /* v8 ignore next */
      const error = r.reason instanceof Error ? r.reason : new Error(String(r.reason))
      failed.push({ calendar, error })
      logger?.warn(`Failed to submit to ${calendar}: ${error.message}`)
    }
  })

  if (successful.length < minimumSuccessfulSubmissions) {
    throw new StampError(
      `Insufficient successful submissions (${successful.length}/${minimumSuccessfulSubmissions} required)`,
      successful,
      failed
    )
  }

  return Buffer.from(detached.serializeToBytes())
}

/**
 * upgrade: consulta los calendarios de las attestations pending (validadas contra la whitelist),
 * fusiona los Timestamp devueltos y devuelve la prueba. Lanza UpgradeError si nada cambió y la
 * prueba no estaba ya completa. Sin softFail.
 */
export async function orchestrateUpgrade(
  incompleteProof: Buffer,
  _calendars: string[],
  networkLayer: ResilientNetworkLayer,
  logger?: Logger,
  signal?: AbortSignal
): Promise<Buffer> {
  let detached: DetachedTimestampFile
  try {
    detached = DetachedTimestampFile.deserialize(new Uint8Array(incompleteProof))
  } catch (error) {
    throw new ValidationError('Invalid .ots proof format', {
      /* v8 ignore next */
      cause: error instanceof Error ? error : undefined,
    })
  }

  if (detached.timestamp.isTimestampComplete()) {
    logger?.info('Proof already complete; nothing to upgrade')
    return Buffer.from(incompleteProof)
  }

  const before = detached.serializeToBytes()

  for (const subStamp of detached.timestamp.directlyVerified()) {
    /* v8 ignore next */
    if (subStamp.isTimestampComplete()) continue
    for (const att of subStamp.attestations) {
      if (att.kind !== 'pending') continue
      if (!DEFAULT_CALENDAR_WHITELIST.contains(att.uri)) {
        logger?.warn(`Ignoring attestation from non-whitelisted calendar ${att.uri}`)
        continue
      }
      try {
        const upgraded = await new CalendarClient(att.uri, networkLayer, logger).getTimestamp(
          subStamp.getDigest(),
          signal
        )
        subStamp.merge(upgraded)
      } catch (err) {
        if (err instanceof CommitmentNotFoundError) {
          logger?.debug(`Calendar ${att.uri} has not confirmed yet`)
          continue
        }
        /* v8 ignore next */
        logger?.warn(`Failed to query ${att.uri}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
  }

  const after = detached.serializeToBytes()
  if (bytesEq(before, after)) {
    throw new UpgradeError('No calendar has confirmed the timestamp yet (Bitcoin not yet mined)')
  }
  return Buffer.from(after)
}

/**
 * verify: localiza la attestation Bitcoin y la verifica en cadena (Esplora). Fail-closed:
 * cualquier fallo de red o de verificación devuelve { valid: false }.
 */
export async function orchestrateVerify(
  proof: Buffer,
  networkLayer: ResilientNetworkLayer,
  originalDataHash?: Buffer | string,
  logger?: Logger,
  signal?: AbortSignal
): Promise<VerificationResult> {
  let detached: DetachedTimestampFile
  try {
    detached = DetachedTimestampFile.deserialize(new Uint8Array(proof))
  } catch {
    return { valid: false, error: 'Invalid .ots proof format' }
  }

  if (originalDataHash !== undefined) {
    let expected: Uint8Array
    try {
      expected = validateHash(originalDataHash)
    } catch (err) {
      /* v8 ignore next */
      return { valid: false, error: err instanceof Error ? err.message : 'Invalid hash format' }
    }
    if (!bytesEq(expected, detached.fileDigest())) {
      return { valid: false, error: 'File hash does not match proof' }
    }
  }

  const bitcoinAtts = detached.timestamp
    .allAttestations()
    .filter(({ attestation }) => attestation.kind === 'bitcoin')

  if (bitcoinAtts.length === 0) {
    const hasLitecoin = detached.timestamp.allAttestations().some(({ attestation }) => attestation.kind === 'litecoin')
    if (hasLitecoin) {
      return { valid: false, error: 'Litecoin verification is not supported by this client' }
    }
    return { valid: false, error: 'No Bitcoin attestation found (timestamp not yet confirmed)' }
  }

  const explorer = new EsploraClient(networkLayer)
  let lastError = ''
  // Probar TODAS las attestations Bitcoin: válido si CUALQUIERA verifica (una prueba mala
  // —p.ej. un bloque huérfano— no debe invalidar otra correcta). El merkleroot de Bitcoin
  // es big-endian, así que invertimos el digest del árbol antes de verificar.
  for (const { msg, attestation } of bitcoinAtts) {
    /* v8 ignore next */
    if (attestation.kind !== 'bitcoin') continue // narrowing (siempre cierto tras el filter)
    try {
      const time = await verifyTimestampAttestation(Uint8Array.from(msg).reverse(), attestation, explorer, signal)
      logger?.info(`Verified against Bitcoin block ${attestation.height}`)
      return { valid: true, blockHeight: attestation.height, timestamp: time }
    } catch (err) {
      /* v8 ignore next */
      lastError = err instanceof Error ? err.message : String(err)
      logger?.warn(`Bitcoin attestation at height ${attestation.height} failed: ${lastError}`)
    }
  }
  return { valid: false, error: `Could not verify against the Bitcoin blockchain: ${lastError}` }
}
