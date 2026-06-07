import { describe, it, expect } from 'vitest'
import { EsploraResponseError, NetworkError, SizeLimitExceededError } from '../../src/errors.js'

describe('EsploraResponseError', () => {
  it('es un NetworkError', () => {
    const e = new EsploraResponseError('bad block')
    expect(e).toBeInstanceOf(NetworkError)
    expect(e).toBeInstanceOf(Error)
    expect(e.name).toBe('EsploraResponseError')
    expect(e.message).toBe('bad block')
  })

  it('preserva la causa', () => {
    const cause = new Error('parse fail')
    const e = new EsploraResponseError('bad json', { cause })
    expect(e.cause).toBe(cause)
  })
})

describe('SizeLimitExceededError', () => {
  it('tiene maxBytes y actualBytes en el mensaje', () => {
    const err = new SizeLimitExceededError(10_000, 15_000)
    expect(err).toBeInstanceOf(SizeLimitExceededError)
    expect(err).toBeInstanceOf(NetworkError)
    expect(err.maxBytes).toBe(10_000)
    expect(err.actualBytes).toBe(15_000)
    expect(err.message).toContain('15000')
    expect(err.message).toContain('10000')
  })

  it('funciona sin actualBytes', () => {
    const err = new SizeLimitExceededError(5_000)
    expect(err.maxBytes).toBe(5_000)
    expect(err.actualBytes).toBeUndefined()
    expect(err.message).toContain('5000')
  })
})
