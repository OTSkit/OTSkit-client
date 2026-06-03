import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const STATE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../state')

const ALGO_RE = /^[a-z0-9_-]{1,32}$/
const HASH_RE = /^[0-9a-f]{64}$/

export function statePathFor(algorithm, hash) {
  if (!ALGO_RE.test(algorithm)) throw new Error(`Invalid algorithm identifier: ${algorithm}`)
  if (!HASH_RE.test(hash)) throw new Error(`Invalid hash: must be 64-char lowercase hex`)
  mkdirSync(STATE_DIR, { recursive: true })
  return resolve(STATE_DIR, `${algorithm}-${hash}.json`)
}

/** Lee el estado existente o devuelve null. Lanza si el JSON está corrupto. */
export function readState(algorithm, hash) {
  const path = statePathFor(algorithm, hash)
  if (!existsSync(path)) return null
  let raw
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'))
  } catch (err) {
    throw new Error(`State file corrupted at ${path}: ${err.message}. Remove manually to start fresh.`)
  }
  return raw
}

/** Escribe el estado de forma atómica. */
export function writeState(algorithm, hash, data) {
  const path = statePathFor(algorithm, hash)
  const tmp = path + '.tmp'
  writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8')
  renameSync(tmp, path)
}

/** Crea el estado inicial para un nuevo ciclo. */
export function createInitialState(algorithm, hash, calendars = []) {
  const now = new Date().toISOString()
  const deadline = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  return {
    schemaVersion: 1,
    algorithm,
    hash,
    status: 'pending',
    createdAt: now,
    deadlineAt: deadline,
    lastAttemptAt: null,
    nextAttemptAt: now,
    attemptCount: 0,
    proofPath: resolve(STATE_DIR, `${algorithm}-${hash}.pending.ots`),
    initialProofSha256: null,
    currentProofSha256: null,
    calendars: Object.fromEntries(calendars.map(url => [url, 'pending'])),
    lastError: null,
    crossClientResults: {
      js: { valid: null, blockHeight: null, timestamp: null },
      python: { valid: null, blockHeight: null, timestamp: null },
    },
  }
}
