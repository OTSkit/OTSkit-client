# OTSkit Client

> TypeScript/JavaScript client for OpenTimestamps with enterprise-grade resilience patterns

[![npm version](https://img.shields.io/npm/v/@otskit/client.svg)](https://www.npmjs.com/package/@otskit/client)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)

## Features

**Complete OpenTimestamps Operations**
- `stamp()` - Create timestamp proofs by submitting to calendar servers
- `upgrade()` - Query calendars for Bitcoin confirmations
- `verify()` - Verify proofs against the Bitcoin blockchain

**Enterprise-Grade Resilience**
- **Circuit Breaker** - Isolate failures per calendar (prevents cascading failures)
- **Exponential Backoff** - Configurable retry strategies with jitter
- **Timeout Management** - Per-attempt and total operation timeouts
- **Threshold-based Submissions** - Require minimum successful submissions (default: 2/4 calendars)

**Developer Experience**
- **TypeScript First** - Full type safety with strict mode enabled
- **Multi-Runtime** - Works in Node.js 18+, browsers, and edge runtimes
- **Tree-Shakeable** - Dual ESM/CJS build with zero dependencies
- **Abort Support** - Native AbortController integration for all operations
- **Observable** - Optional logger interface for monitoring and debugging

## Installation

```bash
npm install @otskit/client
```

## Quick Start

```typescript
import { OpenTimestampsClient } from '@otskit/client'
import { createHash } from 'crypto'
import { readFileSync, writeFileSync } from 'fs'

const client = new OpenTimestampsClient()

const fileContent = readFileSync('document.pdf')
const hash = createHash('sha256').update(fileContent).digest()

// Create timestamp
const otsProof = await client.stamp(hash)
writeFileSync('document.pdf.ots', otsProof)

// Upgrade to Bitcoin confirmation
const upgradedProof = await client.upgrade(otsProof)

// Verify
const result = await client.verify(upgradedProof, hash)
console.log('Verified in block', result.blockHeight)
```

## Resilience Configuration

```typescript
const client = new OpenTimestampsClient({
  resilience: {
    timeout: { totalMs: 30000, perAttemptMs: 5000 },
    retries: {
      enabled: true,
      maxAttempts: 3,
      backoff: { strategy: 'exponential', initialDelayMs: 1000, jitter: 'full' },
    },
    circuitBreaker: {
      enabled: true,
      failureThreshold: 5,
      recoveryTimeoutMs: 15000,
    },
  },
})
```

## Architecture

Key design decisions:
- Per-calendar circuit breakers: one failing calendar does not affect others
- Threshold-based submissions: stamp() requires N/M calendars to succeed (default 2/4)
- Sequential upgrade queries: stops at first confirmed calendar
- 4xx = fail fast, 5xx = retry

## Error Handling

```typescript
try {
  await client.stamp(hash)
} catch (error) {
  if (error instanceof StampError) {
    console.log(error.successfulSubmissions.length, 'calendars succeeded')
    console.log(error.failedSubmissions.length, 'calendars failed')
  }
}
```

## Testing

83+ tests (unit + integration), MSW-based mocks, property-based testing with fast-check.

```bash
npm test
npm run build
```

## Links

- [OpenTimestamps Protocol](https://opentimestamps.org)
- [npm Package](https://www.npmjs.com/package/@otskit/client)
- [Issue Tracker](https://github.com/OTSkit/OTSkit-client/issues)

## License

MIT
