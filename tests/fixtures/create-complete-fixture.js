import { serializeOTS } from '@otskit/core'
import { writeFileSync } from 'fs'

const TEST_HASH = new Uint8Array(32).fill(0xaa)

// Complete proof with Bitcoin attestation (block 123456)
// Block height debe ser Little Endian de 64 bits
const blockHeight = 123456n
const payload = new Uint8Array(8)
const view = new DataView(payload.buffer)
view.setBigUint64(0, blockHeight, true) // true = little endian

const completeProof = {
  version: 1,
  fileHash: TEST_HASH,
  operations: [],
  attestations: [
    {
      type: 0x05, // BITCOIN
      payload: payload,
    },
  ],
}

const serialized = serializeOTS(completeProof)
writeFileSync('tests/fixtures/complete.ots', serialized)
console.log('✅ Created complete.ots with Bitcoin attestation')
console.log(`   Size: ${serialized.length} bytes`)
console.log(`   Block height: ${blockHeight}`)
