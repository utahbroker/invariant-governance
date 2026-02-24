# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in Invariant Governance, please report
it responsibly. **Do not open a public GitHub issue for security vulnerabilities.**

### How to Report

Email **invariant@holladaylabsip.com** with:

- A description of the vulnerability
- Steps to reproduce
- The potential impact
- Any suggested fix (optional)

### What to Expect

- **Acknowledgment** within 48 hours of your report
- **Assessment** within 7 days
- **Fix or mitigation** for confirmed vulnerabilities as soon as possible
- **Credit** in the release notes (unless you prefer to remain anonymous)

### Scope

The following are in scope for security reports:

- Bypass of the Sovereign Boundary between Authority and Execution planes
- Execution Gate accepting forged or manipulated Approval Receipts
- Telemetry Observer gaining write access to execution or authority components
- Stateful Accumulator bypass allowing threshold violations
- Poison Pill Broadcast failure to propagate or halt execution
- Cryptographic weaknesses in receipt signing or verification
- Any mechanism that allows an autonomous agent to self-authorize

The following are out of scope:

- Vulnerabilities in dependencies (report these to the dependency maintainer)
- Issues requiring physical access to the deployment environment
- Social engineering attacks against operators
- Denial of service via resource exhaustion (not a safety violation)

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.1.x   | Yes       |

## Security Design

Invariant Governance is designed with security as a structural property, not
a configuration. The three-plane architecture enforces separation of authority,
execution, and observation through the absence of capabilities rather than
the presence of restrictions. For details, see the
[Architecture Documentation](docs/architecture.md).

---

Copyright 2026 Holladay Labs IP, LLC. Licensed under [Apache License 2.0](LICENSE).
