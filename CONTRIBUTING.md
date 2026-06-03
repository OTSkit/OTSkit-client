# Contributing to OpenTimestamps Client SDK

Thank you for your interest in contributing! This guide will help you get started.

## Code of Conduct

Be respectful, inclusive, and professional in all interactions.

## How to Contribute

### Reporting Bugs

1. Check if the bug already exists in [Issues](https://github.com/alexalves87/opentimestamps-client/issues)
2. Include:
   - Clear description
   - Steps to reproduce
   - Expected vs actual behavior
   - Environment details (Node version, OS, etc.)

### Suggesting Features

1. Open an issue with the `enhancement` label
2. Describe the feature and use case
3. Discuss implementation approach

### Pull Requests

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass: `npm test`
6. Run linter: `npm run lint`
7. Commit with conventional commits format
8. Push and create PR

## Development Setup

```bash
# Clone repository
git clone https://github.com/alexalves87/opentimestamps-client.git
cd opentimestamps-client

# Install dependencies
npm install

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Build
npm run build
```

## Commit Message Format

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `test`: Test additions/changes
- `refactor`: Code refactoring
- `perf`: Performance improvements
- `chore`: Build process or tooling changes

**Examples:**
```
feat(client): add custom calendar support
fix(retry): correct exponential backoff calculation
docs(readme): add browser usage example
test(circuit-breaker): add concurrent request tests
```

## Testing

- Write tests for all new features
- Maintain >80% code coverage
- Use descriptive test names
- Test both success and error paths

## Code Style

- Follow existing code style
- Use TypeScript strict mode
- Add JSDoc comments for public APIs
- Keep functions focused and testable

## Release Process

Releases are automated via semantic-release:
1. Merge PR to `main`
2. CI runs tests and builds
3. semantic-release analyzes commits
4. Version bumped, changelog updated, npm published

## Questions?

Open an issue or discussion on GitHub.
