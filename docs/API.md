# API Reference

Complete API documentation for `@alexalves87/opentimestamps-client`

## Table of Contents

- [OpenTimestampsClient](#opentimestampsclient)
- [Types](#types)
- [Errors](#errors)
- [Examples](#examples)

## OpenTimestampsClient

Main class for interacting with OpenTimestamps calendars.

### Constructor

```typescript
new OpenTimestampsClient(options?: ClientOptions)
```

**Options:**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `calendars` | `string[]` | Default OTS calendars | List of calendar server URLs |
| `minimumSuccessfulSubmissions` | `number` | `2` | Minimum successful stamps required |
| `resilience` | `ResilienceOptions` | See defaults | Resilience configuration |
| `logger` | `Logger` | `undefined` | Optional logger interface |
| `signal` | `AbortSignal` | `undefined` | Global abort signal |

**Default Calendars:**
- `https://a.pool.opentimestamps.org`
- `https://b.pool.opentimestamps.org`
- `https://alice.btc.calendar.opentimestamps.org`
- `https://bob.btc.calendar.opentimestamps.org`

### Methods

#### `stamp()`

Create a timestamp proof by submitting hash to calendar servers.

```typescript
async stamp(
  hash: Buffer | string,
  options?: OperationOptions
): Promise<Buffer>
```

**Parameters:**
- `hash`: SHA-256 hash as Buffer (32 bytes) or hex string (64 chars)
- `options`: Optional operation-specific options

**Returns:** `.ots` proof file as Buffer with pending attestations

**Throws:**
- `ValidationError`: Invalid hash format
- `StampError`: Insufficient successful submissions
- `NetworkError`: Network/timeout errors

**Example:**
```typescript
const hash = '0'.repeat(64)
const proof = await client.stamp(hash)
console.log(`Proof size: ${proof.length} bytes`)
```

#### `upgrade()`

Query calendar servers for Bitcoin confirmations.

```typescript
async upgrade(
  proof: Buffer,
  options?: OperationOptions
): Promise<Buffer>
```

**Parameters:**
- `proof`: Existing `.ots` proof Buffer
- `options`: Optional operation-specific options

**Returns:** Upgraded `.ots` proof (or original if no upgrade available)

**Throws:**
- `ValidationError`: Invalid proof format
- `UpgradeError`: All calendars failed to respond

**Example:**
```typescript
const upgraded = await client.upgrade(proof)
if (upgraded !== proof) {
  console.log('Proof upgraded with Bitcoin confirmation!')
}
```

#### `verify()`

Verify a timestamp proof against the Bitcoin blockchain.

```typescript
async verify(
  proof: Buffer,
  hash: Buffer | string,
  options?: OperationOptions
): Promise<VerificationResult>
```

**Parameters:**
- `proof`: `.ots` proof Buffer
- `hash`: Original file hash (Buffer or hex string)
- `options`: Optional operation-specific options

**Returns:** `VerificationResult` object

**Example:**
```typescript
const result = await client.verify(proof, hash)
if (result.valid) {
  console.log(`Confirmed at block ${result.blockHeight}`)
  console.log(`Timestamp: ${result.timestamp}`)
}
```

#### `getCircuitState()`

Get current circuit breaker state for a calendar.

```typescript
getCircuitState(calendar: string): 'CLOSED' | 'OPEN' | 'HALF_OPEN' | undefined
```

**Example:**
```typescript
const state = client.getCircuitState('https://alice.btc.calendar.opentimestamps.org')
console.log(`Circuit is ${state}`)
```

#### `resetCircuit()`

Manually reset circuit breaker for a calendar.

```typescript
resetCircuit(calendar: string): void
```

**Example:**
```typescript
// Reset after maintenance window
client.resetCircuit('https://alice.btc.calendar.opentimestamps.org')
```

## Types

### `ClientOptions`

```typescript
interface ClientOptions {
  calendars?: string[]
  minimumSuccessfulSubmissions?: number
  resilience?: ResilienceOptions
  logger?: Logger
  signal?: AbortSignal
}
```

### `ResilienceOptions`

```typescript
interface ResilienceOptions {
  timeout?: {
    totalMs: number      // default: 30000 (30s)
    perAttemptMs: number // default: 5000 (5s)
  }
  retries?: RetryOptions
  circuitBreaker?: CircuitBreakerOptions
}
```

### `RetryOptions`

```typescript
interface RetryOptions {
  enabled: boolean       // default: true
  maxAttempts: number    // default: 3
  backoff: {
    strategy: 'exponential' | 'linear' | 'constant'  // default: 'exponential'
    initialDelayMs: number   // default: 1000
    maxDelayMs?: number      // default: 10000
    jitter: 'full' | 'equal' | 'none'  // default: 'full'
  }
}
```

### `CircuitBreakerOptions`

```typescript
interface CircuitBreakerOptions {
  enabled: boolean              // default: true
  failureThreshold: number      // default: 5
  recoveryTimeoutMs: number     // default: 15000 (15s)
  halfOpenMaxAttempts?: number  // default: 1
}
```

### `OperationOptions`

```typescript
interface OperationOptions {
  signal?: AbortSignal  // Per-operation abort signal
}
```

### `VerificationResult`

```typescript
interface VerificationResult {
  valid: boolean
  blockHeight?: number
  timestamp?: Date
  error?: string
}
```

### `Logger`

```typescript
interface Logger {
  debug(message: string): void
  info(message: string): void
  warn(message: string): void
  error(message: string): void
}
```

## Errors

All errors extend `OpenTimestampsClientError`.

### `ValidationError`

Thrown when input validation fails.

```typescript
class ValidationError extends OpenTimestampsClientError {}
```

**Common causes:**
- Invalid hash format (not 64 hex chars or 32 bytes)
- Invalid `.ots` file format

### `StampError`

Thrown when stamp operation fails to meet minimum submission threshold.

```typescript
class StampError extends OpenTimestampsClientError {
  successfulSubmissions: Array<{ calendar: string; proof: Buffer }>
  failedSubmissions: Array<{ calendar: string; error: Error }>
}
```

**Example:**
```typescript
try {
  await client.stamp(hash)
} catch (error) {
  if (error instanceof StampError) {
    console.log(`Success: ${error.successfulSubmissions.length}`)
    console.log(`Failed: ${error.failedSubmissions.length}`)
  }
}
```

### `UpgradeError`

Thrown when upgrade operation fails.

```typescript
class UpgradeError extends OpenTimestampsClientError {}
```

### `NetworkError`

Thrown for network-related errors (timeouts, retries exhausted).

```typescript
class NetworkError extends OpenTimestampsClientError {}
```

### `CircuitBreakerError`

Thrown when circuit breaker rejects a request (calendar temporarily unavailable).

```typescript
class CircuitBreakerError extends NetworkError {}
```

## Examples

### Basic Usage

```typescript
import { OpenTimestampsClient } from '@alexalves87/opentimestamps-client'
import { createHash } from 'crypto'

const client = new OpenTimestampsClient()

// Create timestamp
const data = 'Hello, OpenTimestamps!'
const hash = createHash('sha256').update(data).digest()
const proof = await client.stamp(hash)

// Upgrade (get Bitcoin confirmation)
const upgraded = await client.upgrade(proof)

// Verify
const result = await client.verify(upgraded, hash)
console.log(result)
```

### Custom Configuration

```typescript
const client = new OpenTimestampsClient({
  calendars: ['https://my-calendar.example.com'],
  minimumSuccessfulSubmissions: 1,
  resilience: {
    timeout: { totalMs: 10000, perAttemptMs: 3000 },
    retries: {
      enabled: true,
      maxAttempts: 5,
      backoff: {
        strategy: 'linear',
        initialDelayMs: 500,
        jitter: 'equal',
      },
    },
    circuitBreaker: {
      enabled: true,
      failureThreshold: 3,
      recoveryTimeoutMs: 10000,
    },
  },
})
```

### With Cancellation

```typescript
const controller = new AbortController()
setTimeout(() => controller.abort(), 5000)

try {
  const proof = await client.stamp(hash, { signal: controller.signal })
} catch (error) {
  if (error.name === 'AbortError') {
    console.log('Operation cancelled')
  }
}
```

### With Logging

```typescript
import pino from 'pino'

const logger = pino()
const client = new OpenTimestampsClient({ logger })

// All operations will be logged
await client.stamp(hash)
```

### Error Handling

```typescript
import {
  ValidationError,
  StampError,
  UpgradeError,
  NetworkError,
  CircuitBreakerError,
} from '@alexalves87/opentimestamps-client'

try {
  await client.stamp(hash)
} catch (error) {
  if (error instanceof ValidationError) {
    console.error('Invalid input:', error.message)
  } else if (error instanceof StampError) {
    console.error(`Only ${error.successfulSubmissions.length} calendars succeeded`)
    // Retry with lower threshold?
  } else if (error instanceof CircuitBreakerError) {
    console.error('Calendar temporarily unavailable')
    // Use fallback calendar?
  } else if (error instanceof NetworkError) {
    console.error('Network error:', error.message)
    // Retry later?
  }
}
```

### Circuit Breaker Monitoring

```typescript
const calendars = [
  'https://alice.btc.calendar.opentimestamps.org',
  'https://bob.btc.calendar.opentimestamps.org',
]

// Check circuit states
for (const calendar of calendars) {
  const state = client.getCircuitState(calendar)
  console.log(`${calendar}: ${state || 'UNKNOWN'}`)

  if (state === 'OPEN') {
    console.log(`Calendar ${calendar} is down, resetting...`)
    client.resetCircuit(calendar)
  }
}
```

## Best Practices

1. **Always handle errors gracefully** - Network operations can fail
2. **Use AbortController for long operations** - Prevent hanging requests
3. **Configure timeouts appropriately** - Balance between reliability and speed
4. **Monitor circuit breaker states** - Detect calendar outages early
5. **Use custom calendars for production** - Consider running your own calendar
6. **Log operations in production** - Use logger interface for observability
7. **Handle partial failures** - Check `StampError.successfulSubmissions`
