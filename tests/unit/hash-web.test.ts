import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { hashBytes, hashBlob } from '../../src/utils/hash-web.js'
import { bytesToHex } from '../../src/utils/hex.js'

const data = new TextEncoder().encode('otskit')

describe('hashBytes', () => {
  it('produces a 32-byte digest', async () => {
    expect(await hashBytes(data)).toHaveLength(32)
  })

  it('matches the SHA-256 of the empty input (known-answer vector)', async () => {
    // Well-known SHA-256("") — guards against hashing the wrong thing on empty files.
    expect(bytesToHex(await hashBytes(new Uint8Array(0)))).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    )
  })

  it('agrees with node:crypto on non-trivial input', async () => {
    const big = new Uint8Array(100_000).map((_, i) => i % 256)
    const expected = createHash('sha256').update(big).digest('hex')
    expect(bytesToHex(await hashBytes(big))).toBe(expected)
  })
})

describe('hashBlob', () => {
  it('hashes a Blob to the same digest as its raw bytes', async () => {
    const fromBlob = await hashBlob(new Blob([data]))
    const fromBytes = await hashBytes(data)
    expect(bytesToHex(fromBlob)).toBe(bytesToHex(fromBytes))
    expect(bytesToHex(fromBlob)).toBe(createHash('sha256').update(data).digest('hex'))
  })

  it('hashes a multi-part Blob over the concatenation of its parts', async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3]), new Uint8Array([4, 5, 6])])
    const expected = createHash('sha256')
      .update(Uint8Array.from([1, 2, 3, 4, 5, 6]))
      .digest('hex')
    expect(bytesToHex(await hashBlob(blob))).toBe(expected)
  })
})
