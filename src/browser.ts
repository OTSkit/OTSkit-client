/**
 * Browser entry for @otskit/client. Exposes only the stamp path (hash a file, submit to
 * calendars, get a pending .ots). upgrade/verify stay Node-only and are never imported here,
 * so node:crypto / node:dns / Esplora cannot reach the browser bundle.
 */
import { ResilientNetworkLayer } from './network/resilience.js'
import { orchestrateStamp } from './core/stamp.js'
import { assertSafeCalendarUrlStructural } from './security/ssrf-web.js'
import { DEFAULT_RESILIENCE } from './types.js'
import type { Logger } from './types.js'

export { hashBytes, hashBlob } from './utils/hash-web.js'
export { bytesToHex } from './utils/hex.js'

/** Calendars confirmed to accept browser-origin CORS requests (verified 2026-07-28). */
export const BROWSER_CALENDARS = [
  'https://a.pool.opentimestamps.org',
  'https://b.pool.opentimestamps.org',
  'https://a.pool.eternitywall.com',
] as const

export interface BrowserClientOptions {
  minimumSuccessfulSubmissions?: number
  logger?: Logger
}

/** Browser-only OpenTimestamps client: stamp a hash, get back a pending .ots (Uint8Array). */
export class OpenTimestampsBrowserClient {
  // Immutable allowlist: no arbitrary-URL option is exposed on purpose. An attacker-supplied URL
  // could make a visitor's browser fire requests into their own local network (CORS blocks
  // reading the response, not sending the request).
  private readonly calendars: string[] = [...BROWSER_CALENDARS]
  private readonly minSubs: number
  private readonly layer: ResilientNetworkLayer
  private readonly logger?: Logger

  constructor(options: BrowserClientOptions = {}) {
    this.minSubs = options.minimumSuccessfulSubmissions ?? 2
    if (options.logger !== undefined) this.logger = options.logger
    this.layer = new ResilientNetworkLayer(DEFAULT_RESILIENCE, this.logger)
  }

  /** hash: 32-byte Uint8Array or 64-char hex. Returns the pending .ots as Uint8Array. */
  stamp(hash: Uint8Array | string): Promise<Uint8Array> {
    return orchestrateStamp(
      hash,
      this.calendars,
      this.layer,
      assertSafeCalendarUrlStructural,
      this.logger,
      undefined,
      this.minSubs
    )
  }
}
