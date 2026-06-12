<p align="center">
  <img src=".github/otskit-client-header.png" alt="OTSkit Client" width="480" />
</p>

# @otskit/client

> TypeScript/JavaScript client for OpenTimestamps with enterprise-grade resilience patterns

[![CI](https://github.com/OTSkit/OTSkit-client/actions/workflows/ci.yml/badge.svg)](https://github.com/OTSkit/OTSkit-client/actions/workflows/ci.yml)
[![CodeQL](https://github.com/OTSkit/OTSkit-client/actions/workflows/codeql.yml/badge.svg)](https://github.com/OTSkit/OTSkit-client/actions/workflows/codeql.yml)
[![npm version](https://img.shields.io/npm/v/@otskit/client.svg)](https://www.npmjs.com/package/@otskit/client)
[![npm downloads](https://img.shields.io/npm/dt/@otskit/client.svg)](https://www.npmjs.com/package/@otskit/client)
[![TypeScript](https://img.shields.io/badge/TypeScript-6-blue.svg)](https://www.typescriptlang.org/)
[![Node ≥20](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)
[![Coverage](https://codecov.io/gh/OTSkit/OTSkit-client/branch/main/graph/badge.svg)](https://codecov.io/gh/OTSkit/OTSkit-client)
[![Quality Gate](https://sonarcloud.io/api/project_badges/measure?project=OTSkit_OTSkit-client&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=OTSkit_OTSkit-client)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

`@otskit/client` is the official client SDK for submitting, upgrading, and verifying [OpenTimestamps](https://opentimestamps.org) proofs. It sits on top of [@otskit/core](https://github.com/OTSkit/OTSkit-core) — the low-level protocol engine — and wraps it in a high-level API with production-ready resilience patterns built in.

## Features

### Complete OpenTimestamps Workflow
- **`stamp()`** — Hash your data, build a Merkle tree with a secure nonce, and submit to multiple calendar servers simultaneously
- **`upgrade()`** — Query calendars for Bitcoin confirmations and merge them into the pending proof
- **`verify()`** — Verify a completed proof against the Bitcoin blockchain via Esplora

### Enterprise-Grade Resilience
- **Circuit Breaker** — Per-calendar isolation; one failing calendar never affects the others
- **Exponential Backoff** — Three strategies (`exponential`, `linear`, `constant`) with three jitter modes (`full`, `equal`, `none`)
- **Dual Timeouts** — Independent `totalTimeoutMs` (whole operation) and `connectTimeoutMs` (per attempt)
- **Threshold Submissions** — `stamp()` requires N-of-M successful submissions (default 2-of-4); configurable
- **Fail-Fast on 4xx** — Client errors are never retried; only 5xx and network failures trigger retries

### Developer Experience
- **TypeScript-first** — Strict types throughout; full IntelliSense for every option and error
- **Node.js 20+** — Requires Node.js; uses native `crypto`, `dns`, and `net` APIs not available in browsers or edge runtimes
- **Tree-shakeable** — Dual ESM/CJS build; `@otskit/core` is the only runtime dependency, no third-party packages
- **`AbortController` support** — Cancel any in-flight operation at any level
- **Observable** — Drop-in `Logger` interface compatible with `console`, `pino`, `winston`, etc.
- **Built-in SHA-256 helpers** — `hashFile()` and `hashBuffer()` so you don't need to wire up `crypto` yourself

---

> **Note on confirmation times:** After `stamp()`, the proof is `pending` — registered with calendar servers but not yet anchored to Bitcoin. Confirmations typically arrive within **~60 minutes**, but can take **several hours** during network congestion. Call `upgrade()` periodically to check; a pending proof is not a failed proof — an `UpgradeError` simply means the blockchain hasn't confirmed yet.

---

## Installation

```bash
npm install @otskit/client
```

`@otskit/core` is a regular dependency and installs automatically; no separate install is needed.

---

## Quick Start

```typescript
import { OpenTimestampsClient, hashFile } from '@otskit/client'
import { writeFileSync } from 'fs'

const client = new OpenTimestampsClient()

// 1. Hash the file you want to timestamp
const hash = await hashFile('contract.pdf')

// 2. Submit to calendars → get a pending .ots proof
const pendingProof = await client.stamp(hash)
writeFileSync('contract.pdf.ots', pendingProof)
console.log('Proof saved — Bitcoin confirmation usually arrives in ~60 minutes.')

// 3. Later: query calendars for a Bitcoin confirmation
const upgradedProof = await client.upgrade(pendingProof)
writeFileSync('contract.pdf.ots', upgradedProof)

// 4. Verify the completed proof
const result = await client.verify(upgradedProof, hash)
if (result.valid) {
  console.log(`Timestamp confirmed in Bitcoin block ${result.blockHeight}`)
  console.log(`Block time: ${new Date(result.timestamp! * 1000).toISOString()}`)
} else {
  console.error(`Verification failed: ${result.error}`)
}
```

---

## Usage

### Hashing files and data

Use the built-in helpers to compute SHA-256 without importing `crypto` yourself:

```typescript
import { hashFile, hashBuffer } from '@otskit/client'

// From a file path (streaming — safe for large files)
const hash = await hashFile('contract.pdf')

// From bytes already in memory
const hash = hashBuffer(Buffer.from('hello world'))
const hash = hashBuffer(new Uint8Array([...]))
```

Both return a 32-byte `Buffer` ready to pass directly to `stamp()`.

### Stamping data

`stamp()` accepts either a 32-byte `Buffer` or a 64-character hex string:

```typescript
// From hashFile / hashBuffer
const proof = await client.stamp(await hashFile('contract.pdf'))

// Or a hex string
const proof = await client.stamp('a'.repeat(64))
```

Internally, `stamp()` prepends a 16-byte cryptographic nonce to each submission, builds a Merkle tree over all concurrent submissions, and serializes the result as a standard `.ots` file.

### Upgrading a pending proof

Call `upgrade()` periodically until Bitcoin confirms the timestamp. It queries only the calendars embedded in the proof (validated against a whitelist), so your `calendars` option does not affect this step.

```typescript
import { UpgradeError } from '@otskit/client'

try {
  const upgradedProof = await client.upgrade(pendingProof)
  // Save and stop polling
} catch (err) {
  if (err instanceof UpgradeError) {
    // No calendar has a Bitcoin confirmation yet — try again later
    console.log('Not confirmed yet, retry in 5 minutes')
  }
}
```

### Verifying a proof

`verify()` queries the Blockstream Esplora API to check the Bitcoin merkle root. Passing `originalDataHash` adds an extra integrity check that the proof was created for that specific hash.

```typescript
const result = await client.verify(proof, originalHash)

if (result.valid) {
  console.log(result.blockHeight)  // Bitcoin block number
  console.log(result.blockHash)    // Block hash (hex)
  console.log(result.timestamp)    // Unix timestamp of the block
} else {
  console.log(result.error)        // Human-readable reason
}
```

`verify()` always returns `VerificationResult` — it never throws for invalid proofs, only for unexpected network failures.

### Error handling

```typescript
import {
  StampError,
  UpgradeError,
  ValidationError,
  NetworkError,
  CircuitBreakerError,
} from '@otskit/client'

try {
  await client.stamp(hash)
} catch (err) {
  if (err instanceof ValidationError) {
    // Invalid hash format
  } else if (err instanceof StampError) {
    // Not enough calendars accepted the submission
    console.log(`Succeeded: ${err.successfulSubmissions.map(s => s.calendar)}`)
    console.log(`Failed:    ${err.failedSubmissions.map(s => s.calendar)}`)
  } else if (err instanceof CircuitBreakerError) {
    // A calendar is isolated due to repeated failures
  } else if (err instanceof NetworkError) {
    console.log(`HTTP status: ${err.status}`) // undefined for non-HTTP errors
  }
}
```

### Cancellation with AbortController

You can cancel individual operations or set a client-wide signal:

```typescript
// Per-operation cancellation
const controller = new AbortController()
setTimeout(() => controller.abort(), 10_000)

const proof = await client.stamp(hash, { signal: controller.signal })

// Client-wide cancellation (applies to all operations)
const clientController = new AbortController()
const client = new OpenTimestampsClient({ signal: clientController.signal })

clientController.abort() // cancels any in-flight request
```

### Observability with a logger

Any object with `debug`, `info`, `warn`, and `error` methods works:

```typescript
import pino from 'pino'

const client = new OpenTimestampsClient({
  logger: pino({ level: 'debug' }),
})
```

Using `console` directly:

```typescript
const client = new OpenTimestampsClient({ logger: console })
```

### Monitoring circuit breakers

```typescript
const state = client.getCircuitState('https://alice.btc.calendar.opentimestamps.org')
// 'CLOSED' | 'OPEN' | 'HALF_OPEN' | undefined

// Manually recover a calendar after a known incident
client.resetCircuit('https://alice.btc.calendar.opentimestamps.org')

// Reset all calendars at once
client.resetAllCircuits()
```

---

## Configuration

### `ClientOptions`

```typescript
const client = new OpenTimestampsClient({
  // Calendar servers to submit to (default: the four public OTS calendars)
  calendars: [
    'https://alice.btc.calendar.opentimestamps.org',
    'https://bob.btc.calendar.opentimestamps.org',
    'https://finney.calendar.eternitywall.com',
    'https://btc.calendar.catallaxy.com',
  ],

  // How many calendars must succeed for stamp() to resolve (default: 2)
  minimumSuccessfulSubmissions: 2,

  // Resilience configuration (see below)
  resilience: { ... },

  // Logger implementing { debug, info, warn, error }
  logger: console,

  // AbortSignal applied to all operations on this client
  signal: controller.signal,
})
```

### `ResilienceOptions`

All fields are optional — unspecified fields fall back to the defaults shown.

```typescript
resilience: {
  // Maximum total time for a single operation across all retries (ms)
  totalTimeoutMs: 30_000,   // default

  // Maximum time for a single HTTP attempt (ms)
  connectTimeoutMs: 5_000,  // default

  retries: {
    enabled: true,          // default
    maxAttempts: 3,         // default

    backoff: {
      strategy: 'exponential', // 'exponential' | 'linear' | 'constant'
      initialDelayMs: 200,     // default
      maxDelayMs: 5_000,       // default; caps the computed delay
      jitter: 'full',          // 'full' | 'equal' | 'none'
    },
  },

  circuitBreaker: {
    enabled: true,            // default
    failureThreshold: 5,      // consecutive failures before OPEN (default)
    recoveryTimeoutMs: 15_000,// time in OPEN before trying HALF_OPEN (default)
    halfOpenMaxAttempts: 1,   // probing requests in HALF_OPEN state (default)
  },
}
```

**Backoff strategies:**

| Strategy | Delay formula |
|---|---|
| `exponential` | `initialDelayMs × 2^(attempt - 1)` |
| `linear` | `initialDelayMs × attempt` |
| `constant` | `initialDelayMs` |

**Jitter modes:**

| Mode | Effect |
|---|---|
| `full` | Random value in `[0, delay]` — best for thundering-herd prevention |
| `equal` | Random value in `[delay/2, delay]` |
| `none` | Deterministic delay |

**Circuit breaker states:**

```
CLOSED ──(failureThreshold consecutive failures)──► OPEN
OPEN   ──(recoveryTimeoutMs elapsed)             ──► HALF_OPEN
HALF_OPEN ──(success)                            ──► CLOSED
HALF_OPEN ──(failure)                            ──► OPEN
```

---

## API Reference

### `OpenTimestampsClient`

#### Constructor

```typescript
new OpenTimestampsClient(options?: ClientOptions)
```

#### `stamp(hash, options?): Promise<Buffer>`

Submits the hash to configured calendars and returns a serialized `.ots` proof.

| Parameter | Type | Description |
|---|---|---|
| `hash` | `Buffer \| string` | SHA-256 hash (32-byte Buffer or 64-char hex string) |
| `options.signal` | `AbortSignal` | Override the client-level signal for this call |

Throws `ValidationError` if the hash format is invalid.  
Throws `StampError` if fewer than `minimumSuccessfulSubmissions` calendars accepted.

#### `upgrade(proof, options?): Promise<Buffer>`

Queries the calendars referenced in the proof for Bitcoin confirmations. Returns the updated proof if at least one calendar confirmed; otherwise throws `UpgradeError`.

| Parameter | Type | Description |
|---|---|---|
| `proof` | `Buffer` | Serialized `.ots` proof as returned by `stamp()` |
| `options.signal` | `AbortSignal` | Override the client-level signal for this call |

Throws `ValidationError` if the proof is malformed.  
Throws `UpgradeError` if no calendar has confirmed the timestamp yet.

#### `verify(proof, originalDataHash?): Promise<VerificationResult>`

Verifies a completed proof against the Bitcoin blockchain via Esplora. Never throws for invalid or incomplete proofs — failures are returned as `{ valid: false, error: '...' }`.

| Parameter | Type | Description |
|---|---|---|
| `proof` | `Buffer` | Completed `.ots` proof with a Bitcoin attestation |
| `originalDataHash` | `Buffer \| string \| undefined` | If provided, also checks that the proof was created for this hash |

Returns `VerificationResult`:

```typescript
{
  valid: boolean
  blockHeight?: number   // Bitcoin block number
  blockHash?: string     // Block hash (hex)
  timestamp?: number     // Unix epoch of the block
  error?: string         // Set when valid is false
}
```

#### `getCircuitState(calendarUrl): CircuitState | undefined`

Returns the current state of the circuit breaker for a calendar URL (`'CLOSED'`, `'OPEN'`, `'HALF_OPEN'`, or `undefined` if not yet initialized).

#### `resetCircuit(calendarUrl): void`

Manually resets the circuit breaker for a calendar. Use this after a known outage is resolved.

#### `resetAllCircuits(): void`

Resets all circuit breakers across all calendars.

---

### Errors

All errors extend `OpenTimestampsClientError extends Error`.

| Class | When |
|---|---|
| `ValidationError` | Invalid input (bad hash format, malformed proof, invalid URL) |
| `StampError` | `stamp()` did not reach `minimumSuccessfulSubmissions`. Has `.successfulSubmissions` and `.failedSubmissions` arrays |
| `UpgradeError` | No calendar confirmed the timestamp yet |
| `NetworkError` | Network failure (timeout, all retries exhausted). Has `.status?: number` |
| `CircuitBreakerError extends NetworkError` | Request rejected because the circuit is OPEN |
| `CommitmentNotFoundError extends NetworkError` | Calendar returned 404 for a commitment |
| `CalendarResponseTooLargeError extends NetworkError` | Calendar response exceeded the 10 KB size limit |
| `EsploraResponseError extends NetworkError` | Esplora returned an invalid, malformed, or oversized response |

---

### Utility functions

#### `hashFile(path): Promise<Buffer>`

Returns the SHA-256 hash of a file as a 32-byte `Buffer`. Reads the file as a stream — safe for large files.

```typescript
import { hashFile } from '@otskit/client'

const hash = await hashFile('contract.pdf')
const proof = await client.stamp(hash)
```

#### `hashBuffer(data): Buffer`

Returns the SHA-256 hash of a `Buffer` or `Uint8Array` synchronously.

```typescript
import { hashBuffer } from '@otskit/client'

const hash = hashBuffer(Buffer.from('my data'))
```

---

### Advanced exports

These are available for custom integrations and advanced use cases.

#### `CalendarClient`

Low-level client for a single OTS calendar server.

```typescript
import { CalendarClient, ResilientNetworkLayer, DEFAULT_RESILIENCE } from '@otskit/client'

const network = new ResilientNetworkLayer(DEFAULT_RESILIENCE)
const calendar = new CalendarClient('https://alice.btc.calendar.opentimestamps.org', network)

const timestamp = await calendar.submit(digest)       // POST /digest
const upgraded  = await calendar.getTimestamp(digest) // GET /timestamp/:hex
```

#### `EsploraClient`

Client for querying a Bitcoin block explorer compatible with the [Esplora API](https://github.com/Blockstream/esplora/blob/master/API.md).

```typescript
import { EsploraClient, ResilientNetworkLayer, DEFAULT_RESILIENCE, PUBLIC_ESPLORA_URL } from '@otskit/client'

const network = new ResilientNetworkLayer(DEFAULT_RESILIENCE)
const esplora = new EsploraClient(network, { url: PUBLIC_ESPLORA_URL })

const blockHash   = await esplora.blockHash(850_000)         // → hex string
const blockHeader = await esplora.block(blockHash)           // → { merkleroot, time }
```

#### `verifyTimestampAttestation`

Verifies a single `Attestation` (Bitcoin or Litecoin) against a block explorer.

```typescript
import { verifyTimestampAttestation } from '@otskit/client'

const blockTime = await verifyTimestampAttestation(digest, attestation, esploraClient)
```

#### `UrlWhitelist`

Wildcard URL allowlist used internally to validate calendar URLs in upgrade proofs.

```typescript
import { UrlWhitelist } from '@otskit/client'

const wl = new UrlWhitelist([
  'https://*.calendar.opentimestamps.org',
  'https://my-calendar.example.com',
])

wl.contains('https://alice.btc.calendar.opentimestamps.org') // true
wl.contains('https://evil.example.com')                      // false
```

#### `ResilientNetworkLayer`

The full timeout + retry + circuit-breaker stack as a standalone class.

```typescript
import { ResilientNetworkLayer, DEFAULT_RESILIENCE } from '@otskit/client'

const network = new ResilientNetworkLayer(DEFAULT_RESILIENCE, logger)
const response = await network.request(calendarUrl, {
  url: 'https://...',
  method: 'POST',
  headers: { 'Content-Type': 'application/octet-stream' },
  body: new Uint8Array([...]),
})
// response.data: Uint8Array, response.ok: boolean, response.status: number
```

#### Constants

```typescript
import {
  DEFAULT_CALENDARS,           // string[] — the four public OTS calendars
  DEFAULT_RESILIENCE,          // ResilienceOptions — default timeout/retry/cb config
  DEFAULT_CALENDAR_WHITELIST,  // UrlWhitelist — trusted calendar domains for upgrade
  DEFAULT_AGGREGATORS,         // string[] — OTS aggregator pool URLs
  PUBLIC_ESPLORA_URL,          // 'https://blockstream.info/api'
  MAX_CALENDAR_RESPONSE_SIZE,  // 10_000 (bytes)
  MAX_ESPLORA_RESPONSE_SIZE,   // 100_000 (bytes)
} from '@otskit/client'
```

---

## Contributing

Contributions are welcome. Please open an issue before starting significant work so we can align on approach.

### Setup

```bash
git clone https://github.com/OTSkit/OTSkit-client.git
cd OTSkit-client
npm install
npm test        # 160 unit + integration tests
npm run lint    # ESLint
npm run build   # tsup → dist/
```

### Testing

The test suite uses [Vitest](https://vitest.dev), [MSW](https://mswjs.io) for HTTP mocking, and [fast-check](https://fast-check.dev) for property-based testing. All tests run in Node.js (no browser required).

```bash
npm test                    # run all tests once
npm run test:watch          # watch mode
npm test -- --coverage      # with coverage report (100% threshold enforced)
```

### Commit convention

This repository uses [Conventional Commits](https://www.conventionalcommits.org). Releases are automated via [semantic-release](https://semantic-release.gitbook.io).

### Code style

- TypeScript strict mode
- ESLint + Prettier (run `npm run format` before pushing)
- Fail-closed: all external input is validated at the boundary
- No third-party runtime dependencies (`@otskit/core` is the only dependency)

---

## Links

- [OpenTimestamps Protocol](https://opentimestamps.org)
- [@otskit/core](https://github.com/OTSkit/OTSkit-core) — Protocol engine used by this SDK
- [npm Package](https://www.npmjs.com/package/@otskit/client)
- [Issue Tracker](https://github.com/OTSkit/OTSkit-client/issues)

## License

MIT © OTSkit contributors — see [LICENSE](LICENSE).
