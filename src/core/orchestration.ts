/**
 * Canonical OpenTimestamps orchestration barrel. The stamp path is browser-safe and lives in
 * ./stamp.js; upgrade and verify are Node-only (Buffer / node:crypto / Esplora). Keeping this
 * barrel preserves the historical import path for Node consumers.
 */
export { orchestrateStamp } from './stamp.js'
export type { CalendarUrlValidator } from './stamp.js'
export { orchestrateUpgrade } from './upgrade.js'
export { orchestrateVerify, MAX_BITCOIN_ATTESTATIONS } from './verify.js'
