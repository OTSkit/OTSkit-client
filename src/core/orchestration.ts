/**
 * Canonical OpenTimestamps orchestration: stamp / upgrade / verify on top of the canonical
 * core, the CalendarClient (real OTS protocol), and the EsploraClient. Fail-closed throughout.
 */
import {
  DetachedTimestampFile,
  OpSHA256,
  OpAppend,
  OpSHA1,
  OpRIPEMD160,
  makeMerkleTree,
} from '@otskit/core'
import { ResilientNetworkLayer } from '../network/resilience.js'
import { CalendarClient, DEFAULT_CALENDAR_WHITELIST } from '../network/calendar.js'
import { EsploraClient, verifyTimestampAttestation } from '../network/esplora.js'
import { timingSafeEqual } from 'node:crypto'
import { ValidationError, StampError, UpgradeError, CommitmentNotFoundError, NetworkError, EsploraResponseError } from '../errors.js'
import { Logger, VerificationResult } from '../types.js'
import { assertSafeCalendarUrl } from '../security/ssrf.js'

/** Maximum number of Bitcoin attestations to verify per proof. */
export const MAX_BITCOIN_ATTESTATIONS = 10

/** Validates a SHA-256 hash and returns it as a 32-byte Uint8Array. */
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

/** Cryptographically secure nonce (no Math.random fallback). */
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

/** Constant-time byte comparison — used for user-supplied hashes. */
function timingSafeEq(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/** Fast byte comparison for public data where timing does not matter. */
const bytesEqFast = (a: Uint8Array, b: Uint8Array): boolean =>
  Buffer.compare(Buffer.from(a), Buffer.from(b)) === 0


/**
 * stamp: builds the tree (digest → append(nonce) → SHA256 → merkle root), submits it to
 * calendars, and merges the responses. Requires >= M successes. Returns the canonical `.ots`.
 */
export async function orchestrateStamp(
  hash: Buffer | string,
  calendars: string[],
  networkLayer: ResilientNetworkLayer,
  logger?: Logger,
  signal?: AbortSignal,
  minimumSuccessfulSubmissions = 2,
  allowPrivateCalendars = false,
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
  await Promise.all(
    calendars.map(url => assertSafeCalendarUrl(url, { allowPrivate: allowPrivateCalendars }))
  )

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
 * upgrade: queries the calendars referenced by pending attestations (validated against the
 * allowlist), merges the returned Timestamps, and returns the updated proof. Throws UpgradeError
 * if nothing changed and the proof was not already complete. No soft-fail.
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
      ...(error instanceof Error ? { cause: error } : {}),
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
  if (bytesEqFast(before, after)) {
    throw new UpgradeError('No calendar has confirmed the timestamp yet (Bitcoin not yet mined)')
  }
  return Buffer.from(after)
}

/**
 * verify: locates the Bitcoin attestation and verifies it on-chain (Esplora).
 * Returns a discriminated union so callers can do exhaustive narrowing.
 */
export async function orchestrateVerify(
  proof: Buffer,
  networkLayer: ResilientNetworkLayer,
  originalDataHash?: Buffer | string,
  logger?: Logger,
  signal?: AbortSignal,
): Promise<VerificationResult> {
  // Corrupt .ots → throw ValidationError (consistent with orchestrateUpgrade API)
  let detached: DetachedTimestampFile
  try {
    detached = DetachedTimestampFile.deserialize(new Uint8Array(proof))
  } catch (cause) {
    throw new ValidationError('Invalid .ots proof format', {
      ...(cause instanceof Error ? { cause } : {}),
    })
  }

  if (detached.fileHashOp instanceof OpSHA1 || detached.fileHashOp instanceof OpRIPEMD160) {
    return {
      status: 'invalid',
      reason: `This proof uses ${detached.fileHashOp.tagName} (a weak hash algorithm). ` +
              `Re-stamp the original file with SHA-256 to get a verifiable proof.`,
    }
  }

  if (originalDataHash !== undefined) {
    let expected: Uint8Array
    try {
      expected = validateHash(originalDataHash)
    } catch (err) {
      throw new ValidationError(
        err instanceof Error ? err.message : 'Invalid hash format',
        { ...(err instanceof Error ? { cause: err } : {}) },
      )
    }
    if (!timingSafeEq(expected, detached.fileDigest())) {
      return { status: 'invalid', reason: 'File hash does not match proof — file may have been modified' }
    }
  }

  const allBitcoin = detached.timestamp
    .allAttestations()
    .filter(({ attestation }) => attestation.kind === 'bitcoin')

  // Deduplicate by height: two attestations at the same block would make identical HTTP calls.
  const seenHeights = new Set<number>()
  const deduped = allBitcoin.filter(({ attestation }) => {
    if (attestation.kind !== 'bitcoin') return false
    if (seenHeights.has(attestation.height)) {
      logger?.debug(`Skipping duplicate Bitcoin attestation at height ${attestation.height}`)
      return false
    }
    seenHeights.add(attestation.height)
    return true
  })

  // Cap against crafted proofs that could trigger a DoS via excessive HTTP calls.
  const bitcoinAtts = deduped.slice(0, MAX_BITCOIN_ATTESTATIONS)
  if (deduped.length > MAX_BITCOIN_ATTESTATIONS) {
    logger?.warn(
      `Proof has ${deduped.length} unique Bitcoin attestations; verifying only the first ${MAX_BITCOIN_ATTESTATIONS}`,
    )
  }

  if (bitcoinAtts.length === 0) {
    const hasLitecoin = detached.timestamp
      .allAttestations()
      .some(({ attestation }) => attestation.kind === 'litecoin')
    return {
      status: 'pending',
      reason: hasLitecoin
        ? 'Litecoin-only attestation is not supported by this client'
        : 'No Bitcoin attestation found — timestamp not yet confirmed',
    }
  }

  const explorer = new EsploraClient(networkLayer)
  let lastNetworkError: string | undefined
  let lastCryptoError: string | undefined

  // Try ALL Bitcoin attestations: valid if ANY of them verifies. Bitcoin's merkle root is
  // big-endian, so we reverse the tree digest before verifying.
  for (const { msg, attestation } of bitcoinAtts) {
    /* v8 ignore next */
    if (attestation.kind !== 'bitcoin') continue
    try {
      const blockTime = await verifyTimestampAttestation(
        Uint8Array.from(msg).reverse(),
        attestation,
        explorer,
        signal,
      )
      logger?.info(`Verified against Bitcoin block ${attestation.height}`)
      return { status: 'verified', blockHeight: attestation.height, blockTime }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (err instanceof NetworkError || err instanceof EsploraResponseError) {
        lastNetworkError = message
        logger?.warn(`Network error at block ${attestation.height}: ${message}`)
      } else {
        lastCryptoError = message
        logger?.warn(`Crypto verification failed at block ${attestation.height}: ${message}`)
      }
    }
  }

  if (lastCryptoError !== undefined) {
    return { status: 'invalid', reason: `Cryptographic verification failed: ${lastCryptoError}` }
  }

  return {
    status: 'network_error',
    reason: `Could not reach Bitcoin blockchain: ${lastNetworkError ?? 'unknown error'}`,
  }
}
