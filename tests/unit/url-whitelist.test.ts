import { describe, it, expect } from 'vitest'
import { UrlWhitelist, DEFAULT_CALENDAR_WHITELIST } from '../../src/network/calendar.js'

describe('UrlWhitelist', () => {
  it('un comodín de subdominio acepta los hosts correctos', () => {
    const wl = new UrlWhitelist(['https://*.calendar.opentimestamps.org'])
    expect(wl.contains('https://alice.btc.calendar.opentimestamps.org')).toBe(true)
    expect(wl.contains('https://bob.calendar.opentimestamps.org')).toBe(true)
  })

  it('rechaza hosts fuera de la whitelist', () => {
    const wl = new UrlWhitelist(['https://*.calendar.opentimestamps.org'])
    expect(wl.contains('https://evil.example.com')).toBe(false)
    expect(wl.contains('https://calendar.opentimestamps.org.evil.com')).toBe(false)
  })

  it('el comodín no cruza la barra de path (no es un glob de rutas)', () => {
    const wl = new UrlWhitelist(['https://*.opentimestamps.org'])
    expect(wl.contains('https://a.opentimestamps.org/evil/path')).toBe(false)
  })

  it('trata `?` como literal, no como comodín (fix minimatch)', () => {
    const wl = new UrlWhitelist(['https://a.opentimestamps.org'])
    expect(wl.contains('https://aXopentimestamps.org')).toBe(false)
  })

  it('añade http:// y https:// si la entrada no trae esquema', () => {
    const wl = new UrlWhitelist(['*.calendar.opentimestamps.org'])
    expect(wl.contains('http://a.calendar.opentimestamps.org')).toBe(true)
    expect(wl.contains('https://a.calendar.opentimestamps.org')).toBe(true)
  })

  it('add rechaza entradas que no son string', () => {
    // @ts-expect-error entrada inválida deliberada
    expect(() => new UrlWhitelist([123])).toThrow(TypeError)
  })

  it('toString no lanza y lista las entradas (fix Set.join)', () => {
    const wl = new UrlWhitelist(['https://a.opentimestamps.org'])
    expect(() => wl.toString()).not.toThrow()
    expect(wl.toString()).toContain('https://a.opentimestamps.org')
  })

  it('la whitelist por defecto acepta los calendarios oficiales', () => {
    expect(DEFAULT_CALENDAR_WHITELIST.contains('https://alice.btc.calendar.opentimestamps.org')).toBe(true)
    expect(DEFAULT_CALENDAR_WHITELIST.contains('https://finney.calendar.eternitywall.com')).toBe(true)
  })

  it('el emparejado de host es case-insensitive', () => {
    const wl = new UrlWhitelist(['https://*.calendar.opentimestamps.org'])
    expect(wl.contains('https://ALICE.BTC.Calendar.OpenTimestamps.org')).toBe(true)
  })
})
