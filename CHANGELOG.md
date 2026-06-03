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
