# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Core OpenTimestamps operations (stamp, upgrade, verify)
- Circuit Breaker pattern with per-calendar state isolation
- Exponential backoff retry with configurable strategies
- Timeout management (total + per-attempt)
- Threshold-based stamp submissions (default: 2/4 calendars required)
- Full TypeScript support with strict mode
- AbortController integration for all operations
- Comprehensive test suite (83+ tests, 80%+ coverage)
- Multi-runtime support (Node.js 18+, browsers, edge)
- Dual ESM/CJS build output
- Complete API documentation
- Usage examples and best practices guide
