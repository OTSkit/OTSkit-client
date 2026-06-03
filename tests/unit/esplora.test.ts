import { describe, it, expect } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../mocks/server.js'
import {
  EsploraClient,
  PUBLIC_ESPLORA_URL,
  MAX_ESPLORA_RESPONSE_SIZE,
} from '../../src/network/esplora.js'
import { EsploraResponseError, NetworkError, ValidationError } from '../../src/errors.js'
import { ResilientNetworkLayer } from '../../src/network/resilience.js'
import { DEFAULT_RESILIENCE } from '../../src/types.js'

const MERKLEROOT = 'aa'.repeat(32) // 64 hex; coincide con un digest de 32 bytes a 0xaa
const DIGEST = new Uint8Array(32).fill(0xaa)
const BLOCKHASH = 'bb'.repeat(32)
const HEIGHT = 700000
const TIME = 1700000000

// Capa de red sin reintentos: cada test ejerce un único intento, circuit-breaker aislado por instancia.
const newLayer = () =>
  new ResilientNetworkLayer({
    ...DEFAULT_RESILIENCE,
    retries: { ...DEFAULT_RESILIENCE.retries, enabled: false },
  })
const newClient = () => new EsploraClient(newLayer())

describe('EsploraClient.blockHash', () => {
  it('GET /block-height/{height} → hash en minúsculas', async () => {
    server.use(
      http.get(`${PUBLIC_ESPLORA_URL}/block-height/${HEIGHT}`, () => HttpResponse.text(BLOCKHASH))
    )
    expect(await newClient().blockHash(HEIGHT)).toBe(BLOCKHASH)
  })

  it.each([-1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])(
    'rechaza height inválido (%p) con ValidationError, sin tocar la red',
    async (h) => {
      await expect(newClient().blockHash(h as number)).rejects.toBeInstanceOf(ValidationError)
    }
  )

  it('respuesta que no es hash de 64 → EsploraResponseError', async () => {
    server.use(
      http.get(`${PUBLIC_ESPLORA_URL}/block-height/${HEIGHT}`, () => HttpResponse.text('nope'))
    )
    await expect(newClient().blockHash(HEIGHT)).rejects.toBeInstanceOf(EsploraResponseError)
  })

  it('respuesta mayor que el límite → EsploraResponseError', async () => {
    server.use(
      http.get(`${PUBLIC_ESPLORA_URL}/block-height/${HEIGHT}`, () =>
        HttpResponse.text('x'.repeat(MAX_ESPLORA_RESPONSE_SIZE + 1))
      )
    )
    await expect(newClient().blockHash(HEIGHT)).rejects.toBeInstanceOf(EsploraResponseError)
  })

  it('404 del explorador → NetworkError (no EsploraResponseError silencioso)', async () => {
    server.use(
      http.get(`${PUBLIC_ESPLORA_URL}/block-height/${HEIGHT}`, () => new HttpResponse(null, { status: 404 }))
    )
    await expect(newClient().blockHash(HEIGHT)).rejects.toBeInstanceOf(NetworkError)
  })
})

