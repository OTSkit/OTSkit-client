/**
 * Verifica que los clientes JS y Python estén disponibles antes de Suite B.
 * Lanza si alguno falta.
 */
import { existsSync } from 'node:fs'
import * as jsAdapter from '../adapters/js-original.mjs'
import * as pythonAdapter from '../adapters/python-ots.mjs'

export async function checkPrerequisites() {
  const errors = []

  // JS original
  const jsDir = process.env.OTS_JS_ORIGINAL_DIR
  if (!jsDir) {
    errors.push('OTS_JS_ORIGINAL_DIR is not set')
  } else if (!existsSync(jsDir)) {
    errors.push(`OTS_JS_ORIGINAL_DIR does not exist: ${jsDir}`)
  } else {
    const jsVer = await jsAdapter.version()
    console.log(`  [OK] JS original: v${jsVer} at ${jsDir}`)
  }

  // Python
  const pythonVer = await pythonAdapter.version()
  if (!pythonVer || pythonVer === 'unknown') {
    errors.push(`Python 'ots' client not found. Install: pip install opentimestamps-client`)
  } else {
    console.log(`  [OK] Python ots: ${pythonVer}`)
  }

  if (errors.length > 0) {
    throw new Error(`Prerequisites check failed:\n${errors.map(e => `  - ${e}`).join('\n')}`)
  }
}
