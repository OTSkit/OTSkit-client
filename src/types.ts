/**
 * Type definitions for the OpenTimestamps Client SDK
 */

/** Logger interface for observability */
export interface Logger {
  debug(message: string, ...args: unknown[]): void
  info(message: string, ...args: unknown[]): void
  warn(message: string, ...args: unknown[]): void
  error(message: string, ...args: unknown[]): void
}

/** Backoff strategy for retries */
export type BackoffStrategy = 'exponential' | 'linear' | 'constant'

/** Jitter type for randomizing backoff delays */
export type JitterType = 'none' | 'full' | 'equal'

/** Retry configuration */
export interface RetryOptions {
  enabled: boolean
  maxAttempts: number
  backoff: {
    strategy: BackoffStrategy
    initialDelayMs: number
    maxDelayMs?: number
    jitter: JitterType
  }
}

/** Circuit breaker configuration */
export interface CircuitBreakerOptions {
  enabled: boolean
  failureThreshold: number
  recoveryTimeoutMs: number
  halfOpenMaxAttempts?: number
}

/** Network resilience configuration */
export interface ResilienceOptions {
  totalTimeoutMs: number
  connectTimeoutMs: number
  retries: RetryOptions
  circuitBreaker: CircuitBreakerOptions
  /** Límite de bytes para el body de la respuesta. Default 100 KB. */
  maxResponseBytes?: number
}

/** Client configuration options */
export interface ClientOptions {
  /** List of OpenTimestamps calendar URLs */
  calendars?: string[]
  
  /** Network resilience configuration */
  resilience?: Partial<ResilienceOptions>
  
  /** Optional logger for observability */
  logger?: Logger
  
  /** Optional AbortSignal to cancel all operations */
  signal?: AbortSignal
  
  /** Minimum successful calendar submissions required (default: 2) */
  minimumSuccessfulSubmissions?: number
}

/** Operation-specific options */
export interface OperationOptions {
  signal?: AbortSignal
}

/** Verification result */
export interface VerificationResult {
  valid: boolean
  blockHeight?: number
  blockHash?: string
  timestamp?: number
  error?: string
}

/** Default calendar servers */
export const DEFAULT_CALENDARS = [
  'https://alice.btc.calendar.opentimestamps.org',
  'https://bob.btc.calendar.opentimestamps.org',
  'https://finney.calendar.eternitywall.com',
  'https://btc.calendar.catallaxy.com',
]

/** Default resilience configuration */
export const DEFAULT_RESILIENCE: ResilienceOptions = {
  totalTimeoutMs: 30000,
  connectTimeoutMs: 5000,
  retries: {
    enabled: true,
    maxAttempts: 3,
    backoff: {
      strategy: 'exponential',
      initialDelayMs: 200,
      maxDelayMs: 5000,
      jitter: 'full',
    },
  },
  circuitBreaker: {
    enabled: true,
    failureThreshold: 5,
    recoveryTimeoutMs: 15000,
    halfOpenMaxAttempts: 1,
  },
}