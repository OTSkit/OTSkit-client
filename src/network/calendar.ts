/**
 * Cliente de un calendario remoto OpenTimestamps (protocolo OTS real).
 */
import {
  Timestamp,
  StreamDeserializationContext,
  bytesToHex,
  TRUSTED_CALENDAR_WHITELIST_PATTERNS,
  DEFAULT_AGGREGATOR_URLS,
} from '@otskit/core'
import { ResilientNetworkLayer } from './resilience.js'
import { Logger } from '../types.js'
import { CommitmentNotFoundError, CalendarResponseTooLargeError, NetworkError } from '../errors.js'

/** Limite de tamano de la respuesta de un calendario (defensa DoS). */
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

  /** Envia un digest al calendario y devuelve el Timestamp que lo commit-ea. */
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

  /** Pregunta al calendario si tiene un Timestamp mas completo para `commitment` (upgrade). */
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
    ctx.assertEof() // fail-closed: no se admiten bytes colgando tras el arbol
    return timestamp
  }
}

type WhitelistPattern = {
  readonly protocol: 'http:' | 'https:'
  readonly hostname: string
  readonly port: string
  readonly pathname: string
  readonly wildcardSuffix?: string
}

function parseWhitelistPattern(raw: string): WhitelistPattern | undefined {
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    return undefined
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return undefined

  const hostname = parsed.hostname.toLowerCase()
  const wildcardSuffix = hostname.startsWith('*.') ? hostname.slice(2) : undefined

  // A hostname wildcard is intentionally narrow: one DNS label only, never a URL glob.
  if (hostname.includes('*') && wildcardSuffix === undefined) return undefined
  if (wildcardSuffix !== undefined && (wildcardSuffix.length === 0 || wildcardSuffix.includes('*'))) return undefined

  return {
    protocol: parsed.protocol,
    hostname,
    port: parsed.port,
    pathname: parsed.pathname,
    wildcardSuffix,
  }
}

function hostnameMatchesPattern(hostname: string, pattern: WhitelistPattern): boolean {
  if (pattern.wildcardSuffix === undefined) return hostname === pattern.hostname

  if (!hostname.endsWith('.' + pattern.wildcardSuffix)) return false
  const label = hostname.slice(0, -pattern.wildcardSuffix.length - 1)

  // Allowing dots here turns "*.example.com" into an open-ended suffix match.
  return label.length > 0 && !label.includes('.')
}

/** Lista blanca de URLs de calendario de confianza. */
export class UrlWhitelist {
  readonly #patterns = new Map<string, WhitelistPattern>()

  constructor(urls?: readonly string[]) {
    if (urls) {
      for (const u of urls) this.add(u)
    }
  }

  /** Anade un patron; si no trae esquema, se anaden las variantes http y https. */
  add(url: string): void {
    if (typeof url !== 'string') {
      throw new TypeError('UrlWhitelist: URL must be a string')
    }
    if (url.startsWith('http://') || url.startsWith('https://')) {
      const pattern = parseWhitelistPattern(url)
      if (pattern !== undefined) this.#patterns.set(url, pattern)
    } else {
      this.add('http://' + url)
      this.add('https://' + url)
    }
  }

  /** Verdadero si `url` casa con algun patron de la whitelist. */
  contains(url: string): boolean {
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      return false
    }

    // SSRF defense starts with protocol allowlisting; non-HTTP schemes can target local resources.
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false

    // Calendar attestations name base calendar URLs; query/fragment text must not influence hostname checks.
    if (parsed.search !== '' || parsed.hash !== '') return false

    const hostname = parsed.hostname.toLowerCase()
    for (const pattern of this.#patterns.values()) {
      // Scheme and port are part of the authority boundary, so they must be explicitly allowed.
      if (parsed.protocol !== pattern.protocol || parsed.port !== pattern.port) continue
      if (parsed.pathname !== pattern.pathname) continue
      if (hostnameMatchesPattern(hostname, pattern)) return true
    }
    return false
  }

  toString(): string {
    return `UrlWhitelist([${[...this.#patterns.keys()].join(', ')}])`
  }
}

/**
 * Default trusted calendars for verification/upgrade.
 * Patterns sourced from @otskit/core (single source of truth).
 */
export const DEFAULT_CALENDAR_WHITELIST = new UrlWhitelist([...TRUSTED_CALENDAR_WHITELIST_PATTERNS])

/**
 * Default aggregators to submit digests to when stamping.
 * Sourced from @otskit/core (single source of truth).
 */
export const DEFAULT_AGGREGATORS: readonly string[] = [...DEFAULT_AGGREGATOR_URLS]
