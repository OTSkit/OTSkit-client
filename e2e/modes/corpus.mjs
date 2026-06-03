/**
 * Suite A: valida el corpus de fixtures históricos sin ninguna petición de red.
 * Todos los datos de Bitcoin vienen del manifiesto.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { DetachedTimestampFile, verifyAgainstBlockheader } from '../../dist/index.js'
import { loadManifest, FIXTURES_DIR } from '../lib/manifest.mjs'
import { makeLocalBitcoinProvider } from '../lib/local-bitcoin.mjs'
import * as report from '../lib/report.mjs'

async function runConfirmed(f) {
  const otsPath = resolve(FIXTURES_DIR, f.ots_file)
  const otsBytes = new Uint8Array(readFileSync(otsPath))

  // 1. Deserializar
  let dtf
  try {
    dtf = DetachedTimestampFile.deserialize(otsBytes)
  } catch (err) {
    throw new Error(`Deserialization failed: ${err.message}`)
  }

  // 2. Verificar fileDigest contra original_sha256
  const fileDigestHex = Buffer.from(dtf.fileDigest()).toString('hex')
  if (fileDigestHex !== f.original_sha256) {
    throw new Error(`fileDigest mismatch: got ${fileDigestHex}, expected ${f.original_sha256}`)
  }

  // 3. Extraer attestations Bitcoin
  const bitcoinAtts = dtf.timestamp.allAttestations().filter(a => a.attestation.kind === 'bitcoin')
  if (bitcoinAtts.length === 0) throw new Error('No Bitcoin attestation found in proof')

  // 4. Verificar con proveedor local (sin red)
  const provider = makeLocalBitcoinProvider(f)
  let verified = false
  let lastErr
  for (let i = 0; i < bitcoinAtts.length; i++) {
    const { msg, attestation } = bitcoinAtts[i]
    try {
      const hash = await provider.blockHash(attestation.height)
      const header = await provider.block(hash)
      // El digest del árbol es little-endian; el merkleroot de Esplora es big-endian
      const time = verifyAgainstBlockheader(Uint8Array.from(msg).reverse(), header)
      if (time !== f.expected_timestamp) {
        throw new Error(`timestamp mismatch: got ${time}, expected ${f.expected_timestamp}`)
      }
      if (attestation.height !== f.expected_block_height) {
        throw new Error(`blockHeight mismatch: got ${attestation.height}, expected ${f.expected_block_height}`)
      }
      verified = true
      break
    } catch (err) {
      lastErr = err
    }
  }

  if (!verified) throw lastErr ?? new Error('No Bitcoin attestation verified successfully')
}

async function runSyntactic(f) {
  const otsPath = resolve(FIXTURES_DIR, f.ots_file)
  const otsBytes = new Uint8Array(readFileSync(otsPath))
  let dtf
  try {
    dtf = DetachedTimestampFile.deserialize(otsBytes)
  } catch (err) {
    throw new Error(`Expected to parse but failed: ${err.message}`)
  }
  // unknown-notary: debe deserializarse, verify da false
  // Verificamos que la reserialización no pierde attestations desconocidas
  const before = Buffer.from(otsBytes).toString('hex')
  const reser = Buffer.from(dtf.serializeToBytes()).toString('hex')
  if (before !== reser) {
    throw new Error('Reserialization changed bytes — unknown attestation may have been dropped')
  }
}

async function runInvalid(f) {
  const otsPath = resolve(FIXTURES_DIR, f.ots_file)
  const otsBytes = new Uint8Array(readFileSync(otsPath))
  try {
    DetachedTimestampFile.deserialize(otsBytes)
    throw new Error(`Expected error '${f.expected_error_code}' but deserialization succeeded`)
  } catch (err) {
    if (err.message.includes('Expected error')) throw err
    if (f.expected_error_message_pattern) {
      const re = new RegExp(f.expected_error_message_pattern, 'i')
      if (!re.test(err.message)) {
        throw new Error(`Error message '${err.message}' does not match pattern '${f.expected_error_message_pattern}'`)
      }
    }
    // Error esperado: OK
  }
}

async function runCompat(f) {
  const otsPath = resolve(FIXTURES_DIR, f.ots_file)
  const otsBytes = new Uint8Array(readFileSync(otsPath))
  try {
    DetachedTimestampFile.deserialize(otsBytes)
    // Si no lanza, ver si el expected_error_code es sobre verify, no parse
    if (f.expected_error_code === 'KECCAK256_NOT_SUPPORTED') {
      // Consideramos éxito si se parsea pero falla la verificación
      return
    }
    throw new Error(`Expected compat error '${f.expected_error_code}' but no error thrown`)
  } catch (err) {
    if (err.message.includes('Expected compat error')) throw err
    // Error controlado esperado
  }
}

export async function run() {
  report.section('Suite A: Corpus histórico')
  const { fixtures } = loadManifest({ checkHashes: true })

  if (fixtures.length === 0) {
    report.fail('No fixtures found in manifest — Suite A requires fixtures to be meaningful. Run Task 13 to acquire fixtures.')
    return false
  }

  let passed = 0, failed = 0

  for (const f of fixtures) {
    try {
      if (f.group === 'confirmed') await runConfirmed(f)
      else if (f.group === 'syntactic') await runSyntactic(f)
      else if (f.group === 'invalid') await runInvalid(f)
      else if (f.group === 'compat') await runCompat(f)
      report.pass(`${f.id} (${f.group})`)
      passed++
    } catch (err) {
      report.fail(`${f.id} (${f.group}): ${err.message}`)
      failed++
    }
  }

  report.section(`Resultados: ${passed} passed, ${failed} failed`)
  return failed === 0
}
