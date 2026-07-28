import { describe, it, expect, beforeAll } from 'vitest'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

describe('browser bundle purity', () => {
  beforeAll(() => execSync('npm run build', { stdio: 'inherit' }), 120_000)

  it('has no node built-in imports', () => {
    const code = readFileSync('dist/browser.js', 'utf8')
    for (const m of [
      'node:crypto',
      'node:fs',
      'node:dns',
      'node:net',
      'require("crypto")',
      'require("fs")',
      'from"dns/promises"',
      'from"net"',
    ]) {
      expect(code).not.toContain(m)
    }
  })

  it('exports the browser client and helpers', async () => {
    const mod = await import('../../dist/browser.js')
    expect(typeof mod.OpenTimestampsBrowserClient).toBe('function')
    expect(typeof mod.hashBlob).toBe('function')
    expect(typeof mod.hashBytes).toBe('function')
    expect(typeof mod.bytesToHex).toBe('function')
    expect(Array.isArray(mod.BROWSER_CALENDARS)).toBe(true)
    expect(mod.BROWSER_CALENDARS).toHaveLength(3)
  })
})
