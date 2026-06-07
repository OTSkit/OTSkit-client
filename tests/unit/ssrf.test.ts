import { describe, it, expect } from 'vitest'
import { assertSafeCalendarUrl } from '../../src/security/ssrf.js'
import { ValidationError } from '../../src/errors.js'

describe('assertSafeCalendarUrl', () => {
  describe('protocolo inválido', () => {
    it('rechaza file://', async () => {
      await expect(
        assertSafeCalendarUrl('file:///etc/passwd', { allowPrivate: false })
      ).rejects.toThrow(ValidationError)
    })

    it('rechaza ftp://', async () => {
      await expect(
        assertSafeCalendarUrl('ftp://example.com', { allowPrivate: false })
      ).rejects.toThrow('http or https')
    })
  })

  describe('IPs privadas con IP literal', () => {
    it('bloquea 127.0.0.1 (loopback)', async () => {
      await expect(
        assertSafeCalendarUrl('http://127.0.0.1/api', { allowPrivate: false })
      ).rejects.toThrow('private/reserved')
    })

    it('bloquea 169.254.169.254 (AWS IMDS)', async () => {
      await expect(
        assertSafeCalendarUrl('http://169.254.169.254/latest/meta-data/', { allowPrivate: false })
      ).rejects.toThrow('Link-local/IMDS')
    })

    it('bloquea 10.0.0.1 (RFC 1918)', async () => {
      await expect(
        assertSafeCalendarUrl('http://10.0.0.1/', { allowPrivate: false })
      ).rejects.toThrow('RFC 1918')
    })

    it('bloquea [::1] (IPv6 loopback)', async () => {
      await expect(
        assertSafeCalendarUrl('http://[::1]/', { allowPrivate: false })
      ).rejects.toThrow('Loopback')
    })
  })

  describe('allowPrivate: true', () => {
    it('permite 127.0.0.1 si allowPrivate es true', async () => {
      await expect(
        assertSafeCalendarUrl('http://127.0.0.1/api', { allowPrivate: true })
      ).resolves.toBeUndefined()
    })
  })

  describe('credenciales embebidas', () => {
    it('rechaza URLs con usuario:contraseña', async () => {
      await expect(
        assertSafeCalendarUrl('http://user:pass@calendar.example.com/', { allowPrivate: false })
      ).rejects.toThrow('credentials')
    })
  })

  describe('URL inválida', () => {
    it('rechaza strings no parseables como URL', async () => {
      await expect(
        assertSafeCalendarUrl('not-a-url', { allowPrivate: false })
      ).rejects.toThrow(ValidationError)
    })
  })
})
