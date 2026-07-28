import { describe, it, expect } from 'vitest'
import { validateHash, secureNonce } from '../../src/core/shared.js'
import { ValidationError } from '../../src/errors.js'

describe('validateHash', () => {
  it('decodes a hex string to the exact bytes it represents', () => {
    const out = validateHash('00ff10'.padEnd(64, '0'))
    expect(out).toHaveLength(32)
    expect([out[0], out[1], out[2]]).toEqual([0, 255, 16])
  })

  it('accepts uppercase and surrounding whitespace', () => {
    const lower = validateHash('a'.repeat(64))
    const upper = validateHash(`  ${'A'.repeat(64)}\n`)
    expect(upper).toEqual(lower)
  })

  it('returns an independent copy of a Uint8Array input (no aliasing)', () => {
    const input = new Uint8Array(32).fill(7)
    const out = validateHash(input)
    out[0] = 99
    expect(input[0]).toBe(7) // mutating the result must not touch the caller's buffer
  })

  it('rejects a 63-char hex string with ValidationError', () => {
    expect(() => validateHash('a'.repeat(63))).toThrow(ValidationError)
  })

  it('rejects non-hex characters with ValidationError', () => {
    expect(() => validateHash('z'.repeat(64))).toThrow(ValidationError)
  })

  it('rejects a 31-byte Uint8Array with ValidationError', () => {
    expect(() => validateHash(new Uint8Array(31))).toThrow(ValidationError)
  })

  it('rejects a 33-byte Uint8Array with ValidationError', () => {
    expect(() => validateHash(new Uint8Array(33))).toThrow(ValidationError)
  })
})

describe('secureNonce', () => {
  it('returns exactly n bytes', () => {
    expect(secureNonce(16)).toHaveLength(16)
    expect(secureNonce(0)).toHaveLength(0)
  })

  it('does not return an all-zero buffer', () => {
    // A stubbed/broken RNG would leave the freshly-allocated zeros in place.
    const nonce = secureNonce(32)
    expect(nonce.some((b) => b !== 0)).toBe(true)
  })

  it('returns different bytes on successive calls', () => {
    const a = secureNonce(32)
    const b = secureNonce(32)
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false)
  })
})
