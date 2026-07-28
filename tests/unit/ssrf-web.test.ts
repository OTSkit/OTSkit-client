import { describe, it, expect } from 'vitest'
import { assertSafeCalendarUrlStructural } from '../../src/security/ssrf-web.js'
import { ValidationError } from '../../src/errors.js'

describe('assertSafeCalendarUrlStructural', () => {
  it('accepts each real browser calendar', async () => {
    for (const url of [
      'https://a.pool.opentimestamps.org',
      'https://b.pool.opentimestamps.org',
      'https://a.pool.eternitywall.com',
    ]) {
      await expect(assertSafeCalendarUrlStructural(url)).resolves.toBeUndefined()
    }
  })

  it('rejects http (non-TLS) with ValidationError', async () => {
    await expect(
      assertSafeCalendarUrlStructural('http://a.pool.opentimestamps.org')
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('rejects a non-http protocol', async () => {
    await expect(assertSafeCalendarUrlStructural('ftp://example.org')).rejects.toBeInstanceOf(
      ValidationError
    )
  })

  it('rejects embedded credentials (both userinfo forms)', async () => {
    await expect(
      assertSafeCalendarUrlStructural('https://user:pass@example.org')
    ).rejects.toBeInstanceOf(ValidationError)
    await expect(
      assertSafeCalendarUrlStructural('https://user@example.org')
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('rejects an unparseable URL', async () => {
    await expect(assertSafeCalendarUrlStructural('not a url')).rejects.toBeInstanceOf(
      ValidationError
    )
  })
})
