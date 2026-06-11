/**
 * Fetch adapter for Node.js 20+.
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

/** Reads the Content-Length header if it exists and is a valid integer. */
function getDeclaredContentLength(response: Response): number | undefined {
  const value = response.headers.get('content-length')
  if (value === null || !/^\d+$/.test(value)) return undefined
  const n = Number(value)
  return Number.isSafeInteger(n) ? n : undefined
}

/**
 * Reads `body` as a stream and accumulates up to `maxBytes`.
 * Cancels the stream and throws `SizeLimitExceededError` if the limit is exceeded.
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
 * Reads the body of a Response while enforcing the size limit.
 * Checks Content-Length first (fast defense) then reads the stream.
 */
async function readResponseBody(response: Response, maxBytes: number): Promise<Uint8Array> {
  const contentLength = getDeclaredContentLength(response)
  if (contentLength !== undefined && contentLength > maxBytes) {
    throw new SizeLimitExceededError(maxBytes, contentLength, { status: response.status })
  }

  if (response.body === null) {
    // Bodyless responses (204, 304, HEAD) — safe fallback
    const ab = await response.arrayBuffer()
    if (ab.byteLength > maxBytes) {
      throw new SizeLimitExceededError(maxBytes, ab.byteLength, { status: response.status })
    }
    return new Uint8Array(ab)
  }

  return readStreamLimited(response.body, maxBytes, response.status)
}

/**
 * Executes an HTTP request and returns the response with a bounded body.
 *
 * @param maxBytes Maximum bytes allowed in the response body.
 *                 Pass `MAX_CALENDAR_RESPONSE_SIZE` (10 KB) or `MAX_ESPLORA_RESPONSE_SIZE` (100 KB).
 */
export async function executeRequest(
  request: FetchRequest,
  maxBytes: number,
): Promise<FetchResponse> {
  try {
    const response = await globalThis.fetch(request.url, {
      method: request.method,
      headers: { 'Content-Type': 'application/octet-stream', ...request.headers },
      ...(request.body !== undefined ? { body: request.body } : {}),
      ...(request.signal !== undefined ? { signal: request.signal } : {}),
      redirect: 'error',
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
 * Creates an AbortController with a timeout.
 * The child controller is aborted when `timeoutMs` elapses or when `parentSignal` is aborted.
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
