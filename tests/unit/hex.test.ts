import { describe, it, expect } from 'vitest'
import { hexToBytes, bytesToHex } from '../../src/utils/hex.js'

describe('hexToBytes', () => {
  it('decodes to the exact byte values, not just the right length', () => {
    expect(Array.from(hexToBytes('000f ff10'.replace(' ', '')))).toEqual([0, 15, 255, 16])
  })

  it('round-trips a 32-byte SHA-256 digest', () => {
    const hex = '7f86dc618f35e8b710df6069487a8dbfceed9147754ed983af33daae6b76a290'
    expect(bytesToHex(hexToBytes(hex))).toBe(hex)
    expect(hexToBytes(hex)).toHaveLength(32)
  })

  it('normalizes uppercase and surrounding whitespace', () => {
    expect(Array.from(hexToBytes('  DEADbeef\n'))).toEqual([0xde, 0xad, 0xbe, 0xef])
  })

  it('decodes the empty string to an empty array', () => {
    expect(hexToBytes('')).toHaveLength(0)
  })

  it('rejects odd-length input', () => {
    expect(() => hexToBytes('abc')).toThrow()
  })

  it('rejects non-hex characters', () => {
    expect(() => hexToBytes('zz')).toThrow()
    expect(() => hexToBytes('gg')).toThrow()
  })
})

describe('bytesToHex', () => {
  it('zero-pads single-digit bytes', () => {
    expect(bytesToHex(Uint8Array.from([0, 1, 15, 16]))).toBe('00010f10')
  })

  it('matches Node Buffer output across the full byte range', () => {
    const bytes = Uint8Array.from(Array.from({ length: 256 }, (_, i) => i))
    expect(bytesToHex(bytes)).toBe(Buffer.from(bytes).toString('hex'))
  })
})
