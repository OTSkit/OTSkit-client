import type { ClientOptions } from './types.js'
import type { ResilientNetworkLayer } from './network/resilience.js'

/**
 * Internal constructor options, kept out of the public API: this file is not exported
 * from index.ts. For tests and for injecting network fixtures.
 * @internal
 */
export interface InternalClientOptions extends ClientOptions {
  /**
   * Injects a custom network layer, skipping the ResilientNetworkLayer construction.
   * @internal
   */
  _networkLayer?: ResilientNetworkLayer
}
