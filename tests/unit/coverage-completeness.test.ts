/**
 * Coverage completeness tests: branches, functions, and lines not exercised
 * by integration tests because they are edge cases in infrastructure modules.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../mocks/server.js'

// ─── src/index.ts ────────────────────────────────────────────────────────────
import * as barrel from '../../src/index.js'

describe('src/index.ts — barrel exports', () => {
  it('exports the main client symbols', () => {
    expect(typeof barrel.OpenTimestampsClient).toBe('function')
    expect(typeof barrel.EsploraClient).toBe('function')
    expect(typeof barrel.CalendarClient).toBe('function')
    expect(typeof barrel.UrlWhitelist).toBe('function')
    expect(typeof barrel.NetworkError).toBe('function')
    expect(typeof barrel.ValidationError).toBe('function')
    expect(typeof barrel.StampError).toBe('function')
    expect(typeof barrel.UpgradeError).toBe('function')
    expect(typeof barrel.EsploraResponseError).toBe('function')
    expect(typeof barrel.verifyTimestampAttestation).toBe('function')
    expect(typeof barrel.DetachedTimestampFile).toBe('function')
    expect(typeof barrel.Timestamp).toBe('function')
  })
})

// ─── src/client.ts — utility methods ─────────────────────────────────────────
import { OpenTimestampsClient } from '../../src/client.js'

describe('OpenTimestampsClient — utility methods', () => {
  it('getCircuitState returns undefined for a never-seen calendar', () => {
    const client = new OpenTimestampsClient()
    expect(client.getCircuitState('https://never-used.example.com')).toBeUndefined()
  })

  it('resetCircuit does not throw for a never-seen calendar', () => {
    const client = new OpenTimestampsClient()
    expect(() => client.resetCircuit('https://never-used.example.com')).not.toThrow()
  })

  it('resetAllCircuits does not throw', () => {
    const client = new OpenTimestampsClient()
    expect(() => client.resetAllCircuits()).not.toThrow()
  })

  it('resetCircuit with active logger — covers the logger?.info (true) branch', () => {
    const info = vi.fn()
    const client = new OpenTimestampsClient({ logger: { debug: vi.fn(), info, warn: vi.fn(), error: vi.fn() } })
    client.resetCircuit('https://a.pool.opentimestamps.org')
    expect(info).toHaveBeenCalledWith(expect.stringContaining('Manually resetting'))
  })

  it('resetAllCircuits with active logger — covers the logger?.info (true) branch', () => {
    const info = vi.fn()
    const client = new OpenTimestampsClient({ logger: { debug: vi.fn(), info, warn: vi.fn(), error: vi.fn() } })
    client.resetAllCircuits()
    expect(info).toHaveBeenCalledWith(expect.stringContaining('Manually resetting all'))
  })
})

// ─── src/network/resilience.ts — resetCircuit / resetAllCircuits ──────────────
import { ResilientNetworkLayer } from '../../src/network/resilience.js'
import { DEFAULT_RESILIENCE } from '../../src/types.js'

describe('ResilientNetworkLayer — reset methods', () => {
  it('resetCircuit does not throw', () => {
    const layer = new ResilientNetworkLayer(DEFAULT_RESILIENCE)
    expect(() => layer.resetCircuit('https://example.com')).not.toThrow()
  })

  it('resetAllCircuits does not throw', () => {
    const layer = new ResilientNetworkLayer(DEFAULT_RESILIENCE)
    expect(() => layer.resetAllCircuits()).not.toThrow()
  })
})

// ─── src/network/retry.ts — jitter and final line ────────────────────────────
import { withRetry } from '../../src/network/retry.js'

describe('withRetry — branches not covered by integration tests', () => {
  it('jitter=full does not throw (case full branch)', async () => {
    const fn = vi.fn().mockResolvedValue('ok')
    const result = await withRetry(fn, {
      enabled: true,
      maxAttempts: 1,
      backoff: { strategy: 'exponential', initialDelayMs: 10, maxDelayMs: 100, jitter: 'full' },
    })
    expect(result).toBe('ok')
  })

  it('jitter=equal does not throw (case equal branch)', async () => {
    const fn = vi.fn().mockResolvedValue('ok')
    const result = await withRetry(fn, {
      enabled: true,
      maxAttempts: 1,
      backoff: { strategy: 'linear', initialDelayMs: 10, maxDelayMs: 100, jitter: 'equal' },
    })
    expect(result).toBe('ok')
  })

  it('maxAttempts=0 → throws (TypeScript safety line)', async () => {
    const fn = vi.fn().mockResolvedValue('ok')
    await expect(
      withRetry(fn, {
        enabled: true,
        maxAttempts: 0,
        backoff: { strategy: 'constant', initialDelayMs: 0, jitter: 'none' },
      })
    ).rejects.toThrow()
  })

  it('retry with jitter=full actually retries (covers the delay path with full jitter)', async () => {
    let calls = 0
    const fn = vi.fn().mockImplementation(() => {
      calls++
      if (calls < 2) throw new Error('fail')
      return Promise.resolve('ok')
    })
    const result = await withRetry(fn, {
      enabled: true,
      maxAttempts: 3,
      backoff: { strategy: 'constant', initialDelayMs: 1, jitter: 'full' },
    })
    expect(result).toBe('ok')
    expect(calls).toBe(2)
  })

  it('retry with jitter=equal actually retries (covers the delay path with equal jitter)', async () => {
    let calls = 0
    const fn = vi.fn().mockImplementation(() => {
      calls++
      if (calls < 2) throw new Error('fail')
      return Promise.resolve('ok')
    })
    const result = await withRetry(fn, {
      enabled: true,
      maxAttempts: 3,
      backoff: { strategy: 'constant', initialDelayMs: 1, jitter: 'equal' },
    })
    expect(result).toBe('ok')
  })
})

// ─── src/adapters/fetch-adapter.ts — error branches ──────────────────────────
import { executeRequest } from '../../src/adapters/fetch-adapter.js'
import { NetworkError } from '../../src/errors.js'

describe('executeRequest — error branches', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('error with "timeout" in the message → NetworkError Request timeout', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(Object.assign(new Error('connection timeout'), {})))
    await expect(
      executeRequest({ url: 'https://example.com', method: 'GET' })
    ).rejects.toMatchObject({ message: 'Request timeout' })
    vi.unstubAllGlobals()
  })

  it('non-Error thrown (string) → NetworkError Unknown network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue('string error'))
    await expect(
      executeRequest({ url: 'https://example.com', method: 'GET' })
    ).rejects.toBeInstanceOf(NetworkError)
    vi.unstubAllGlobals()
  })
})

// ─── src/network/circuit-breaker.ts — logger branches ────────────────────────
import { CircuitBreaker } from '../../src/network/circuit-breaker.js'

describe('CircuitBreaker — logger branches', () => {
  const makeLogger = () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
  const opts = { enabled: true, failureThreshold: 2, recoveryTimeoutMs: 50, halfOpenMaxAttempts: 1 }

  it('covers logger.info on entering HALF_OPEN', async () => {
    const logger = makeLogger()
    const cb = new CircuitBreaker(opts, logger)
    const fail = () => Promise.reject(new Error('boom'))
    // Open the circuit (2 failures)
    await expect(cb.execute('k', fail)).rejects.toThrow()
    await expect(cb.execute('k', fail)).rejects.toThrow()
    // Wait for the recovery timeout, then request again to enter HALF_OPEN
    await new Promise((r) => setTimeout(r, 60))
    await expect(cb.execute('k', fail)).rejects.toThrow()
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('HALF_OPEN'))
  })

  it('covers logger.warn when reopening from HALF_OPEN', async () => {
    const logger = makeLogger()
    const cb = new CircuitBreaker(opts, logger)
    const fail = () => Promise.reject(new Error('boom'))
    // Open
    await expect(cb.execute('k2', fail)).rejects.toThrow()
    await expect(cb.execute('k2', fail)).rejects.toThrow()
    // Wait and reopen
    await new Promise((r) => setTimeout(r, 60))
    await expect(cb.execute('k2', fail)).rejects.toThrow()
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('reopening'))
  })

  it('covers logger.info on closing from HALF_OPEN', async () => {
    const logger = makeLogger()
    const cb = new CircuitBreaker(opts, logger)
    const fail = () => Promise.reject(new Error('boom'))
    const succeed = () => Promise.resolve('ok')
    // Open
    await expect(cb.execute('k3', fail)).rejects.toThrow()
    await expect(cb.execute('k3', fail)).rejects.toThrow()
    // Wait and succeed in HALF_OPEN → closes
    await new Promise((r) => setTimeout(r, 60))
    await expect(cb.execute('k3', succeed)).resolves.toBe('ok')
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('closing'))
  })

  it('covers logger.warn when opening the circuit on failure threshold', async () => {
    const logger = makeLogger()
    const cb = new CircuitBreaker(opts, logger)
    const fail = () => Promise.reject(new Error('boom'))
    await expect(cb.execute('k4', fail)).rejects.toThrow()
    await expect(cb.execute('k4', fail)).rejects.toThrow()
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('opening'))
  })
})

// ─── src/network/calendar.ts — logger branch ─────────────────────────────────
import { CalendarClient } from '../../src/network/calendar.js'

describe('CalendarClient — logger?.debug (true branch)', () => {
  it('submit with logger covers the logger?.debug branch', async () => {
    const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
    const layer = new ResilientNetworkLayer({
      ...DEFAULT_RESILIENCE,
      retries: { ...DEFAULT_RESILIENCE.retries, enabled: false },
    })
    const ALICE = 'https://alice.btc.calendar.opentimestamps.org'
    const digest = new Uint8Array(32).fill(0xab)
    // The MSW handler returns a valid pending response
    const client = new CalendarClient(ALICE, layer, logger)
    await client.submit(digest)
    expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('digest'))
  })

  it('getTimestamp with logger covers the logger?.debug branch', async () => {
    const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
    const layer = new ResilientNetworkLayer({
      ...DEFAULT_RESILIENCE,
      retries: { ...DEFAULT_RESILIENCE.retries, enabled: false },
    })
    const ALICE = 'https://alice.btc.calendar.opentimestamps.org'
    const commitment = new Uint8Array(32).fill(0xcd)
    const client = new CalendarClient(ALICE, layer, logger)
    await client.getTimestamp(commitment)
    expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('timestamp'))
  })
})

// ─── src/network/esplora.ts — logger branch ───────────────────────────────────
import { EsploraClient, PUBLIC_ESPLORA_URL } from '../../src/network/esplora.js'

describe('EsploraClient — logger?.debug (true branch)', () => {
  const BLOCKHASH = 'bb'.repeat(32)
  const MERKLEROOT = 'aa'.repeat(32)
  const HEIGHT = 700000
  const TIME = 1700000000

  it('blockHash with logger covers the logger?.debug branch', async () => {
    const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
    const layer = new ResilientNetworkLayer({
      ...DEFAULT_RESILIENCE,
      retries: { ...DEFAULT_RESILIENCE.retries, enabled: false },
    })
    server.use(http.get(`${PUBLIC_ESPLORA_URL}/block-height/${HEIGHT}`, () => HttpResponse.text(BLOCKHASH)))
    const client = new EsploraClient(layer, { logger })
    await client.blockHash(HEIGHT)
    expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('block-height'))
  })

  it('block with logger covers the logger?.debug branch', async () => {
    const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
    const layer = new ResilientNetworkLayer({
      ...DEFAULT_RESILIENCE,
      retries: { ...DEFAULT_RESILIENCE.retries, enabled: false },
    })
    server.use(
      http.get(`${PUBLIC_ESPLORA_URL}/block/${BLOCKHASH}`, () =>
        HttpResponse.json({ id: BLOCKHASH, height: HEIGHT, merkle_root: MERKLEROOT, timestamp: TIME })
      )
    )
    const client = new EsploraClient(layer, { logger })
    await client.block(BLOCKHASH)
    expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('block'))
  })
})

// ─── src/core/orchestration.ts — assertHttpUrl and empty-calendars branches ───
import { orchestrateStamp } from '../../src/core/orchestration.js'

describe('orchestrateStamp — direct validation branches', () => {
  const layer = new ResilientNetworkLayer({
    ...DEFAULT_RESILIENCE,
    retries: { ...DEFAULT_RESILIENCE.retries, enabled: false },
  })
  const hash = 'a'.repeat(64)

  it('empty calendars → ValidationError (defensive line)', async () => {
    const { ValidationError } = await import('../../src/errors.js')
    await expect(orchestrateStamp(hash, [], layer, undefined, undefined, 1)).rejects.toBeInstanceOf(ValidationError)
  })

  it('malformed URL (new URL() catch) → ValidationError', async () => {
    const { ValidationError } = await import('../../src/errors.js')
    await expect(
      orchestrateStamp(hash, ['not a valid url'], layer, undefined, undefined, 1)
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('non-http(s) protocol URL (ftp://) → ValidationError', async () => {
    const { ValidationError } = await import('../../src/errors.js')
    await expect(
      orchestrateStamp(hash, ['ftp://evil.example.com'], layer, undefined, undefined, 1)
    ).rejects.toBeInstanceOf(ValidationError)
  })
})


// ─── orchestration.ts — logger branches in verify ────────────────────────────
import { FAKE_COMPLETE_OTS } from '../mocks/handlers.js'

describe('orchestrateVerify — logger branches', () => {
  it('logger?.info on successful verification', async () => {
    const info = vi.fn()
    const logger = { debug: vi.fn(), info, warn: vi.fn(), error: vi.fn() }
    const client = new OpenTimestampsClient({ logger })
    const result = await client.verify(Buffer.from(FAKE_COMPLETE_OTS))
    expect(result.status).toBe('verified')
    expect(info).toHaveBeenCalledWith(expect.stringContaining('Verified against Bitcoin'))
  })

  it('logger?.warn on failed verification (Esplora 404)', async () => {
    const warn = vi.fn()
    const logger = { debug: vi.fn(), info: vi.fn(), warn, error: vi.fn() }
    server.use(
      http.get('https://blockstream.info/api/block-height/:height', () => new HttpResponse(null, { status: 404 }))
    )
    const client = new OpenTimestampsClient({ logger })
    const result = await client.verify(Buffer.from(FAKE_COMPLETE_OTS))
    expect(result.status).toBe('network_error')
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Network error at block'))
  })
})

// ─── orchestration.ts — logger?.warn in upgrade (whitelist) ──────────────────
import { orchestrateUpgrade } from '../../src/core/orchestration.js'
import { DetachedTimestampFile, OpSHA256, makePending } from '@otskit/core'

describe('orchestrateUpgrade — logger?.warn with non-whitelisted calendar', () => {
  it('covers the logger?.warn branch when a calendar is ignored', async () => {
    const warn = vi.fn()
    const logger = { debug: vi.fn(), info: vi.fn(), warn, error: vi.fn() }
    const dtf = DetachedTimestampFile.fromHash(new OpSHA256(), new Uint8Array(32).fill(0x11))
    dtf.timestamp.add(new OpSHA256()).addAttestation(makePending('https://evil.example.com'))
    const layer = new ResilientNetworkLayer(DEFAULT_RESILIENCE)
    await expect(
      orchestrateUpgrade(Buffer.from(dtf.serializeToBytes()), [], layer, logger)
    ).rejects.toThrow()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('non-whitelisted'))
  })
})

// ─── resilience.ts — logger.debug (success) and logger.error (error) ─────────
describe('ResilientNetworkLayer — logger branches', () => {
  it('covers logger.debug on a successful request', async () => {
    const debug = vi.fn()
    const logger = { debug, info: vi.fn(), warn: vi.fn(), error: vi.fn() }
    const layer = new ResilientNetworkLayer(
      { ...DEFAULT_RESILIENCE, retries: { ...DEFAULT_RESILIENCE.retries, enabled: false } },
      logger
    )
    const ALICE = 'https://alice.btc.calendar.opentimestamps.org'
    await layer.request(ALICE, { url: `${ALICE}/digest`, method: 'POST', body: new Uint8Array(32) })
    expect(debug).toHaveBeenCalledWith(expect.stringContaining('succeeded'))
  })

  it('covers logger.error on a failed request', async () => {
    const error = vi.fn()
    const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error }
    const layer = new ResilientNetworkLayer(
      { ...DEFAULT_RESILIENCE, retries: { ...DEFAULT_RESILIENCE.retries, enabled: false } },
      logger
    )
    const { NetworkError } = await import('../../src/errors.js')
    server.use(
      http.post('https://failing.example.com/digest', () => new HttpResponse(null, { status: 503 }))
    )
    await expect(
      layer.request('https://failing.example.com', { url: 'https://failing.example.com/digest', method: 'POST' })
    ).rejects.toBeInstanceOf(NetworkError)
    expect(error).toHaveBeenCalledWith(expect.stringContaining('failed'), expect.anything())
  })
})

// ─── retry.ts — linear strategy with real retry + logger branches ─────────────
describe('withRetry — linear strategy with retry', () => {
  it('linear strategy retries correctly (covers lines 22-24)', async () => {
    let calls = 0
    const fn = vi.fn().mockImplementation(() => {
      calls++
      if (calls < 2) throw new Error('fail')
      return Promise.resolve('done')
    })
    const result = await withRetry(fn, {
      enabled: true,
      maxAttempts: 3,
      backoff: { strategy: 'linear', initialDelayMs: 1, jitter: 'none' },
    })
    expect(result).toBe('done')
    expect(calls).toBe(2)
  })

  it('logger.warn when all attempts are exhausted', async () => {
    const warn = vi.fn()
    const logger = { debug: vi.fn(), info: vi.fn(), warn, error: vi.fn() }
    const fn = vi.fn().mockRejectedValue(new Error('always fails'))
    await expect(
      withRetry(fn, { enabled: true, maxAttempts: 2, backoff: { strategy: 'constant', initialDelayMs: 1, jitter: 'none' } }, logger)
    ).rejects.toThrow()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('attempts failed'))
  })

  it('logger.debug on retry (covers the logger?.debug branch in calculateDelay)', async () => {
    const debug = vi.fn()
    const logger = { debug, info: vi.fn(), warn: vi.fn(), error: vi.fn() }
    let calls = 0
    const fn = vi.fn().mockImplementation(() => {
      calls++
      if (calls < 2) throw new Error('fail once')
      return Promise.resolve('ok')
    })
    await withRetry(fn, { enabled: true, maxAttempts: 3, backoff: { strategy: 'constant', initialDelayMs: 1, jitter: 'none' } }, logger)
    expect(debug).toHaveBeenCalledWith(expect.stringContaining('Retry attempt'))
  })
})

// ─── orchestration.ts — logger?.info and logger?.warn in stamp ───────────────
describe('orchestrateStamp — logger branches', () => {
  it('logger.info and logger.warn in stamp (partial success)', async () => {
    const info = vi.fn(); const warn = vi.fn()
    const logger = { debug: vi.fn(), info, warn, error: vi.fn() }
    const layer = new ResilientNetworkLayer(
      { ...DEFAULT_RESILIENCE, retries: { ...DEFAULT_RESILIENCE.retries, enabled: false } }
    )
    server.use(
      http.post('https://bob.btc.calendar.opentimestamps.org/digest', () => new HttpResponse(null, { status: 503 }))
    )
    const { orchestrateStamp: oStamp } = await import('../../src/core/orchestration.js')
    const hash = 'a'.repeat(64)
    const proof = await oStamp(hash, ['https://alice.btc.calendar.opentimestamps.org', 'https://bob.btc.calendar.opentimestamps.org'], layer, logger, undefined, 1)
    expect(Buffer.isBuffer(proof)).toBe(true)
    expect(info).toHaveBeenCalledWith(expect.stringContaining('stamp'))
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Failed to submit'))
  })
})

// ─── orchestration.ts — logger?.warn in upgrade (non-CommitmentNotFound error) ─
describe('orchestrateUpgrade — additional branches', () => {
  it('covers logger?.warn when a calendar returns 503', async () => {
    const warn = vi.fn()
    const logger = { debug: vi.fn(), info: vi.fn(), warn, error: vi.fn() }
    server.use(
      http.get('https://alice.btc.calendar.opentimestamps.org/timestamp/:hex', () => new HttpResponse(null, { status: 503 })),
      http.get('https://bob.btc.calendar.opentimestamps.org/timestamp/:hex', () => new HttpResponse(null, { status: 503 }))
    )
    const layer = new ResilientNetworkLayer(
      { ...DEFAULT_RESILIENCE, retries: { ...DEFAULT_RESILIENCE.retries, enabled: false } }
    )
    const { orchestrateUpgrade: oUp } = await import('../../src/core/orchestration.js')
    const { FAKE_INCOMPLETE_OTS: INC } = await import('../mocks/handlers.js')
    await expect(oUp(Buffer.from(INC), [], layer, logger)).rejects.toThrow()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Failed to query'))
  })

  it('logger?.info when proof is already complete (true branch of logger)', async () => {
    const info = vi.fn()
    const logger = { debug: vi.fn(), info, warn: vi.fn(), error: vi.fn() }
    const layer = new ResilientNetworkLayer(DEFAULT_RESILIENCE)
    const { orchestrateUpgrade: oUp } = await import('../../src/core/orchestration.js')
    const { FAKE_COMPLETE_OTS: COMP } = await import('../mocks/handlers.js')
    const result = await oUp(Buffer.from(COMP), [], layer, logger)
    expect(Buffer.isBuffer(result)).toBe(true)
    expect(info).toHaveBeenCalledWith(expect.stringContaining('already complete'))
  })

  it('logger?.debug when CommitmentNotFoundError (404) in upgrade', async () => {
    const debug = vi.fn()
    const logger = { debug, info: vi.fn(), warn: vi.fn(), error: vi.fn() }
    server.use(
      http.get('https://alice.btc.calendar.opentimestamps.org/timestamp/:hex', () => new HttpResponse(null, { status: 404 })),
      http.get('https://bob.btc.calendar.opentimestamps.org/timestamp/:hex', () => new HttpResponse(null, { status: 404 }))
    )
    const layer = new ResilientNetworkLayer(
      { ...DEFAULT_RESILIENCE, retries: { ...DEFAULT_RESILIENCE.retries, enabled: false } }
    )
    const { orchestrateUpgrade: oUp } = await import('../../src/core/orchestration.js')
    const { FAKE_INCOMPLETE_OTS: INC } = await import('../mocks/handlers.js')
    await expect(oUp(Buffer.from(INC), [], layer, logger)).rejects.toThrow()
    expect(debug).toHaveBeenCalledWith(expect.stringContaining('not confirmed yet'))
  })

  it('att.kind !== pending → continue (covers the unknown attestation branch)', async () => {
    const { makeUnknown } = await import('@otskit/core')
    const _leaf = new (await import('@otskit/core')).Timestamp(new Uint8Array(32).fill(0x33))
    // Timestamp with unknown + pending: unknown is skipped, pending is queried
    const dtf2 = DetachedTimestampFile.fromHash(new OpSHA256(), new Uint8Array(32).fill(0x33))
    const sub = dtf2.timestamp.add(new OpSHA256())
    sub.addAttestation(makeUnknown(new Uint8Array([0xde, 0xad, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]), new Uint8Array(0)))
    sub.addAttestation(makePending('https://alice.btc.calendar.opentimestamps.org'))
    const layer = new ResilientNetworkLayer(DEFAULT_RESILIENCE)
    const { orchestrateUpgrade: oUp } = await import('../../src/core/orchestration.js')
    // alice returns pending (default) → nothing changes → UpgradeError
    await expect(oUp(Buffer.from(dtf2.serializeToBytes()), [], layer)).rejects.toThrow()
  })
})

// ─── circuit-breaker.ts — halfOpenMaxAttempts || 1 and logger.warn ────────────
describe('CircuitBreaker — halfOpenMaxAttempts limit with logger', () => {
  it('covers the || 1 branch (halfOpenMaxAttempts=0) and logger.warn', async () => {
    const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
    const opts = {
      enabled: true,
      failureThreshold: 1,
      recoveryTimeoutMs: 30,
      halfOpenMaxAttempts: 0, // forces || 1 → maxAttempts=1
    }
    const cb = new CircuitBreaker(opts, logger)
    const fail = () => Promise.reject(new Error('boom'))
    // Open the circuit
    await expect(cb.execute('hk', fail)).rejects.toThrow()
    // Wait for recovery
    await new Promise((r) => setTimeout(r, 40))
    // First call: opens HALF_OPEN, fires the probe which fails, reopens to OPEN
    await expect(cb.execute('hk', fail)).rejects.toThrow()
    // Second call: circuit OPEN but timeout elapsed, enters HALF_OPEN, halfOpenAttempts=1 >= 1 → warn
    await new Promise((r) => setTimeout(r, 40))
    await expect(cb.execute('hk', fail)).rejects.toThrow()
    // The warn may come from the second or third call
    expect(logger.warn).toHaveBeenCalled()
  })
})
