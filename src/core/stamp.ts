/**
 * Browser-safe stamp path: builds the tree (digest -> append(nonce) -> SHA256 -> merkle root),
 * submits it to calendars, and merges the responses. Requires >= M successes. Returns the
 * canonical `.ots` as a Uint8Array. The calendar-URL validator is injected so this module never
 * imports node:dns/net: the Node client passes a DNS-aware guard, the browser a structural one.
 */
import { DetachedTimestampFile, OpSHA256, OpAppend, makeMerkleTree } from '@otskit/core'
import { ResilientNetworkLayer } from '../network/resilience.js'
import { CalendarClient } from '../network/calendar.js'
import { ValidationError, StampError } from '../errors.js'
import { Logger } from '../types.js'
import { validateHash, secureNonce } from './shared.js'
import { bytesToHex } from '../utils/hex.js'

/** Validates a calendar URL, throwing if it must not be contacted. */
export type CalendarUrlValidator = (url: string) => Promise<void>

export async function orchestrateStamp(
  hash: Uint8Array | string,
  calendars: string[],
  networkLayer: ResilientNetworkLayer,
  validateCalendarUrl: CalendarUrlValidator,
  logger?: Logger,
  signal?: AbortSignal,
  minimumSuccessfulSubmissions = 2
): Promise<Uint8Array> {
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
  // A calendar that fails validation is never contacted, but it must not sink the others:
  // one unresolvable hostname used to abort the whole stamp even when the rest could have met
  // the threshold. Each rejection still fails closed for that single calendar.
  const validations = await Promise.allSettled(calendars.map((url) => validateCalendarUrl(url)))
  const usable: string[] = []
  const unusable: Array<{ calendar: string; error: Error }> = []
  validations.forEach((v, i) => {
    const calendar = calendars[i]!
    if (v.status === 'fulfilled') {
      usable.push(calendar)
      return
    }
    const error = v.reason instanceof Error ? v.reason : new Error(String(v.reason))
    unusable.push({ calendar, error })
    logger?.warn(`Skipping calendar ${calendar}: ${error.message}`)
  })
  if (usable.length === 0) {
    throw unusable[0]!.error
  }
  if (usable.length < minimumSuccessfulSubmissions) {
    throw new StampError(
      `Insufficient usable calendars (${usable.length}/${minimumSuccessfulSubmissions} required)`,
      [],
      unusable
    )
  }

  const digest = validateHash(hash)
  logger?.info(`Starting stamp for ${bytesToHex(digest)}`)

  const detached = DetachedTimestampFile.fromHash(new OpSHA256(), digest)
  const nonceAppended = detached.timestamp.add(new OpAppend(secureNonce(16)))
  const merkleRoot = nonceAppended.add(new OpSHA256())
  const merkleTip = makeMerkleTree([merkleRoot])

  const results = await Promise.allSettled(
    usable.map((url) =>
      new CalendarClient(url, networkLayer, logger).submit(merkleTip.getDigest(), signal)
    )
  )

  const successful: Array<{ calendar: string }> = []
  const failed: Array<{ calendar: string; error: Error }> = [...unusable]
  results.forEach((r, i) => {
    const calendar = usable[i]!
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

  return detached.serializeToBytes()
}
