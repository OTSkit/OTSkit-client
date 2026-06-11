import { describe, it, expect } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../mocks/server.js'
import {
  EsploraClient,
  PUBLIC_ESPLORA_URL,
  MAX_ESPLORA_RESPONSE_SIZE,
} from '../../src/network/esplora.js'
import { EsploraResponseError, NetworkError, SizeLimitExceededError, ValidationError } from '../../src/errors.js'
import { ResilientNetworkLayer } from '../../src/network/resilience.js'
import { DEFAULT_RESILIENCE } from '../../src/types.js'

const MERKLEROOT = 'aa'.repeat(32) // 64 hex; matches a 32-byte digest of 0xaa
const DIGEST = new Uint8Array(32).fill(0xaa)
const BLOCKHASH = 'bb'.repeat(32)
const HEIGHT = 700000
const TIME = 1700000000

// Network layer with retries disabled: each test exercises exactly one attempt with an isolated circuit breaker.
const newLayer = () =>
  new ResilientNetworkLayer({
    ...DEFAULT_RESILIENCE,
    retries: { ...DEFAULT_RESILIENCE.retries, enabled: false },
  })
const newClient = () => new EsploraClient(newLayer())

describe('EsploraClient.blockHash', () => {
  it('GET /block-height/{height} → lowercase hash', async () => {
    server.use(
      http.get(`${PUBLIC_ESPLORA_URL}/block-height/${HEIGHT}`, () => HttpResponse.text(BLOCKHASH))
    )
    expect(await newClient().blockHash(HEIGHT)).toBe(BLOCKHASH)
  })

  it.each([-1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid height (%p) with ValidationError without touching the network',
    async (h) => {
      await expect(newClient().blockHash(h as number)).rejects.toBeInstanceOf(ValidationError)
    }
  )

  it('response that is not a 64-char hash → EsploraResponseError', async () => {
    server.use(
      http.get(`${PUBLIC_ESPLORA_URL}/block-height/${HEIGHT}`, () => HttpResponse.text('nope'))
    )
    await expect(newClient().blockHash(HEIGHT)).rejects.toBeInstanceOf(EsploraResponseError)
  })

  it('response larger than the limit → SizeLimitExceededError (detected in transport)', async () => {
    server.use(
      http.get(`${PUBLIC_ESPLORA_URL}/block-height/${HEIGHT}`, () =>
        HttpResponse.text('x'.repeat(MAX_ESPLORA_RESPONSE_SIZE + 1))
      )
    )
    await expect(newClient().blockHash(HEIGHT)).rejects.toBeInstanceOf(SizeLimitExceededError)
  })

  it('404 from the explorer → NetworkError (not a silent EsploraResponseError)', async () => {
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
    'rejects invalid input hash (%p) with ValidationError',
    async (h) => {
      await expect(newClient().block(h)).rejects.toBeInstanceOf(ValidationError)
    }
  )

  it('non-JSON body → EsploraResponseError', async () => {
    server.use(http.get(`${PUBLIC_ESPLORA_URL}/block/${BLOCKHASH}`, () => HttpResponse.text('<html>oops</html>')))
    await expect(newClient().block(BLOCKHASH)).rejects.toBeInstanceOf(EsploraResponseError)
  })

  it('JSON that is not an object → EsploraResponseError', async () => {
    server.use(http.get(`${PUBLIC_ESPLORA_URL}/block/${BLOCKHASH}`, () => HttpResponse.json(42)))
    await expect(newClient().block(BLOCKHASH)).rejects.toBeInstanceOf(EsploraResponseError)
  })

  it('missing or non-hex merkle_root → EsploraResponseError', async () => {
    server.use(
      http.get(`${PUBLIC_ESPLORA_URL}/block/${BLOCKHASH}`, () =>
        HttpResponse.json({ ...okBody, merkle_root: 'not-hex' })
      )
    )
    await expect(newClient().block(BLOCKHASH)).rejects.toBeInstanceOf(EsploraResponseError)
  })

  it.each([0, -5, 1.5, '1700000000'])(
    'non-positive-integer timestamp (%p) → EsploraResponseError',
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

  it('valid Bitcoin attestation → returns block time', async () => {
    wireBlock(PUBLIC_ESPLORA_URL, BLOCKHASH, MERKLEROOT, TIME)
    const time = await verifyTimestampAttestation(DIGEST, makeBitcoin(HEIGHT), newClient())
    expect(time).toBe(TIME)
  })

  it('Litecoin attestation against a Litecoin explorer → returns block time', async () => {
    const LTC_URL = 'https://litecoinspace.org/api'
    wireBlock(LTC_URL, BLOCKHASH, MERKLEROOT, TIME)
    const ltc = new EsploraClient(newLayer(), { url: LTC_URL })
    const time = await verifyTimestampAttestation(DIGEST, makeLitecoin(HEIGHT), ltc)
    expect(time).toBe(TIME)
  })

  it('digest does not match the merkle root → fails (no false positive)', async () => {
    wireBlock(PUBLIC_ESPLORA_URL, BLOCKHASH, 'cc'.repeat(32), TIME) // merkleroot != DIGEST
    await expect(
      verifyTimestampAttestation(DIGEST, makeBitcoin(HEIGHT), newClient())
    ).rejects.toThrow(/does not match/)
  })

  it('pending attestation is not on-chain verifiable → throws', async () => {
    await expect(
      verifyTimestampAttestation(DIGEST, makePending('https://a.pool.opentimestamps.org'), newClient())
    ).rejects.toThrow(/cannot verify/)
  })
})

describe('EsploraClient — UTF-8 decoding', () => {
  it('invalid UTF-8 bytes in blockHash → EsploraResponseError with "invalid UTF-8"', async () => {
    // 0xFF is invalid in UTF-8; with fatal:false it would be silently replaced,
    // but with fatal:true it must throw an explicit EsploraResponseError.
    server.use(
      http.get(`${PUBLIC_ESPLORA_URL}/block-height/${HEIGHT}`, () =>
        new HttpResponse(new Uint8Array([0x61, 0xFF, 0x62]), {
          status: 200,
          headers: { 'Content-Type': 'text/plain' },
        })
      )
    )
    let error: unknown
    try { await newClient().blockHash(HEIGHT) } catch (e) { error = e }
    expect(error).toBeInstanceOf(EsploraResponseError)
    expect((error as Error).message).toContain('invalid UTF-8')
  })
})

describe('EsploraClient — base URL validation', () => {
  it('rejects a non-http(s) base URL', () => {
    expect(() => new EsploraClient(newLayer(), { url: 'ftp://example.com' })).toThrow(ValidationError)
  })
  it('rejects a malformed base URL', () => {
    expect(() => new EsploraClient(newLayer(), { url: 'not a url' })).toThrow(ValidationError)
  })
})
