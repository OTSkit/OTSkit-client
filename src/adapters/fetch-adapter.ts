/**
 * Universal fetch adapter for multi-runtime compatibility
 * Works in Node.js 18+, browsers, and edge runtimes
 */

import { NetworkError } from '../errors.js'

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

/**
 * Execute HTTP request using the global fetch API
 */
export async function executeRequest(request: FetchRequest): Promise<FetchResponse> {
  try {
    const response = await globalThis.fetch(request.url, {
      method: request.method,
      headers: {
        'Content-Type': 'application/octet-stream',
        ...request.headers,
      },
      body: request.body,
      signal: request.signal,
    })

    // Read response as buffer
    const arrayBuffer = await response.arrayBuffer()
    const data = new Uint8Array(arrayBuffer)

    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      data,
    }
  } catch (error) {
    if (error instanceof Error) {
      // Handle abort
      if (error.name === 'AbortError') {
        throw new NetworkError('Request aborted', { cause: error })
      }

      // Handle timeout
      if (error.message.includes('timeout')) {
        throw new NetworkError('Request timeout', { cause: error })
      }

      // Generic network error
      throw new NetworkError(`Network request failed: ${error.message}`, { cause: error })
    }

    throw new NetworkError('Unknown network error')
  }
}

/**
 * Create an AbortController with timeout
 */
export function createTimeoutController(timeoutMs: number, parentSignal?: AbortSignal): AbortController {
  const controller = new AbortController()

  // Set timeout
  const timeout = setTimeout(() => {
    controller.abort(new Error('Timeout'))
  }, timeoutMs)

  // Link to parent signal
  if (parentSignal) {
    if (parentSignal.aborted) {
      clearTimeout(timeout)
      controller.abort(parentSignal.reason)
    } else {
      parentSignal.addEventListener('abort', () => {
        clearTimeout(timeout)
        controller.abort(parentSignal.reason)
      })
    }
  }

  // Clean up timeout when aborted
  controller.signal.addEventListener('abort', () => {
    clearTimeout(timeout)
  })

  return controller
}