# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-02-23

### Added

- **Governance Kernel** — deterministic policy evaluation, approval receipt
  issuance, stateful accumulator tracking, fluidity token issuance, and
  hierarchical retraction cascade
- **Execution Gate** — six-step cryptographic receipt verification, parameter
  hash binding, poison pill handler, and fluidity token management
- **Telemetry Observer** — one-way audit chain, degradation scoring, drift
  detection, and configurable telemetry sinks
- **Approval Receipts** — cryptographically signed, single-use, time-bound
  authorization artifacts with parameter hash binding
- **Fluidity Tokens** — speculative pre-authorization with risk budget
  decrementing for high-latency and disconnected operations
- **Stateful Accumulator** — cumulative impact tracking across sliding temporal
  windows, defeating salami-slicing / fragmentation attacks
- **Poison Pill Broadcast** — system-wide emergency halt with sub-second
  propagation and ephemeral key shard destruction
- **Retraction Cascade** — hierarchical revocation where parent retraction
  invalidates all child approval receipts and fluidity tokens
- **78 integration and stress tests** covering structural separation,
  hash chain integrity, accumulator limits, fluidity lifecycle, retraction
  propagation, poison pill, and full pipeline flows
- Apache 2.0 license with patent grant
- Enterprise landing page and whitepaper

[0.1.0]: https://github.com/utahbroker/invariant-governance/releases/tag/v0.1.0
