/**
 * Retry logic with exponential backoff and jitter
 */

import { RetryOptions, Logger } from '../types.js'

/**
 * Calculate delay for next retry attempt
 */
function calculateDelay(
  attempt: number,
  options: RetryOptions
): number {
  const { strategy, initialDelayMs, maxDelayMs, jitter } = options.backoff

  let delay: number

  switch (strategy) {
    case 'exponential':
      delay = initialDelayMs * Math.pow(2, attempt - 1)
      break
    case 'linear':
      delay = initialDelayMs * attempt
      break
    case 'constant':
      delay = initialDelayMs
      break
  }

  // Apply max delay cap
  if (maxDelayMs && delay > maxDelayMs) {
    delay = maxDelayMs
  }

  // Apply jitter
  switch (jitter) {
    case 'full':
      // Random value between 0 and delay
      delay = Math.random() * delay
      break
    case 'equal':
      // Random value between delay/2 and delay
      delay = delay / 2 + Math.random() * (delay / 2)
      break
    case 'none':
    default:
      // No jitter
      break
  }

  return Math.floor(delay)
}

/**
 * Sleep for specified milliseconds, respecting an optional AbortSignal.
 * The abort listener is always removed to avoid a permanent listener leak on long-lived signals.
 */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    /* v8 ignore next 4 */
    if (signal?.aborted) {
      reject(new Error('Aborted'))
      return
    }

    const onAbort = (): void => {
      clearTimeout(timeout)
      reject(new Error('Aborted'))
    }

    const timeout = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)

    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/**
 * Execute a function with retry logic
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions,
  logger?: Logger,
  signal?: AbortSignal
): Promise<T> {
  if (!options.enabled) {
    return fn()
  }

  let lastError: Error | undefined

  for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
    try {
      logger?.debug(`Attempt ${attempt}/${options.maxAttempts}`)
      return await fn()
    } catch (error) {
      /* v8 ignore next */
      lastError = error instanceof Error ? error : new Error(String(error))

      // Don't retry if aborted
      if (signal?.aborted) {
        throw lastError
      }

      // Don't retry if error is marked as non-retryable (4xx errors)
      if ((error as any).retryable === false) {
        logger?.debug('Error is not retryable (4xx client error), failing immediately')
        throw lastError
      }

      // Don't retry on last attempt
      if (attempt === options.maxAttempts) {
        logger?.warn(`All ${options.maxAttempts} attempts failed`)
        throw lastError
      }

      // Calculate delay and wait
      const delay = calculateDelay(attempt, options)
      logger?.debug(`Retry attempt ${attempt} failed, waiting ${delay}ms before next attempt`)

      try {
        await sleep(delay, signal)
      } catch {
        // Sleep was aborted
        throw lastError
      }
    }
  }

  // This should never happen, but TypeScript needs it
  throw lastError || new Error('Retry failed')
}