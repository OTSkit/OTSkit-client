/**
 * Node entry point for upgrade. Delegates to the shared, Uint8Array-native implementation and
 * adapts the public contract to Buffer, which the Node client and its callers expect. The protocol
 * logic lives in upgrade-core.ts so the browser bundle can reuse it without pulling in Buffer.
 */
import { ResilientNetworkLayer } from '../network/resilience.js'
import { Logger } from '../types.js'
import { upgradeProofBytes } from './upgrade-core.js'

export async function orchestrateUpgrade(
  incompleteProof: Buffer,
  _calendars: string[],
  networkLayer: ResilientNetworkLayer,
  logger?: Logger,
  signal?: AbortSignal
): Promise<Buffer> {
  const upgraded = await upgradeProofBytes(
    new Uint8Array(incompleteProof),
    networkLayer,
    logger,
    signal
  )
  return Buffer.from(upgraded)
}
