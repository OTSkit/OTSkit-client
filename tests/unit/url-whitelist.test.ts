import { describe, it, expect } from 'vitest'
import { UrlWhitelist, DEFAULT_CALENDAR_WHITELIST } from '../../src/network/calendar.js'

describe('UrlWhitelist', () => {
  it('a subdomain wildcard accepts exactly one host label', () => {
    const wl = new UrlWhitelist(['https://*.calendar.opentimestamps.org'])
    expect(wl.contains('https://bob.calendar.opentimestamps.org')).toBe(true)
    expect(wl.contains('https://alice.btc.calendar.opentimestamps.org')).toBe(false)
    expect(wl.contains('https://calendar.opentimestamps.org')).toBe(false)
  })

  it('rejects known bypasses: query suffix, dot-suffix, and sub-subdomain', () => {
    const wl = new UrlWhitelist(['https://*.calendar.opentimestamps.org'])
    expect(wl.contains('https://evil.com?foo=alice.btc.calendar.opentimestamps.org')).toBe(false)
    expect(wl.contains('https://alice.btc.calendar.opentimestamps.org.evil.com')).toBe(false)
    expect(wl.contains('https://x.y.calendar.opentimestamps.org')).toBe(false)
  })

  it('rejects userinfo bypass (RFC 3986 §3.2.1)', () => {
    const wl = new UrlWhitelist(['https://*.calendar.opentimestamps.org'])
    // new URL() isolates the real hostname (evil.com); userinfo is not the host
    expect(wl.contains('https://alice.btc.calendar.opentimestamps.org@evil.com/')).toBe(false)
  })

  it('rejects hosts outside the allowlist', () => {
    const wl = new UrlWhitelist(['https://*.calendar.opentimestamps.org'])
    expect(wl.contains('https://evil.example.com')).toBe(false)
    expect(wl.contains('https://calendar.opentimestamps.org.evil.com')).toBe(false)
  })

  it('rejects path, query, and fragments when the pattern is a base URL', () => {
    const wl = new UrlWhitelist(['https://*.opentimestamps.org'])
    expect(wl.contains('https://a.opentimestamps.org/evil/path')).toBe(false)
    expect(wl.contains('https://a.opentimestamps.org/../admin')).toBe(false)
    expect(wl.contains('https://a.opentimestamps.org?x=a.opentimestamps.org')).toBe(false)
    expect(wl.contains('https://a.opentimestamps.org#x')).toBe(false)
  })

  it('validates scheme and port as part of the allowed authority', () => {
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

  it('adds both http:// and https:// variants when no scheme is provided', () => {
    const wl = new UrlWhitelist(['*.calendar.opentimestamps.org'])
    expect(wl.contains('http://a.calendar.opentimestamps.org')).toBe(true)
    expect(wl.contains('https://a.calendar.opentimestamps.org')).toBe(true)
  })

  it('rejects inputs that are not expected public URLs', () => {
    const wl = new UrlWhitelist(['https://*.calendar.opentimestamps.org'])
    expect(wl.contains('')).toBe(false)
    expect(wl.contains('https://127.0.0.1')).toBe(false)
    expect(wl.contains('https://[::1]')).toBe(false)
    expect(wl.contains('not a url')).toBe(false)
  })

  it('add throws when the entry is not a string', () => {
    // @ts-expect-error intentional invalid input
    expect(() => new UrlWhitelist([123])).toThrow(TypeError)
  })

  it('add throws when the pattern is structurally invalid', () => {
    expect(() => new UrlWhitelist(['https://not-*-valid.example.com'])).toThrow(TypeError)
  })

  it('toString does not throw and lists the entries', () => {
    const wl = new UrlWhitelist(['https://a.opentimestamps.org'])
    expect(() => wl.toString()).not.toThrow()
    expect(wl.toString()).toContain('https://a.opentimestamps.org')
  })

  it('default allowlist accepts the required official calendars', () => {
    expect(DEFAULT_CALENDAR_WHITELIST.contains('https://alice.btc.calendar.opentimestamps.org')).toBe(true)
    expect(DEFAULT_CALENDAR_WHITELIST.contains('https://finney.calendar.eternitywall.com')).toBe(true)
  })

  it('host matching is case-insensitive', () => {
    const wl = new UrlWhitelist(['https://*.calendar.opentimestamps.org'])
    expect(wl.contains('https://BOB.Calendar.OpenTimestamps.org')).toBe(true)
  })
})
