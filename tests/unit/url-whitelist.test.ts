import { describe, it, expect } from 'vitest'
import { UrlWhitelist, DEFAULT_CALENDAR_WHITELIST } from '../../src/network/calendar.js'

describe('UrlWhitelist', () => {
  it('un comodin de subdominio acepta exactamente una etiqueta de host', () => {
    const wl = new UrlWhitelist(['https://*.calendar.opentimestamps.org'])
    expect(wl.contains('https://bob.calendar.opentimestamps.org')).toBe(true)
    expect(wl.contains('https://alice.btc.calendar.opentimestamps.org')).toBe(false)
    expect(wl.contains('https://calendar.opentimestamps.org')).toBe(false)
  })

  it('rechaza los bypasses conocidos de query, sufijo con punto y sub-subdominio', () => {
    const wl = new UrlWhitelist(['https://*.calendar.opentimestamps.org'])
    expect(wl.contains('https://evil.com?foo=alice.btc.calendar.opentimestamps.org')).toBe(false)
    expect(wl.contains('https://alice.btc.calendar.opentimestamps.org.evil.com')).toBe(false)
    expect(wl.contains('https://x.y.calendar.opentimestamps.org')).toBe(false)
  })

  it('rechaza userinfo bypass (RFC 3986 §3.2.1)', () => {
    const wl = new UrlWhitelist(['https://*.calendar.opentimestamps.org'])
    // new URL() aísla el hostname real (evil.com), userinfo no es el host
    expect(wl.contains('https://alice.btc.calendar.opentimestamps.org@evil.com/')).toBe(false)
  })

  it('rechaza hosts fuera de la whitelist', () => {
    const wl = new UrlWhitelist(['https://*.calendar.opentimestamps.org'])
    expect(wl.contains('https://evil.example.com')).toBe(false)
    expect(wl.contains('https://calendar.opentimestamps.org.evil.com')).toBe(false)
  })

  it('rechaza path, query y fragmentos cuando el patron es una URL base', () => {
    const wl = new UrlWhitelist(['https://*.opentimestamps.org'])
    expect(wl.contains('https://a.opentimestamps.org/evil/path')).toBe(false)
    expect(wl.contains('https://a.opentimestamps.org/../admin')).toBe(false)
    expect(wl.contains('https://a.opentimestamps.org?x=a.opentimestamps.org')).toBe(false)
    expect(wl.contains('https://a.opentimestamps.org#x')).toBe(false)
  })

  it('valida esquema y puerto como parte de la autoridad permitida', () => {
    const httpsOnly = new UrlWhitelist(['https://a.opentimestamps.org'])
    expect(httpsOnly.contains('https://a.opentimestamps.org')).toBe(true)
    expect(httpsOnly.contains('HTTPS://a.opentimestamps.org')).toBe(true)
    expect(httpsOnly.contains('http://a.opentimestamps.org')).toBe(false)
    expect(httpsOnly.contains('ftp://a.opentimestamps.org')).toBe(false)
    expect(httpsOnly.contains('https://a.opentimestamps.org:444')).toBe(false)

    const withPort = new UrlWhitelist(['https://a.opentimestamps.org:444'])
    expect(withPort.contains('https://a.opentimestamps.org:444')).toBe(true)
    expect(withPort.contains('https://a.opentimestamps.org')).toBe(false)
  })

  it('anade http:// y https:// si la entrada no trae esquema', () => {
    const wl = new UrlWhitelist(['*.calendar.opentimestamps.org'])
    expect(wl.contains('http://a.calendar.opentimestamps.org')).toBe(true)
    expect(wl.contains('https://a.calendar.opentimestamps.org')).toBe(true)
  })

  it('rechaza entradas que no son URLs publicas esperadas', () => {
    const wl = new UrlWhitelist(['https://*.calendar.opentimestamps.org'])
    expect(wl.contains('')).toBe(false)
    expect(wl.contains('https://127.0.0.1')).toBe(false)
    expect(wl.contains('https://[::1]')).toBe(false)
    expect(wl.contains('not a url')).toBe(false)
  })

  it('add rechaza entradas que no son string', () => {
    // @ts-expect-error entrada invalida deliberada
    expect(() => new UrlWhitelist([123])).toThrow(TypeError)
  })

  it('toString no lanza y lista las entradas', () => {
    const wl = new UrlWhitelist(['https://a.opentimestamps.org'])
    expect(() => wl.toString()).not.toThrow()
    expect(wl.toString()).toContain('https://a.opentimestamps.org')
  })

  it('la whitelist por defecto acepta los calendarios oficiales necesarios', () => {
    expect(DEFAULT_CALENDAR_WHITELIST.contains('https://alice.btc.calendar.opentimestamps.org')).toBe(true)
    expect(DEFAULT_CALENDAR_WHITELIST.contains('https://finney.calendar.eternitywall.com')).toBe(true)
  })

  it('el emparejado de host es case-insensitive', () => {
    const wl = new UrlWhitelist(['https://*.calendar.opentimestamps.org'])
    expect(wl.contains('https://BOB.Calendar.OpenTimestamps.org')).toBe(true)
  })
})
