/**
 * Custom error classes for the OpenTimestamps Client SDK
 */

/** Base class for all SDK-specific errors */
export class OpenTimestampsClientError extends Error {
  public readonly cause?: Error

  constructor(message: string, options?: { cause?: Error }) {
    super(message)
    this.name = this.constructor.name
    if (options?.cause !== undefined) this.cause = options.cause
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
  /** HTTP status code when the failure originates from an HTTP response. */
  public readonly status?: number

  constructor(message: string, options?: { cause?: Error; status?: number }) {
    super(message, options)
    if (options?.status !== undefined) this.status = options.status
  }
}

/** Circuit breaker is open, request rejected */
export class CircuitBreakerError extends NetworkError {
  constructor(calendar: string) {
    super(`Circuit breaker open for calendar: ${calendar}`)
  }
}

/** The calendar does not yet know the queried commitment (HTTP 404). */
export class CommitmentNotFoundError extends NetworkError {}

/** The calendar response exceeds the allowed size limit (DoS defense). */
export class CalendarResponseTooLargeError extends NetworkError {}

/** Invalid Esplora response: empty, non-JSON, malformed, or too large (DoS defense). */
export class EsploraResponseError extends NetworkError {}

/** Response exceeds the allowed byte limit (DoS defense). */
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
    if (actualBytes !== undefined) this.actualBytes = actualBytes
  }
}
