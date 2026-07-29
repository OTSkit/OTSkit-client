/**
 * Shared upgrade logic, expressed over Uint8Array so it runs in both Node and the browser.
 * Queries the calendars named by pending attestations (validated against the allowlist), merges
 * the returned Timestamps, and returns the updated proof bytes. Throws UpgradeError if nothing
 * changed and the proof was not already complete. No Buffer here, so the browser bundle stays free
 * of node: built-ins.
 */
import { DetachedTimestampFile } from '@otskit/core'
import { ResilientNetworkLayer } from '../network/resilience.js'
import { CalendarClient, DEFAULT_CALENDAR_WHITELIST } from '../network/calendar.js'
import { ValidationError, UpgradeError, CommitmentNotFoundError } from '../errors.js'
import { Logger } from '../types.js'

/** Byte comparison for public data where timing does not matter. Accumulates instead of
 * short-circuiting so a single length check is the only branch. */
function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i]
  }
  return diff === 0
}

export async function upgradeProofBytes(
  incompleteProof: Uint8Array,
  networkLayer: ResilientNetworkLayer,
  logger?: Logger,
  signal?: AbortSignal
): Promise<Uint8Array> {
  let detached: DetachedTimestampFile
  try {
    detached = DetachedTimestampFile.deserialize(incompleteProof)
  } catch (error) {
    throw new ValidationError('Invalid .ots proof format', {
      /* v8 ignore next */
      ...(error instanceof Error ? { cause: error } : {}),
    })
  }

  if (detached.timestamp.isTimestampComplete()) {
    logger?.info('Proof already complete; nothing to upgrade')
    return incompleteProof
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
        logger?.warn(
          `Failed to query ${att.uri}: ${err instanceof Error ? err.message : String(err)}`
        )
      }
    }
  }

  const after = detached.serializeToBytes()
  if (bytesEqual(before, after)) {
    throw new UpgradeError('No calendar has confirmed the timestamp yet (Bitcoin not yet mined)')
  }
  return after
}
