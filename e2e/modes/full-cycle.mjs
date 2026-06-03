/**
 * Orquesta el ciclo completo: stamp → upgrade → verify.
 * Reanuda automáticamente si existe estado previo.
 */
import * as stampMode from './stamp.mjs'
import * as upgradeMode from './upgrade.mjs'
import * as verifyMode from './verify.mjs'
import { readState } from '../lib/state.mjs'
import { checkPrerequisites } from '../lib/prerequisites.mjs'
import * as report from '../lib/report.mjs'

const HEX64_RE = /^[0-9a-f]{64}$/

export async function run([hashArg] = [], mode = 'full-cycle') {
  if (!hashArg || !HEX64_RE.test(hashArg)) {
    throw new Error('Usage: node e2e/run.mjs full-cycle <hash64hex>')
  }

  report.section('Verificando prerrequisitos')
  await checkPrerequisites()

  const existing = readState('sha256', hashArg)

  if (existing && mode !== 'full-cycle') {
    report.info(`Reanudando ciclo existente (status=${existing.status})`)
  } else if (existing && existing.status !== 'pending') {
    report.info(`Estado existente: ${existing.status}. Iniciando ciclo nuevo requiere borrar el estado.`)
  }

  const state = existing

  // ── Paso 1: Stamp (solo si no hay estado previo) ──
  if (!state) {
    report.section('Paso 1/3: Stamp')
    const ok = await stampMode.run([hashArg])
    if (!ok) return false
  } else {
    report.info('Paso 1/3: Stamp ya completado — omitiendo')
  }

  // ── Paso 2: Upgrade ──
  const stateNow = readState('sha256', hashArg)
  if (stateNow?.status !== 'confirmed') {
    report.section('Paso 2/3: Upgrade (polling hasta 24h)')
    const ok = await upgradeMode.run(['sha256', hashArg])
    if (!ok) return false
  } else {
    report.info('Paso 2/3: Upgrade ya confirmado — omitiendo')
  }

  // ── Paso 3: Verify ──
  const finalState = readState('sha256', hashArg)
  if (!finalState) return false

  report.section('Paso 3/3: Verify')
  const ok = await verifyMode.run([finalState.proofPath, hashArg])
  return ok
}
