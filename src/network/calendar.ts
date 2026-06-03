/**
 * Cliente de un calendario remoto OpenTimestamps (protocolo OTS real).
 */
import { Timestamp, StreamDeserializationContext, bytesToHex } from '@otskit/core'
import { ResilientNetworkLayer } from './resilience.js'
import { Logger } from '../types.js'
import { CommitmentNotFoundError, CalendarResponseTooLargeError, NetworkError } from '../errors.js'

/** Límite de tamaño de la respuesta de un calendario (defensa DoS). */
export const MAX_CALENDAR_RESPONSE_SIZE = 10000

/** Valida un commitment en la frontera (fail-closed): Uint8Array de longitud razonable. */
function assertCommitment(bytes: Uint8Array): void {
  if (!(bytes instanceof Uint8Array)) {
    throw new TypeError('commitment must be a Uint8Array')
  }
  if (bytes.length === 0 || bytes.length > 64) {
    throw new RangeError(`commitment length ${bytes.length} is out of range (1..64)`)
  }
}

const OTS_HEADERS: Record<string, string> = {
  Accept: 'application/vnd.opentimestamps.v1',
  'Content-Type': 'application/x-www-form-urlencoded',
}

/** Une la URL base del calendario con un path absoluto, sin duplicar la barra. */
function joinUrl(base: string, path: string): string {
  return base.replace(/\/+$/, '') + path
}

/** Interfaz con un servidor de calendario remoto. */
export class CalendarClient {
  constructor(
    private readonly url: string,
    private readonly networkLayer: ResilientNetworkLayer,
    private readonly logger?: Logger,
  ) {}

  /** Envía un digest al calendario y devuelve el Timestamp que lo commit-ea. */
  async submit(digest: Uint8Array, signal?: AbortSignal): Promise<Timestamp> {
    assertCommitment(digest)
    this.logger?.debug(`Submitting digest to ${this.url}/digest`)
    const response = await this.networkLayer.request(
      this.url,
      { url: joinUrl(this.url, '/digest'), method: 'POST', headers: OTS_HEADERS, body: digest },
      signal,
    )
    return this.#parseTimestamp(response.data, digest)
  }

  /** Pregunta al calendario si tiene un Timestamp más completo para `commitment` (upgrade). */
  async getTimestamp(commitment: Uint8Array, signal?: AbortSignal): Promise<Timestamp> {
    assertCommitment(commitment)
    const path = `/timestamp/${bytesToHex(commitment)}`
    this.logger?.debug(`Querying ${this.url}${path}`)
    let response
    try {
      response = await this.networkLayer.request(
        this.url,
        { url: joinUrl(this.url, path), method: 'GET', headers: OTS_HEADERS },
        signal,
      )
    } catch (err) {
      if (err instanceof NetworkError && err.status === 404) {
        throw new CommitmentNotFoundError(`calendar ${this.url} has no timestamp for the commitment yet`, {
          cause: err,
        })
      }
      throw err
    }
    return this.#parseTimestamp(response.data, commitment)
  }

  /** Deserializa la respuesta del calendario como un Timestamp commit-eado a `commitment`. */
  #parseTimestamp(data: Uint8Array, commitment: Uint8Array): Timestamp {
    if (data.length > MAX_CALENDAR_RESPONSE_SIZE) {
      throw new CalendarResponseTooLargeError(
        `calendar response of ${data.length} bytes exceeds limit ${MAX_CALENDAR_RESPONSE_SIZE}`,
      )
    }
    const ctx = new StreamDeserializationContext(data)
    const timestamp = Timestamp.deserialize(ctx, commitment)
    ctx.assertEof() // fail-closed: no se admiten bytes colgando tras el árbol
    return timestamp
  }
}

/** Convierte un patrón con comodín `*` en un RegExp anclado; `*` ≡ «chars salvo `/`». */
function wildcardToRegExp(pattern: string): RegExp {
  // Escapa TODOS los metacaracteres regex (incluido `?`, que en URL es literal), luego
  // reactiva solo `*` como comodín que no cruza la barra de path.
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '[^/]*')
  // Flag `i`: los hosts son case-insensitive (un host en mayúsculas debe casar igual).
  return new RegExp(`^${escaped}$`, 'i')
}

/** Lista blanca de URLs de calendario de confianza. */
export class UrlWhitelist {
  readonly #patterns = new Set<string>()

  constructor(urls?: readonly string[]) {
    if (urls) {
      for (const u of urls) this.add(u)
    }
  }

  /** Añade un patrón; si no trae esquema, se añaden las variantes http y https. */
  add(url: string): void {
    if (typeof url !== 'string') {
      throw new TypeError('UrlWhitelist: URL must be a string')
    }
    if (url.startsWith('http://') || url.startsWith('https://')) {
      this.#patterns.add(url)
    } else {
      this.#patterns.add('http://' + url)
      this.#patterns.add('https://' + url)
    }
  }

  /** Verdadero si `url` casa con algún patrón de la whitelist. */
  contains(url: string): boolean {
    for (const pattern of this.#patterns) {
      if (wildcardToRegExp(pattern).test(url)) return true
    }
    return false
  }

  toString(): string {
    return `UrlWhitelist([${[...this.#patterns].join(', ')}])`
  }
}

/** Calendarios de confianza por defecto para verificación/upgrade. */
export const DEFAULT_CALENDAR_WHITELIST = new UrlWhitelist([
  'https://*.calendar.opentimestamps.org', // Peter Todd
  'https://*.calendar.eternitywall.com', // Eternity Wall
  'https://*.calendar.catallaxy.com', // Catallaxy
])

/** Agregadores por defecto a los que enviar digests al sellar. */
export const DEFAULT_AGGREGATORS: readonly string[] = [
  'https://a.pool.opentimestamps.org',
  'https://b.pool.opentimestamps.org',
  'https://a.pool.eternitywall.com',
  'https://ots.btc.catallaxy.com',
]
