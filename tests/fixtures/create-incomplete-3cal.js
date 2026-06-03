import { serializeOTS } from '@otskit/core'
import { writeFileSync } from 'fs'

const TEST_HASH = new Uint8Array(32).fill(0xaa)

// Incomplete proof with 3 pending attestations (alice, bob, finney)
const incompleteProof = {
  version: 1,
  fileHash: TEST_HASH,
  operations: [],
  attestations: [
    {
      type: 0x00, // PENDING
      payload: new TextEncoder().encode('https://alice.btc.calendar.opentimestamps.org'),
      uri: 'https://alice.btc.calendar.opentimestamps.org',
    },
    {
      type: 0x00, // PENDING
      payload: new TextEncoder().encode('https://bob.btc.calendar.opentimestamps.org'),
      uri: 'https://bob.btc.calendar.opentimestamps.org',
    },
    {
      type: 0x00, // PENDING
      payload: new TextEncoder().encode('https://finney.calendar.eternitywall.com'),
      uri: 'https://finney.calendar.eternitywall.com',
    },
  ],
}

const serialized = serializeOTS(incompleteProof)
writeFileSync('tests/fixtures/incomplete.ots', serialized)
console.log('✅ Recreated incomplete.ots with 3 calendars')
console.log(`   Size: ${serialized.length} bytes`)
