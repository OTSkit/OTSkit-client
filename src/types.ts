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

  /**
   * Permite URLs de calendario que resuelven a IPs privadas/reservadas.
   *
   * **No activar en producción.** Útil para testing local o redes corporativas.
   *
   * Incluso con `false`, la protección es best-effort contra DNS rebinding (TOCTOU).
   * Para alta seguridad, complementar con egress filtering a nivel de red.
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