/**
 * Sella un hash SHA-256 contra los calendarios reales.
 * Verifica: nonce único, hash original no viajó por la red, cross-client parse.
 */
import { createHash, randomBytes } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  OpenTimestampsClient,
  DetachedTimestampFile,
  DEFAULT_RESILIENCE,
} from '../../dist/index.js'
import { ResilientNetworkLayer } from '../../dist/index.js'
import { RecordingLayer } from '../lib/http-recorder.mjs'
import { checkPrerequisites } from '../lib/prerequisites.mjs'
import { createInitialState, writeState, statePathFor } from '../lib/state.mjs'
import * as jsAdapter from '../adapters/js-original.mjs'
import * as pythonAdapter from '../adapters/python-ots.mjs'
import * as report from '../lib/report.mjs'

const HEX64_RE = /^[0-9a-f]{64}$/

function extractNonceFromProof(dtf) {
  // branches es un Array de { op, stamp }. Buscamos el primer OpAppend.
  const branches = dtf.timestamp.branches
  if (!Array.isArray(branches) || branches.length === 0) return null
  for (const { op } of branches) {
    if (op?.tagName === 'append' && op.arg != null) {
      // op.arg puede ser un objeto {0:byte, 1:byte,...} o un Uint8Array
      return Buffer.from(
        ArrayBuffer.isView(op.arg) ? op.arg : Object.values(op.arg)
      )
    }
  }
  return null
}

export async function run([hashArg] = []) {
  if (!hashArg || !HEX64_RE.test(hashArg)) {
    throw new Error('Usage: node e2e/run.mjs stamp <hash64hex>')
  }

  report.section('Verificando prerrequisitos')
  await checkPrerequisites()

  const hashBytes = Buffer.from(hashArg, 'hex')

  // Crear capa de red con recorder
  const innerLayer = new ResilientNetworkLayer(DEFAULT_RESILIENCE)
  const recordingLayer = new RecordingLayer(innerLayer)

  report.section(`Stamp de ${hashArg.slice(0, 16)}...`)

  // ── Primer stamp ──
  const client = new OpenTimestampsClient({ networkLayer: recordingLayer })
  let proof1
  try {
    proof1 = await client.stamp(hashArg)
    report.pass('stamp() completado')
  } catch (err) {
    report.fail(`stamp() falló: ${err.message}`)
    return false
  }

  // ── Privacidad del nonce ──
  try {
    recordingLayer.assertHashNotLeaked(hashBytes)
    report.pass('Hash original no viajó por la red')
  } catch (err) {
    report.fail(err.message)
    return false
  }

  // ── Verificar fileDigest ──
  const dtf1 = DetachedTimestampFile.deserialize(new Uint8Array(proof1))
  const fileDigest = Buffer.from(dtf1.fileDigest())
  if (Buffer.compare(fileDigest, hashBytes) !== 0) {
    report.fail(`fileDigest no coincide con el hash enviado`)
    return false
  }
  report.pass('fileDigest correcto')

  // ── Verificar pending URIs ──
  const attestations = dtf1.timestamp.getAttestations()
  const pendingUris = attestations.filter(a => a.kind === 'pending').map(a => a.uri)
  report.pass(`Pending attestations (${pendingUris.length}): ${pendingUris.join(', ')}`)

  // ── Segundo stamp para verificar nonces únicos ──
  const innerLayer2 = new ResilientNetworkLayer(DEFAULT_RESILIENCE)
  const client2 = new OpenTimestampsClient({ networkLayer: new RecordingLayer(innerLayer2) })
  let proof2
  try {
    proof2 = await client2.stamp(hashArg)
    const dtf2 = DetachedTimestampFile.deserialize(new Uint8Array(proof2))
    const nonce1 = extractNonceFromProof(dtf1)
    const nonce2 = extractNonceFromProof(dtf2)
    if (!nonce1 || !nonce2) {
      report.fail('No se pudo extraer nonce del árbol — no se puede verificar unicidad de nonces')
      return false
    } else if (Buffer.compare(nonce1, nonce2) === 0) {
      report.fail('Los dos stamps tienen el mismo nonce — RNG puede estar roto')
      return false
    } else {
      report.pass(`Nonces distintos: ${nonce1.toString('hex').slice(0,16)}... ≠ ${nonce2.toString('hex').slice(0,16)}...`)
    }
  } catch (err) {
    report.fail(`Segundo stamp falló — no se puede verificar unicidad de nonces: ${err.message}`)
    return false
  }

  // ── Cross-client: JS original ──
  try {
    await jsAdapter.parseAndValidate(proof1, hashBytes)
    report.pass('JS original: parsea y valida el proof')
  } catch (err) {
    report.fail(`JS original: ${err.message}`)
    return false
  }

  // ── Cross-client: Python ──
  try {
    await pythonAdapter.parseAndValidate(proof1, hashBytes)
    report.pass('Python: parsea el proof')
  } catch (err) {
    report.fail(`Python: ${err.message}`)
    return false
  }

  // ── Guardar proof y estado ──
  const state = createInitialState('sha256', hashArg, pendingUris)
  writeFileSync(state.proofPath, proof1)
  state.initialProofSha256 = createHash('sha256').update(proof1).digest('hex')
  state.currentProofSha256 = state.initialProofSha256
  writeState('sha256', hashArg, state)

  report.pass(`Proof guardado en: ${state.proofPath}`)
  report.info(`Para upgrade: node e2e/run.mjs upgrade sha256 ${hashArg}`)

  return true
}
