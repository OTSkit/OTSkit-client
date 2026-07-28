import { ValidationError } from '../errors.js'
import { hexToBytes } from '../utils/hex.js'

/** Validates a SHA-256 hash and returns it as a 32-byte Uint8Array. */
export function validateHash(hash: Uint8Array | string): Uint8Array {
  if (typeof hash === 'string') {
    const hex = hash.trim().toLowerCase()
    if (!/^[0-9a-f]{64}$/.test(hex)) {
      throw new ValidationError('Hash must be a 64-character hex string (SHA-256)')
    }
    return hexToBytes(hex)
  }
  if (hash.length !== 32) {
    throw new ValidationError('Hash must be exactly 32 bytes (SHA-256)')
  }
  return Uint8Array.from(hash)
}

/** Cryptographically secure nonce (no Math.random fallback). */
export function secureNonce(n: number): Uint8Array {
  const bytes = new Uint8Array(n)
  /* c8 ignore start */
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error('secure RNG unavailable: globalThis.crypto.getRandomValues is required')
  }
  /* c8 ignore stop */
  globalThis.crypto.getRandomValues(bytes)
  return bytes
}
