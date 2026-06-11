/**
 * MSW handlers — canonical OTS protocol (calendars) + Esplora, with fixtures built
 * in memory using the canonical core. Disk .ots files are NOT read (they are not canonical).
 */
import { http, HttpResponse } from 'msw'
import {
  Timestamp,
  DetachedTimestampFile,
  OpSHA256,
  makePending,
  makeBitcoin,
  bytesToHex,
  StreamSerializationContext,
} from '@otskit/core'

const CALENDAR_URLS = [
  'https://alice.btc.calendar.opentimestamps.org',
  'https://bob.btc.calendar.opentimestamps.org',
  'https://finney.calendar.eternitywall.com',
  'https://btc.calendar.catallaxy.com',
]

/** Local hex decoder (no dependency on whether core exports hexToBytes). */
function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return out
}

function serializeTimestamp(ts: Timestamp): Uint8Array {
  const sc = new StreamSerializationContext()
  ts.serialize(sc)
  return sc.getOutput()
}

/** PENDING calendar response (not yet confirmed) committed to `commitment`. */
function pendingResponseFor(commitment: Uint8Array, uri: string): Uint8Array {
  const ts = new Timestamp(commitment)
  ts.addAttestation(makePending(uri))
  return serializeTimestamp(ts)
}

/** COMPLETE (Bitcoin) calendar response committed to `commitment`. */
export function bitcoinResponseFor(commitment: Uint8Array, height: number): Uint8Array {
  const ts = new Timestamp(commitment)
  const leaf = ts.add(new OpSHA256())
  leaf.addAttestation(makeBitcoin(height))
  return serializeTimestamp(ts)
}

const arrayBufferOf = (bytes: Uint8Array): ArrayBuffer =>
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer

const otsResponse = (bytes: Uint8Array) =>
  HttpResponse.arrayBuffer(arrayBufferOf(bytes), {
    status: 200,
    headers: { 'Content-Type': 'application/octet-stream' },
  })

// --- INCOMPLETE fixture: digest 0xaa×32, SHA256 leaf with two pendings (alice + bob) ---
const FILE_DIGEST = new Uint8Array(32).fill(0xaa)
const incomplete = DetachedTimestampFile.fromHash(new OpSHA256(), FILE_DIGEST)
const incompleteLeaf = incomplete.timestamp.add(new OpSHA256())
incompleteLeaf.addAttestation(makePending('https://alice.btc.calendar.opentimestamps.org'))
incompleteLeaf.addAttestation(makePending('https://bob.btc.calendar.opentimestamps.org'))
export const FAKE_INCOMPLETE_OTS: Uint8Array = incomplete.serializeToBytes()
/** Commitment of the pending sub-stamp (what `upgrade` sends as /timestamp/{hex}). */
export const INCOMPLETE_COMMITMENT: Uint8Array = incompleteLeaf.getDigest()

// --- COMPLETE fixture (for verify): SHA256 leaf with Bitcoin at height 123456 ---
const BITCOIN_HEIGHT = 123456
const BLOCK_TIME = 1609459200
const complete = DetachedTimestampFile.fromHash(new OpSHA256(), FILE_DIGEST)
const completeLeaf = complete.timestamp.add(new OpSHA256())
completeLeaf.addAttestation(makeBitcoin(BITCOIN_HEIGHT))
export const FAKE_COMPLETE_OTS: Uint8Array = complete.serializeToBytes()
// Block merkle root = Bitcoin leaf digest REVERSED (big-endian)
const COMPLETE_MERKLEROOT = bytesToHex(Uint8Array.from(completeLeaf.getDigest()).reverse())
const COMPLETE_BLOCK_HASH = 'ab'.repeat(32)

export { BITCOIN_HEIGHT, BLOCK_TIME, COMPLETE_BLOCK_HASH }

export const handlers = [
  // Real OTS protocol: submit. Returns a pending Timestamp committed to the sent digest.
  ...CALENDAR_URLS.map((url) =>
    http.post(`${url}/digest`, async ({ request }) => {
      const digest = new Uint8Array(await request.arrayBuffer())
      return otsResponse(pendingResponseFor(digest, url))
    })
  ),
  // Real OTS protocol: upgrade. Default is pending (not yet confirmed).
  ...CALENDAR_URLS.map((url) =>
    http.get(`${url}/timestamp/:hex`, ({ params }) => {
      const commitment = hexToBytes(String(params.hex))
      return otsResponse(pendingResponseFor(commitment, url))
    })
  ),
  // Esplora — block by height (plain text: hash) and by hash (JSON with merkle_root + timestamp).
  http.get('https://blockstream.info/api/block-height/:height', ({ params }) => {
    if (String(params.height) === String(BITCOIN_HEIGHT)) return HttpResponse.text(COMPLETE_BLOCK_HASH)
    return new HttpResponse(null, { status: 404 })
  }),
  http.get('https://blockstream.info/api/block/:hash', ({ params }) => {
    if (String(params.hash) === COMPLETE_BLOCK_HASH) {
      return HttpResponse.json({
        id: COMPLETE_BLOCK_HASH,
        height: BITCOIN_HEIGHT,
        merkle_root: COMPLETE_MERKLEROOT,
        timestamp: BLOCK_TIME,
      })
    }
    return new HttpResponse(null, { status: 404 })
  }),
]
