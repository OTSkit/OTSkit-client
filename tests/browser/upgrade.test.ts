/** Integration tests for the browser client's upgrade() — same protocol path as Node, Uint8Array in/out. */
import { describe, it, expect } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../mocks/server.js'
import { OpenTimestampsBrowserClient } from '../../src/browser.js'
import { UpgradeError, ValidationError } from '../../src/errors.js'
import {
  FAKE_INCOMPLETE_OTS,
  FAKE_COMPLETE_OTS,
  INCOMPLETE_COMMITMENT,
  bitcoinResponseFor,
  BITCOIN_HEIGHT,
} from '../mocks/handlers.js'

const ALICE = 'https://alice.btc.calendar.opentimestamps.org'
const arrayBufferOf = (b: Uint8Array) =>
  b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer
const completeFromCalendar = (url: string) =>
  http.get(`${url}/timestamp/:hex`, () =>
    HttpResponse.arrayBuffer(
      arrayBufferOf(bitcoinResponseFor(INCOMPLETE_COMMITMENT, BITCOIN_HEIGHT)),
      {
        status: 200,
        headers: { 'Content-Type': 'application/octet-stream' },
      }
    )
  )

const bytesEqual = (a: Uint8Array, b: Uint8Array) =>
  a.length === b.length && a.every((v, i) => v === b[i])

describe('OpenTimestampsBrowserClient.upgrade()', () => {
  it('upgrades and returns a plain Uint8Array when a calendar confirms', async () => {
    server.use(completeFromCalendar(ALICE))
    const upgraded = await new OpenTimestampsBrowserClient().upgrade(
      new Uint8Array(FAKE_INCOMPLETE_OTS)
    )
    expect(upgraded).toBeInstanceOf(Uint8Array)
    expect(bytesEqual(upgraded, new Uint8Array(FAKE_INCOMPLETE_OTS))).toBe(false) // proof changed
  })

  it('throws UpgradeError when no calendar has confirmed yet', async () => {
    await expect(
      new OpenTimestampsBrowserClient().upgrade(new Uint8Array(FAKE_INCOMPLETE_OTS))
    ).rejects.toThrow(UpgradeError)
  })

  it('returns the same proof unchanged when already complete', async () => {
    const complete = new Uint8Array(FAKE_COMPLETE_OTS)
    const result = await new OpenTimestampsBrowserClient().upgrade(complete)
    expect(bytesEqual(result, complete)).toBe(true)
  })

  it('throws ValidationError for an invalid .ots format', async () => {
    await expect(
      new OpenTimestampsBrowserClient().upgrade(new TextEncoder().encode('invalid binary data'))
    ).rejects.toThrow(ValidationError)
  })

  it('accepts a custom logger and submission threshold', async () => {
    const logger = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }
    const complete = new Uint8Array(FAKE_COMPLETE_OTS)
    const client = new OpenTimestampsBrowserClient({ logger, minimumSuccessfulSubmissions: 2 })
    expect(bytesEqual(await client.upgrade(complete), complete)).toBe(true)
  })
})
