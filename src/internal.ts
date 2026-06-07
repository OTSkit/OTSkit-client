import type { ClientOptions } from './types.js'
import type { ResilientNetworkLayer } from './network/resilience.js'

/**
 * Opciones internas del constructor — no expuestas en la API pública (no se exporta desde index.ts).
 * Solo para testing e inyección de fixtures de red.
 * @internal
 */
export interface InternalClientOptions extends ClientOptions {
  /**
   * Inyecta una capa de red personalizada, omitiendo la construcción de ResilientNetworkLayer.
   * @internal
   */
  _networkLayer?: ResilientNetworkLayer
}
