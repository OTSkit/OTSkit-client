/**
 * verify: locates the Bitcoin attestation and verifies it on-chain (Esplora).
 * Returns a discriminated union so callers can do exhaustive narrowing. Node-only
 * (node:crypto timing-safe compare + Esplora HTTP client).
 */
import { DetachedTimestampFile, OpSHA1, OpRIPEMD160 } from '@otskit/core'
import { timingSafeEqual } from 'node:crypto'
import { ResilientNetworkLayer } from '../network/resilience.js'
import { EsploraClient, verifyTimestampAttestation } from '../network/esplora.js'
import { ValidationError, NetworkError, EsploraResponseError } from '../errors.js'
import { Logger, VerificationResult } from '../types.js'
import { validateHash } from './shared.js'

/** Maximum number of Bitcoin attestations to verify per proof. */
export const MAX_BITCOIN_ATTESTATIONS = 10

/** Constant-time byte comparison — used for user-supplied hashes. */
function timingSafeEq(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export async function orchestrateVerify(
  proof: Buffer,
  networkLayer: ResilientNetworkLayer,
  originalDataHash?: Buffer | string,
  logger?: Logger,
  signal?: AbortSignal,
  esploraUrl?: string
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
      reason:
        `This proof uses ${detached.fileHashOp.tagName} (a weak hash algorithm). ` +
        `Re-stamp the original file with SHA-256 to get a verifiable proof.`,
    }
  }

  if (originalDataHash !== undefined) {
    let expected: Uint8Array
    try {
      expected = validateHash(originalDataHash)
    } catch (err) {
      throw new ValidationError(err instanceof Error ? err.message : 'Invalid hash format', {
        ...(err instanceof Error ? { cause: err } : {}),
      })
    }
    if (!timingSafeEq(expected, detached.fileDigest())) {
      return {
        status: 'invalid',
        reason: 'File hash does not match proof — file may have been modified',
      }
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
      `Proof has ${deduped.length} unique Bitcoin attestations; verifying only the first ${MAX_BITCOIN_ATTESTATIONS}`
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

  const explorer = new EsploraClient(networkLayer, {
    ...(esploraUrl !== undefined ? { url: esploraUrl } : {}),
    ...(logger !== undefined ? { logger } : {}),
  })
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
        signal
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
