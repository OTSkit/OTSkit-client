import { describe, it, expect, vi } from 'vitest'
import { orchestrateStamp } from '../../src/core/stamp.js'
import { ValidationError } from '../../src/errors.js'

const noopValidate = async () => {}

describe('orchestrateStamp is url-validator injectable', () => {
  it('calls the injected validator once per calendar', async () => {
    const validate = vi.fn(async () => {})
    await orchestrateStamp(
      'a'.repeat(64),
      ['https://a.example', 'https://b.example'],
      {} as never,
      validate,
      undefined,
      undefined,
      1
    ).catch(() => {})
    expect(validate).toHaveBeenCalledTimes(2)
  })

  it('rejects a non-integer minimum-submissions threshold', async () => {
    await expect(
      orchestrateStamp(
        'a'.repeat(64),
        ['https://a.example'],
        {} as never,
        noopValidate,
        undefined,
        undefined,
        1.5
      )
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('rejects a threshold greater than the number of calendars', async () => {
    await expect(
      orchestrateStamp(
        'a'.repeat(64),
        ['https://a.example'],
        {} as never,
        noopValidate,
        undefined,
        undefined,
        2
      )
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('fails closed: a rejecting validator aborts before any network layer is touched', async () => {
    const boom = new Error('blocked calendar')
    const rejecting = vi.fn(async () => {
      throw boom
    })
    // networkLayer is a poisoned stub: reaching it would throw a different (TypeError) error,
    // so asserting we get `boom` back proves the validator gates the network call.
    await expect(
      orchestrateStamp(
        'a'.repeat(64),
        ['https://a.example', 'https://b.example'],
        {} as never,
        rejecting,
        undefined,
        undefined,
        1
      )
    ).rejects.toBe(boom)
  })

  it('rejects an invalid hash before contacting calendars', async () => {
    const validate = vi.fn(async () => {})
    await expect(
      orchestrateStamp(
        'nothex',
        ['https://a.example'],
        {} as never,
        validate,
        undefined,
        undefined,
        1
      )
    ).rejects.toBeInstanceOf(ValidationError)
  })
})
