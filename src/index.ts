/**
 * @otskit/client
 * 
 * Official OpenTimestamps client SDK with resilience patterns
 * 
 * @module
 */

// Main client
export { OpenTimestampsClient } from './client.js'

// Types
export type {
  ClientOptions,
  OperationOptions,
  ResilienceOptions,
  RetryOptions,
  CircuitBreakerOptions,
  Logger,
  VerificationResult,
  BackoffStrategy,
  JitterType,
} from './types.js'

export { DEFAULT_CALENDARS, DEFAULT_RESILIENCE } from './types.js'

// Errors
export {
  OpenTimestampsClientError,
  ValidationError,
  StampError,
  UpgradeError,
  NetworkError,
  CircuitBreakerError,
} from './errors.js'

// Internal types that might be useful for advanced users
export { CircuitState } from './network/circuit-breaker.js'

// Calendar client
export {
  CalendarClient,
  UrlWhitelist,
  DEFAULT_CALENDAR_WHITELIST,
  DEFAULT_AGGREGATORS,
  MAX_CALENDAR_RESPONSE_SIZE,
} from './network/calendar.js'
export { CommitmentNotFoundError, CalendarResponseTooLargeError } from './errors.js'

// Esplora client
export {
  EsploraClient,
  verifyTimestampAttestation,
  PUBLIC_ESPLORA_URL,
  MAX_ESPLORA_RESPONSE_SIZE,
} from './network/esplora.js'
export type { EsploraClientOptions } from './network/esplora.js'
export { EsploraResponseError } from './errors.js'

// Re-export de tipos del core canónico útiles para usuarios avanzados
export type { Attestation, BitcoinAttestation, PendingAttestation } from '@otskit/core'
export { DetachedTimestampFile, Timestamp } from '@otskit/core'

// Needed by E2E suite
export { ResilientNetworkLayer } from './network/resilience.js'
export { verifyAgainstBlockheader } from '@otskit/core'

// Hashing utilities
export { hashBuffer, hashFile } from './utils/hash.js'