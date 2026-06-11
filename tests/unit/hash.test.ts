import { describe, it, expect } from 'vitest'
import { createHash } from 'crypto'
import { writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { hashBuffer, hashFile } from '../../src/index.js'

const sha256 = (data: string) => createHash('sha256').update(data).digest()

describe('hashBuffer', () => {
  it('returns SHA-256 of a Buffer as Buffer', () => {
    const input = Buffer.from('hello')
    const result = hashBuffer(input)
    expect(result).toBeInstanceOf(Buffer)
    expect(result.toString('hex')).toBe(sha256('hello').toString('hex'))
  })

  it('returns SHA-256 of a Uint8Array as Buffer', () => {
    const input = new TextEncoder().encode('hello')
    const result = hashBuffer(input)
    expect(result.toString('hex')).toBe(sha256('hello').toString('hex'))
  })

  it('returns correct hash for empty input', () => {
    const result = hashBuffer(Buffer.alloc(0))
    // SHA-256 of the empty string
    expect(result.toString('hex')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
  })
})

describe('hashFile', () => {
  it('returns SHA-256 of a file as Buffer', async () => {
    const path = join(tmpdir(), 'otskit-test-hash.txt')
    writeFileSync(path, 'hello')
    try {
      const result = await hashFile(path)
      expect(result).toBeInstanceOf(Buffer)
      expect(result.toString('hex')).toBe(sha256('hello').toString('hex'))
    } finally {
      rmSync(path)
    }
  })

  it('rejects for a non-existent file', async () => {
    await expect(hashFile('/does/not/exist/otskit-test.txt')).rejects.toThrow()
  })
})
