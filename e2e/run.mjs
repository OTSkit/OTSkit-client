#!/usr/bin/env node
/**
 * E2E test suite for @alexalves87/opentimestamps-client.
 * Usage: node e2e/run.mjs <mode> [args...]
 * Modes: corpus | stamp | upgrade | verify | calendars | esplora | full-cycle | resume
 */
import { argv, exit } from 'node:process'

const [, , mode, ...args] = argv

const MODES = {
  corpus: () => import('./modes/corpus.mjs'),
  stamp: () => import('./modes/stamp.mjs'),
  upgrade: () => import('./modes/upgrade.mjs'),
  verify: () => import('./modes/verify.mjs'),
  calendars: () => import('./modes/calendars.mjs'),
  esplora: () => import('./modes/esplora.mjs'),
  'full-cycle': () => import('./modes/full-cycle.mjs'),
  resume: () => import('./modes/full-cycle.mjs'),
}

if (!mode || !MODES[mode]) {
  console.error(`Usage: node e2e/run.mjs <mode> [args]`)
  console.error(`Modes: ${Object.keys(MODES).join(' | ')}`)
  exit(1)
}

try {
  const mod = await MODES[mode]()
  const result = await mod.run(args, mode)
  exit(result ? 0 : 1)
} catch (err) {
  console.error(`[FATAL] ${err.message}`)
  if (process.env.E2E_DEBUG) console.error(err.stack)
  exit(1)
}
