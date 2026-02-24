# Invariant Governance™

**Deterministic governance for autonomous systems.**

Invariant Governance is an open-source framework that enforces authorization boundaries on autonomous agents, trading algorithms, robotic controllers, and smart contracts -- preventing irreversible, high-blast-radius decisions from executing without cryptographically verified approval.

It separates *who may authorize* from *what may execute* from *what may observe*, using three structurally decoupled components that cannot be collapsed, bypassed, or silently degraded.

> Autonomous agents need three layers: **knowledge** (what to do), **connectivity** (how to reach tools and data), and **governance** (whether they are allowed to act). This framework is the governance layer.

[![CI](https://github.com/utahbroker/invariant-governance/actions/workflows/ci.yml/badge.svg)](https://github.com/utahbroker/invariant-governance/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Patent](https://img.shields.io/badge/Patent-US_19%2F533%2C191-green.svg)](PATENT_NOTICE.md)

---

## Table of Contents

- [The Problem](#the-problem)
- [The Solution](#the-solution)
- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [Use Cases](#use-cases)
- [Enterprise](#enterprise)
- [Contributing](#contributing)
- [License](#license)
- [Links](#links)

---

## The Problem

Autonomous systems are making consequential decisions at machine speed. Existing governance approaches force a choice between two failure modes:

**Human-in-the-loop** -- safe but slow. Every decision waits for manual approval. Latency kills throughput, operators develop alert fatigue, and the system degrades to rubber-stamping. In high-frequency environments (algorithmic trading, real-time robotics, multi-agent orchestration), this approach is structurally unviable.

**Probabilistic guardrails** -- fast but brittle. LLM-based filters, anomaly scores, and confidence thresholds can be gamed, hallucinated past, or silently degraded. They offer no cryptographic proof that a decision was authorized. They cannot detect salami-slicing attacks where each individual action falls within bounds but the cumulative effect is catastrophic. And they provide no mechanism for emergency halt that propagates faster than the system can act.

This is the **Latency-Integrity Paradox**: the faster your system needs to operate, the harder it becomes to maintain governance integrity -- unless the governance architecture itself is redesigned from first principles.

---

## The Solution

Invariant Governance resolves the paradox through **structural separation** and **deterministic enforcement**. No machine learning. No probabilistic scoring. No trust assumptions between components.

### Three Decoupled Components

```
                    Sovereign Boundary
                          |
    Authority Plane       |       Execution Plane
   +------------------+   |   +-------------------+
   |                  |   |   |                   |
   | Governance       |   |   |   Execution       |
   | Kernel      -----+---+---+-> Gate            |
   |                  |   |   |                   |
   +------------------+   |   +-------------------+
           |                           |
           |   Advisory Telemetry      |
           |   (one-way mirror)        |
           |         |                 |
           |   +-----v-------+        |
           |   |             |        |
           +---+ Telemetry   |<-------+
               | Observer    |
               |             |
               +-------------+
```

| Component | Role | Structural Constraint |
|-----------|------|----------------------|
| **Governance Kernel** | Evaluates policy, issues Approval Receipts | Cannot execute actions. Cannot be bypassed by the execution layer. |
| **Execution Gate** | Validates receipts, permits or blocks action | Cannot authorize itself. Cannot fabricate or modify receipts. |
| **Telemetry Observer** | Records all decisions, monitors accumulation | Cannot intervene. One-way data flow only. |

These constraints are not conventions -- they are enforced by the architecture. The Governance Kernel and Execution Gate are separated by a **Sovereign Boundary** that prevents lateral privilege escalation. Telemetry flows through a **one-way advisory channel** that cannot carry commands.

### Key Mechanisms

- **Approval Receipts** -- Cryptographically signed, non-fungible, single-use authorization tokens. Each receipt binds a specific action to a specific context at a specific time. Receipts are retractable before use.

- **Fluidity Tokens** -- Speculative pre-authorization for high-frequency and high-latency environments. A Fluidity Token grants bounded execution authority that can be consumed incrementally, enabling machine-speed operation within governor-defined limits.

- **Stateful Accumulator** -- Tracks cumulative impact across all actions, not just individual transactions. Detects salami-slicing and drift attacks that per-action thresholds miss.

- **Poison Pill Broadcast** -- Emergency halt mechanism with sub-second propagation. Revokes all outstanding Fluidity Tokens and Approval Receipts system-wide, faster than any agent can act.

- **Hardware HAL Gate** -- For physical safety-critical systems (robotics, industrial control, infrastructure), a hardware-enforced gate that requires a valid Approval Receipt before permitting actuation. Software cannot bypass the gate.

---

## Architecture

```
src/
  governance-kernel/    # Policy evaluation, receipt issuance, accumulator
  execution-gate/       # Receipt validation, action gating, Poison Pill
  telemetry/            # One-way observation, drift detection, audit log
  types/                # Shared type definitions and protocol interfaces
```

The Governance Kernel runs in the **Authority Plane**. The Execution Gate runs in the **Execution Plane**. The two planes communicate exclusively through the Sovereign Boundary protocol. The Telemetry Observer receives data from both planes through one-way channels and cannot send commands to either.

For detailed architecture documentation, component specifications, and protocol descriptions, see [docs/architecture.md](docs/architecture.md).

---

## Quick Start

### Installation

```bash
npm install @invariant-governance/core
```

### Minimal Example

```typescript
import {
  GovernanceKernel,
  ExecutionGate,
  TelemetryObserver,
} from "@invariant-governance/core";

// Initialize the three components
const kernel = new GovernanceKernel({
  policy: {
    maxSingleAction: 10_000,
    maxCumulativeWindow: 100_000,
    windowDuration: "1h",
    requireMultiSig: (amount) => amount > 50_000,
  },
});

const gate = new ExecutionGate({
  kernelPublicKey: kernel.publicKey,
  onPoisonPill: () => process.exit(1),
});

const telemetry = new TelemetryObserver({
  sinks: [console, auditLog],
});

// Request authorization for an action
const receipt = await kernel.evaluate({
  action: "transfer",
  amount: 5_000,
  target: "account-7291",
  context: { initiator: "agent-alpha", session: "s-0042" },
});

// Execute only if the receipt is valid
const result = await gate.execute(receipt, async () => {
  return await ledger.transfer("account-7291", 5_000);
});

// Telemetry records everything -- no intervention capability
telemetry.record(receipt, result);
```

### Emergency Halt

```typescript
// Poison Pill: revoke all outstanding tokens and receipts
await kernel.poisonPill({
  reason: "anomalous accumulation detected",
  revokeFluidityTokens: true,
  revokeApprovalReceipts: true,
});
// Propagation completes in < 1 second across all connected gates
```

---

## Use Cases

Invariant Governance is domain-agnostic by design. The specification discloses implementations across eight industrial domains:

| Domain | Example Scenario |
|--------|-----------------|
| **Financial Services** | Algorithmic trading governance, transaction authorization, cumulative exposure limits |
| **Healthcare** | Clinical decision support, nurse handoff attestation, medication administration gates |
| **Orbital / Disconnected Ops** | Satellite command authorization with high-latency Fluidity Tokens, autonomous operation within bounded authority |
| **Blockchain / Smart Contracts** | On-chain governance enforcement, smart contract execution gating, cross-chain authorization |
| **Logistics / Supply Chain** | Autonomous vehicle routing decisions, warehouse robotics, shipment release authorization |
| **Enterprise Operations** | Contract execution workflows, procurement authorization, multi-party approval chains |
| **Government** | Benefits issuance, permit authorization, regulatory compliance enforcement |
| **Critical Infrastructure** | Power grid control, water treatment, industrial SCADA -- with Hardware HAL Gate for physical actuation |

---

## Enterprise

Invariant Governance follows an **open-core model**:

- **Open source (Apache 2.0)** -- The complete governance framework, all three components, protocol specifications, and reference implementations. Free to use, modify, and distribute under the terms of the Apache License.

- **Commercial licenses** -- Available for organizations requiring patent coverage beyond the Apache 2.0 grant, dedicated support, certified builds, or compliance documentation for regulated industries.

- **Patent portfolio** -- The underlying architecture is protected by U.S. Patent Application No. 19/533,191, PCT International Application No. PCT/US26/15432, and related continuation applications. The Apache 2.0 license includes a patent grant for all use of the open-source software. See [PATENT_NOTICE.md](PATENT_NOTICE.md) for details.

For enterprise licensing inquiries: **invariant@holladaylabsip.com**

---

## Contributing

Contributions are welcome. Before submitting a pull request, please review the following:

1. **Scope** -- Invariant Governance enforces structural constraints, not probabilistic ones. Contributions that introduce ML-based decision-making, confidence scoring, or non-deterministic governance evaluation fall outside the project's design principles.

2. **Separation invariants** -- The three-component separation is not negotiable. Pull requests that allow the Execution Gate to authorize itself, the Telemetry Observer to intervene, or the Governance Kernel to execute actions directly will not be merged.

3. **Testing** -- All contributions must include tests that verify both the intended behavior and the structural constraints (e.g., confirm that a component *cannot* perform an action outside its role).

4. **Contributor License Agreement** -- By submitting a contribution, you agree that your contribution is licensed under the Apache License 2.0 and that you have the right to make that grant.

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines.

---

## License

Copyright 2026 Holladay Labs IP, LLC.

Licensed under the Apache License, Version 2.0. You may obtain a copy of the License at:

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See [LICENSE](LICENSE) for the full text.

This software is covered by one or more patent applications. Use of this software under the Apache 2.0 License includes a patent grant as described in Section 3 of the License. See [PATENT_NOTICE.md](PATENT_NOTICE.md) for the full patent notice and defensive termination provisions.

**Disclaimer:** This software is provided without warranty of any kind. The authors and contributors accept no liability for damages arising from its use. Structural guarantees described in this documentation assume correct implementation. See the [Apache License 2.0](LICENSE) for the complete terms.

---

## Links

- [Architecture Documentation](docs/architecture.md)
- [Patent Notice](PATENT_NOTICE.md)
- [Apache 2.0 License](LICENSE)
- [Contributing Guidelines](CONTRIBUTING.md)
- [Enterprise Licensing](mailto:invariant@holladaylabsip.com)
