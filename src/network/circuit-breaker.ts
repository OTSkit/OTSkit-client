/**
 * Circuit Breaker implementation for protecting against cascading failures
 */

import { CircuitBreakerOptions, Logger } from '../types.js'
import { CircuitBreakerError } from '../errors.js'

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

interface CircuitStats {
  consecutiveFailures: number
  lastFailureTime?: number
  halfOpenAttempts: number
}

export class CircuitBreaker {
  private circuits = new Map<string, { state: CircuitState; stats: CircuitStats }>()
  
  constructor(
    private options: CircuitBreakerOptions,
    private logger?: Logger
  ) {}

  /**
   * Execute a request through the circuit breaker
   */
  async execute<T>(
    key: string,
    fn: () => Promise<T>
  ): Promise<T> {
    if (!this.options.enabled) {
      return fn()
    }

    const circuit = this.getOrCreateCircuit(key)

    // Check if circuit is open
    if (circuit.state === CircuitState.OPEN) {
      const shouldAttemptRecovery = this.shouldAttemptRecovery(circuit)
      
      if (shouldAttemptRecovery) {
        this.logger?.info(`Circuit breaker for ${key} entering HALF_OPEN state`)
        circuit.state = CircuitState.HALF_OPEN
        circuit.stats.halfOpenAttempts = 0
      } else {
        throw new CircuitBreakerError(key)
      }
    }

    // Check if too many half-open attempts
    if (circuit.state === CircuitState.HALF_OPEN) {
      const maxAttempts = this.options.halfOpenMaxAttempts || 1
      if (circuit.stats.halfOpenAttempts >= maxAttempts) {
        /* v8 ignore next */
        this.logger?.warn(`Circuit breaker for ${key} reopening after failed HALF_OPEN attempts`)
        circuit.state = CircuitState.OPEN
        circuit.stats.lastFailureTime = Date.now()
        throw new CircuitBreakerError(key)
      }
      circuit.stats.halfOpenAttempts++
    }

    try {
      const result = await fn()
      this.onSuccess(key, circuit)
      return result
    } catch (error) {
      this.onFailure(key, circuit)
      throw error
    }
  }

  private getOrCreateCircuit(key: string) {
    let circuit = this.circuits.get(key)
    if (!circuit) {
      circuit = {
        state: CircuitState.CLOSED,
        stats: {
          consecutiveFailures: 0,
          halfOpenAttempts: 0,
        },
      }
      this.circuits.set(key, circuit)
    }
    return circuit
  }

  private shouldAttemptRecovery(circuit: { state: CircuitState; stats: CircuitStats }): boolean {
    /* v8 ignore next */
    if (!circuit.stats.lastFailureTime) return false
    
    const elapsed = Date.now() - circuit.stats.lastFailureTime
    return elapsed >= this.options.recoveryTimeoutMs
  }

  private onSuccess(key: string, circuit: { state: CircuitState; stats: CircuitStats }) {
    if (circuit.state === CircuitState.HALF_OPEN) {
      this.logger?.info(`Circuit breaker for ${key} closing after successful HALF_OPEN attempt`)
      circuit.state = CircuitState.CLOSED
    }
    
    circuit.stats.consecutiveFailures = 0
    circuit.stats.halfOpenAttempts = 0
  }

  private onFailure(key: string, circuit: { state: CircuitState; stats: CircuitStats }) {
    circuit.stats.consecutiveFailures++
    circuit.stats.lastFailureTime = Date.now()

    if (circuit.state === CircuitState.HALF_OPEN) {
      this.logger?.warn(`Circuit breaker for ${key} reopening after failed HALF_OPEN attempt`)
      circuit.state = CircuitState.OPEN
      return
    }

    if (circuit.stats.consecutiveFailures >= this.options.failureThreshold) {
      this.logger?.warn(
        `Circuit breaker for ${key} opening after ${circuit.stats.consecutiveFailures} consecutive failures`
      )
      circuit.state = CircuitState.OPEN
    }
  }

  /** Get current state for debugging/monitoring */
  getState(key: string): CircuitState | undefined {
    return this.circuits.get(key)?.state
  }

  /** Reset a specific circuit */
  reset(key: string): void {
    this.circuits.delete(key)
  }

  /** Reset all circuits */
  resetAll(): void {
    this.circuits.clear()
  }
}