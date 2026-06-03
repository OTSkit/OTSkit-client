import * as report from '../lib/report.mjs'

const FETCH_TIMEOUT_MS = 15000

const PROVIDERS = [
  { name: 'Blockstream', base: 'https://blockstream.info/api' },
  { name: 'mempool.space', base: 'https://mempool.space/api' },
  { name: 'Bull Bitcoin', base: 'https://mempool.bullbitcoin.com/api' },
]

function timedFetch(url) {
  return fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
}

async function checkProvider(base) {
  const heightRes = await timedFetch(`${base}/blocks/tip/height`)
  if (!heightRes.ok) throw new Error(`HTTP ${heightRes.status} on /blocks/tip/height`)
  const height = parseInt(await heightRes.text(), 10)
  if (!Number.isInteger(height) || height < 800000) throw new Error(`Implausible height: ${height}`)

  const hashRes = await timedFetch(`${base}/block-height/${height - 1}`)
  if (!hashRes.ok) throw new Error(`HTTP ${hashRes.status} on /block-height`)
  const blockHash = (await hashRes.text()).trim()
  if (!/^[0-9a-f]{64}$/.test(blockHash)) throw new Error(`Invalid block hash: ${blockHash}`)

  const blockRes = await timedFetch(`${base}/block/${blockHash}`)
  if (!blockRes.ok) throw new Error(`HTTP ${blockRes.status} on /block`)
  const block = await blockRes.json()
  if (!block.merkle_root || !block.timestamp) throw new Error('Missing merkle_root or timestamp')

  return { height, blockHash: blockHash.slice(0, 16) + '...', merkleroot: block.merkle_root.slice(0, 16) + '...' }
}

export async function run() {
  report.section('Salud de proveedores Esplora')
  let anyPassed = false
  const heights = []

  for (const { name, base } of PROVIDERS) {
    try {
      const info = await checkProvider(base)
      report.pass(`${name}: height=${info.height}, hash=${info.blockHash}, merkle=${info.merkleroot}`)
      heights.push({ name, height: info.height })
      anyPassed = true
    } catch (err) {
      report.fail(`${name}: ${err.message}`)
    }
  }

  if (heights.length > 1) {
    const h0 = heights[0].height
    const disagree = heights.filter(p => Math.abs(p.height - h0) > 2)
    if (disagree.length > 0) {
      report.fail(`Discrepancia de altura entre proveedores: ${heights.map(p => `${p.name}=${p.height}`).join(', ')}`)
      return false
    }
    report.pass(`Todos los proveedores coinciden en altura (±2 bloques)`)
  }

  if (!anyPassed) {
    report.fail('Ningún proveedor Esplora respondió correctamente')
    return false
  }
  return true
}
