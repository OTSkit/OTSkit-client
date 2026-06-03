import { describe, it, expect } from 'vitest'
import { NetworkError } from '../../src/errors.js'

describe('NetworkError.status', () => {
  it('por defecto es undefined', () => {
    expect(new NetworkError('boom').status).toBeUndefined()
  })
  it('acepta un status HTTP', () => {
    expect(new NetworkError('not found', { status: 404 }).status).toBe(404)
  })
})
