/**
 * Two calendars can anchor in the same Bitcoin block by different merkle paths, so a proof can
 * hold several attestations that share a height but commit to different digests. Verification
 * must check each commitment: keying deduplication on the height alone dropped valid branches
 * unchecked, turning a verifiable proof into an `invalid` verdict.
 */
import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { http, HttpResponse } from 'msw'
import { server } from '../mocks/server.js'
import { DetachedTimestampFile, OpSHA256, OpAppend, makeBitcoin, bytesToHex } from '@otskit/core'
import { orchestrateVerify } from '../../src/core/orchestration.js'
import { ResilientNetworkLayer } from '../../src/network/resilience.js'
import { DEFAULT_RESILIENCE } from '../../src/types.js'

const HEIGHT = 700000
const BLOCK_TIME = 1630000000
const FILE_DIGEST = new Uint8Array(32).fill(0xaa)

const sha256d = (data: Uint8Array): Uint8Array => {
  const first = createHash('sha256').update(data).digest()
  return new Uint8Array(createHash('sha256').update(first).digest())
}

/** 80-byte header carrying `merkleRoot` at bytes 36..68 and `BLOCK_TIME` at 68..72. */
function headerFor(merkleRoot: Uint8Array): Uint8Array {
  const h = new Uint8Array(80)
  h.set(merkleRoot, 36)
  h[68] = BLOCK_TIME & 0xff
  h[69] = (BLOCK_TIME >> 8) & 0xff
  h[70] = (BLOCK_TIME >> 16) & 0xff
  h[71] = (BLOCK_TIME >> 24) & 0xff
  return h
}

describe('orchestrateVerify — two commitments at the same block height', () => {
  it('verifies the second branch when the first does not match the block', async () => {
    // Two branches off the same file digest: different operations, so different commitments,
    // both claiming the same block. Only the second one is actually in that block.
    const detached = DetachedTimestampFile.fromHash(new OpSHA256(), FILE_DIGEST)
    const unmatched = detached.timestamp.add(new OpSHA256())
    unmatched.addAttestation(makeBitcoin(HEIGHT))
    const matched = detached.timestamp.add(new OpAppend(new Uint8Array([0x01]))).add(new OpSHA256())
    matched.addAttestation(makeBitcoin(HEIGHT))

    const attestations = detached.timestamp
      .allAttestations()
      .filter(({ attestation }) => attestation.kind === 'bitcoin')
    expect(attestations).toHaveLength(2)
    expect(bytesToHex(attestations[0]!.msg)).not.toBe(bytesToHex(attestations[1]!.msg))

    const header = headerFor(Uint8Array.from(matched.getDigest()))
    const blockHash = Buffer.from(sha256d(header)).reverse().toString('hex')
    server.use(
      http.get('https://blockstream.info/api/block-height/:height', ({ params }) =>
        String(params.height) === String(HEIGHT)
          ? HttpResponse.text(blockHash)
          : new HttpResponse(null, { status: 404 })
      ),
      http.get('https://blockstream.info/api/block/:hash/header', ({ params }) =>
        String(params.hash) === blockHash
          ? HttpResponse.text(bytesToHex(header))
          : new HttpResponse(null, { status: 404 })
      )
    )

    const layer = new ResilientNetworkLayer({
      ...DEFAULT_RESILIENCE,
      retries: { ...DEFAULT_RESILIENCE.retries, enabled: false },
    })
    const result = await orchestrateVerify(Buffer.from(detached.serializeToBytes()), layer)

    expect(result).toMatchObject({ status: 'verified', blockHeight: HEIGHT, blockTime: BLOCK_TIME })
  })
})
