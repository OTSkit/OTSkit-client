/**
 * Unit tests for Circuit Breaker
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { CircuitBreaker } from '../../src/network/circuit-breaker.js'
import { CircuitBreakerError } from '../../src/errors.js'

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker

  beforeEach(() => {
    breaker = new CircuitBreaker({
      enabled: true,
      failureThreshold: 3,
      recoveryTimeoutMs: 1000,
      halfOpenMaxAttempts: 1,
    })
  })

  it('should allow requests when circuit is CLOSED', async () => {
    const result = await breaker.execute('test-key', async () => 'success')
    expect(result).toBe('success')
  })

  it('should open circuit after threshold failures', async () => {
    // Fail 3 times
    for (let i = 0; i < 3; i++) {
      await expect(
        breaker.execute('test-key', async () => {
          throw new Error('fail')
        })
      ).rejects.toThrow('fail')
    }

    // 4th attempt should be rejected immediately
    await expect(
      breaker.execute('test-key', async () => 'should not run')
    ).rejects.toThrow(CircuitBreakerError)
  })

  it('should transition to HALF_OPEN after recovery timeout', async () => {
    // Open the circuit
    for (let i = 0; i < 3; i++) {
      await expect(
        breaker.execute('test-key', async () => {
          throw new Error('fail')
        })
      ).rejects.toThrow('fail')
    }

    // Wait for recovery timeout
    await new Promise(resolve => setTimeout(resolve, 1100))

    // Should allow one test request
    const result = await breaker.execute('test-key', async () => 'recovered')
    expect(result).toBe('recovered')

    // Circuit should be CLOSED again
    expect(breaker.getState('test-key')).toBe('CLOSED')
  })

  it('should reopen circuit if HALF_OPEN request fails', async () => {
    // Open the circuit
    for (let i = 0; i < 3; i++) {
      await expect(
        breaker.execute('test-key', async () => {
          throw new Error('fail')
        })
      ).rejects.toThrow('fail')
    }

    // Wait for recovery timeout
    await new Promise(resolve => setTimeout(resolve, 1100))

    // HALF_OPEN request fails
    await expect(
      breaker.execute('test-key', async () => {
        throw new Error('still failing')
      })
    ).rejects.toThrow('still failing')

    // Circuit should be OPEN again
    await expect(
      breaker.execute('test-key', async () => 'should not run')
    ).rejects.toThrow(CircuitBreakerError)
  })

  it('should reset state when reset() is called', async () => {
    // Open the circuit
    for (let i = 0; i < 3; i++) {
      await expect(
        breaker.execute('test-key', async () => {
          throw new Error('fail')
        })
      ).rejects.toThrow('fail')
    }

    // Reset
    breaker.reset('test-key')

    // Should work normally
    const result = await breaker.execute('test-key', async () => 'success')
    expect(result).toBe('success')
  })

  it('should not interfere when disabled', async () => {
    const disabledBreaker = new CircuitBreaker({
      enabled: false,
      failureThreshold: 3,
      recoveryTimeoutMs: 1000,
    })

    // Fail many times
    for (let i = 0; i < 10; i++) {
      await expect(
        disabledBreaker.execute('test-key', async () => {
          throw new Error('fail')
        })
      ).rejects.toThrow('fail')
    }

    // Should still allow requests
    const result = await disabledBreaker.execute('test-key', async () => 'success')
    expect(result).toBe('success')
  })
})