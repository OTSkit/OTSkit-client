import { describe, it, expect } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../mocks/server.js'
import { Timestamp, OpSHA256, StreamSerializationContext, bytesToHex, makePending } from '@otskit/core'
import { CalendarClient } from '../../src/network/calendar.js'
import { CalendarResponseTooLargeError, CommitmentNotFoundError } from '../../src/errors.js'
import { ResilientNetworkLayer } from '../../src/network/resilience.js'
import { DEFAULT_RESILIENCE } from '../../src/types.js'

const CAL = 'https://alice.btc.calendar.opentimestamps.org'
const DIGEST = new Uint8Array(32).fill(0xaa)

// Builds a Timestamp using the canonical core that commits to the given digest and serializes it.
// (A real calendar responds with a Timestamp like this: a SHA256 op with a pending attestation.)
const calendarResponseBytes = (msg: Uint8Array): Uint8Array => {
  const ts = new Timestamp(msg)
  // The sub-stamp needs at least one attestation to be serializable.
  ts.add(new OpSHA256()).addAttestation(makePending(CAL))
  const sc = new StreamSerializationContext()
  ts.serialize(sc)
  return sc.getOutput()
}

const newClient = () =>
  new CalendarClient(CAL, new ResilientNetworkLayer({ ...DEFAULT_RESILIENCE, retries: { ...DEFAULT_RESILIENCE.retries, enabled: false } }))

describe('CalendarClient.submit', () => {
  it('POST /digest → deserializes the Timestamp committed to the digest', async () => {
    const body = calendarResponseBytes(DIGEST)
    server.use(
      http.post(`${CAL}/digest`, async ({ request }) => {
        const sent = new Uint8Array(await request.arrayBuffer())
        expect(Array.from(sent)).toEqual(Array.from(DIGEST)) // raw digest is sent
        return HttpResponse.arrayBuffer(body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength), {
          status: 200,
          headers: { 'Content-Type': 'application/octet-stream' },
        })
      })
    )
    const ts = await newClient().submit(DIGEST)
    expect(ts).toBeInstanceOf(Timestamp)
    expect(Array.from(ts.getDigest())).toEqual(Array.from(DIGEST))
    expect(ts.branches.length).toBe(1)
  })

  it('response larger than the limit → CalendarResponseTooLargeError', async () => {
    server.use(
      http.post(`${CAL}/digest`, () =>
        HttpResponse.arrayBuffer(new Uint8Array(10001).buffer, { status: 200 })
      )
    )
    await expect(newClient().submit(DIGEST)).rejects.toBeInstanceOf(CalendarResponseTooLargeError)
  })

  it('rejects a commitment that is not a Uint8Array or has an invalid length (boundary)', async () => {
    // @ts-expect-error deliberate invalid input
    await expect(newClient().submit([1, 2, 3])).rejects.toBeInstanceOf(TypeError)
    await expect(newClient().submit(new Uint8Array(0))).rejects.toBeInstanceOf(RangeError)
    await expect(newClient().submit(new Uint8Array(65))).rejects.toBeInstanceOf(RangeError)
  })
})

describe('CalendarClient.getTimestamp', () => {
  it('GET /timestamp/{hex} → deserializes the Timestamp', async () => {
    const body = calendarResponseBytes(DIGEST)
    server.use(
      http.get(`${CAL}/timestamp/${bytesToHex(DIGEST)}`, () =>
        HttpResponse.arrayBuffer(body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength), {
          status: 200,
          headers: { 'Content-Type': 'application/octet-stream' },
        })
      )
    )
    const ts = await newClient().getTimestamp(DIGEST)
    expect(Array.from(ts.getDigest())).toEqual(Array.from(DIGEST))
  })

  it('404 → CommitmentNotFoundError', async () => {
    server.use(
      http.get(`${CAL}/timestamp/${bytesToHex(DIGEST)}`, () => new HttpResponse(null, { status: 404 }))
    )
    await expect(newClient().getTimestamp(DIGEST)).rejects.toBeInstanceOf(CommitmentNotFoundError)
  })

  it('server error (500) propagates as NetworkError, not CommitmentNotFoundError', async () => {
    server.use(
      http.get(`${CAL}/timestamp/${bytesToHex(DIGEST)}`, () => new HttpResponse(null, { status: 500 }))
    )
    const err = await newClient().getTimestamp(DIGEST).catch((e) => e)
    expect(err).not.toBeInstanceOf(CommitmentNotFoundError)
  })
})
