# Changelog

## [0.3.0](https://github.com/camcima/nestjs-memory-microservices/compare/v0.2.1...v0.3.0) (2026-08-19)

### Bug Fixes

* correct pattern normalization and event-handler completion ([#101](https://github.com/camcima/nestjs-memory-microservices/issues/101)) ([faa25d7](https://github.com/camcima/nestjs-memory-microservices/commit/faa25d7b1862d80a74b9c3fefb15a7014b67707a))

Three bugs in the dispatch path: multi-key object patterns could never be matched by
`request()` (patterns were normalized with `JSON.stringify()` instead of NestJS's
key-sorting `transformPatternToRoute()`), and `await emit()` resolved before the handler
finished whenever an interceptor was attached or several `@EventPattern` handlers shared
a pattern. Also adds numeric pattern support, verifies NestJS 10 in CI, and type-checks
the test suite.

### Upgrade notes

Most suites upgrade with no changes. The deliberate behaviour changes:

* `request()` now throws for a pattern registered as an `@EventPattern` handler, where it
  previously resolved `undefined`. Use `emit()` for those.
* The "no handler found" error now prints the normalized route rather than
  `JSON.stringify(pattern)`: `No handler found for pattern: "x"` becomes
  `No handler found for pattern: x`. Update any test asserting on that string.
* Deep imports no longer resolve -- the package declares an `exports` map, so only the
  package root is importable.
* The pattern parameter is typed as NestJS's `MsPattern` (`string | number | object`)
  rather than `string | object`.
* A previously-passing test may now fail legitimately: if an event handler was throwing
  and the early-resolve bug hid it, `emit()` now waits and your assertion sees the real
  outcome.

Full notes: [v0.3.0 release](https://github.com/camcima/nestjs-memory-microservices/releases/tag/v0.3.0)

## [0.2.1](https://github.com/camcima/nestjs-memory-microservices/compare/v0.2.0...v0.2.1) (2026-05-30)

## [0.2.0](https://github.com/camcima/nestjs-memory-microservices/compare/v0.1.2...v0.2.0) (2026-04-06)

## [0.1.2](https://github.com/camcima/nestjs-memory-microservices/compare/v0.1.1...v0.1.2) (2026-03-28)

## 0.1.1 (2026-03-28)
