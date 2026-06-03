/** Integration tests de upgrade() — protocolo OTS canónico. */
import { describe, it, expect } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../mocks/server.js'
import { OpenTimestampsClient } from '../../src/client.js'
import { UpgradeError, ValidationError } from '../../src/errors.js'
import { DetachedTimestampFile, OpSHA256, makePending } from '@alexalves87/opentimestamps'
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
  it('actualiza cuando un calendario confirma (Bitcoin)', async () => {
    server.use(completeFromCalendar(ALICE))
    const upgraded = await client().upgrade(Buffer.from(FAKE_INCOMPLETE_OTS))
    expect(upgraded).toBeInstanceOf(Buffer)
    expect(Buffer.compare(upgraded, Buffer.from(FAKE_INCOMPLETE_OTS))).not.toBe(0) // cambió
  })

  it('UpgradeError cuando ningún calendario ha confirmado (todos pending por defecto)', async () => {
    await expect(client().upgrade(Buffer.from(FAKE_INCOMPLETE_OTS))).rejects.toThrow(UpgradeError)
  })

  it('no consulta y devuelve la misma prueba si ya está completa', async () => {
    const result = await client().upgrade(Buffer.from(FAKE_COMPLETE_OTS))
    expect(result.equals(Buffer.from(FAKE_COMPLETE_OTS))).toBe(true)
  })

  it('UpgradeError cuando todos los calendarios fallan (503)', async () => {
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

  it('ignora la respuesta corrupta de un calendario y usa la válida del otro', async () => {
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

  it('ValidationError para un .ots con formato inválido', async () => {
    await expect(client().upgrade(Buffer.from('invalid binary data'))).rejects.toThrow(ValidationError)
  })

  it('ignora un pending fuera de la whitelist (no lo consulta) → UpgradeError', async () => {
    // Un .ots cuyo único pending apunta a un calendario NO whitelisted: la rama
    // `!DEFAULT_CALENDAR_WHITELIST.contains(uri)` se ejercita; no se consulta nada → UpgradeError.
    const dtf = DetachedTimestampFile.fromHash(new OpSHA256(), new Uint8Array(32).fill(0x11))
    dtf.timestamp.add(new OpSHA256()).attestations.push(makePending('https://evil.example.com'))
    let queried = false
    server.use(
      http.get('https://evil.example.com/timestamp/:hex', () => {
        queried = true
        return new HttpResponse(null, { status: 200 })
      })
    )
    await expect(client().upgrade(Buffer.from(dtf.serializeToBytes()))).rejects.toThrow(UpgradeError)
    expect(queried).toBe(false) // nunca se consultó el calendario no whitelisted
  })

  it('CommitmentNotFoundError (404) se ignora silenciosamente; si otro confirma, pasa', async () => {
    // ALICE devuelve 404 (CommitmentNotFoundError), BOB confirma con Bitcoin.
    server.use(
      http.get(`${ALICE}/timestamp/:hex`, () => new HttpResponse(null, { status: 404 })),
      completeFromCalendar(BOB)
    )
    const upgraded = await client().upgrade(Buffer.from(FAKE_INCOMPLETE_OTS))
    expect(upgraded).toBeInstanceOf(Buffer)
    expect(Buffer.compare(upgraded, Buffer.from(FAKE_INCOMPLETE_OTS))).not.toBe(0)
  })
})