describe('EsploraClient.block', () => {
  const okBody = { id: BLOCKHASH, height: HEIGHT, merkle_root: MERKLEROOT, timestamp: TIME }

  it('GET /block/{hash} → { merkleroot, time }', async () => {
    server.use(http.get(`${PUBLIC_ESPLORA_URL}/block/${BLOCKHASH}`, () => HttpResponse.json(okBody)))
    expect(await newClient().block(BLOCKHASH)).toEqual({ merkleroot: MERKLEROOT, time: TIME })
  })

  it.each(['zz', 'a'.repeat(63), '', 'A'.repeat(65)])(
    'rechaza hash de entrada inválido (%p) con ValidationError',
    async (h) => {
      await expect(newClient().block(h)).rejects.toBeInstanceOf(ValidationError)
    }
  )

  it('cuerpo no-JSON → EsploraResponseError', async () => {
    server.use(http.get(`${PUBLIC_ESPLORA_URL}/block/${BLOCKHASH}`, () => HttpResponse.text('<html>oops</html>')))
    await expect(newClient().block(BLOCKHASH)).rejects.toBeInstanceOf(EsploraResponseError)
  })

  it('JSON que no es objeto → EsploraResponseError', async () => {
    server.use(http.get(`${PUBLIC_ESPLORA_URL}/block/${BLOCKHASH}`, () => HttpResponse.json(42)))
    await expect(newClient().block(BLOCKHASH)).rejects.toBeInstanceOf(EsploraResponseError)
  })

  it('merkle_root ausente o no hex → EsploraResponseError', async () => {
    server.use(
      http.get(`${PUBLIC_ESPLORA_URL}/block/${BLOCKHASH}`, () =>
        HttpResponse.json({ ...okBody, merkle_root: 'not-hex' })
      )
    )
    await expect(newClient().block(BLOCKHASH)).rejects.toBeInstanceOf(EsploraResponseError)
  })

  it.each([0, -5, 1.5, '1700000000'])(
    'timestamp no entero positivo (%p) → EsploraResponseError',
    async (t) => {
      server.use(
        http.get(`${PUBLIC_ESPLORA_URL}/block/${BLOCKHASH}`, () =>
          HttpResponse.json({ ...okBody, timestamp: t })
        )
      )
      await expect(newClient().block(BLOCKHASH)).rejects.toBeInstanceOf(EsploraResponseError)
    }
  )
})

import { verifyTimestampAttestation } from '../../src/network/esplora.js'
import { makeBitcoin, makeLitecoin, makePending } from '@otskit/core'

describe('verifyTimestampAttestation', () => {
  const wireBlock = (baseUrl: string, hash: string, merkleroot: string, time: number) => {
    server.use(
      http.get(`${baseUrl}/block-height/${HEIGHT}`, () => HttpResponse.text(hash)),
      http.get(`${baseUrl}/block/${hash}`, () =>
        HttpResponse.json({ id: hash, height: HEIGHT, merkle_root: merkleroot, timestamp: time })
      )
    )
  }

  it('atestación bitcoin válida → devuelve el time del bloque', async () => {
    wireBlock(PUBLIC_ESPLORA_URL, BLOCKHASH, MERKLEROOT, TIME)
    const time = await verifyTimestampAttestation(DIGEST, makeBitcoin(HEIGHT), newClient())
    expect(time).toBe(TIME)
  })

  it('atestación litecoin contra un explorador de Litecoin → devuelve el time', async () => {
    const LTC_URL = 'https://litecoinspace.org/api'
    wireBlock(LTC_URL, BLOCKHASH, MERKLEROOT, TIME)
    const ltc = new EsploraClient(newLayer(), { url: LTC_URL })
    const time = await verifyTimestampAttestation(DIGEST, makeLitecoin(HEIGHT), ltc)
    expect(time).toBe(TIME)
  })

  it('digest que no coincide con el merkleroot → falla (no valida en falso)', async () => {
    wireBlock(PUBLIC_ESPLORA_URL, BLOCKHASH, 'cc'.repeat(32), TIME) // merkleroot != DIGEST
    await expect(
      verifyTimestampAttestation(DIGEST, makeBitcoin(HEIGHT), newClient())
    ).rejects.toThrow(/does not match/)
  })

  it('atestación pending no es verificable en cadena → lanza', async () => {
    await expect(
      verifyTimestampAttestation(DIGEST, makePending('https://a.pool.opentimestamps.org'), newClient())
    ).rejects.toThrow(/cannot verify/)
  })
})

describe('EsploraClient — validación de URL base', () => {
  it('rechaza una URL base no http(s)', () => {
    expect(() => new EsploraClient(newLayer(), { url: 'ftp://example.com' })).toThrow(ValidationError)
  })
  it('rechaza una URL base malformada', () => {
    expect(() => new EsploraClient(newLayer(), { url: 'not a url' })).toThrow(ValidationError)
  })
})
