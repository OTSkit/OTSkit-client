/**
 * Unit tests for retry mechanism
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { withRetry } from '../../src/network/retry.js'
import { NetworkError } from '../../src/errors.js'
import type { RetryOptions } from '../../src/types.js'

describe('withRetry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should succeed on first attempt', async () => {
    const options: RetryOptions = {
      enabled: true,
      maxAttempts: 3,
      backoff: {
        strategy: 'exponential',
        initialDelayMs: 100,
        maxDelayMs: 1000,
        jitter: 'none',
      },
    }

    const operation = vi.fn().mockResolvedValue('success')
    const result = await withRetry(operation, options)

    expect(result).toBe('success')
    expect(operation).toHaveBeenCalledTimes(1)
  })

  it('should retry on failure and eventually succeed', async () => {
    const options: RetryOptions = {
      enabled: true,
      maxAttempts: 3,
      backoff: {
        strategy: 'exponential',
        initialDelayMs: 10,
        maxDelayMs: 1000,
        jitter: 'none',
      },
    }

    const operation = vi.fn()
      .mockRejectedValueOnce(new Error('Attempt 1 failed'))
      .mockRejectedValueOnce(new Error('Attempt 2 failed'))
      .mockResolvedValue('success')

    const result = await withRetry(operation, options)

    expect(result).toBe('success')
    expect(operation).toHaveBeenCalledTimes(3)
  })

  it('should throw after max attempts', async () => {
    const options: RetryOptions = {
      enabled: true,
      maxAttempts: 3,
      backoff: {
        strategy: 'exponential',
        initialDelayMs: 10,
        maxDelayMs: 1000,
        jitter: 'none',
      },
    }

    const operation = vi.fn().mockRejectedValue(new NetworkError('Network error'))

    await expect(withRetry(operation, options)).rejects.toThrow(NetworkError)
    expect(operation).toHaveBeenCalledTimes(3)
  })

  it('should apply exponential backoff', async () => {
    const options: RetryOptions = {
      enabled: true,
      maxAttempts: 4,
      backoff: {
        strategy: 'exponential',
        initialDelayMs: 100,
        maxDelayMs: 1000,
        jitter: 'none',
      },
    }

    const operation = vi.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockRejectedValueOnce(new Error('fail'))
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue('success')

    const startTime = Date.now()
    await withRetry(operation, options)
    const duration = Date.now() - startTime

    // Should wait: 100ms + 200ms + 400ms = 700ms minimum
    expect(duration).toBeGreaterThanOrEqual(600)
    expect(operation).toHaveBeenCalledTimes(4)
  })

  it('should respect max delay cap', async () => {
    const options: RetryOptions = {
      enabled: true,
      maxAttempts: 5,
      backoff: {
        strategy: 'exponential',
        initialDelayMs: 100,
        maxDelayMs: 200, // Cap at 200ms
        jitter: 'none',
      },
    }

    const operation = vi.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockRejectedValueOnce(new Error('fail'))
      .mockRejectedValueOnce(new Error('fail'))
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue('success')

    const startTime = Date.now()
    await withRetry(operation, options)
    const duration = Date.now() - startTime

    // Delays: 100, 200 (capped), 200 (capped), 200 (capped) = 700ms
    expect(duration).toBeGreaterThanOrEqual(600)
    expect(duration).toBeLessThan(1000) // Not exponential beyond cap
  })
})