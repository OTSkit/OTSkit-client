/**
 * Transporte HTTP que registra todas las peticiones salientes.
 * Se inyecta en OpenTimestampsClient para verificar que el hash original
 * nunca aparece en el body, URL, cabeceras o parámetros.
 */

/** Comprueba que needle no aparece en haystack como bytes crudos, hex ni base64. */
function appearsIn(needle, haystack) {
  if (!needle || !haystack) return false
  const needleBuf = Buffer.isBuffer(needle) ? needle : Buffer.from(needle)

  // Binary check first — catches raw-byte transmission that text search would miss.
  if (Buffer.isBuffer(haystack) || haystack instanceof Uint8Array) {
    const haystackBuf = Buffer.isBuffer(haystack) ? haystack : Buffer.from(haystack)
    if (haystackBuf.indexOf(needleBuf) !== -1) return true
  }

  const haystackStr = typeof haystack === 'string' ? haystack : Buffer.from(haystack).toString('utf8')
  const hexLower = needleBuf.toString('hex')
  const hexUpper = hexLower.toUpperCase()
  const b64 = needleBuf.toString('base64')
  return (
    haystackStr.includes(hexLower) ||
    haystackStr.includes(hexUpper) ||
    haystackStr.includes(b64)
  )
}

export class RecordingLayer {
  #requests = []
  #inner

  constructor(innerLayer) {
    this.#inner = innerLayer
  }

  async request(baseUrl, req, signal) {
    this.#requests.push({
      url: req.url,
      method: req.method,
      headers: req.headers ?? {},
      body: req.body,
    })
    return this.#inner.request(baseUrl, req, signal)
  }

  getCircuitState(url) { return this.#inner.getCircuitState?.(url) }
  resetCircuit(url) { return this.#inner.resetCircuit?.(url) }
  resetAllCircuits() { return this.#inner.resetAllCircuits?.() }

  /**
   * Verifica que originalHashBytes no aparece en ninguna petición registrada.
   * Lanza si se encuentra.
   */
  assertHashNotLeaked(originalHashBytes) {
    for (const req of this.#requests) {
      const locations = []
      if (appearsIn(originalHashBytes, req.url)) locations.push('URL')
      if (appearsIn(originalHashBytes, req.body)) locations.push('body')
      for (const [k, v] of Object.entries(req.headers)) {
        if (appearsIn(originalHashBytes, v)) locations.push(`header:${k}`)
      }
      if (locations.length > 0) {
        throw new Error(
          `Privacy violation: original hash appeared in HTTP request to ${req.url} in: ${locations.join(', ')}`
        )
      }
    }
  }

  get requests() { return [...this.#requests] }
}
