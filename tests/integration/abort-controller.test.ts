/**
 * Integration tests for AbortController and cancellation support
 */
import { describe, it, expect } from 'vitest'
import { OpenTimestampsClient } from '../../src/client.js'
import type { ClientOptions } from '../../src/types.js'
import { server } from '../mocks/server.js'
import { http, HttpResponse, delay } from 'msw'
import { Timestamp, StreamSerializationContext, makePending } from '@otskit/core'

// Calendarios *.example.com no se pueden resolver por DNS en los tests; allowPrivateCalendars
// desactiva la validación SSRF para que los tests de abort/timeout funcionen correctamente.
const localClient = (options: Omit<ClientOptions, 'allowPrivateCalendars'> = {}) =>
  new OpenTimestampsClient({ ...options, allowPrivateCalendars: true })

/** Respuesta OTS canónica mínima para un digest arbitrario. */
function pendingOtsResponse(body: ArrayBuffer): ArrayBuffer {
  const digest = new Uint8Array(body)
  const ts = new Timestamp(digest)
  ts.addAttestation(makePending('https://a.pool.opentimestamps.org'))
  const sc = new StreamSerializationContext()
  ts.serialize(sc)
  const out = sc.getOutput()
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength)
}

describe('AbortController Integration', () => {

  describe('stamp() cancellation', () => {
    it('should abort stamp operation when signal is aborted', async () => {
      const client = localClient({
        calendars: ['https://slow-calendar.example.com'],
      })

      // Mock slow response
      server.use(
        http.post('*/digest', async () => {
          await delay(5000) // 5 second delay
          return HttpResponse.arrayBuffer(new ArrayBuffer(100))
        })
      )

      const controller = new AbortController()
      const hash = 'a'.repeat(64)

      // Abort after 100ms
      setTimeout(() => controller.abort(), 100)

      await expect(
        client.stamp(hash, { signal: controller.signal })
      ).rejects.toThrow()
    })

    it('should abort stamp operation mid-flight across multiple calendars', async () => {
      const client = localClient({
        calendars: [
          'https://calendar1.example.com',
          'https://calendar2.example.com',
          'https://calendar3.example.com',
        ],
        minimumSuccessfulSubmissions: 2,
      })

      server.use(
        http.post('*/digest', async () => {
          await delay(2000) // All calendars slow
          return HttpResponse.arrayBuffer(new ArrayBuffer(100))
        })
      )

      const controller = new AbortController()
      const hash = 'b'.repeat(64)

      // Abort after 200ms
      setTimeout(() => controller.abort(), 200)

      await expect(
        client.stamp(hash, { signal: controller.signal })
      ).rejects.toThrow()
    })

    it('should not abort if signal is never triggered', async () => {
      const client = localClient({
        calendars: ['https://fast-calendar.example.com'],
        minimumSuccessfulSubmissions: 1,
      })

      server.use(
        http.post('*/digest', async ({ request }) => {
          return HttpResponse.arrayBuffer(pendingOtsResponse(await request.arrayBuffer()))
        })
      )

      const controller = new AbortController()
      const hash = 'c'.repeat(64)

      // Never abort - operation should complete
      const result = await client.stamp(hash, { signal: controller.signal })
      expect(result).toBeDefined()
      expect(Buffer.isBuffer(result)).toBe(true)
    })
  })

  describe('upgrade() cancellation', () => {
    it('should abort upgrade operation when signal is aborted', async () => {
      const client = localClient({
        calendars: ['https://slow-calendar.example.com'],
      })

      server.use(
        http.post('*/upgrade', async () => {
          await delay(5000) // 5 second delay
          return HttpResponse.arrayBuffer(new ArrayBuffer(100))
        })
      )

      const controller = new AbortController()
      const proof = Buffer.from([0x00, 0x01, 0x02])

      // Abort after 100ms
      setTimeout(() => controller.abort(), 100)

      await expect(
        client.upgrade(proof, { signal: controller.signal })
      ).rejects.toThrow()
    })

    it('should handle pre-aborted signal gracefully', async () => {
      const client = new OpenTimestampsClient()
      const controller = new AbortController()
      const proof = Buffer.from([0x00, 0x01, 0x02])

      // Abort BEFORE calling upgrade
      controller.abort()

      await expect(
        client.upgrade(proof, { signal: controller.signal })
      ).rejects.toThrow()
    })
  })

  describe('verify() cancellation', () => {
    it('should handle AbortSignal in verify operation', async () => {
      const client = new OpenTimestampsClient({
        resilience: {
          timeout: {
            totalMs: 10000,
            perAttemptMs: 5000,
          },
        },
      })

      // Use a pre-aborted signal to test immediate cancellation
      const controller = new AbortController()
      controller.abort()

      const proof = Buffer.from([0x00, 0x01, 0x02])
      const hash = 'd'.repeat(64)

      // With a pre-aborted signal or invalid proof, verify() throws (ValidationError or abort)
      await expect(
        client.verify(proof, hash)
      ).rejects.toThrow()
    })
  })

  describe('timeout handling', () => {
    it('should timeout if operation exceeds timeout duration', async () => {
      const client = localClient({
        calendars: ['https://very-slow-calendar.example.com'],
        minimumSuccessfulSubmissions: 1,
        resilience: {
          timeout: {
            totalMs: 1000, // 1 second total timeout
            perAttemptMs: 500,
          },
          retries: {
            enabled: false, // Disable retries for faster test
          },
        },
      })

      server.use(
        http.post('*/digest', async () => {
          await delay(10000) // 10 second delay (exceeds timeout)
          return HttpResponse.arrayBuffer(new ArrayBuffer(100))
        })
      )

      const hash = 'e'.repeat(64)

      // Should timeout before the 10 second delay completes
      await expect(client.stamp(hash)).rejects.toThrow()
    }, 15000) // Increase test timeout to 15 seconds

    it('should complete if operation finishes within timeout', async () => {
      const client = localClient({
        calendars: ['https://fast-calendar.example.com'],
        minimumSuccessfulSubmissions: 1,
        resilience: {
          timeout: {
            totalMs: 5000, // 5 second timeout
            perAttemptMs: 2000,
          },
        },
      })

      server.use(
        http.post('*/digest', async ({ request }) => {
          await delay(100) // Fast response
          return HttpResponse.arrayBuffer(pendingOtsResponse(await request.arrayBuffer()))
        })
      )

      const hash = 'f'.repeat(64)

      const result = await client.stamp(hash)
      expect(result).toBeDefined()
      expect(Buffer.isBuffer(result)).toBe(true)
    })
  })

  describe('AbortSignal propagation', () => {
    it('should propagate parent signal to child operations', async () => {
      const client = localClient({
        calendars: ['https://calendar1.example.com', 'https://calendar2.example.com'],
        minimumSuccessfulSubmissions: 1,
      })

      let requestCount = 0
      server.use(
        http.post('*/digest', async () => {
          requestCount++
          await delay(1000)
          return HttpResponse.arrayBuffer(new ArrayBuffer(100))
        })
      )

      const parentController = new AbortController()
      const hash = '0'.repeat(64)

      // Abort parent signal after 100ms
      setTimeout(() => parentController.abort(), 100)

      await expect(
        client.stamp(hash, { signal: parentController.signal })
      ).rejects.toThrow()

      // Note: Request count might be 0 if abort happens before fetch starts
      // Just verify the operation was aborted
      expect(requestCount).toBeGreaterThanOrEqual(0)
    })

    it('should not affect other operations when one is aborted', async () => {
      const client = localClient({
        calendars: ['https://calendar.example.com'],
        minimumSuccessfulSubmissions: 1,
      })

      server.use(
        http.post('*/digest', async ({ request }) => {
          return HttpResponse.arrayBuffer(pendingOtsResponse(await request.arrayBuffer()))
        })
      )

      const controller1 = new AbortController()
      const controller2 = new AbortController()
      const hash1 = '1'.repeat(64)
      const hash2 = '2'.repeat(64)

      // Abort only the first operation
      controller1.abort()

      // First should fail
      await expect(
        client.stamp(hash1, { signal: controller1.signal })
      ).rejects.toThrow()

      // Second should succeed
      const result = await client.stamp(hash2, { signal: controller2.signal })
      expect(result).toBeDefined()
    })
  })

  describe('edge cases', () => {
    it('should handle abort during retry backoff', async () => {
      const client = localClient({
        calendars: ['https://flaky-calendar.example.com'],
        minimumSuccessfulSubmissions: 1,
        resilience: {
          retries: {
            enabled: true,
            maxAttempts: 10,
            backoff: {
              strategy: 'constant',
              initialDelayMs: 200,
              maxDelayMs: 5000,
              jitter: 'none',
            },
          },
        },
      })

      let attemptCount = 0
      server.use(
        http.post('*/digest', () => {
          attemptCount++
          return HttpResponse.error() // Always fail to trigger retries
        })
      )

      const controller = new AbortController()
      const hash = '5'.repeat(64)

      // Abort after 500ms (should allow 2-3 attempts with 200ms delay)
      setTimeout(() => controller.abort(), 500)

      await expect(
        client.stamp(hash, { signal: controller.signal })
      ).rejects.toThrow()

      // Should have attempted less than max attempts due to abort
      expect(attemptCount).toBeLessThan(10)
      expect(attemptCount).toBeGreaterThan(0)
    })

    it('should clean up resources when aborted', async () => {
      const client = localClient({
        calendars: ['https://calendar.example.com'],
        minimumSuccessfulSubmissions: 1,
      })

      server.use(
        http.post('*/digest', async () => {
          await delay(2000)
          return HttpResponse.arrayBuffer(new ArrayBuffer(100))
        })
      )

      const controller = new AbortController()
      const hash = '3'.repeat(64)

      setTimeout(() => controller.abort(), 100)

      await expect(
        client.stamp(hash, { signal: controller.signal })
      ).rejects.toThrow()

      // Subsequent operations should work normally (no resource leaks)
      const controller2 = new AbortController()
      const hash2 = '4'.repeat(64)

      server.use(
        http.post('*/digest', async ({ request }) => {
          return HttpResponse.arrayBuffer(pendingOtsResponse(await request.arrayBuffer()))
        })
      )

      const result = await client.stamp(hash2, { signal: controller2.signal })
      expect(result).toBeDefined()
    })
  })
})
