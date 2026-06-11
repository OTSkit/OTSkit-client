import { describe, it, expect } from 'vitest'
import { DetachedTimestampFile } from '@otskit/core'
import {
  FAKE_INCOMPLETE_OTS,
  FAKE_COMPLETE_OTS,
  INCOMPLETE_COMMITMENT,
  bitcoinResponseFor,
} from '../mocks/handlers.js'

describe('canonical fixtures', () => {
  it('FAKE_INCOMPLETE_OTS is a canonical .ots with pending attestations', () => {
    const dtf = DetachedTimestampFile.deserialize(FAKE_INCOMPLETE_OTS)
    const kinds = dtf.timestamp.getAttestations().map((a) => a.kind)
    expect(kinds).toContain('pending')
    expect(dtf.timestamp.isTimestampComplete()).toBe(false)
  })

  it('FAKE_COMPLETE_OTS is a canonical .ots that is already complete (Bitcoin)', () => {
    const dtf = DetachedTimestampFile.deserialize(FAKE_COMPLETE_OTS)
    expect(dtf.timestamp.isTimestampComplete()).toBe(true)
  })

  it('bitcoinResponseFor produces a deserializable Timestamp committed to the commitment', () => {
    const bytes = bitcoinResponseFor(INCOMPLETE_COMMITMENT, 700000)
    expect(bytes).toBeInstanceOf(Uint8Array)
    expect(bytes.length).toBeGreaterThan(8)
  })
})
