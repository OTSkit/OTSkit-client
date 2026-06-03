/**
 * Tests de completitud de cobertura: ramas, funciones y líneas que no se ejercitan
 * en los tests de integración porque son edge cases de módulos de infraestructura.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../mocks/server.js'

// ─── src/index.ts ────────────────────────────────────────────────────────────
import * as barrel from '../../src/index.js'

describe('src/index.ts — barrel exports', () => {
  it('exporta los símbolos principales del cliente', () => {
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

// ─── src/client.ts — métodos de utilidad ──────────────────────────────────────
import { OpenTimestampsClient } from '../../src/client.js'

describe('OpenTimestampsClient — métodos de utilidad', () => {
  it('getCircuitState devuelve undefined para un calendario no visto', () => {
    const client = new OpenTimestampsClient()
    expect(client.getCircuitState('https://never-used.example.com')).toBeUndefined()
  })

  it('resetCircuit no lanza para un calendario no visto', () => {
    const client = new OpenTimestampsClient()
    expect(() => client.resetCircuit('https://never-used.example.com')).not.toThrow()
  })

  it('resetAllCircuits no lanza', () => {
    const client = new OpenTimestampsClient()
    expect(() => client.resetAllCircuits()).not.toThrow()
  })

  it('resetCircuit con logger activo — cubre la rama logger?.info (true)', () => {
    const info = vi.fn()
    const client = new OpenTimestampsClient({ logger: { debug: vi.fn(), info, warn: vi.fn(), error: vi.fn() } })
    client.resetCircuit('https://a.pool.opentimestamps.org')
    expect(info).toHaveBeenCalledWith(expect.stringContaining('Manually resetting'))
  })

  it('resetAllCircuits con logger activo — cubre la rama logger?.info (true)', () => {
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
  it('resetCircuit no lanza', () => {
    const layer = new ResilientNetworkLayer(DEFAULT_RESILIENCE)
    expect(() => layer.resetCircuit('https://example.com')).not.toThrow()
  })

  it('resetAllCircuits no lanza', () => {
    const layer = new ResilientNetworkLayer(DEFAULT_RESILIENCE)
    expect(() => layer.resetAllCircuits()).not.toThrow()
  })
})

// ─── src/network/retry.ts — jitter y línea final ─────────────────────────────
import { withRetry } from '../../src/network/retry.js'

describe('withRetry — ramas no cubiertas por tests de integración', () => {
  it('jitter=full no lanza (rama case full)', async () => {
    const fn = vi.fn().mockResolvedValue('ok')
    const result = await withRetry(fn, {
      enabled: true,
      maxAttempts: 1,
      backoff: { strategy: 'exponential', initialDelayMs: 10, maxDelayMs: 100, jitter: 'full' },
    })
    expect(result).toBe('ok')
  })

  it('jitter=equal no lanza (rama case equal)', async () => {
    const fn = vi.fn().mockResolvedValue('ok')
    const result = await withRetry(fn, {
      enabled: true,
      maxAttempts: 1,
      backoff: { strategy: 'linear', initialDelayMs: 10, maxDelayMs: 100, jitter: 'equal' },
    })
    expect(result).toBe('ok')
  })

  it('maxAttempts=0 → lanza (línea de seguridad TypeScript)', async () => {
    const fn = vi.fn().mockResolvedValue('ok')
    await expect(
      withRetry(fn, {
        enabled: true,
        maxAttempts: 0,
        backoff: { strategy: 'constant', initialDelayMs: 0, jitter: 'none' },
      })
    ).rejects.toThrow()
  })

  it('retry con jitter=full llega a reintentar (cubre el delay path con jitter full)', async () => {
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

  it('retry con jitter=equal llega a reintentar (cubre el delay path con jitter equal)', async () => {
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

// ─── src/adapters/fetch-adapter.ts — ramas de error ─────────────────────────
import { executeRequest } from '../../src/adapters/fetch-adapter.js'
import { NetworkError } from '../../src/errors.js'

describe('executeRequest — ramas de error', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('error con "timeout" en el mensaje → NetworkError Request timeout', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(Object.assign(new Error('connection timeout'), {})))
    await expect(
      executeRequest({ url: 'https://example.com', method: 'GET' })
    ).rejects.toMatchObject({ message: 'Request timeout' })
    vi.unstubAllGlobals()
  })

  it('error no-Error (string thrown) → NetworkError Unknown network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue('string error'))
    await expect(
      executeRequest({ url: 'https://example.com', method: 'GET' })
    ).rejects.toBeInstanceOf(NetworkError)
    vi.unstubAllGlobals()
  })
})

// ─── src/network/circuit-breaker.ts — ramas de logger ────────────────────────
import { CircuitBreaker } from '../../src/network/circuit-breaker.js'

describe('CircuitBreaker — ramas de logger', () => {
  const makeLogger = () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
  const opts = { enabled: true, failureThreshold: 2, recoveryTimeoutMs: 50, halfOpenMaxAttempts: 1 }

  it('cubre logger.info al entrar en HALF_OPEN', async () => {
    const logger = makeLogger()
    const cb = new CircuitBreaker(opts, logger)
    const fail = () => Promise.reject(new Error('boom'))
    // Abrir el circuito (2 fallos)
    await expect(cb.execute('k', fail)).rejects.toThrow()
    await expect(cb.execute('k', fail)).rejects.toThrow()
    // Esperar el recoveryTimeout y pedir de nuevo para entrar en HALF_OPEN
    await new Promise((r) => setTimeout(r, 60))
    await expect(cb.execute('k', fail)).rejects.toThrow()
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('HALF_OPEN'))
  })

  it('cubre logger.warn al reabrir desde HALF_OPEN', async () => {
    const logger = makeLogger()
    const cb = new CircuitBreaker(opts, logger)
    const fail = () => Promise.reject(new Error('boom'))
    // Abrir
    await expect(cb.execute('k2', fail)).rejects.toThrow()
    await expect(cb.execute('k2', fail)).rejects.toThrow()
    // Esperar y reabrir
    await new Promise((r) => setTimeout(r, 60))
    await expect(cb.execute('k2', fail)).rejects.toThrow()
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('reopening'))
  })

  it('cubre logger.info al cerrar desde HALF_OPEN', async () => {
    const logger = makeLogger()
    const cb = new CircuitBreaker(opts, logger)
    const fail = () => Promise.reject(new Error('boom'))
    const succeed = () => Promise.resolve('ok')
    // Abrir
    await expect(cb.execute('k3', fail)).rejects.toThrow()
    await expect(cb.execute('k3', fail)).rejects.toThrow()
    // Esperar y tener éxito en HALF_OPEN → cierra
    await new Promise((r) => setTimeout(r, 60))
    await expect(cb.execute('k3', succeed)).resolves.toBe('ok')
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('closing'))
  })

  it('cubre logger.warn al abrir el circuito por umbral de fallos', async () => {
    const logger = makeLogger()
    const cb = new CircuitBreaker(opts, logger)
    const fail = () => Promise.reject(new Error('boom'))
    await expect(cb.execute('k4', fail)).rejects.toThrow()
    await expect(cb.execute('k4', fail)).rejects.toThrow()
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('opening'))
  })
})

// ─── src/network/calendar.ts — rama logger ────────────────────────────────────
import { CalendarClient } from '../../src/network/calendar.js'

describe('CalendarClient — rama logger?.debug (true branch)', () => {
  it('submit con logger cubre la rama logger?.debug', async () => {
    const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
    const layer = new ResilientNetworkLayer({
      ...DEFAULT_RESILIENCE,
      retries: { ...DEFAULT_RESILIENCE.retries, enabled: false },
    })
    const ALICE = 'https://alice.btc.calendar.opentimestamps.org'
    const digest = new Uint8Array(32).fill(0xab)
    // El handler de MSW devuelve un pending válido
    const client = new CalendarClient(ALICE, layer, logger)
    await client.submit(digest)
    expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('digest'))
  })

  it('getTimestamp con logger cubre la rama logger?.debug', async () => {
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

// ─── src/network/esplora.ts — rama logger ─────────────────────────────────────
import { EsploraClient, PUBLIC_ESPLORA_URL } from '../../src/network/esplora.js'

describe('EsploraClient — rama logger?.debug (true branch)', () => {
  const BLOCKHASH = 'bb'.repeat(32)
  const MERKLEROOT = 'aa'.repeat(32)
  const HEIGHT = 700000
  const TIME = 1700000000

  it('blockHash con logger cubre la rama logger?.debug', async () => {
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

  it('block con logger cubre la rama logger?.debug', async () => {
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

// ─── src/core/orchestration.ts — ramas de assertHttpUrl y calendarios vacíos ──
import { orchestrateStamp } from '../../src/core/orchestration.js'

describe('orchestrateStamp — ramas de validación directa', () => {
  const layer = new ResilientNetworkLayer({
    ...DEFAULT_RESILIENCE,
    retries: { ...DEFAULT_RESILIENCE.retries, enabled: false },
  })
  const hash = 'a'.repeat(64)

  it('calendarios vacíos → ValidationError (línea defensiva)', async () => {
    const { ValidationError } = await import('../../src/errors.js')
    await expect(orchestrateStamp(hash, [], layer, undefined, undefined, 1)).rejects.toBeInstanceOf(ValidationError)
  })

  it('URL malformada (catch de new URL) → ValidationError', async () => {
    const { ValidationError } = await import('../../src/errors.js')
    await expect(
      orchestrateStamp(hash, ['not a valid url'], layer, undefined, undefined, 1)
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('URL de protocolo no http(s) (ftp://) → ValidationError', async () => {
    const { ValidationError } = await import('../../src/errors.js')
    await expect(
      orchestrateStamp(hash, ['ftp://evil.example.com'], layer, undefined, undefined, 1)
    ).rejects.toBeInstanceOf(ValidationError)
  })
})


// ─── orchestration.ts — ramas de logger en verify ────────────────────────────
import { FAKE_COMPLETE_OTS } from '../mocks/handlers.js'

describe('orchestrateVerify — ramas de logger', () => {
  it('logger?.info en verificación exitosa', async () => {
    const info = vi.fn()
    const logger = { debug: vi.fn(), info, warn: vi.fn(), error: vi.fn() }
    const client = new OpenTimestampsClient({ logger })
    const result = await client.verify(Buffer.from(FAKE_COMPLETE_OTS))
    expect(result.valid).toBe(true)
    expect(info).toHaveBeenCalledWith(expect.stringContaining('Verified against Bitcoin'))
  })

  it('logger?.warn en verificación fallida (Esplora 404)', async () => {
    const warn = vi.fn()
    const logger = { debug: vi.fn(), info: vi.fn(), warn, error: vi.fn() }
    server.use(
      http.get('https://blockstream.info/api/block-height/:height', () => new HttpResponse(null, { status: 404 }))
    )
    const client = new OpenTimestampsClient({ logger })
    const result = await client.verify(Buffer.from(FAKE_COMPLETE_OTS))
    expect(result.valid).toBe(false)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Bitcoin attestation'))
  })
})

// ─── orchestration.ts — rama logger?.warn en upgrade (whitelist) ─────────────
import { orchestrateUpgrade } from '../../src/core/orchestration.js'
import { DetachedTimestampFile, OpSHA256, makePending } from '@otskit/core'

describe('orchestrateUpgrade — logger?.warn con calendario no whitelisted', () => {
  it('cubre la rama logger?.warn cuando se ignora un calendario', async () => {
    const warn = vi.fn()
    const logger = { debug: vi.fn(), info: vi.fn(), warn, error: vi.fn() }
    const dtf = DetachedTimestampFile.fromHash(new OpSHA256(), new Uint8Array(32).fill(0x11))
    dtf.timestamp.add(new OpSHA256()).attestations.push(makePending('https://evil.example.com'))
    const layer = new ResilientNetworkLayer(DEFAULT_RESILIENCE)
    await expect(
      orchestrateUpgrade(Buffer.from(dtf.serializeToBytes()), [], layer, logger)
    ).rejects.toThrow()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('non-whitelisted'))
  })
})

// ─── resilience.ts — logger.debug (éxito) y logger.error (error) ─────────────
describe('ResilientNetworkLayer — ramas de logger', () => {
  it('cubre logger.debug en petición exitosa', async () => {
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

  it('cubre logger.error en petición fallida', async () => {
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

// ─── retry.ts — estrategia linear con reintento real + logger branches ───────
describe('withRetry — estrategia linear con reintento', () => {
  it('linear strategy retries correctamente (cubre lines 22-24)', async () => {
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

  it('logger.warn al agotar todos los intentos', async () => {
    const warn = vi.fn()
    const logger = { debug: vi.fn(), info: vi.fn(), warn, error: vi.fn() }
    const fn = vi.fn().mockRejectedValue(new Error('always fails'))
    await expect(
      withRetry(fn, { enabled: true, maxAttempts: 2, backoff: { strategy: 'constant', initialDelayMs: 1, jitter: 'none' } }, logger)
    ).rejects.toThrow()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('attempts failed'))
  })

  it('logger.debug al reintentar (cubre la rama logger?.debug en calculateDelay)', async () => {
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

// ─── orchestration.ts — logger?.info y logger?.warn en stamp ─────────────────
describe('orchestrateStamp — ramas de logger', () => {
  it('logger.info y logger.warn en stamp (éxito parcial)', async () => {
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

// ─── orchestration.ts — logger?.warn en upgrade (error no-CommitmentNotFound) ─
describe('orchestrateUpgrade — ramas adicionales', () => {
  it('cubre logger?.warn cuando el calendario devuelve 503', async () => {
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

  it('logger?.info cuando la prueba ya está completa (rama true de logger)', async () => {
    const info = vi.fn()
    const logger = { debug: vi.fn(), info, warn: vi.fn(), error: vi.fn() }
    const layer = new ResilientNetworkLayer(DEFAULT_RESILIENCE)
    const { orchestrateUpgrade: oUp } = await import('../../src/core/orchestration.js')
    const { FAKE_COMPLETE_OTS: COMP } = await import('../mocks/handlers.js')
    const result = await oUp(Buffer.from(COMP), [], layer, logger)
    expect(Buffer.isBuffer(result)).toBe(true)
    expect(info).toHaveBeenCalledWith(expect.stringContaining('already complete'))
  })

  it('logger?.debug cuando CommitmentNotFoundError (404) en upgrade', async () => {
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

  it('att.kind !== pending → continue (cubre rama unknown attestation)', async () => {
    const { makeUnknown } = await import('@otskit/core')
    const _leaf = new (await import('@otskit/core')).Timestamp(new Uint8Array(32).fill(0x33))
    // timestamp con unknown + pending: unknown se salta, pending se consulta
    const dtf2 = DetachedTimestampFile.fromHash(new OpSHA256(), new Uint8Array(32).fill(0x33))
    const sub = dtf2.timestamp.add(new OpSHA256())
    sub.attestations.push(makeUnknown(new Uint8Array([0xde, 0xad, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]), new Uint8Array(0)))
    sub.attestations.push(makePending('https://alice.btc.calendar.opentimestamps.org'))
    const layer = new ResilientNetworkLayer(DEFAULT_RESILIENCE)
    const { orchestrateUpgrade: oUp } = await import('../../src/core/orchestration.js')
    // alice devuelve pending (por defecto) → nada cambia → UpgradeError
    await expect(oUp(Buffer.from(dtf2.serializeToBytes()), [], layer)).rejects.toThrow()
  })
})

// ─── circuit-breaker.ts — halfOpenMaxAttempts || 1 y logger.warn ─────────────
describe('CircuitBreaker — halfOpenMaxAttempts limit con logger', () => {
  it('cubre la rama || 1 (halfOpenMaxAttempts=0) y logger.warn', async () => {
    const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
    const opts = {
      enabled: true,
      failureThreshold: 1,
      recoveryTimeoutMs: 30,
      halfOpenMaxAttempts: 0, // fuerza || 1 → maxAttempts=1
    }
    const cb = new CircuitBreaker(opts, logger)
    const fail = () => Promise.reject(new Error('boom'))
    // Abrir el circuito
    await expect(cb.execute('hk', fail)).rejects.toThrow()
    // Esperar recovery
    await new Promise((r) => setTimeout(r, 40))
    // Primera llamada: abre HALF_OPEN, lanza la probe que falla, re-abre a OPEN
    await expect(cb.execute('hk', fail)).rejects.toThrow()
    // Segunda llamada: circuito OPEN pero ya pasó el timeout, entra HALF_OPEN, halfOpenAttempts=1 >= 1 → warn
    await new Promise((r) => setTimeout(r, 40))
    await expect(cb.execute('hk', fail)).rejects.toThrow()
    // El warn puede venir de la segunda o tercera llamada
    expect(logger.warn).toHaveBeenCalled()
  })
})
