/**
 * Adaptador para el cliente JS original (C:\tmp\ots-original o $OTS_JS_ORIGINAL_DIR).
 * Se importa como módulo CommonJS con createRequire para evitar problemas ESM/CJS.
 */
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

/**
 * Creates a fresh Uint8Array from any buffer-like value, avoiding the
 * byteOffset/byteLength issue that occurs when a Node.js Buffer shares a
 * larger backing allocation. The JS original client accepts Uint8Array but
 * not ArrayBuffer.
 */
function toUint8Array(data) {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data)
  const arr = new Uint8Array(buf.length)
  arr.set(buf)
  return arr
}

/**
 * The original JS client returns either a Map<height, timestamp> (newer versions)
 * or a plain object { bitcoin: { height, timestamp } } (older versions).
 * Normalise both to { valid, blockHeight, timestamp }.
 */
function parseVerifyResult(result) {
  if (!result) return { valid: false, blockHeight: null, timestamp: null }
  // Map form
  if (typeof result.size === 'number' && typeof result.entries === 'function') {
    if (result.size === 0) return { valid: false, blockHeight: null, timestamp: null }
    const [height, ts] = [...result.entries()][0]
    return { valid: true, blockHeight: height ?? null, timestamp: ts ?? null }
  }
  // Plain-object form: { bitcoin: { height, timestamp } } or { height, timestamp }
  const values = Object.values(result)
  if (values.length === 0) return { valid: false, blockHeight: null, timestamp: null }
  const first = values[0]
  if (first && typeof first === 'object') {
    return { valid: true, blockHeight: first.height ?? null, timestamp: first.timestamp ?? null }
  }
  if (typeof result.height === 'number' || typeof result.timestamp === 'number') {
    return { valid: true, blockHeight: result.height ?? null, timestamp: result.timestamp ?? null }
  }
  return { valid: false, blockHeight: null, timestamp: null }
}

function getJsDir() {
  const dir = process.env.OTS_JS_ORIGINAL_DIR
  if (!dir) throw new Error('OTS_JS_ORIGINAL_DIR is not set')
  return dir
}

let _ots = null
function loadOts() {
  if (_ots) return _ots
  const require = createRequire(import.meta.url)
  const dir = getJsDir()
  // index.js (npm package) primero; src/ y root como fallback para repos clonados
  for (const candidate of [
    resolve(dir, 'index.js'),
    resolve(dir, 'src', 'open-timestamps.js'),
    resolve(dir, 'open-timestamps.js'),
  ]) {
    try { _ots = require(candidate); break } catch {}
  }
  if (!_ots) throw new Error(`No se pudo cargar el cliente JS original desde ${dir}`)
  return _ots
}

/**
 * Parsea un proof .ots y valida que el fileDigest coincida con el hash dado.
 * Devuelve { ok: true } o lanza.
 */
export async function parseAndValidate(proofBytes, originalHashBytes) {
  const OpenTimestamps = loadOts()
  // El JS original trabaja con ArrayBuffer o Uint8Array
  const detached = OpenTimestamps.DetachedTimestampFile.deserialize(
    toUint8Array(proofBytes)
  )
  // Verificar fileDigest
  const fileDigest = detached.fileDigest()
  const fdBuf = Buffer.from(fileDigest)
  const hashBuf = Buffer.from(originalHashBytes)
  if (Buffer.compare(fdBuf, hashBuf) !== 0) {
    throw new Error(`JS original: fileDigest mismatch. Proof does not belong to this hash.`)
  }
  // Verificar que tiene al menos una attestation pending (getAttestations devuelve Set)
  const attestations = detached.timestamp.getAttestations()
  let hasPending = false
  for (const a of attestations) {
    if (a.type === 'PendingAttestation' || a.isPending?.() || a.uri) { hasPending = true; break }
  }
  if (!hasPending) throw new Error(`JS original: proof has no pending attestation`)
  return { ok: true }
}

/**
 * Verifica un proof completo. Devuelve formato normalizado.
 * Requiere red real (llama a Esplora).
 */
export async function verify(proofBytes, originalHashBytes) {
  const OpenTimestamps = loadOts()
  const fileOts = OpenTimestamps.DetachedTimestampFile.deserialize(
    toUint8Array(proofBytes)
  )
  const fileHash = OpenTimestamps.DetachedTimestampFile.fromHash(
    fileOts.hashOp,
    toUint8Array(originalHashBytes)
  )
  try {
    const result = await OpenTimestamps.verify(fileOts, fileHash)
    return parseVerifyResult(result)
  } catch {
    return { valid: false, blockHeight: null, timestamp: null }
  }
}

export async function version() {
  const dir = getJsDir()
  const require = createRequire(import.meta.url)
  try {
    const pkg = require(resolve(dir, 'package.json'))
    return pkg.version ?? 'unknown'
  } catch {
    return 'unknown'
  }
}
