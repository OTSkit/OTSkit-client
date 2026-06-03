const PASS = '\x1b[32m[PASS]\x1b[0m'
const FAIL = '\x1b[31m[FAIL]\x1b[0m'
const WARN = '\x1b[33m[WARN]\x1b[0m'
const INFO = '\x1b[36m[INFO]\x1b[0m'

export function pass(msg) { console.log(`${PASS} ${msg}`) }
export function fail(msg) { console.error(`${FAIL} ${msg}`) }
export function warn(msg) { console.warn(`${WARN} ${msg}`) }
export function info(msg) { console.log(`${INFO} ${msg}`) }

export function section(title) { console.log(`\n── ${title} ──`) }
