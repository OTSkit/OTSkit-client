import { readFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve, dirname, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const FIXTURES_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../fixtures')
const MANIFEST_PATH = resolve(FIXTURES_DIR, 'manifest.json')

const VALID_GROUPS = ['confirmed', 'syntactic', 'invalid', 'compat']
const HEX64_RE = /^[0-9a-f]{64}$/

function safeFixturePath(relativePath) {
  if (typeof relativePath !== 'string' || !relativePath)
    throw new Error(`fixture path must be a non-empty string, got ${JSON.stringify(relativePath)}`)
  const resolved = resolve(FIXTURES_DIR, relativePath)
  if (!resolved.startsWith(FIXTURES_DIR + sep))
    throw new Error(`Path traversal detected: ${relativePath}`)
  return resolved
}

function sha256ofFile(path) {
  const data = readFileSync(path)
  return createHash('sha256').update(data).digest('hex')
}

function validateFixture(f, index) {
  const loc = `fixtures[${index}] (id=${f?.id})`
  if (!f.id || typeof f.id !== 'string') throw new Error(`${loc}: missing id`)
  if (!VALID_GROUPS.includes(f.group)) throw new Error(`${loc}: invalid group '${f.group}'`)
  if (typeof f.ots_file !== 'string' || !f.ots_file) throw new Error(`${loc}: ots_file must be a non-empty string`)
  if (!HEX64_RE.test(f.ots_sha256 ?? '')) throw new Error(`${loc}: ots_sha256 must be 64-char hex`)

  if (f.group === 'confirmed') {
    if (typeof f.original_file !== 'string' || !f.original_file) throw new Error(`${loc}: original_file required for confirmed fixtures`)
    if (!HEX64_RE.test(f.original_sha256 ?? '')) throw new Error(`${loc}: original_sha256 must be 64-char lowercase hex`)
    if (!Number.isInteger(f.expected_block_height) || f.expected_block_height <= 0) throw new Error(`${loc}: expected_block_height must be a positive integer`)
    if (!Number.isInteger(f.expected_timestamp) || f.expected_timestamp <= 0) throw new Error(`${loc}: expected_timestamp must be a positive integer`)
    if (typeof f.expected_merkleroot !== 'string' || !HEX64_RE.test(f.expected_merkleroot))
      throw new Error(`${loc}: expected_merkleroot must be 64-char lowercase hex`)
  }

  if (f.group === 'invalid' || f.group === 'compat') {
    if (typeof f.expected_error_code !== 'string' || !f.expected_error_code)
      throw new Error(`${loc}: expected_error_code must be a non-empty string for group '${f.group}'`)
  }
}

function validateFileHashes(f) {
  const otsPath = safeFixturePath(f.ots_file)
  if (!existsSync(otsPath)) throw new Error(`Fixture file not found: ${f.ots_file}`)
  const actual = sha256ofFile(otsPath)
  if (actual !== f.ots_sha256) throw new Error(`SHA-256 mismatch for ${f.ots_file}: expected ${f.ots_sha256}, got ${actual}`)

  if (f.original_file) {
    const origPath = safeFixturePath(f.original_file)
    if (!existsSync(origPath)) throw new Error(`Original file not found: ${f.original_file}`)
    const origActual = sha256ofFile(origPath)
    if (origActual !== f.original_sha256) throw new Error(`SHA-256 mismatch for ${f.original_file}`)
  }
}

/** Carga y valida manifest.json. Lanza si hay errores. */
export function loadManifest({ checkHashes = true } = {}) {
  const raw = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'))
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('manifest.json must be a JSON object')
  if (raw.schemaVersion !== 1) throw new Error(`Unknown manifest schemaVersion: ${raw.schemaVersion}`)
  if (!Array.isArray(raw.fixtures)) throw new Error('manifest.fixtures must be an array')

  const ids = new Set()
  raw.fixtures.forEach((f, i) => {
    validateFixture(f, i)
    if (ids.has(f.id)) throw new Error(`Duplicate fixture id: ${f.id}`)
    ids.add(f.id)
    if (checkHashes) validateFileHashes(f)
  })

  return raw
}

export { FIXTURES_DIR }
