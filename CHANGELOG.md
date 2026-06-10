# [0.4.0](https://github.com/OTSkit/OTSkit-client/compare/v0.3.0...v0.4.0) (2026-06-10)


### Features

* derive calendar data from @otskit/core and depend on it at runtime ([1135364](https://github.com/OTSkit/OTSkit-client/commit/11353648cc8d83d4ecd701e5ec17de1a4d529d06))

# [0.3.0](https://github.com/OTSkit/OTSkit-client/compare/v0.2.0...v0.3.0) (2026-06-07)


### Bug Fixes

* add SSRF protection for configurable calendar URLs ([faf1788](https://github.com/OTSkit/OTSkit-client/commit/faf17888f352bd1d6ae9ce405e1d0d5b4395acfb))
* apply response size limit via ReadableStream before loading full body ([088c9d7](https://github.com/OTSkit/OTSkit-client/commit/088c9d7961602f4e31e69cd658369c51d30b1ad8))
* limit Bitcoin attestation verification to prevent DoS via crafted proofs ([e72e5ca](https://github.com/OTSkit/OTSkit-client/commit/e72e5ca56ff8436d5cce36cd78d963a257c83af6))
* remove unused assertHttpUrl after SSRF migration ([39681cf](https://github.com/OTSkit/OTSkit-client/commit/39681cf90cbd2417135faf09b19ffcac2496dd62))
* rewrite UrlWhitelist to use URL parsing instead of wildcardToRegExp ([7968731](https://github.com/OTSkit/OTSkit-client/commit/7968731e84109bd926c8b5ac754d47b307d32a7e))
* rewrite UrlWhitelist using URL.hostname to prevent bypass attacks ([23344eb](https://github.com/OTSkit/OTSkit-client/commit/23344ebf453cadc23504469c94c367d194b5791e))
* strip IPv6 brackets before isIP check in assertSafeCalendarUrl ([f917493](https://github.com/OTSkit/OTSkit-client/commit/f917493731edb527eceb48c09c900d5ef4e18c76))
* use constant-time comparison for file hash verification ([5c7c458](https://github.com/OTSkit/OTSkit-client/commit/5c7c4585f8e46e9a8d52503fc6d0c06139336f51))
* use fatal UTF-8 decoding in EsploraClient ([2c03f04](https://github.com/OTSkit/OTSkit-client/commit/2c03f047b5340c890f5c254f151417ea0ef3146e))


### Features

* replace VerificationResult with discriminated union for unambiguous verify() semantics ([cced2fa](https://github.com/OTSkit/OTSkit-client/commit/cced2fad4b9545bc6185b88e3bb124aca2e22a1e))

# [0.2.0](https://github.com/OTSkit/OTSkit-client/compare/v0.1.3...v0.2.0) (2026-06-05)


### Features

* add hashBuffer and hashFile utilities to public API ([cb67373](https://github.com/OTSkit/OTSkit-client/commit/cb673732d3e1987dc67746afc73116438e7c5209))

## [0.1.3](https://github.com/OTSkit/OTSkit-client/compare/v0.1.2...v0.1.3) (2026-06-05)


### Bug Fixes

* run build before semantic-release so dist/ is included in npm publish ([04a7bd3](https://github.com/OTSkit/OTSkit-client/commit/04a7bd34fe4bd049a68d0d3000faa82bc0bef192))

## [1.0.4](https://github.com/OTSkit/OTSkit-client/compare/v1.0.3...v1.0.4) (2026-06-04)


### Bug Fixes

* **ci:** restore otskit-core clone, revert actions to v4 ([2cef9da](https://github.com/OTSkit/OTSkit-client/commit/2cef9da970f5df5a5170adb853dccf77d336205a))

## [1.0.3](https://github.com/OTSkit/OTSkit-client/compare/v1.0.2...v1.0.3) (2026-06-04)


### Bug Fixes

* restore version to 0.1.1 [skip ci] ([24f5e44](https://github.com/OTSkit/OTSkit-client/commit/24f5e446fe425343c80c2a8bdd50e3c085d2d054))

## [1.0.2](https://github.com/OTSkit/OTSkit-client/compare/v1.0.1...v1.0.2) (2026-06-03)


### Bug Fixes

* revert version to 0.1.1 (1.x published by mistake) ([64e1150](https://github.com/OTSkit/OTSkit-client/commit/64e11503abf88f218342fc715cd6fd3ce02c3f45))

## [1.0.1](https://github.com/OTSkit/OTSkit-client/compare/v1.0.0...v1.0.1) (2026-06-03)


### Bug Fixes

* move @otskit/core to devDependencies (bundled in dist) ([1f10ee8](https://github.com/OTSkit/OTSkit-client/commit/1f10ee8ab637385192d2a66fe4c08f8d96031ca3))

# 1.0.0 (2026-06-03)


### Bug Fixes

* **ci:** build otskit-core before npm install ([d9888a5](https://github.com/OTSkit/OTSkit-client/commit/d9888a5ca7c813a5ed30879696ffca3762e78085))
* **ci:** revert actions to v4 + FORCE_JAVASCRIPT_ACTIONS_TO_NODE24, fix unquoted step names ([648084a](https://github.com/OTSkit/OTSkit-client/commit/648084a9c762546359b5a88d6d6cf9dfb4cacfbd))
* **ci:** use git clone for otskit-core, upgrade actions to v5 ([b01f1ab](https://github.com/OTSkit/OTSkit-client/commit/b01f1ab1146838018398118b71b9d347f20974f5))
* **ci:** use Node 22 for release job (semantic-release requires >=22.14) ([e1f1df8](https://github.com/OTSkit/OTSkit-client/commit/e1f1df8031147ddfb7ea53e9d9e896d0ac9d4496))
* exclude e2e scripts from eslint ([22865f2](https://github.com/OTSkit/OTSkit-client/commit/22865f208f42ea50e12a0ecdc4b2e66db169363d))
* quote YAML name with colon-space, add yml eol=lf to gitattributes ([f0a378f](https://github.com/OTSkit/OTSkit-client/commit/f0a378fe71d3f885042af5084abb04b71c83ff2d))
* remove unused imports, update all [@alexalves87](https://github.com/alexalves87) refs to [@otskit](https://github.com/otskit) ([ead7bc6](https://github.com/OTSkit/OTSkit-client/commit/ead7bc697d8ca4bd56c7282731a981ef0c7f1530))
* revert GitHub Actions to v4 (v6 does not exist) ([e677387](https://github.com/OTSkit/OTSkit-client/commit/e6773871aca0afbe1e32b237ce9a651661681b9b))
* revert version to 0.1.1 (last published on npm) ([2854338](https://github.com/OTSkit/OTSkit-client/commit/285433888654779e808bcd3b0f4c08fe3427631b))
* update README to @otskit/client ([083a93c](https://github.com/OTSkit/OTSkit-client/commit/083a93c941f5b95ec356a28fb7e49ab99a9a5f46))

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
