/** Integration tests for stamp() — canonical OTS protocol. */
import { describe, it, expect } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../mocks/server.js'
import { DetachedTimestampFile } from '@otskit/core'
import { OpenTimestampsClient } from '../../src/client.js'
import { StampError, ValidationError } from '../../src/errors.js'

const TEST_HASH = '1f02d20a78657fab24c5028383f23a45e11a8a25c102a86c6e768855b5059e3a'
const clientWith = (calendars: string[], extra = {}) => new OpenTimestampsClient({ calendars, ...extra })

describe('stamp() - Integration', () => {
  it('stamps with 2 OK calendars and returns a canonical .ots with pending attestations', async () => {
    const proof = await clientWith([
      'https://alice.btc.calendar.opentimestamps.org',
      'https://bob.btc.calendar.opentimestamps.org',
    ]).stamp(TEST_HASH)
    expect(proof).toBeInstanceOf(Buffer)
    const dtf = DetachedTimestampFile.deserialize(new Uint8Array(proof))
    expect(dtf.timestamp.getAttestations().filter((a) => a.kind === 'pending').length).toBe(2)
  })

  it('accepts the hash as a Buffer', async () => {
    const proof = await clientWith([
      'https://alice.btc.calendar.opentimestamps.org',
      'https://bob.btc.calendar.opentimestamps.org',
    ]).stamp(Buffer.from(TEST_HASH, 'hex'))
    expect(proof).toBeInstanceOf(Buffer)
  })

  it('partial success (2/4 calendars OK) meets the default threshold', async () => {
    server.use(
      http.post('https://finney.calendar.eternitywall.com/digest', () => new HttpResponse(null, { status: 503 })),
      http.post('https://btc.calendar.catallaxy.com/digest', () => new HttpResponse(null, { status: 503 }))
    )
    const proof = await clientWith([
      'https://alice.btc.calendar.opentimestamps.org',
      'https://bob.btc.calendar.opentimestamps.org',
      'https://finney.calendar.eternitywall.com',
      'https://btc.calendar.catallaxy.com',
    ]).stamp(TEST_HASH)
    expect(proof).toBeInstanceOf(Buffer)
  })

  it('throws StampError when the minimum threshold is not reached', async () => {
    server.use(
      http.post('https://alice.btc.calendar.opentimestamps.org/digest', () => new HttpResponse(null, { status: 503 })),
      http.post('https://bob.btc.calendar.opentimestamps.org/digest', () => new HttpResponse(null, { status: 503 })),
      http.post('https://finney.calendar.eternitywall.com/digest', () => new HttpResponse(null, { status: 503 }))
    )
    await expect(
      clientWith([
        'https://alice.btc.calendar.opentimestamps.org',
        'https://bob.btc.calendar.opentimestamps.org',
        'https://finney.calendar.eternitywall.com',
        'https://btc.calendar.catallaxy.com',
      ]).stamp(TEST_HASH)
    ).rejects.toThrow(StampError)
  })

  it('throws ValidationError for a hash with invalid length', async () => {
    await expect(
      clientWith(['https://alice.btc.calendar.opentimestamps.org'], { minimumSuccessfulSubmissions: 1 }).stamp('abcd1234')
    ).rejects.toThrow(ValidationError)
  })

  it('throws ValidationError for non-hex characters', async () => {
    await expect(
      clientWith(['https://alice.btc.calendar.opentimestamps.org'], { minimumSuccessfulSubmissions: 1 }).stamp('z'.repeat(64))
    ).rejects.toThrow(ValidationError)
  })

  it('minimumSuccessfulSubmissions=3 with 3/4 OK succeeds', async () => {
    server.use(
      http.post('https://btc.calendar.catallaxy.com/digest', () => new HttpResponse(null, { status: 503 }))
    )
    const proof = await clientWith(
      [
        'https://alice.btc.calendar.opentimestamps.org',
        'https://bob.btc.calendar.opentimestamps.org',
        'https://finney.calendar.eternitywall.com',
        'https://btc.calendar.catallaxy.com',
      ],
      { minimumSuccessfulSubmissions: 3 }
    ).stamp(TEST_HASH)
    expect(proof).toBeInstanceOf(Buffer)
  })

  it('throws ValidationError when minimumSuccessfulSubmissions < 1', () => {
    expect(() =>
      clientWith(['https://alice.btc.calendar.opentimestamps.org'], { minimumSuccessfulSubmissions: 0 })
    ).toThrow(ValidationError)
  })

  it('throws ValidationError when a calendar URL is not http(s)', async () => {
    await expect(
      clientWith(['ftp://evil.example.com'], { minimumSuccessfulSubmissions: 1 }).stamp(TEST_HASH)
    ).rejects.toThrow(ValidationError)
  })

  it('throws ValidationError when minimumSuccessfulSubmissions exceeds the number of calendars', () => {
    expect(() =>
      clientWith(['https://alice.btc.calendar.opentimestamps.org'], { minimumSuccessfulSubmissions: 5 })
    ).toThrow(ValidationError)
  })
})
