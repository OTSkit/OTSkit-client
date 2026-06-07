/**
 * Universal fetch adapter para compatibilidad multi-runtime.
 * Funciona en Node.js 18+, browsers y edge runtimes.
 */

import { NetworkError, SizeLimitExceededError } from '../errors.js'

export interface FetchRequest {
  url: string
  method: 'GET' | 'POST'
  body?: Uint8Array
  headers?: Record<string, string>
  signal?: AbortSignal
}

export interface FetchResponse {
  ok: boolean
  status: number
  statusText: string
  data: Uint8Array
}

/** Lee el Content-Length header si existe y es un número válido. */
function getDeclaredContentLength(response: Response): number | undefined {
  const value = response.headers.get('content-length')
  if (value === null || !/^\d+$/.test(value)) return undefined
  const n = Number(value)
  return Number.isSafeInteger(n) ? n : undefined
}

/**
 * Lee `body` como stream y acumula hasta `maxBytes`.
 * Cancela el stream y lanza `SizeLimitExceededError` si se supera el límite.
 */
async function readStreamLimited(
  body: ReadableStream<Uint8Array>,
  maxBytes: number,
  status: number,
): Promise<Uint8Array> {
  const reader = body.getReader()
  const buffer = new Uint8Array(maxBytes)
  let received = 0

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) return buffer.subarray(0, received)

      const next = received + value.byteLength
      if (next > maxBytes) {
        await reader.cancel()
        throw new SizeLimitExceededError(maxBytes, next, { status })
      }
      buffer.set(value, received)
      received = next
    }
  } finally {
    reader.releaseLock()
  }
}

/**
 * Lee el body de una Response aplicando el límite de tamaño.
 * Comprueba Content-Length primero (defensa rápida) y luego lee el stream.
 */
async function readResponseBody(response: Response, maxBytes: number): Promise<Uint8Array> {
  const contentLength = getDeclaredContentLength(response)
  if (contentLength !== undefined && contentLength > maxBytes) {
    throw new SizeLimitExceededError(maxBytes, contentLength, { status: response.status })
  }

  if (response.body === null) {
    // Respuestas sin body (204, 304, HEAD) — fallback seguro
    const ab = await response.arrayBuffer()
    if (ab.byteLength > maxBytes) {
      throw new SizeLimitExceededError(maxBytes, ab.byteLength, { status: response.status })
    }
    return new Uint8Array(ab)
  }

  return readStreamLimited(response.body, maxBytes, response.status)
}

/**
 * Ejecuta una petición HTTP y devuelve la respuesta con el body limitado.
 *
 * @param maxBytes Límite de bytes para el body de la respuesta.
 *                 Pasar `MAX_CALENDAR_RESPONSE_SIZE` (10 KB) o `MAX_ESPLORA_RESPONSE_SIZE` (100 KB).
 */
export async function executeRequest(
  request: FetchRequest,
  maxBytes: number,
): Promise<FetchResponse> {
  try {
    const response = await globalThis.fetch(request.url, {
      method: request.method,
      headers: { 'Content-Type': 'application/octet-stream', ...request.headers },
      body: request.body,
      signal: request.signal,
    })

    const data = await readResponseBody(response, maxBytes)

    return { ok: response.ok, status: response.status, statusText: response.statusText, data }
  } catch (error) {
    if (error instanceof SizeLimitExceededError) throw error
    if (error instanceof NetworkError) throw error
    if (error instanceof Error) {
      if (error.name === 'AbortError') throw new NetworkError('Request aborted', { cause: error })
      if (error.message.includes('timeout')) throw new NetworkError('Request timeout', { cause: error })
      throw new NetworkError(`Network request failed: ${error.message}`, { cause: error })
    }
    throw new NetworkError('Unknown network error')
  }
}

/**
 * Crea un AbortController con timeout.
 * El controller hijo se aborta si se supera `timeoutMs` o si `parentSignal` se aborta.
 */
export function createTimeoutController(timeoutMs: number, parentSignal?: AbortSignal): AbortController {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(new Error('Timeout')), timeoutMs)

  const onParentAbort = (): void => {
    clearTimeout(timeout)
    parentSignal?.removeEventListener('abort', onParentAbort)
    controller.abort(parentSignal?.reason)
  }

  controller.signal.addEventListener('abort', () => {
    clearTimeout(timeout)
    parentSignal?.removeEventListener('abort', onParentAbort)
  }, { once: true })

  if (parentSignal) {
    if (parentSignal.aborted) {
      clearTimeout(timeout)
      controller.abort(parentSignal.reason)
    } else {
      parentSignal.addEventListener('abort', onParentAbort, { once: true })
    }
  }

  return controller
}
