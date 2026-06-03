/**
 * Proveedor Bitcoin local para Suite A.
 * No hace peticiones de red. Los datos vienen del manifiesto.
 *
 * Simula las dos llamadas que hace EsploraClient:
 *   blockHash(height)  → string hex 64
 *   block(hash)        → { merkleroot, time }
 */
export function makeLocalBitcoinProvider(fixture) {
  const { expected_block_height, expected_merkleroot, expected_timestamp } = fixture
  if (typeof expected_merkleroot !== 'string' || !/^[0-9a-f]{64}$/.test(expected_merkleroot))
    throw new Error('LocalBitcoin: fixture.expected_merkleroot must be 64-char lowercase hex')
  if (!Number.isInteger(expected_block_height) || expected_block_height <= 0)
    throw new Error('LocalBitcoin: fixture.expected_block_height must be a positive integer')

  // Synthetic block hash: byte-level reversal of merkleroot (big-endian → little-endian bytes).
  // Value is arbitrary; what matters is that blockHash(h) and block(hash) are internally consistent.
  const blockHashHex = Buffer.from(expected_merkleroot, 'hex').reverse().toString('hex')

  return {
    /** Devuelve el hash del bloque a la altura dada. Lanza si height no coincide. */
    async blockHash(height) {
      if (height !== expected_block_height)
        throw new Error(`LocalBitcoin: unexpected height ${height} (expected ${expected_block_height})`)
      return blockHashHex
    },

    /** Devuelve la cabecera del bloque dado su hash. Lanza si hash no coincide. */
    async block(hash) {
      if (hash !== blockHashHex)
        throw new Error(`LocalBitcoin: unexpected block hash ${hash}`)
      return { merkleroot: expected_merkleroot, time: expected_timestamp }
    },
  }
}
