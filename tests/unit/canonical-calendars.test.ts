import { describe, it, expect } from 'vitest'
import {
  DEFAULT_CALENDAR_URLS,
  DEFAULT_AGGREGATOR_URLS,
  TRUSTED_CALENDAR_WHITELIST_PATTERNS,
} from '@otskit/core'
import {
  DEFAULT_CALENDARS,
  DEFAULT_AGGREGATORS,
  DEFAULT_CALENDAR_WHITELIST,
} from '../../src/index.js'

// B1 — the client must derive its calendar data from @otskit/core (single source
// of truth) rather than re-declaring its own copies. These tests fail if the two
// ever drift apart.
describe('canonical calendar wiring (client ← core)', () => {
  it('DEFAULT_CALENDARS mirrors core DEFAULT_CALENDAR_URLS', () => {
    expect(DEFAULT_CALENDARS).toEqual([...DEFAULT_CALENDAR_URLS])
  })

  it('DEFAULT_AGGREGATORS mirrors core DEFAULT_AGGREGATOR_URLS', () => {
    expect([...DEFAULT_AGGREGATORS]).toEqual([...DEFAULT_AGGREGATOR_URLS])
  })

  it('DEFAULT_CALENDARS is a mutable copy, not the frozen core tuple', () => {
    // [...spread] decouples the published array from core's readonly tuple.
    expect(DEFAULT_CALENDARS).not.toBe(DEFAULT_CALENDAR_URLS as unknown as string[])
    expect(Object.isFrozen(DEFAULT_CALENDARS)).toBe(false)
  })

  it('default whitelist is built from the canonical patterns and admits every default calendar', () => {
    expect(TRUSTED_CALENDAR_WHITELIST_PATTERNS.length).toBeGreaterThan(0)
    for (const url of DEFAULT_CALENDARS) {
      expect(DEFAULT_CALENDAR_WHITELIST.contains(url)).toBe(true)
    }
  })

  it('default whitelist rejects an untrusted calendar host', () => {
    expect(DEFAULT_CALENDAR_WHITELIST.contains('https://evil.example.com')).toBe(false)
  })
})
