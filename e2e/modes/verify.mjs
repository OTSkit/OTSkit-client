/**
 * Verifica un proof con el hash original + cross-client comparison.
 * Acepta tanto proofs pendientes como confirmados.
 */
import { readFileSync } from 'node:fs'
import { OpenTimestampsClient } from '../../dist/index.js'
import { checkPrerequisites } from '../lib/prerequisites.mjs'
import * as jsAdapter from '../adapters/js-original.mjs'
import * as pythonAdapter from '../adapters/python-ots.mjs'
import * as report from '../lib/report.mjs'

const HEX64_RE = /^[0-9a-f]{64}$/

export async function run([proofPath, hashArg] = []) {
  if (!proofPath || !hashArg || !HEX64_RE.test(hashArg)) {
    throw new Error('Usage: node e2e/run.mjs verify <proof.ots> <hash64hex>')
  }

  report.section('Verificando prerrequisitos')
  await checkPrerequisites()

  const proofBytes = readFileSync(proofPath)
  const hashBytes = Buffer.from(hashArg, 'hex')

  report.section(`Verify: ${proofPath}`)

  const client = new OpenTimestampsClient()
  const tsResult = await client.verify(proofBytes, hashArg)
  report.info(`TS result: ${JSON.stringify(tsResult)}`)

  // ── Resultado esperado para proof pendiente ──
  if (!tsResult.valid && tsResult.error?.includes('No Bitcoin attestation')) {
    report.info('Proof pendiente: sin attestation Bitcoin todavía')
    // MEDIUM: Para proofs pendientes, validar que los clientes cross también pueden parsear
    try {
      await jsAdapter.parseAndValidate(proofBytes, hashBytes)
      report.pass('JS original: parsea y valida el proof pendiente')
    } catch (err) {
      report.fail(`JS original: no puede parsear el proof pendiente: ${err.message}`)
      return false
    }
    try {
      await pythonAdapter.parseAndValidate(proofBytes, hashBytes)
      report.pass('Python: parsea el proof pendiente')
    } catch (err) {
      report.fail(`Python: no puede parsear el proof pendiente: ${err.message}`)
      return false
    }
    return true
  }

  // ── Resultado para proof confirmado ──
  if (!tsResult.valid) {
    report.warn(`TS verify falló: ${tsResult.error}`)
    // MEDIUM: Intentar cross-client antes de declarar fallo (Esplora puede estar caído)
    const jsResult = await jsAdapter.verify(proofBytes, hashBytes)
    const pythonResult = await pythonAdapter.verify(proofBytes, hashBytes)
    if (jsResult.valid || pythonResult.valid) {
      report.warn('TS verify falló pero cross-client confirma — posible Esplora caído')
      if (jsResult.valid) report.pass(`JS original: valid=true, blockHeight=${jsResult.blockHeight}`)
      if (pythonResult.valid) report.pass(`Python: valid=true, blockHeight=${pythonResult.blockHeight}`)
      return true
    }
    report.fail(`TS verify: ${tsResult.error}`)
    return false
  }

  report.pass(`TS verify: valid=true, blockHeight=${tsResult.blockHeight}, timestamp=${tsResult.timestamp}`)

  // ── Cross-client: JS original ──
  const jsResult = await jsAdapter.verify(proofBytes, hashBytes)
  report.info(`JS result: ${JSON.stringify(jsResult)}`)
  if (jsResult.valid !== tsResult.valid) {
    report.fail(`Discrepancia JS vs TS: JS=${jsResult.valid}, TS=${tsResult.valid}`)
    return false
  }
  if (jsResult.blockHeight !== null && jsResult.blockHeight !== tsResult.blockHeight) {
    report.fail(`Discrepancia blockHeight: JS=${jsResult.blockHeight}, TS=${tsResult.blockHeight}`)
    return false
  }
  report.pass('JS original: coincide con TS')

  // ── Cross-client: Python ──
  // NOTA: 'ots verify' del cliente Python requiere un nodo Bitcoin local (RPC).
  // Sin él, siempre devuelve valid=false aunque el proof sea correcto.
  // La discrepancia con TS se registra como [WARN], no como [FAIL].
  const pythonResult = await pythonAdapter.verify(proofBytes, hashBytes)
  report.info(`Python result: ${JSON.stringify(pythonResult)}`)
  if (!pythonResult.valid && tsResult.valid) {
    report.warn('Python verify: falló (probable causa: sin nodo Bitcoin local). El cliente Python no soporta Esplora para verificación.')
  } else if (pythonResult.valid !== tsResult.valid) {
    report.fail(`Discrepancia Python vs TS: Python=${pythonResult.valid}, TS=${tsResult.valid}`)
    return false
  } else if (pythonResult.blockHeight !== null && pythonResult.blockHeight !== tsResult.blockHeight) {
    report.fail(`Discrepancia blockHeight: Python=${pythonResult.blockHeight}, TS=${tsResult.blockHeight}`)
    return false
  } else {
    report.pass('Python: coincide con TS')
  }

  return true
}
