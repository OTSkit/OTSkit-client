/**
 * Custom error classes for the OpenTimestamps Client SDK
 */

/** Base class for all SDK-specific errors */
export class OpenTimestampsClientError extends Error {
  public readonly cause?: Error

  constructor(message: string, options?: { cause?: Error }) {
    super(message)
    this.name = this.constructor.name
    this.cause = options?.cause
    Error.captureStackTrace?.(this, this.constructor)
  }
}

/** Error during input validation */
export class ValidationError extends OpenTimestampsClientError {}

/** Error during stamp operation */
export class StampError extends OpenTimestampsClientError {
  public readonly successfulSubmissions: Array<{ calendar: string; proof?: Buffer }>
  public readonly failedSubmissions: Array<{ calendar: string; error: Error }>

  constructor(
    message: string,
    successful: Array<{ calendar: string; proof?: Buffer }>,
    failed: Array<{ calendar: string; error: Error }>,
    options?: { cause?: Error }
  ) {
    super(message, options)
    this.successfulSubmissions = successful
    this.failedSubmissions = failed
  }
}

/** Error during upgrade operation */
export class UpgradeError extends OpenTimestampsClientError {}

/** Network-related error (timeout, all retries failed, etc.) */
export class NetworkError extends OpenTimestampsClientError {
  /** HTTP status code, cuando el fallo viene de una respuesta HTTP. */
  public readonly status?: number

  constructor(message: string, options?: { cause?: Error; status?: number }) {
    super(message, options)
    this.status = options?.status
  }
}

/** Circuit breaker is open, request rejected */
export class CircuitBreakerError extends NetworkError {
  constructor(calendar: string) {
    super(`Circuit breaker open for calendar: ${calendar}`)
  }
}

/** El calendario no conoce (todavía) el commitment consultado (HTTP 404). */
export class CommitmentNotFoundError extends NetworkError {}

/** La respuesta del calendario supera el límite de tamaño permitido (defensa DoS). */
export class CalendarResponseTooLargeError extends NetworkError {}

/** Respuesta del explorador Esplora inválida: vacía, no-JSON, malformada o demasiado grande (defensa DoS). */
export class EsploraResponseError extends NetworkError {}

/** La respuesta supera el límite de bytes permitido (defensa DoS). */
export class SizeLimitExceededError extends NetworkError {
  public readonly maxBytes: number
  public readonly actualBytes?: number

  constructor(maxBytes: number, actualBytes?: number, options?: { cause?: Error; status?: number }) {
    super(
      actualBytes === undefined
        ? `Response size exceeds limit of ${maxBytes} bytes`
        : `Response size ${actualBytes} bytes exceeds limit of ${maxBytes} bytes`,
      options,
    )
    this.maxBytes = maxBytes
    this.actualBytes = actualBytes
  }
}