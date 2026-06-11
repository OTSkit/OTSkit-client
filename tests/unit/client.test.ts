/**
 * Unit tests for OpenTimestampsClient
 */

import { describe, it, expect } from 'vitest'
import { OpenTimestampsClient } from '../../src/client.js'
import { ValidationError } from '../../src/errors.js'
import { DEFAULT_CALENDARS } from '../../src/types.js'

describe('OpenTimestampsClient', () => {
  it('should initialize with default calendars', () => {
    const client = new OpenTimestampsClient({ calendars: [] })
    expect(client).toBeDefined()
  })

  it('should initialize with custom calendars', () => {
    const client = new OpenTimestampsClient({
      calendars: ['https://custom.calendar.example.com'],
      minimumSuccessfulSubmissions: 1,
    })
    expect(client).toBeDefined()
  })

  it('should reject invalid hash in stamp()', async () => {
    const client = new OpenTimestampsClient({ calendars: DEFAULT_CALENDARS })

    // Too short
    await expect(client.stamp('abc')).rejects.toThrow(ValidationError)

    // Invalid characters
    await expect(client.stamp('z'.repeat(64))).rejects.toThrow(ValidationError)

    // Wrong length buffer
    await expect(client.stamp(Buffer.alloc(16))).rejects.toThrow(ValidationError)
  })

  it('should accept valid hash formats', async () => {
    const client = new OpenTimestampsClient({ calendars: DEFAULT_CALENDARS })
    
    const validHash = 'a'.repeat(64)
    const validBuffer = Buffer.from(validHash, 'hex')

    // Should succeed with valid formats (mocked calendars respond 200)
    await expect(client.stamp(validHash)).resolves.toBeInstanceOf(Buffer)
    await expect(client.stamp(validBuffer)).resolves.toBeInstanceOf(Buffer)
  })

  it('should provide circuit breaker management methods', () => {
    const client = new OpenTimestampsClient({ calendars: DEFAULT_CALENDARS })

    expect(typeof client.getCircuitState).toBe('function')
    expect(typeof client.resetCircuit).toBe('function')
    expect(typeof client.resetAllCircuits).toBe('function')
  })
})