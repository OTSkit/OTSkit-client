import { describe, it, expect } from 'vitest'
import { EsploraResponseError, NetworkError } from '../../src/errors.js'

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
