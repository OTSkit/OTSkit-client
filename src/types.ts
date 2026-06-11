/**
 * Type definitions for the OpenTimestamps Client SDK
 */

import { DEFAULT_CALENDAR_URLS } from '@otskit/core'

/** Logger interface for observability. */
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
  /** Maximum bytes allowed in the response body. Defaults to 100 KB. */
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

  /**
   * Allows calendar URLs that resolve to private/reserved IPs.
   *
   * **Do not enable in production.** Useful for local testing or corporate networks.
   *
   * Even when `false`, protection is best-effort against DNS rebinding (TOCTOU).
   * For high-security environments, complement with network-level egress filtering.
   *
   * @default false
   */
  allowPrivateCalendars?: boolean
}

/** Operation-specific options */
export interface OperationOptions {
  signal?: AbortSignal
}

/** Verificación exitosa: prueba criptográficamente válida y confirmada en Bitcoin. */
export interface VerificationSuccess {
  readonly status: 'verified'
  readonly blockHeight: number
  readonly blockTime: number
  readonly blockHash?: string
}

/** El timestamp es parseable pero aún no tiene confirmación Bitcoin. Estado normal. */
export interface VerificationPending {
  readonly status: 'pending'
  readonly reason: string
}

/**
 * La verificación criptográfica falló: el digest no coincide con el merkleroot.
 * Indica posible manipulación del archivo o de la prueba.
 */
export interface VerificationInvalid {
  readonly status: 'invalid'
  readonly reason: string
}

/** Error de infraestructura: Esplora no disponible. El estado del timestamp es desconocido. */
export interface VerificationNetworkError {
  readonly status: 'network_error'
  readonly reason: string
}

/** Resultado de verify(). Usar switch(result.status) para narrowing exhaustivo. */
export type VerificationResult =
  | VerificationSuccess
  | VerificationPending
  | VerificationInvalid
  | VerificationNetworkError

/** Type guard — verdadero si la verificación fue exitosa. */
export const isVerified = (r: VerificationResult): r is VerificationSuccess =>
  r.status === 'verified'

/** Default calendar servers. Sourced from @otskit/core (single source of truth). */
export const DEFAULT_CALENDARS: string[] = [...DEFAULT_CALENDAR_URLS]

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