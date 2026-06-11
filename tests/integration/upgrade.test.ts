/** Integration tests for upgrade() — canonical OTS protocol. */
import { describe, it, expect } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../mocks/server.js'
import { OpenTimestampsClient } from '../../src/client.js'
import { UpgradeError, ValidationError } from '../../src/errors.js'
import { DetachedTimestampFile, OpSHA256, makePending } from '@otskit/core'
import {
  FAKE_INCOMPLETE_OTS,
  FAKE_COMPLETE_OTS,
  INCOMPLETE_COMMITMENT,
  bitcoinResponseFor,
  BITCOIN_HEIGHT,
} from '../mocks/handlers.js'

const ALICE = 'https://alice.btc.calendar.opentimestamps.org'
const BOB = 'https://bob.btc.calendar.opentimestamps.org'
const arrayBufferOf = (b: Uint8Array) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer
const completeFromCalendar = (url: string) =>
  http.get(`${url}/timestamp/:hex`, () =>
    HttpResponse.arrayBuffer(arrayBufferOf(bitcoinResponseFor(INCOMPLETE_COMMITMENT, BITCOIN_HEIGHT)), {
      status: 200,
      headers: { 'Content-Type': 'application/octet-stream' },
    })
  )

const client = () => new OpenTimestampsClient({ calendars: [ALICE, BOB] })

describe('upgrade() - Integration', () => {
  it('upgrades when a calendar confirms (Bitcoin)', async () => {
    server.use(completeFromCalendar(ALICE))
    const upgraded = await client().upgrade(Buffer.from(FAKE_INCOMPLETE_OTS))
    expect(upgraded).toBeInstanceOf(Buffer)
    expect(Buffer.compare(upgraded, Buffer.from(FAKE_INCOMPLETE_OTS))).not.toBe(0) // proof changed
  })

  it('throws UpgradeError when no calendar has confirmed (all pending by default)', async () => {
    await expect(client().upgrade(Buffer.from(FAKE_INCOMPLETE_OTS))).rejects.toThrow(UpgradeError)
  })

  it('returns the same proof unchanged when already complete', async () => {
    const result = await client().upgrade(Buffer.from(FAKE_COMPLETE_OTS))
    expect(result.equals(Buffer.from(FAKE_COMPLETE_OTS))).toBe(true)
  })

  it('throws UpgradeError when all calendars fail with 503', async () => {
    server.use(
      http.get(`${ALICE}/timestamp/:hex`, () => new HttpResponse(null, { status: 503 })),
      http.get(`${BOB}/timestamp/:hex`, () => new HttpResponse(null, { status: 503 }))
    )
    await expect(
      new OpenTimestampsClient({ calendars: [ALICE, BOB], resilience: { retries: { maxAttempts: 1 } } }).upgrade(
        Buffer.from(FAKE_INCOMPLETE_OTS)
      )
    ).rejects.toThrow(UpgradeError)
  })

  it('ignores a corrupt calendar response and uses the valid one from the other calendar', async () => {
    server.use(
      http.get(`${ALICE}/timestamp/:hex`, () =>
        HttpResponse.arrayBuffer(new Uint8Array([0xff, 0xff, 0xff]).buffer, {
          status: 200,
          headers: { 'Content-Type': 'application/octet-stream' },
        })
      ),
      completeFromCalendar(BOB)
    )
    const upgraded = await client().upgrade(Buffer.from(FAKE_INCOMPLETE_OTS))
    expect(upgraded).toBeInstanceOf(Buffer)
  })

  it('throws ValidationError for an invalid .ots format', async () => {
    await expect(client().upgrade(Buffer.from('invalid binary data'))).rejects.toThrow(ValidationError)
  })

  it('ignores a pending attestation outside the allowlist (does not query it) → UpgradeError', async () => {
    // A .ots whose only pending attestation points to a non-allowlisted calendar:
    // the `!DEFAULT_CALENDAR_WHITELIST.contains(uri)` branch fires; nothing is queried → UpgradeError.
    const dtf = DetachedTimestampFile.fromHash(new OpSHA256(), new Uint8Array(32).fill(0x11))
    dtf.timestamp.add(new OpSHA256()).addAttestation(makePending('https://evil.example.com'))
    let queried = false
    server.use(
      http.get('https://evil.example.com/timestamp/:hex', () => {
        queried = true
        return new HttpResponse(null, { status: 200 })
      })
    )
    await expect(client().upgrade(Buffer.from(dtf.serializeToBytes()))).rejects.toThrow(UpgradeError)
    expect(queried).toBe(false) // the non-allowlisted calendar was never queried
  })

  it('silently ignores CommitmentNotFoundError (404); succeeds when another calendar confirms', async () => {
    // ALICE returns 404 (CommitmentNotFoundError); BOB confirms with Bitcoin.
    server.use(
      http.get(`${ALICE}/timestamp/:hex`, () => new HttpResponse(null, { status: 404 })),
      completeFromCalendar(BOB)
    )
    const upgraded = await client().upgrade(Buffer.from(FAKE_INCOMPLETE_OTS))
    expect(upgraded).toBeInstanceOf(Buffer)
    expect(Buffer.compare(upgraded, Buffer.from(FAKE_INCOMPLETE_OTS))).not.toBe(0)
  })
})
