/** Integration tests for verify() — canonical Esplora, fail-closed. */
import { createHash } from 'node:crypto'
import { describe, it, expect } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../mocks/server.js'
import { OpenTimestampsClient } from '../../src/client.js'
import { DetachedTimestampFile, OpSHA256, OpSHA1, OpAppend, makeBitcoin } from '@otskit/core'
import { FAKE_COMPLETE_OTS, FAKE_INCOMPLETE_OTS, BITCOIN_HEIGHT, BLOCK_TIME } from '../mocks/handlers.js'
import { MAX_BITCOIN_ATTESTATIONS } from '../../src/core/orchestration.js'

const sha256d = (data: Uint8Array): Uint8Array => {
  const first = createHash('sha256').update(data).digest()
  return new Uint8Array(createHash('sha256').update(first).digest())
}

/** Builds a valid raw header whose merkle root (bytes 36..68) equals `merkleRootInternal`. */
function rawHeaderFor(merkleRootInternal: Uint8Array, time: number): { header: Uint8Array; hash: string } {
  const header = new Uint8Array(80)
  header.set(merkleRootInternal, 36)
  header[68] = time & 0xff
  header[69] = (time >> 8) & 0xff
  header[70] = (time >> 16) & 0xff
  header[71] = (time >> 24) & 0xff
  const hash = Buffer.from(sha256d(header)).reverse().toString('hex')
  return { header, hash }
}

describe('verify() - Integration', () => {
  it('verifies a complete proof against the chain', async () => {
    const result = await new OpenTimestampsClient().verify(Buffer.from(FAKE_COMPLETE_OTS))
    expect(result.status).toBe('verified')
    if (result.status === 'verified') {
      expect(result.blockHeight).toBe(BITCOIN_HEIGHT)
      expect(result.blockTime).toBe(BLOCK_TIME)
    }
  })

  it('verifies with the correct original hash', async () => {
    const result = await new OpenTimestampsClient().verify(Buffer.from(FAKE_COMPLETE_OTS), 'aa'.repeat(32))
    expect(result.status).toBe('verified')
  })

  it('returns invalid when the original hash does not match', async () => {
    const result = await new OpenTimestampsClient().verify(Buffer.from(FAKE_COMPLETE_OTS), 'bb'.repeat(32))
    expect(result.status).toBe('invalid')
    if (result.status === 'invalid') expect(result.reason).toContain('File hash does not match')
  })

  it('returns pending (no Bitcoin) for an incomplete proof', async () => {
    const result = await new OpenTimestampsClient().verify(Buffer.from(FAKE_INCOMPLETE_OTS))
    expect(result.status).toBe('pending')
    if (result.status === 'pending') expect(result.reason).toContain('No Bitcoin attestation found')
  })

  it('throws ValidationError for an invalid .ots format', async () => {
    const { ValidationError } = await import('../../src/errors.js')
    await expect(
      new OpenTimestampsClient().verify(Buffer.from([0xff, 0xff, 0xff]))
    ).rejects.toThrow(ValidationError)
  })

  it('fail-closed: returns network_error when Esplora is unreachable', async () => {
    server.use(
      http.get('https://blockstream.info/api/block-height/:height', () => HttpResponse.error())
    )
    const result = await new OpenTimestampsClient().verify(Buffer.from(FAKE_COMPLETE_OTS))
    expect(result.status).toBe('network_error')
    if (result.status === 'network_error') expect(result.reason).toContain('Could not reach Bitcoin blockchain')
  })

  it('throws ValidationError for an invalid hex hash', async () => {
    const { ValidationError } = await import('../../src/errors.js')
    await expect(
      new OpenTimestampsClient().verify(Buffer.from(FAKE_COMPLETE_OTS), 'not-a-hex-string')
    ).rejects.toThrow(ValidationError)
  })

  it('tries ALL Bitcoin attestations: valid if any one verifies even when another fails', async () => {
    // Two leaves with Bitcoin attestations at different heights. The first points to a
    // non-existent block (404); the second is valid. verify must return verified via the second.
    const dtf = DetachedTimestampFile.fromHash(new OpSHA256(), new Uint8Array(32).fill(0xcc))
    const leafBad = dtf.timestamp.add(new OpSHA256()) // 32 bytes
    leafBad.addAttestation(makeBitcoin(111111))
    const leafGood = dtf.timestamp.add(new OpAppend(new Uint8Array([0x01]))).add(new OpSHA256()) // 32 bytes
    leafGood.addAttestation(makeBitcoin(222222))
    // Build a self-authenticating raw header for the good block.
    const goodMerkleRootInternal = Uint8Array.from(leafGood.getDigest()).reverse()
    const { header: goodRawHeader, hash: goodHash } = rawHeaderFor(goodMerkleRootInternal, 1700000000)
    server.use(
      http.get('https://blockstream.info/api/block-height/111111', () => new HttpResponse(null, { status: 404 })),
      http.get('https://blockstream.info/api/block-height/222222', () => HttpResponse.text(goodHash)),
      http.get(`https://blockstream.info/api/block/${goodHash}/header`, () =>
        new HttpResponse(goodRawHeader, { status: 200, headers: { 'Content-Type': 'application/octet-stream' } })
      )
    )
    const result = await new OpenTimestampsClient().verify(Buffer.from(dtf.serializeToBytes()))
    expect(result.status).toBe('verified')
    if (result.status === 'verified') expect(result.blockHeight).toBe(222222)
  })

  it('returns invalid with a helpful message for a SHA-1 legacy proof', async () => {
    const dtf = DetachedTimestampFile.fromHash(new OpSHA1(), new Uint8Array(20).fill(0xaa))
    dtf.timestamp.add(new OpSHA256()).addAttestation(makeBitcoin(800000))
    const result = await new OpenTimestampsClient().verify(Buffer.from(dtf.serializeToBytes()))
    expect(result.status).toBe('invalid')
    if (result.status === 'invalid') {
      expect(result.reason).toContain('sha1')
      expect(result.reason).toContain('weak hash algorithm')
    }
  })

  it('MAX_BITCOIN_ATTESTATIONS is exported and has a reasonable value', () => {
    expect(MAX_BITCOIN_ATTESTATIONS).toBeGreaterThan(0)
    expect(MAX_BITCOIN_ATTESTATIONS).toBeLessThanOrEqual(20)
  })

  it('Litecoin attestation → not supported by this client', async () => {
    const { makeLitecoin } = await import('@otskit/core')
    const dtf = DetachedTimestampFile.fromHash(new OpSHA256(), new Uint8Array(32).fill(0xdd))
    const leaf = dtf.timestamp.add(new OpSHA256())
    leaf.addAttestation(makeLitecoin(800000))
    const result = await new OpenTimestampsClient().verify(Buffer.from(dtf.serializeToBytes()))
    expect(result.status).toBe('pending')
    if (result.status === 'pending') expect(result.reason).toContain('Litecoin')
  })
})
