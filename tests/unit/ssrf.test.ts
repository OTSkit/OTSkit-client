import { describe, it, expect } from 'vitest'
import { assertSafeCalendarUrl } from '../../src/security/ssrf.js'
import { ValidationError } from '../../src/errors.js'

describe('assertSafeCalendarUrl', () => {
  describe('invalid protocol', () => {
    it('rejects file://', async () => {
      await expect(
        assertSafeCalendarUrl('file:///etc/passwd', { allowPrivate: false })
      ).rejects.toThrow(ValidationError)
    })

    it('rejects ftp://', async () => {
      await expect(
        assertSafeCalendarUrl('ftp://example.com', { allowPrivate: false })
      ).rejects.toThrow('http or https')
    })
  })

  describe('private IPs with literal IP address', () => {
    it('blocks 127.0.0.1 (loopback)', async () => {
      await expect(
        assertSafeCalendarUrl('http://127.0.0.1/api', { allowPrivate: false })
      ).rejects.toThrow('private/reserved')
    })

    it('blocks 169.254.169.254 (AWS IMDS)', async () => {
      await expect(
        assertSafeCalendarUrl('http://169.254.169.254/latest/meta-data/', { allowPrivate: false })
      ).rejects.toThrow('Link-local/IMDS')
    })

    it('blocks 10.0.0.1 (RFC 1918)', async () => {
      await expect(
        assertSafeCalendarUrl('http://10.0.0.1/', { allowPrivate: false })
      ).rejects.toThrow('RFC 1918')
    })

    it('blocks [::1] (IPv6 loopback)', async () => {
      await expect(
        assertSafeCalendarUrl('http://[::1]/', { allowPrivate: false })
      ).rejects.toThrow('Loopback')
    })
  })

  describe('allowPrivate: true', () => {
    it('allows 127.0.0.1 when allowPrivate is true', async () => {
      await expect(
        assertSafeCalendarUrl('http://127.0.0.1/api', { allowPrivate: true })
      ).resolves.toBeUndefined()
    })
  })

  describe('embedded credentials', () => {
    it('rejects URLs with user:password credentials', async () => {
      await expect(
        assertSafeCalendarUrl('http://user:pass@calendar.example.com/', { allowPrivate: false })
      ).rejects.toThrow('credentials')
    })
  })

  describe('invalid URL', () => {
    it('rejects strings that cannot be parsed as a URL', async () => {
      await expect(
        assertSafeCalendarUrl('not-a-url', { allowPrivate: false })
      ).rejects.toThrow(ValidationError)
    })
  })
})
