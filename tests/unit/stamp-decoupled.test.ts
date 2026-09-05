import { describe, it, expect, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../mocks/server.js'
import { orchestrateStamp } from '../../src/core/stamp.js'
import { ValidationError, StampError } from '../../src/errors.js'
import { ResilientNetworkLayer } from '../../src/network/resilience.js'
import { DEFAULT_RESILIENCE } from '../../src/types.js'

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

  it('stamps with the remaining calendars when one fails to resolve', async () => {
    const ALICE = 'https://alice.btc.calendar.opentimestamps.org'
    const BOB = 'https://bob.btc.calendar.opentimestamps.org'
    const UNRESOLVABLE = 'https://finney.calendar.eternitywall.com'

    let contactedUnresolvable = false
    server.use(
      http.post(`${UNRESOLVABLE}/digest`, () => {
        contactedUnresolvable = true
        return new HttpResponse(null, { status: 500 })
      })
    )

    // A single transient DNS failure used to abort the whole stamp through Promise.all.
    const validate = vi.fn(async (url: string) => {
      if (url === UNRESOLVABLE) {
        throw new ValidationError(
          'Calendar URL hostname "finney.calendar.eternitywall.com" could not be resolved: getaddrinfo EAI_AGAIN'
        )
      }
    })

    const layer = new ResilientNetworkLayer({
      ...DEFAULT_RESILIENCE,
      retries: { ...DEFAULT_RESILIENCE.retries, enabled: false },
    })
    const bytes = await orchestrateStamp(
      'a'.repeat(64),
      [ALICE, UNRESOLVABLE, BOB],
      layer,
      validate,
      undefined,
      undefined,
      2
    )

    expect(bytes).toBeInstanceOf(Uint8Array)
    expect(bytes.length).toBeGreaterThan(0)
    expect(validate).toHaveBeenCalledTimes(3)
    expect(contactedUnresolvable).toBe(false)
  })

  it('fails when the calendars left after validation cannot meet the threshold', async () => {
    const ALICE = 'https://alice.btc.calendar.opentimestamps.org'
    const BOB = 'https://bob.btc.calendar.opentimestamps.org'
    const validate = vi.fn(async (url: string) => {
      if (url !== ALICE) throw new ValidationError('could not be resolved')
    })

    await expect(
      orchestrateStamp('a'.repeat(64), [ALICE, BOB], {} as never, validate, undefined, undefined, 2)
    ).rejects.toBeInstanceOf(StampError)
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
