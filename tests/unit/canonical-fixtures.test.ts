import { describe, it, expect } from 'vitest'
import { DetachedTimestampFile } from '@otskit/core'
import {
  FAKE_INCOMPLETE_OTS,
  FAKE_COMPLETE_OTS,
  INCOMPLETE_COMMITMENT,
  bitcoinResponseFor,
} from '../mocks/handlers.js'

describe('fixtures canónicos', () => {
  it('FAKE_INCOMPLETE_OTS es un .ots canónico con attestations pending', () => {
    const dtf = DetachedTimestampFile.deserialize(FAKE_INCOMPLETE_OTS)
    const kinds = dtf.timestamp.getAttestations().map((a) => a.kind)
    expect(kinds).toContain('pending')
    expect(dtf.timestamp.isTimestampComplete()).toBe(false)
  })

  it('FAKE_COMPLETE_OTS es un .ots canónico ya completo (Bitcoin)', () => {
    const dtf = DetachedTimestampFile.deserialize(FAKE_COMPLETE_OTS)
    expect(dtf.timestamp.isTimestampComplete()).toBe(true)
  })

  it('bitcoinResponseFor produce un Timestamp deserializable commit-eado al commitment', () => {
    const bytes = bitcoinResponseFor(INCOMPLETE_COMMITMENT, 700000)
    expect(bytes).toBeInstanceOf(Uint8Array)
    expect(bytes.length).toBeGreaterThan(8)
  })
})
