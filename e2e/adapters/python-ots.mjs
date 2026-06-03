/**
 * Adaptador para el cliente Python 'ots'.
 * Invoca el ejecutable como proceso hijo y parsea su salida.
 */
import { spawnSync } from 'node:child_process'
import { writeFileSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { randomBytes } from 'node:crypto'

function getBin() {
  return process.env.OTS_PYTHON_BIN ?? 'ots'
}

function run(args, input) {
  const result = spawnSync(getBin(), args, {
    input,
    encoding: 'utf8',
    timeout: 30000,
    windowsHide: true,
    shell: true,  // necesario en Windows para ejecutar .cmd wrappers
  })
  return { stdout: result.stdout ?? '', stderr: result.stderr ?? '', status: result.status ?? -1 }
}

/**
 * Parsea un proof .ots y valida fileDigest. Usa 'ots info'.
 * Devuelve { ok: true } o lanza.
 */
export async function parseAndValidate(proofBytes, originalHashBytes) {
  const tmpOts = resolve(tmpdir(), `ots-e2e-${randomBytes(8).toString('hex')}.ots`)
  try {
    writeFileSync(tmpOts, Buffer.from(proofBytes))
    const { status, stdout, stderr } = run(['info', tmpOts])
    if (status !== 0) throw new Error(`Python ots info failed: ${stderr.trim()}`)

    // Extract fileDigest from 'ots info' output ("File sha256 hash: <hex>")
    // and verify it matches the expected hash.
    const expectedHex = Buffer.from(originalHashBytes).toString('hex')
    const match = stdout.match(/File\s+\w+\s+hash:\s+([0-9a-f]{64})/i)
    if (match && match[1] !== expectedHex) {
      throw new Error(
        `Python ots: fileDigest mismatch. Expected ${expectedHex.slice(0, 16)}..., got ${match[1].slice(0, 16)}...`
      )
    }

    return { ok: true }
  } finally {
    try { unlinkSync(tmpOts) } catch {}
  }
}

/**
 * Verifica un proof completo. Devuelve formato normalizado.
 * LIMITACIÓN: 'ots verify' requiere nodo Bitcoin local (RPC). Sin él, siempre devuelve
 * { valid: false }. No hay modo Esplora en el cliente Python oficial.
 */
export async function verify(proofBytes, originalHashBytes) {
  const tmpOts = resolve(tmpdir(), `ots-e2e-${randomBytes(8).toString('hex')}.ots`)
  try {
    writeFileSync(tmpOts, Buffer.from(proofBytes))
    const digestHex = Buffer.from(originalHashBytes).toString('hex')
    const { stdout, stderr, status } = run(['verify', '-d', digestHex, tmpOts])
    if (status !== 0) return { valid: false, blockHeight: null, timestamp: null }
    // 'ots verify' prints e.g. "Success! Bitcoin block 358391 attests existence as of ..."
    const blockMatch = stdout.match(/Bitcoin block (\d+)/i) ?? stderr.match(/Bitcoin block (\d+)/i)
    if (!blockMatch) return { valid: false, blockHeight: null, timestamp: null }
    // Some versions also print a Unix timestamp after "as of "
    const tsMatch = (stdout + stderr).match(/as of (\d{10,})/)
    return {
      valid: true,
      blockHeight: parseInt(blockMatch[1], 10),
      timestamp: tsMatch ? parseInt(tsMatch[1], 10) : null,
    }
  } catch {
    return { valid: false, blockHeight: null, timestamp: null }
  } finally {
    try { unlinkSync(tmpOts) } catch {}
  }
}

export async function version() {
  const { stdout } = run(['--version'])
  return stdout.trim() || 'unknown'
}
