import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { log } from 'node:console'
import { version } from 'node:process'
import { createRequire } from 'node:module'
import * as esm from '../dist/index.js'

const require = createRequire(import.meta.url)
const cjs = require('../dist/index.cjs')
const expected = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'

for (const [format, sdk] of [['ESM', esm], ['CommonJS', cjs]]) {
  assert.equal(typeof sdk.OpenTimestampsClient, 'function', `${format}: client export`)
  assert.equal(typeof sdk.DetachedTimestampFile, 'function', `${format}: core dependency export`)
  assert.equal(sdk.hashBuffer(Buffer.from('abc')).toString('hex'), expected, `${format}: SHA-256`)
}
log(`Built SDK works in ESM and CommonJS on ${version}`)
