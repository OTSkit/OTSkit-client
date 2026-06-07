/**
 * Resilient network layer combining timeout, retry, and circuit breaker
 */

import { ResilienceOptions, Logger } from '../types.js'
import { CircuitBreaker } from './circuit-breaker.js'
import { withRetry } from './retry.js'
import { executeRequest, createTimeoutController, FetchRequest, FetchResponse } from '../adapters/fetch-adapter.js'
import { NetworkError } from '../errors.js'

export class ResilientNetworkLayer {
  private circuitBreaker: CircuitBreaker

  constructor(
    private options: ResilienceOptions,
    private logger?: Logger
  ) {
    this.circuitBreaker = new CircuitBreaker(options.circuitBreaker, logger)
  }

  /**
   * Execute a request with full resilience pipeline
   */
  async request(
    calendarUrl: string,
    request: Omit<FetchRequest, 'signal'>,
    parentSignal?: AbortSignal
  ): Promise<FetchResponse> {
    const startTime = Date.now()

    // Create timeout controller for total operation
    const totalController = createTimeoutController(
      this.options.totalTimeoutMs,
      parentSignal
    )

    try {
      // Execute through circuit breaker
      return await this.circuitBreaker.execute(calendarUrl, async () => {
        // Execute with retry logic
        return await withRetry(
          async () => {
            // Create timeout for this specific attempt
            const attemptController = createTimeoutController(
              this.options.connectTimeoutMs,
              totalController.signal
            )

            try {
              const response = await executeRequest(
                { ...request, signal: attemptController.signal },
                this.options.maxResponseBytes ?? 100_000,
              )

              // Log success
              const elapsed = Date.now() - startTime
              this.logger?.debug(`Request to ${calendarUrl} succeeded in ${elapsed}ms`)

              // Check HTTP status
              if (!response.ok) {
                // 4xx = client error, don't retry
                if (response.status >= 400 && response.status < 500) {
                  const error = new NetworkError(
                    `HTTP ${response.status}: ${response.statusText}`,
                    { status: response.status }
                  )
                  ;(error as { retryable?: boolean }).retryable = false
                  throw error
                }

                // 5xx or other = server error, retryable
                throw new NetworkError(
                  `HTTP ${response.status}: ${response.statusText}`,
                  { status: response.status }
                )
              }

              return response
            } finally {
              attemptController.abort(new Error('Attempt complete'))
            }
          },
          this.options.retries,
          this.logger,
          totalController.signal
        )
      })
    } catch (error) {
      const elapsed = Date.now() - startTime
      this.logger?.error(`Request to ${calendarUrl} failed after ${elapsed}ms`, error)
      throw error
    } finally {
      totalController.abort(new Error('Request complete'))
    }
  }

  /** Get circuit breaker state for a calendar */
  getCircuitState(calendarUrl: string) {
    return this.circuitBreaker.getState(calendarUrl)
  }

  /** Reset circuit breaker for a calendar */
  resetCircuit(calendarUrl: string) {
    this.circuitBreaker.reset(calendarUrl)
  }

  /** Reset all circuit breakers */
  resetAllCircuits() {
    this.circuitBreaker.resetAll()
  }
}