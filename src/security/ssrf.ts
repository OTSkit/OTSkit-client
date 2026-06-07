/**
 * SSRF protection para calendarios configurables por el usuario.
 *
 * LIMITACIONES (documentadas intencionalmente):
 * - TOCTOU/DNS rebinding: la validación DNS ocurre ANTES de la conexión.
 *   Un servidor con TTL=0 puede cambiar la IP entre la validación y el fetch.
 *   Mitigación real requiere egress filtering a nivel de red.
 * - IPv4-mapped IPv6 (::ffff:x.x.x.x): se bloquea el prefijo ::ffff:
 *   pero la validación del componente IPv4 depende del formato que devuelva Node.js.
 */

import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { ValidationError } from '../errors.js'

interface BlockedCidr4 {
  readonly network: number
  readonly mask: number
  readonly label: string
}

const BLOCKED_CIDRS_V4: readonly BlockedCidr4[] = [
  { network: 0x00000000, mask: 0xff000000, label: '0.0.0.0/8 (This Network)' },
  { network: 0x0a000000, mask: 0xff000000, label: '10.0.0.0/8 (RFC 1918)' },
  { network: 0x7f000000, mask: 0xff000000, label: '127.0.0.0/8 (Loopback)' },
  { network: 0xa9fe0000, mask: 0xffff0000, label: '169.254.0.0/16 (Link-local/IMDS)' },
  { network: 0xac100000, mask: 0xfff00000, label: '172.16.0.0/12 (RFC 1918)' },
  { network: 0xc0a80000, mask: 0xffff0000, label: '192.168.0.0/16 (RFC 1918)' },
  { network: 0xc6120000, mask: 0xfffe0000, label: '198.18.0.0/15 (Benchmarking)' },
  { network: 0xe0000000, mask: 0xf0000000, label: '224.0.0.0/4 (Multicast)' },
  { network: 0xf0000000, mask: 0xf0000000, label: '240.0.0.0/4 (Reserved)' },
  { network: 0xffffffff, mask: 0xffffffff, label: '255.255.255.255 (Broadcast)' },
]

function ipv4ToUint32(ip: string): number {
  const parts = ip.split('.')
  return (
    ((parseInt(parts[0]!, 10) << 24) |
      (parseInt(parts[1]!, 10) << 16) |
      (parseInt(parts[2]!, 10) << 8) |
      parseInt(parts[3]!, 10)) >>>
    0
  )
}

function assertNotPrivateIPv4(ip: string, calendarUrl: string): void {
  const n = ipv4ToUint32(ip)
  for (const cidr of BLOCKED_CIDRS_V4) {
    // >>> 0 normaliza a uint32 para que la comparación funcione con redes >= 128.0.0.0
    if (((n & cidr.mask) >>> 0) === cidr.network) {
      throw new ValidationError(
        `Calendar URL "${calendarUrl}" resolves to a private/reserved IPv4 address ` +
          `(${ip} — ${cidr.label}). Set allowPrivateCalendars: true to override.`,
      )
    }
  }
}

const BLOCKED_IPV6_PREFIXES = [
  { prefix: '::1',      label: 'Loopback' },
  { prefix: '::',       label: 'Unspecified' },
  { prefix: 'fc',       label: 'fc00::/7 (Unique Local)' },
  { prefix: 'fd',       label: 'fd00::/8 (Unique Local)' },
  { prefix: 'fe8',      label: 'fe80::/10 (Link-local)' },
  { prefix: 'fe9',      label: 'fe80::/10 (Link-local)' },
  { prefix: 'fea',      label: 'fe80::/10 (Link-local)' },
  { prefix: 'feb',      label: 'fe80::/10 (Link-local)' },
  { prefix: 'ff',       label: 'ff00::/8 (Multicast)' },
  { prefix: '::ffff:',  label: 'IPv4-mapped IPv6' },
  { prefix: '64:ff9b:', label: '64:ff9b::/96 (NAT64)' },
  { prefix: '2001:db8', label: '2001:db8::/32 (Documentation)' },
] as const

function assertNotPrivateIPv6(ip: string, calendarUrl: string): void {
  const lower = ip.toLowerCase()
  for (const { prefix, label } of BLOCKED_IPV6_PREFIXES) {
    if (lower === prefix || lower.startsWith(prefix)) {
      throw new ValidationError(
        `Calendar URL "${calendarUrl}" resolves to a private/reserved IPv6 address ` +
          `(${ip} — ${label}). Set allowPrivateCalendars: true to override.`,
      )
    }
  }
}

/**
 * Valida que una URL de calendario es segura para hacer outbound HTTP.
 * Bloquea IPs privadas/reservadas por defecto.
 *
 * @param allowPrivate Si true, omite la comprobación de rangos IP.
 *   Útil para testing local o redes corporativas internas.
 */
export async function assertSafeCalendarUrl(
  url: string,
  options: { allowPrivate: boolean },
): Promise<void> {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new ValidationError(`Calendar URL is not valid: "${url}"`)
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new ValidationError(`Calendar URL must use http or https: "${url}"`)
  }

  if (parsed.username || parsed.password) {
    throw new ValidationError(`Calendar URL must not contain embedded credentials: "${url}"`)
  }

  if (options.allowPrivate) return

  const hostname = parsed.hostname
  // new URL() incluye corchetes en IPv6: "[::1]" → quitarlos para isIP/assertNot*
  const host = hostname.startsWith('[') && hostname.endsWith(']')
    ? hostname.slice(1, -1)
    : hostname
  const ipVersion = isIP(host)

  if (ipVersion === 4) { assertNotPrivateIPv4(host, url); return }
  if (ipVersion === 6) { assertNotPrivateIPv6(host, url); return }

  // Hostname — resolver DNS (sujeto a TOCTOU, ver JSDoc del módulo)
  let addresses: Array<{ address: string; family: number }>
  try {
    addresses = await lookup(hostname, { all: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    throw new ValidationError(
      `Calendar URL hostname "${hostname}" could not be resolved: ${message}`,
    )
  }

  if (addresses.length === 0) {
    throw new ValidationError(`Calendar URL hostname "${hostname}" resolved to no addresses`)
  }

  for (const { address, family } of addresses) {
    if (family === 4) assertNotPrivateIPv4(address, url)
    else if (family === 6) assertNotPrivateIPv6(address, url)
  }
}
