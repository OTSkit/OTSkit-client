/** Integration tests de stamp() — protocolo OTS canónico. */
import { describe, it, expect } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../mocks/server.js'
import { DetachedTimestampFile } from '@otskit/core'
import { OpenTimestampsClient } from '../../src/client.js'
import { StampError, ValidationError } from '../../src/errors.js'

const TEST_HASH = '1f02d20a78657fab24c5028383f23a45e11a8a25c102a86c6e768855b5059e3a'
const clientWith = (calendars: string[], extra = {}) => new OpenTimestampsClient({ calendars, ...extra })

describe('stamp() - Integration', () => {
  it('sella con 2 calendarios OK y devuelve un .ots canónico con pendings', async () => {
    const proof = await clientWith([
      'https://alice.btc.calendar.opentimestamps.org',
      'https://bob.btc.calendar.opentimestamps.org',
    ]).stamp(TEST_HASH)
    expect(proof).toBeInstanceOf(Buffer)
    const dtf = DetachedTimestampFile.deserialize(new Uint8Array(proof))
    expect(dtf.timestamp.getAttestations().filter((a) => a.kind === 'pending').length).toBe(2)
  })

  it('acepta el hash como Buffer', async () => {
    const proof = await clientWith([
      'https://alice.btc.calendar.opentimestamps.org',
      'https://bob.btc.calendar.opentimestamps.org',
    ]).stamp(Buffer.from(TEST_HASH, 'hex'))
    expect(proof).toBeInstanceOf(Buffer)
  })

  it('éxito parcial (2/4 calendarios OK) supera el umbral por defecto', async () => {
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

  it('falla (StampError) si no se alcanza el mínimo de calendarios', async () => {
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

  it('ValidationError para hash de longitud inválida', async () => {
    await expect(clientWith(['https://alice.btc.calendar.opentimestamps.org']).stamp('abcd1234')).rejects.toThrow(
      ValidationError
    )
  })

  it('ValidationError para caracteres no hex', async () => {
    await expect(
      clientWith(['https://alice.btc.calendar.opentimestamps.org']).stamp('z'.repeat(64))
    ).rejects.toThrow(ValidationError)
  })

  it('minimumSuccessfulSubmissions=3 con 3/4 OK pasa', async () => {
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

  it('ValidationError si minimumSuccessfulSubmissions < 1', async () => {
    await expect(
      clientWith(['https://alice.btc.calendar.opentimestamps.org'], { minimumSuccessfulSubmissions: 0 }).stamp(
        TEST_HASH
      )
    ).rejects.toThrow(ValidationError)
  })

  it('ValidationError si un calendario no es una URL http(s)', async () => {
    await expect(
      clientWith(['ftp://evil.example.com'], { minimumSuccessfulSubmissions: 1 }).stamp(TEST_HASH)
    ).rejects.toThrow(ValidationError)
  })

  it('ValidationError si minimumSuccessfulSubmissions supera el número de calendarios', async () => {
    await expect(
      clientWith(['https://alice.btc.calendar.opentimestamps.org'], { minimumSuccessfulSubmissions: 5 }).stamp(
        TEST_HASH
      )
    ).rejects.toThrow(ValidationError)
  })
})
