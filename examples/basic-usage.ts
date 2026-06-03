/**
 * Basic Usage Example
 *
 * Demonstrates the core stamp → upgrade → verify workflow
 */

import { OpenTimestampsClient } from '../src/index.js'
import { createHash } from 'crypto'

async function main() {
  // Initialize client with default calendars
  const client = new OpenTimestampsClient()

  // 1. Create a hash of your data
  const data = 'Hello, OpenTimestamps!'
  const hash = createHash('sha256').update(data).digest()
  console.log(`Hash: ${hash.toString('hex')}`)

  // 2. Create timestamp proof
  console.log('\n📝 Creating timestamp...')
  const proof = await client.stamp(hash)
  console.log(`✅ Timestamp created (${proof.length} bytes)`)

  // 3. Upgrade to get Bitcoin confirmation (may take time)
  console.log('\n⏫ Upgrading timestamp...')
  const upgraded = await client.upgrade(proof)

  if (upgraded.equals(proof)) {
    console.log('⏳ No Bitcoin confirmation yet (try again later)')
  } else {
    console.log('✅ Bitcoin confirmation received!')
  }

  // 4. Verify the timestamp
  console.log('\n✓ Verifying timestamp...')
  const result = await client.verify(upgraded, hash)

  if (result.valid) {
    console.log('✅ Timestamp is VALID')
    if (result.blockHeight) {
      console.log(`   Block: ${result.blockHeight}`)
      console.log(`   Time:  ${result.timestamp}`)
    }
  } else {
    console.log(`❌ Verification failed: ${result.error}`)
  }
}

main().catch(console.error)
