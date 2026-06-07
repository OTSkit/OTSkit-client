/** Integration tests de verify() — Esplora canónico, fail-closed. */
import { describe, it, expect } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../mocks/server.js'
import { OpenTimestampsClient } from '../../src/client.js'
import { DetachedTimestampFile, OpSHA256, OpAppend, makeBitcoin, bytesToHex } from '@otskit/core'
import { FAKE_COMPLETE_OTS, FAKE_INCOMPLETE_OTS, BITCOIN_HEIGHT, BLOCK_TIME } from '../mocks/handlers.js'
import { MAX_BITCOIN_ATTESTATIONS } from '../../src/core/orchestration.js'

describe('verify() - Integration', () => {
  it('verifica una prueba completa contra la cadena', async () => {
    const result = await new OpenTimestampsClient().verify(Buffer.from(FAKE_COMPLETE_OTS))
    expect(result.status).toBe('verified')
    if (result.status === 'verified') {
      expect(result.blockHeight).toBe(BITCOIN_HEIGHT)
      expect(result.blockTime).toBe(BLOCK_TIME)
    }
  })

  it('verifica con el hash original correcto', async () => {
    const result = await new OpenTimestampsClient().verify(Buffer.from(FAKE_COMPLETE_OTS), 'aa'.repeat(32))
    expect(result.status).toBe('verified')
  })

  it('falla si el hash original no coincide', async () => {
    const result = await new OpenTimestampsClient().verify(Buffer.from(FAKE_COMPLETE_OTS), 'bb'.repeat(32))
    expect(result.status).toBe('invalid')
    if (result.status === 'invalid') expect(result.reason).toContain('File hash does not match')
  })

  it('falla (no Bitcoin) para una prueba incompleta', async () => {
    const result = await new OpenTimestampsClient().verify(Buffer.from(FAKE_INCOMPLETE_OTS))
    expect(result.status).toBe('pending')
    if (result.status === 'pending') expect(result.reason).toContain('No Bitcoin attestation found')
  })

  it('falla para un .ots con formato inválido — lanza ValidationError', async () => {
    const { ValidationError } = await import('../../src/errors.js')
    await expect(
      new OpenTimestampsClient().verify(Buffer.from([0xff, 0xff, 0xff]))
    ).rejects.toThrow(ValidationError)
  })

  it('fail-closed: si Esplora falla, devuelve network_error', async () => {
    server.use(
      http.get('https://blockstream.info/api/block-height/:height', () => HttpResponse.error())
    )
    const result = await new OpenTimestampsClient().verify(Buffer.from(FAKE_COMPLETE_OTS))
    expect(result.status).toBe('network_error')
    if (result.status === 'network_error') expect(result.reason).toContain('Could not reach Bitcoin blockchain')
  })

  it('hash hex inválido — lanza ValidationError', async () => {
    const { ValidationError } = await import('../../src/errors.js')
    await expect(
      new OpenTimestampsClient().verify(Buffer.from(FAKE_COMPLETE_OTS), 'not-a-hex-string')
    ).rejects.toThrow(ValidationError)
  })

  it('prueba TODAS las attestations Bitcoin: válida si una verifica aunque otra falle', async () => {
    // Dos hojas con attestation Bitcoin a alturas distintas. La primera apunta a un bloque
    // inexistente (404); la segunda es válida. verify debe devolver válido por la segunda.
    const dtf = DetachedTimestampFile.fromHash(new OpSHA256(), new Uint8Array(32).fill(0xcc))
    const leafBad = dtf.timestamp.add(new OpSHA256()) // 32 bytes
    leafBad.attestations.push(makeBitcoin(111111))
    const leafGood = dtf.timestamp.add(new OpAppend(new Uint8Array([0x01]))).add(new OpSHA256()) // 32 bytes
    leafGood.attestations.push(makeBitcoin(222222))
    const goodHash = 'cd'.repeat(32)
    const goodMerkleroot = bytesToHex(Uint8Array.from(leafGood.getDigest()).reverse())
    server.use(
      http.get('https://blockstream.info/api/block-height/111111', () => new HttpResponse(null, { status: 404 })),
      http.get('https://blockstream.info/api/block-height/222222', () => HttpResponse.text(goodHash)),
      http.get(`https://blockstream.info/api/block/${goodHash}`, () =>
        HttpResponse.json({ merkle_root: goodMerkleroot, timestamp: 1700000000 })
      )
    )
    const result = await new OpenTimestampsClient().verify(Buffer.from(dtf.serializeToBytes()))
    expect(result.status).toBe('verified')
    if (result.status === 'verified') expect(result.blockHeight).toBe(222222)
  })

  it('MAX_BITCOIN_ATTESTATIONS está exportada y es razonable', () => {
    expect(MAX_BITCOIN_ATTESTATIONS).toBeGreaterThan(0)
    expect(MAX_BITCOIN_ATTESTATIONS).toBeLessThanOrEqual(20)
  })

  it('attestation litecoin → no soportado por este cliente', async () => {
    const { makeLitecoin } = await import('@otskit/core')
    const dtf = DetachedTimestampFile.fromHash(new OpSHA256(), new Uint8Array(32).fill(0xdd))
    const leaf = dtf.timestamp.add(new OpSHA256())
    leaf.attestations.push(makeLitecoin(800000))
    const result = await new OpenTimestampsClient().verify(Buffer.from(dtf.serializeToBytes()))
    expect(result.status).toBe('pending')
    if (result.status === 'pending') expect(result.reason).toContain('Litecoin')
  })
})
