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

import { createHash } from 'node:crypto'
import { verifyTimestampAttestation } from '../../src/network/esplora.js'
import { makeBitcoin, makeLitecoin, makePending } from '@otskit/core'

/**
 * Builds a syntactically valid 80-byte block header whose merkle root (bytes 36..68)
 * is set to `merkleRoot`, and whose sha256d reversed equals the returned `hash`.
 * Used to produce self-consistent test data for rawBlockHeader.
 */
function makeRawHeader(merkleRoot: Uint8Array, time: number): { header: Uint8Array; hash: string } {
  const header = new Uint8Array(80)
  header.set(merkleRoot, 36)
  header[68] = time & 0xff
  header[69] = (time >> 8) & 0xff
  header[70] = (time >> 16) & 0xff
  header[71] = (time >> 24) & 0xff
  const first = createHash('sha256').update(header).digest()
  const second = new Uint8Array(createHash('sha256').update(first).digest())
  const hash = Buffer.from(second).reverse().toString('hex')
  return { header, hash }
}

describe('EsploraClient.rawBlockHeader', () => {
  it('GET /block/{hash}/header → 80-byte header (self-authenticated)', async () => {
    const { header, hash } = makeRawHeader(DIGEST, TIME)
    server.use(
      http.get(`${PUBLIC_ESPLORA_URL}/block/${hash}/header`, () =>
        new HttpResponse(header, { status: 200, headers: { 'Content-Type': 'application/octet-stream' } })
      )
    )
    const result = await newClient().rawBlockHeader(hash)
    expect(result).toEqual(header)
  })

  it('tampered header (hash mismatch) → EsploraResponseError', async () => {
    const { header, hash } = makeRawHeader(DIGEST, TIME)
    const tampered = new Uint8Array(header)
    tampered[0] ^= 0xff // flip one byte
    server.use(
      http.get(`${PUBLIC_ESPLORA_URL}/block/${hash}/header`, () =>
        new HttpResponse(tampered, { status: 200, headers: { 'Content-Type': 'application/octet-stream' } })
      )
    )
    await expect(newClient().rawBlockHeader(hash)).rejects.toBeInstanceOf(EsploraResponseError)
  })

  it('wrong size response → EsploraResponseError', async () => {
    const { hash } = makeRawHeader(DIGEST, TIME)
    server.use(
      http.get(`${PUBLIC_ESPLORA_URL}/block/${hash}/header`, () =>
        new HttpResponse(new Uint8Array(79), { status: 200, headers: { 'Content-Type': 'application/octet-stream' } })
      )
    )
    await expect(newClient().rawBlockHeader(hash)).rejects.toBeInstanceOf(EsploraResponseError)
  })

  it.each(['zz', 'a'.repeat(63), ''])(
    'invalid hash (%p) → ValidationError',
    async (h) => {
      await expect(newClient().rawBlockHeader(h)).rejects.toBeInstanceOf(ValidationError)
    }
  )
})

describe('verifyTimestampAttestation', () => {
  const wireRaw = (baseUrl: string, hash: string, header: Uint8Array) => {
    server.use(
      http.get(`${baseUrl}/block-height/${HEIGHT}`, () => HttpResponse.text(hash)),
      http.get(`${baseUrl}/block/${hash}/header`, () =>
        new HttpResponse(header, { status: 200, headers: { 'Content-Type': 'application/octet-stream' } })
      )
    )
  }

  it('valid Bitcoin attestation → returns block time', async () => {
    const { header, hash } = makeRawHeader(DIGEST, TIME)
    wireRaw(PUBLIC_ESPLORA_URL, hash, header)
    const time = await verifyTimestampAttestation(DIGEST, makeBitcoin(HEIGHT), newClient())
    expect(time).toBe(TIME)
  })

  it('Litecoin attestation against a Litecoin explorer → returns block time', async () => {
    const LTC_URL = 'https://litecoinspace.org/api'
    const { header, hash } = makeRawHeader(DIGEST, TIME)
    wireRaw(LTC_URL, hash, header)
    const ltc = new EsploraClient(newLayer(), { url: LTC_URL })
    const time = await verifyTimestampAttestation(DIGEST, makeLitecoin(HEIGHT), ltc)
    expect(time).toBe(TIME)
  })

  it('digest does not match the merkle root → fails (no false positive)', async () => {
    const wrongDigest = new Uint8Array(32).fill(0xcc)
    const { header, hash } = makeRawHeader(wrongDigest, TIME) // merkleroot != DIGEST
    wireRaw(PUBLIC_ESPLORA_URL, hash, header)
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
