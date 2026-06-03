/**
 * Polling de upgrade hasta 24h. Lee el estado de e2e/state/ y lo actualiza.
 * Puede reanudar si se interrumpe.
 */
import { readFileSync, writeFileSync, renameSync } from 'node:fs'
import { createHash } from 'node:crypto'
import {
  OpenTimestampsClient,
  DetachedTimestampFile,
  UpgradeError,
  ValidationError,
} from '../../dist/index.js'
import { readState, writeState } from '../lib/state.mjs'
import * as report from '../lib/report.mjs'

const POLL_INTERVAL_MS = 30 * 60 * 1000  // 30 minutos

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function hasBitcoinAttestation(proofBytes) {
  try {
    const dtf = DetachedTimestampFile.deserialize(new Uint8Array(proofBytes))
    return dtf.timestamp.allAttestations().some(a => a.attestation.kind === 'bitcoin')
  } catch {
    return false
  }
}

function writeProofAtomic(proofPath, data) {
  const tmp = proofPath + '.tmp'
  writeFileSync(tmp, data)
  renameSync(tmp, proofPath)
}

export async function run([algorithm, hash] = []) {
  const HEX64_RE = /^[0-9a-f]{64}$/
  if (!algorithm || !hash || !HEX64_RE.test(hash)) {
    throw new Error('Usage: node e2e/run.mjs upgrade sha256 <hash64hex>')
  }

  const state = readState(algorithm, hash)
  if (!state) throw new Error(`No state found for ${algorithm}:${hash.slice(0,16)}... Run stamp first.`)
  if (state.status === 'confirmed') {
    report.info('Proof already confirmed. Nothing to do.')
    return true
  }
  if (state.status === 'failed') {
    report.warn('State is failed. Inspect and remove state file to retry.')
    return false
  }

  report.section(`Upgrade polling para ${hash.slice(0,16)}...`)
  report.info(`Deadline: ${state.deadlineAt}`)
  report.info(`Proof: ${state.proofPath}`)

  // LOW: Validar deadline antes de entrar al loop
  const deadlineMs = new Date(state.deadlineAt).getTime()
  if (!Number.isFinite(deadlineMs)) {
    state.status = 'failed'
    state.lastError = `Invalid deadlineAt in state: ${state.deadlineAt}`
    writeState(algorithm, hash, state)
    report.fail(state.lastError)
    return false
  }

  const client = new OpenTimestampsClient()

  while (true) {
    const now = Date.now()

    if (now >= deadlineMs) {
      state.status = 'timeout'
      state.lastError = 'Reached 24h deadline without Bitcoin confirmation'
      writeState(algorithm, hash, state)
      report.fail(`Timeout: ningún calendario confirmó en 24h`)
      return false
    }

    state.lastAttemptAt = new Date().toISOString()
    state.attemptCount++

    const currentProofBytes = readFileSync(state.proofPath)
    const beforeSha256 = createHash('sha256').update(currentProofBytes).digest('hex')

    try {
      const upgraded = await client.upgrade(currentProofBytes)
      const afterSha256 = createHash('sha256').update(upgraded).digest('hex')
      // HIGH 1: Comprobar que el proof actualizado tiene attestation Bitcoin
      const confirmed = hasBitcoinAttestation(upgraded)

      if (afterSha256 !== beforeSha256) {
        // Proof cambió — guardarlo atómicamente (MEDIUM: escritura atómica)
        writeProofAtomic(state.proofPath, upgraded)
        state.currentProofSha256 = afterSha256

        if (confirmed) {
          state.status = 'confirmed'
          writeState(algorithm, hash, state)
          report.pass(`Upgrade exitoso en intento ${state.attemptCount}`)
          report.info(`Proof actualizado: ${state.proofPath}`)
          return true
        } else {
          // Proof mejorado pero aún sin Bitcoin — seguir esperando
          writeState(algorithm, hash, state)
          report.info(`Intento ${state.attemptCount}: proof actualizado pero sin Bitcoin aún`)
        }
      } else {
        // HIGH 2: Sin cambio + sin excepción = proof ya estaba confirmado
        if (confirmed) {
          state.status = 'confirmed'
          writeState(algorithm, hash, state)
          report.pass(`Proof ya confirmado (sin cambios, Bitcoin attestation presente)`)
          return true
        }
        report.info(`Intento ${state.attemptCount}: sin cambios`)
      }
    } catch (err) {
      if (err instanceof UpgradeError) {
        report.info(`Intento ${state.attemptCount}: ningún calendario ha confirmado aún`)
      } else if (err instanceof ValidationError) {
        state.status = 'failed'
        state.lastError = err.message
        writeState(algorithm, hash, state)
        report.fail(`Error de validación: ${err.message}`)
        return false
      } else {
        report.warn(`Intento ${state.attemptCount}: ${err.message}`)
      }
    }

    const next = new Date(Date.now() + POLL_INTERVAL_MS).toISOString()
    state.nextAttemptAt = next
    writeState(algorithm, hash, state)
    report.info(`Próximo intento: ${next}`)
    await sleep(POLL_INTERVAL_MS)
  }
}
