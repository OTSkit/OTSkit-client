/**
 * Advanced unit tests for Circuit Breaker
 * Covers edge cases, concurrent requests, and complex state transitions
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { CircuitBreaker } from '../../src/network/circuit-breaker.js'
import { CircuitBreakerError } from '../../src/errors.js'

describe('CircuitBreaker - Advanced Scenarios', () => {
  let breaker: CircuitBreaker

  beforeEach(() => {
    breaker = new CircuitBreaker({
      enabled: true,
      failureThreshold: 3,
      recoveryTimeoutMs: 500,
      halfOpenMaxAttempts: 1,
    })
  })

  describe('Multi-key isolation', () => {
    it('should maintain independent state per key', async () => {
      // Fail key1 to open its circuit
      for (let i = 0; i < 3; i++) {
        await expect(
          breaker.execute('key1', async () => {
            throw new Error('key1 fail')
          })
        ).rejects.toThrow('key1 fail')
      }

      // key1 circuit should be OPEN
      expect(breaker.getState('key1')).toBe('OPEN')

      // key2 circuit should still be CLOSED and working
      const result = await breaker.execute('key2', async () => 'key2 success')
      expect(result).toBe('key2 success')
      expect(breaker.getState('key2')).toBe('CLOSED')
    })

    it('should handle many independent circuits simultaneously', async () => {
      const keys = Array.from({ length: 10 }, (_, i) => `key${i}`)

      // Open circuits for even-numbered keys
      for (let i = 0; i < keys.length; i++) {
        if (i % 2 === 0) {
          for (let j = 0; j < 3; j++) {
            await expect(
              breaker.execute(keys[i], async () => {
                throw new Error(`fail ${i}`)
              })
            ).rejects.toThrow()
          }
        }
      }

      // Verify even keys are OPEN, odd keys are still undefined (never used)
      for (let i = 0; i < keys.length; i++) {
        if (i % 2 === 0) {
          expect(breaker.getState(keys[i])).toBe('OPEN')
        } else {
          // Never used, so no state yet
          expect(breaker.getState(keys[i])).toBeUndefined()
        }
      }

      // Odd keys should still work
      for (let i = 1; i < keys.length; i += 2) {
        const result = await breaker.execute(keys[i], async () => `success ${i}`)
        expect(result).toBe(`success ${i}`)
      }
    })
  })

  describe('Concurrent requests', () => {
    it('should handle concurrent successful requests', async () => {
      const promises = Array.from({ length: 50 }, (_, i) =>
        breaker.execute('concurrent-key', async () => `result ${i}`)
      )

      const results = await Promise.all(promises)

      expect(results).toHaveLength(50)
      results.forEach((result, i) => {
        expect(result).toBe(`result ${i}`)
      })
    })

    it('should handle concurrent failures correctly', async () => {
      let _failCount = 0
      const promises = Array.from({ length: 10 }, () =>
        breaker
          .execute('fail-key', async () => {
            throw new Error('concurrent fail')
          })
          .catch(() => {
            _failCount++
          })
      )

      await Promise.all(promises)

      // Should have opened circuit after threshold
      expect(breaker.getState('fail-key')).toBe('OPEN')

      // Further requests should be rejected immediately
      await expect(
        breaker.execute('fail-key', async () => 'should not run')
      ).rejects.toThrow(CircuitBreakerError)
    })

    it('should handle race condition during HALF_OPEN state', async () => {
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        await expect(
          breaker.execute('race-key', async () => {
            throw new Error('fail')
          })
        ).rejects.toThrow('fail')
      }

      // Wait for recovery
      await new Promise((resolve) => setTimeout(resolve, 600))

      // Fire multiple concurrent requests during HALF_OPEN
      const promises = Array.from({ length: 5 }, () =>
        breaker.execute('race-key', async () => {
          await new Promise((resolve) => setTimeout(resolve, 10))
          return 'success'
        })
      )

      // Only first request should be allowed in HALF_OPEN
      const results = await Promise.allSettled(promises)

      const fulfilled = results.filter((r) => r.status === 'fulfilled')
      const rejected = results.filter((r) => r.status === 'rejected')

      // At least one should succeed
      expect(fulfilled.length).toBeGreaterThan(0)

      // Others should be rejected due to HALF_OPEN limit
      expect(rejected.length).toBeGreaterThan(0)
    })
  })

  describe('State transition edge cases', () => {
    it('should handle success immediately after threshold failure', async () => {
      // Exactly 3 failures (at threshold)
      for (let i = 0; i < 3; i++) {
        await expect(
          breaker.execute('edge-key', async () => {
            throw new Error('fail')
          })
        ).rejects.toThrow('fail')
      }

      // Circuit should be OPEN
      expect(breaker.getState('edge-key')).toBe('OPEN')

      // Wait for recovery
      await new Promise((resolve) => setTimeout(resolve, 600))

      // Should transition to HALF_OPEN and succeed
      const result = await breaker.execute('edge-key', async () => 'recovered')
      expect(result).toBe('recovered')

      // Circuit should be CLOSED
      expect(breaker.getState('edge-key')).toBe('CLOSED')
    })

    it('should handle rapid open-close cycles', async () => {
      for (let cycle = 0; cycle < 3; cycle++) {
        // Open circuit
        for (let i = 0; i < 3; i++) {
          await expect(
            breaker.execute('cycle-key', async () => {
              throw new Error('fail')
            })
          ).rejects.toThrow('fail')
        }

        expect(breaker.getState('cycle-key')).toBe('OPEN')

        // Wait and recover
        await new Promise((resolve) => setTimeout(resolve, 600))

        const result = await breaker.execute('cycle-key', async () => 'ok')
        expect(result).toBe('ok')
        expect(breaker.getState('cycle-key')).toBe('CLOSED')
      }
    })

    it('should reset failure count after successful request', async () => {
      // 2 failures (below threshold)
      for (let i = 0; i < 2; i++) {
        await expect(
          breaker.execute('reset-key', async () => {
            throw new Error('fail')
          })
        ).rejects.toThrow('fail')
      }

      // Still CLOSED
      expect(breaker.getState('reset-key')).toBe('CLOSED')

      // Successful request should reset counter
      await breaker.execute('reset-key', async () => 'success')

      // Now 2 more failures shouldn't open circuit
      for (let i = 0; i < 2; i++) {
        await expect(
          breaker.execute('reset-key', async () => {
            throw new Error('fail')
          })
        ).rejects.toThrow('fail')
      }

      // Should still be CLOSED (counter was reset)
      expect(breaker.getState('reset-key')).toBe('CLOSED')
    })
  })

  describe('Reset and recovery', () => {
    it('should reset all circuits with resetAll()', async () => {
      const keys = ['key1', 'key2', 'key3']

      // Open all circuits
      for (const key of keys) {
        for (let i = 0; i < 3; i++) {
          await expect(
            breaker.execute(key, async () => {
              throw new Error('fail')
            })
          ).rejects.toThrow()
        }
        expect(breaker.getState(key)).toBe('OPEN')
      }

      // Reset all
      breaker.resetAll()

      // After reset, they should be removed, so getState returns undefined
      // But execute should still work
      for (const key of keys) {
        const result = await breaker.execute(key, async () => 'ok')
        expect(result).toBe('ok')
        // After successful execution, state should be CLOSED
        expect(breaker.getState(key)).toBe('CLOSED')
      }
    })

    it('should handle reset during HALF_OPEN state', async () => {
      // Open circuit
      for (let i = 0; i < 3; i++) {
        await expect(
          breaker.execute('ho-key', async () => {
            throw new Error('fail')
          })
        ).rejects.toThrow()
      }

      // Wait for recovery
      await new Promise((resolve) => setTimeout(resolve, 600))

      // Verify HALF_OPEN (by checking it allows a request)
      await breaker.execute('ho-key', async () => 'ok')

      // Reset during HALF_OPEN
      breaker.reset('ho-key')

      // After reset, state is cleared (undefined)
      expect(breaker.getState('ho-key')).toBeUndefined()

      // But execute should work normally
      const result = await breaker.execute('ho-key', async () => 'success')
      expect(result).toBe('success')

      // After successful execution, state should be CLOSED
      expect(breaker.getState('ho-key')).toBe('CLOSED')
    })
  })

  describe('Timing precision', () => {
    it('should not allow requests before recovery timeout', async () => {
      // Open circuit
      for (let i = 0; i < 3; i++) {
        await expect(
          breaker.execute('timing-key', async () => {
            throw new Error('fail')
          })
        ).rejects.toThrow('fail')
      }

      // Wait less than recovery timeout
      await new Promise((resolve) => setTimeout(resolve, 300))

      // Should still be OPEN
      await expect(
        breaker.execute('timing-key', async () => 'too soon')
      ).rejects.toThrow(CircuitBreakerError)
    })

    it('should allow requests exactly at recovery timeout', async () => {
      // Open circuit
      for (let i = 0; i < 3; i++) {
        await expect(
          breaker.execute('exact-timing-key', async () => {
            throw new Error('fail')
          })
        ).rejects.toThrow('fail')
      }

      // Wait exactly recovery timeout (with small buffer)
      await new Promise((resolve) => setTimeout(resolve, 550))

      // Should transition to HALF_OPEN
      const result = await breaker.execute('exact-timing-key', async () => 'recovered')
      expect(result).toBe('recovered')
    })
  })

  describe('Error propagation', () => {
    it('should propagate original error when circuit is CLOSED', async () => {
      const customError = new Error('Custom error message')
      customError.name = 'CustomError'

      await expect(
        breaker.execute('error-key', async () => {
          throw customError
        })
      ).rejects.toThrow('Custom error message')

      await expect(
        breaker.execute('error-key', async () => {
          throw customError
        })
      ).rejects.toHaveProperty('name', 'CustomError')
    })

    it('should throw CircuitBreakerError when circuit is OPEN', async () => {
      // Open circuit
      for (let i = 0; i < 3; i++) {
        await expect(
          breaker.execute('cb-error-key', async () => {
            throw new Error('fail')
          })
        ).rejects.toThrow()
      }

      // Should throw CircuitBreakerError
      await expect(
        breaker.execute('cb-error-key', async () => 'blocked')
      ).rejects.toThrow(CircuitBreakerError)

      await expect(
        breaker.execute('cb-error-key', async () => 'blocked')
      ).rejects.toThrow('Circuit breaker open for calendar: cb-error-key')
    })
  })

  describe('Configuration edge cases', () => {
    it('should handle threshold of 1 (immediate circuit opening)', async () => {
      const sensitiveBreaker = new CircuitBreaker({
        enabled: true,
        failureThreshold: 1,
        recoveryTimeoutMs: 500,
      })

      // Single failure should open circuit
      await expect(
        sensitiveBreaker.execute('sensitive-key', async () => {
          throw new Error('fail')
        })
      ).rejects.toThrow('fail')

      // Next request should be blocked
      await expect(
        sensitiveBreaker.execute('sensitive-key', async () => 'blocked')
      ).rejects.toThrow(CircuitBreakerError)
    })

    it('should handle very high threshold', async () => {
      const tolerantBreaker = new CircuitBreaker({
        enabled: true,
        failureThreshold: 100,
        recoveryTimeoutMs: 500,
      })

      // Many failures shouldn't open circuit
      for (let i = 0; i < 50; i++) {
        await expect(
          tolerantBreaker.execute('tolerant-key', async () => {
            throw new Error('fail')
          })
        ).rejects.toThrow('fail')
      }

      // Circuit should still be CLOSED
      expect(tolerantBreaker.getState('tolerant-key')).toBe('CLOSED')

      // Should still allow requests
      const result = await tolerantBreaker.execute(
        'tolerant-key',
        async () => 'still working'
      )
      expect(result).toBe('still working')
    })

    it('should handle halfOpenMaxAttempts configuration', async () => {
      const multiTestBreaker = new CircuitBreaker({
        enabled: true,
        failureThreshold: 3,
        recoveryTimeoutMs: 500,
        halfOpenMaxAttempts: 3, // Allow 3 test requests
      })

      // Open circuit
      for (let i = 0; i < 3; i++) {
        await expect(
          multiTestBreaker.execute('multi-test-key', async () => {
            throw new Error('fail')
          })
        ).rejects.toThrow()
      }

      // Wait for recovery
      await new Promise((resolve) => setTimeout(resolve, 600))

      // Should allow multiple test requests in HALF_OPEN
      const promises = []
      for (let i = 0; i < 3; i++) {
        promises.push(
          multiTestBreaker.execute('multi-test-key', async () => `success ${i}`)
        )
      }

      const results = await Promise.all(promises)
      expect(results).toHaveLength(3)
    })
  })
})
