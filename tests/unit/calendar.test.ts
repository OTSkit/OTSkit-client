import { describe, it, expect, beforeEach } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../mocks/server.js'
import { Timestamp, OpSHA256, StreamSerializationContext, bytesToHex, makePending } from '@alexalves87/opentimestamps'
import { CalendarClient } from '../../src/network/calendar.js'
import { CalendarResponseTooLargeError, CommitmentNotFoundError } from '../../src/errors.js'
import { ResilientNetworkLayer } from '../../src/network/resilience.js'
import { DEFAULT_RESILIENCE } from '../../src/types.js'

const CAL = 'https://alice.btc.calendar.opentimestamps.org'
const DIGEST = new Uint8Array(32).fill(0xaa)

// Construye, con el CORE canónico, un Timestamp que commit-ea al digest dado, y lo serializa.
// (Un calendario real responde un Timestamp así: una op SHA256 con una attestation pending.)
const calendarResponseBytes = (msg: Uint8Array): Uint8Array => {
  const ts = new Timestamp(msg)
  // El sub-stamp necesita al menos una attestation para ser serializable
  ts.add(new OpSHA256()).attestations.push(makePending(CAL))
  const sc = new StreamSerializationContext()
  ts.serialize(sc)
  return sc.getOutput()
}

const newClient = () =>
  new CalendarClient(CAL, new ResilientNetworkLayer({ ...DEFAULT_RESILIENCE, retries: { ...DEFAULT_RESILIENCE.retries, enabled: false } }))

describe('CalendarClient.submit', () => {
  it('POST /digest → deserializa el Timestamp commit-eado al digest', async () => {
    const body = calendarResponseBytes(DIGEST)
    server.use(
      http.post(`${CAL}/digest`, async ({ request }) => {
        const sent = new Uint8Array(await request.arrayBuffer())
        expect(Array.from(sent)).toEqual(Array.from(DIGEST)) // se envía el digest crudo
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

  it('respuesta mayor que el límite → CalendarResponseTooLargeError', async () => {
    server.use(
      http.post(`${CAL}/digest`, () =>
        HttpResponse.arrayBuffer(new Uint8Array(10001).buffer, { status: 200 })
      )
    )
    await expect(newClient().submit(DIGEST)).rejects.toBeInstanceOf(CalendarResponseTooLargeError)
  })

  it('rechaza un commitment que no es Uint8Array o de longitud inválida (frontera)', async () => {
    // @ts-expect-error entrada inválida deliberada
    await expect(newClient().submit([1, 2, 3])).rejects.toBeInstanceOf(TypeError)
    await expect(newClient().submit(new Uint8Array(0))).rejects.toBeInstanceOf(RangeError)
    await expect(newClient().submit(new Uint8Array(65))).rejects.toBeInstanceOf(RangeError)
  })
})

describe('CalendarClient.getTimestamp', () => {
  it('GET /timestamp/{hex} → deserializa el Timestamp', async () => {
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

  it('error de servidor (500) se propaga como NetworkError, no como CommitmentNotFound', async () => {
    server.use(
      http.get(`${CAL}/timestamp/${bytesToHex(DIGEST)}`, () => new HttpResponse(null, { status: 500 }))
    )
    const err = await newClient().getTimestamp(DIGEST).catch((e) => e)
    expect(err).not.toBeInstanceOf(CommitmentNotFoundError)
  })
})
