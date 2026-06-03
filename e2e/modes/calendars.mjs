import { randomBytes } from 'node:crypto'
import { CalendarClient, DEFAULT_RESILIENCE } from '../../dist/index.js'
import { ResilientNetworkLayer } from '../../dist/index.js'
import * as report from '../lib/report.mjs'

const CALENDARS = [
  'https://alice.btc.calendar.opentimestamps.org',
  'https://bob.btc.calendar.opentimestamps.org',
  'https://finney.calendar.eternitywall.com',
  'https://btc.calendar.catallaxy.com',
]

async function checkCalendar(url) {
  const layer = new ResilientNetworkLayer({
    ...DEFAULT_RESILIENCE,
    retries: { ...DEFAULT_RESILIENCE.retries, enabled: false },
  })
  const client = new CalendarClient(url, layer)
  const digest = new Uint8Array(randomBytes(32))
  const start = Date.now()
  const ts = await client.submit(digest)
  const latency = Date.now() - start

  const attestations = ts.getAttestations()
  const pending = attestations.filter(a => a.kind === 'pending')
  if (pending.length === 0) throw new Error('Response has no pending attestation')

  const uri = pending[0].uri
  try {
    const parsed = new URL(uri)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
      throw new Error('not http/https')
  } catch {
    throw new Error(`Pending URI invalid or suspicious: ${uri}`)
  }

  return { latency, uri }
}

export async function run() {
  report.section('Salud de calendarios OTS')
  let anyPassed = false

  for (const url of CALENDARS) {
    try {
      const { latency, uri } = await checkCalendar(url)
      report.pass(`${url} (${latency}ms) → pending: ${uri}`)
      anyPassed = true
    } catch (err) {
      report.fail(`${url}: ${err.message}`)
    }
  }

  if (!anyPassed) {
    report.fail('Ningún calendario respondió correctamente')
    return false
  }
  return true
}
