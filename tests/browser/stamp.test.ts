/** Integration test for the browser client's stamp() — Uint8Array in/out against fixed calendars. */
import { describe, it, expect } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../mocks/server.js'
import { pendingResponseFor } from '../mocks/handlers.js'
import { OpenTimestampsBrowserClient, BROWSER_CALENDARS } from '../../src/browser.js'
import { DetachedTimestampFile } from '@otskit/core'

const TEST_HASH = '1f02d20a78657fab24c5028383f23a45e11a8a25c102a86c6e768855b5059e3a'
const arrayBufferOf = (b: Uint8Array) =>
  b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer

/** Mock POST /digest for a browser calendar, returning a pending Timestamp for the sent digest. */
const pendingFromCalendar = (url: string) =>
  http.post(`${url}/digest`, async ({ request }) => {
    const digest = new Uint8Array(await request.arrayBuffer())
    return HttpResponse.arrayBuffer(arrayBufferOf(pendingResponseFor(digest, url)), {
      status: 200,
      headers: { 'Content-Type': 'application/octet-stream' },
    })
  })

describe('OpenTimestampsBrowserClient.stamp()', () => {
  it('stamps against the fixed browser calendars and returns a pending .ots as Uint8Array', async () => {
    // Submissions go to every calendar concurrently, so mock all of them to stay off the network.
    server.use(...BROWSER_CALENDARS.map(pendingFromCalendar))
    const proof = await new OpenTimestampsBrowserClient().stamp(TEST_HASH)
    expect(proof).toBeInstanceOf(Uint8Array)
    const dtf = DetachedTimestampFile.deserialize(proof)
    expect(dtf.timestamp.getAttestations().filter((a) => a.kind === 'pending').length).toBe(
      BROWSER_CALENDARS.length
    )
  })
})
