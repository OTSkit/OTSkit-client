/**
 * Main OpenTimestamps Client SDK
 */

import {
  ClientOptions,
  OperationOptions,
  VerificationResult,
  DEFAULT_CALENDARS,
  DEFAULT_RESILIENCE,
  ResilienceOptions,
} from './types.js'
import { ResilientNetworkLayer } from './network/resilience.js'
import { orchestrateStamp, orchestrateUpgrade, orchestrateVerify } from './core/orchestration.js'

/**
 * OpenTimestamps Client SDK
 * 
 * Provides a high-level interface for interacting with OpenTimestamps calendars
 * with built-in resilience patterns (timeout, retry, circuit breaker)
 * 
 * @example
 * ```typescript
 * const client = new OpenTimestampsClient({
 *   calendars: ['https://alice.btc.calendar.opentimestamps.org']
 * })
 * 
 * // Create timestamp
 * const fileHash = Buffer.from('a'.repeat(64), 'hex')
 * const otsProof = await client.stamp(fileHash)
 * 
 * // Later, upgrade to get Bitcoin confirmation
 * const upgradedProof = await client.upgrade(otsProof)
 * 
 * // Verify the timestamp
 * const result = await client.verify(upgradedProof, fileHash)
 * console.log(`Confirmed in block ${result.blockHeight}`)
 * ```
 */
export class OpenTimestampsClient {
  private calendars: string[]
  private networkLayer: ResilientNetworkLayer
  private logger?: ClientOptions['logger']
  private globalSignal?: AbortSignal
  private minimumSuccessfulSubmissions: number

  /**
   * Create a new OpenTimestamps client
   * 
   * @param options Client configuration options
   */
  constructor(options: ClientOptions = {}) {
    // Validate and set calendars
    if (!options.calendars || options.calendars.length === 0) {
      this.calendars = DEFAULT_CALENDARS
      /* v8 ignore next */ // this.logger is not yet assigned at this point in the constructor
      this.logger?.info('No calendars provided, using defaults')
    } else {
      this.calendars = options.calendars
    }

    // Set minimum successful submissions (default: 2)
    this.minimumSuccessfulSubmissions = options.minimumSuccessfulSubmissions ?? 2

    // Merge resilience options with defaults
    const resilienceConfig: ResilienceOptions = {
      ...DEFAULT_RESILIENCE,
      ...options.resilience,
      retries: {
        ...DEFAULT_RESILIENCE.retries,
        ...options.resilience?.retries,
        backoff: {
          ...DEFAULT_RESILIENCE.retries.backoff,
          ...options.resilience?.retries?.backoff,
        },
      },
      circuitBreaker: {
        ...DEFAULT_RESILIENCE.circuitBreaker,
        ...options.resilience?.circuitBreaker,
      },
    }

    this.logger = options.logger
    this.globalSignal = options.signal
    // Allow injecting a custom network layer (for testing/recording)
    this.networkLayer = (options as any).networkLayer ?? new ResilientNetworkLayer(resilienceConfig, this.logger)

    this.logger?.info(`OpenTimestamps client initialized with ${this.calendars.length} calendars`)
  }

  /**
   * Create a timestamp by submitting a hash to calendar servers
   * 
   * @param hash SHA-256 hash of the data to timestamp (as Buffer or hex string)
   * @param options Operation-specific options
   * @returns Initial .ots proof with pending attestations
   * 
   * @throws {ValidationError} If the hash is invalid
   * @throws {StampError} If submission fails to all calendars
   * @throws {NetworkError} If network errors occur
   * 
   * @example
   * ```typescript
   * const hash = crypto.createHash('sha256').update('my data').digest()
   * const otsProof = await client.stamp(hash)
   * // Save otsProof to database as Buffer
   * ```
   */
  async stamp(hash: Buffer | string, options?: OperationOptions): Promise<Buffer> {
    const signal = options?.signal || this.globalSignal

    return orchestrateStamp(
      hash,
      this.calendars,
      this.networkLayer,
      this.logger,
      signal,
      this.minimumSuccessfulSubmissions
    )
  }

  /**
   * Upgrade an incomplete timestamp proof by querying calendars for Bitcoin confirmation
   * 
   * @param incompleteProof The initial .ots proof returned by stamp()
   * @param options Operation-specific options
   * @returns Upgraded .ots proof with Bitcoin attestation (if available)
   * 
   * @throws {ValidationError} If the proof format is invalid
   * @throws {UpgradeError} If no calendar has confirmed the timestamp yet
   * @throws {NetworkError} If network errors occur
   * 
   * @example
   * ```typescript
   * // Proof already has pending attestations from stamp()
   * const upgradedProof = await client.upgrade(incompleteProof)
   * 
   * // If upgrade throws UpgradeError, Bitcoin hasn't confirmed yet
   * // Retry later (typically 10-60 minutes after stamp)
   * ```
   */
  async upgrade(incompleteProof: Buffer, options?: OperationOptions): Promise<Buffer> {
    const signal = options?.signal || this.globalSignal

    return orchestrateUpgrade(
      incompleteProof,
      this.calendars,
      this.networkLayer,
      this.logger,
      signal
    )
  }

  /**
   * Verify a complete timestamp proof against the Bitcoin blockchain
   * 
   * @param proof The complete .ots proof with Bitcoin attestation
   * @param originalDataHash Optional: the original data hash to verify against
   * @returns Verification result with block details
   * 
   * @example
   * ```typescript
   * const result = await client.verify(completeProof, originalHash)
   * 
   * if (result.valid) {
   *   console.log(`Timestamp confirmed in Bitcoin block ${result.blockHeight}`)
   *   console.log(`Block timestamp: ${new Date(result.timestamp! * 1000)}`)
   * } else {
   *   console.error(`Verification failed: ${result.error}`)
   * }
   * ```
   */
  async verify(
    proof: Buffer,
    originalDataHash?: Buffer | string
  ): Promise<VerificationResult> {
    return orchestrateVerify(proof, this.networkLayer, originalDataHash, this.logger, this.globalSignal)
  }

  /**
   * Get the current state of the circuit breaker for a calendar
   * Useful for monitoring and debugging
   * 
   * @param calendarUrl The calendar URL to check
   * @returns Circuit state: 'CLOSED', 'OPEN', or 'HALF_OPEN' (undefined if not yet initialized)
   */
  getCircuitState(calendarUrl: string): 'CLOSED' | 'OPEN' | 'HALF_OPEN' | undefined {
    return this.networkLayer.getCircuitState(calendarUrl)
  }

  /**
   * Reset the circuit breaker for a specific calendar
   * Use this to manually recover a calendar that has been marked as failing
   * 
   * @param calendarUrl The calendar URL to reset
   */
  resetCircuit(calendarUrl: string): void {
    this.logger?.info(`Manually resetting circuit breaker for ${calendarUrl}`)
    this.networkLayer.resetCircuit(calendarUrl)
  }

  /**
   * Reset all circuit breakers
   * Use this to clear all failure states
   */
  resetAllCircuits(): void {
    this.logger?.info('Manually resetting all circuit breakers')
    this.networkLayer.resetAllCircuits()
  }
}