# Invariant Governance -- Architecture Documentation

A deterministic governance framework for autonomous systems.

---

## Table of Contents

- [1. Introduction](#1-introduction)
  - [1.1 The Latency-Integrity Paradox](#11-the-latency-integrity-paradox)
  - [1.2 Why Identity-Based Security Fails](#12-why-identity-based-security-fails)
  - [1.3 Design Principles](#13-design-principles)
- [2. High-Level Architecture](#2-high-level-architecture)
  - [2.1 Three-Component Model](#21-three-component-model)
  - [2.2 Structural Separation of Concerns](#22-structural-separation-of-concerns)
  - [2.3 Data Flow Overview](#23-data-flow-overview)
- [3. Governance Kernel (Authority Plane)](#3-governance-kernel-authority-plane)
  - [3.1 Responsibilities](#31-responsibilities)
  - [3.2 Isolation Model](#32-isolation-model)
  - [3.3 Stateful Accumulator](#33-stateful-accumulator)
  - [3.4 Safety Invariant](#34-safety-invariant)
  - [3.5 Policy Matrix Evaluation](#35-policy-matrix-evaluation)
- [4. Execution Gate (Execution Plane)](#4-execution-gate-execution-plane)
  - [4.1 Responsibilities](#41-responsibilities)
  - [4.2 Non-Bypassability](#42-non-bypassability)
  - [4.3 Six-Step Cryptographic Verification](#43-six-step-cryptographic-verification)
  - [4.4 Ephemeral Key Shard](#44-ephemeral-key-shard)
  - [4.5 Stealth Retraction](#45-stealth-retraction)
  - [4.6 Sidecar Proxy Deployment (FIG. 3)](#46-sidecar-proxy-deployment-fig-3)
- [5. Advisory Telemetry System (One-Way Mirror)](#5-advisory-telemetry-system-one-way-mirror)
  - [5.1 Responsibilities](#51-responsibilities)
  - [5.2 One-Way Data Ingestion](#52-one-way-data-ingestion)
  - [5.3 Degradation Score Computation](#53-degradation-score-computation)
  - [5.4 Shadow Mode](#54-shadow-mode)
  - [5.5 Out-of-Band Telemetry](#55-out-of-band-telemetry)
  - [5.6 Alert Fatigue Detection](#56-alert-fatigue-detection)
- [6. Sovereign Boundary](#6-sovereign-boundary)
- [7. Authorization Artifacts](#7-authorization-artifacts)
  - [7.1 Approval Receipt (FIG. 15)](#71-approval-receipt-fig-15)
  - [7.2 Speculative Fluidity Token (FIG. 2)](#72-speculative-fluidity-token-fig-2)
- [8. Key Mechanisms](#8-key-mechanisms)
  - [8.1 Dual-Attestation and Intent-Vectoring (FIG. 4)](#81-dual-attestation-and-intent-vectoring-fig-4)
  - [8.2 Poison Pill Broadcast (FIG. 6)](#82-poison-pill-broadcast-fig-6)
  - [8.3 Hierarchical Entity Paths and Retraction Cascade (FIG. 14, FIG. 16)](#83-hierarchical-entity-paths-and-retraction-cascade-fig-14-fig-16)
  - [8.4 Salami-Slicing Accumulator (FIG. 5)](#84-salami-slicing-accumulator-fig-5)
  - [8.5 Atomic Work Plans](#85-atomic-work-plans)
- [9. Hardware HAL Gate (FIG. 7)](#9-hardware-hal-gate-fig-7)
- [10. Fail-Safe Behavior](#10-fail-safe-behavior)
- [11. Anti-Self-Modification Guarantee](#11-anti-self-modification-guarantee)
- [12. Industrial Domain Applications](#12-industrial-domain-applications)
- [13. Reference Diagram Index](#13-reference-diagram-index)
- [14. Source Tree Map](#14-source-tree-map)

---

## 1. Introduction

### 1.1 The Latency-Integrity Paradox

The systems that require the highest governance integrity -- power grids, high-frequency trading, healthcare automation, orbital operations -- are precisely the systems that cannot tolerate human-approval latency. A human-in-the-loop model that adds 200ms of round-trip approval time to a trading system, or minutes of delay to an orbital maneuver, is architecturally incompatible with the operational requirements of that system.

Invariant Governance resolves this paradox by separating **authority** from **execution** at a structural level, enabling deterministic, machine-speed governance without removing human oversight from the loop.

### 1.2 Why Identity-Based Security Fails

Traditional identity-based security models (RBAC, ABAC, OAuth scopes) answer the question "Who is allowed to act?" but fail to answer the more critical question: "Is this action, in this cumulative context, safe?"

An authenticated, authorized agent can still:

- **Drift** -- gradually shift behavior outside intended boundaries
- **Hallucinate** -- produce outputs that satisfy format requirements but violate intent
- **Be exploited via salami-slicing** -- execute 1,000 actions at $1 each, each individually authorized, totaling $1,000 of unauthorized cumulative impact

Invariant Governance treats cumulative state change as a first-class governance concern, not just individual action authorization.

### 1.3 Design Principles

| Principle | Description |
|-----------|-------------|
| **Structural incapability** | Components cannot violate their constraints, not because of policy, but because they lack the credentials, keys, or network routes to do so. |
| **Authority/Execution separation** | No single component can both decide and act. |
| **Deterministic evaluation** | Governance decisions are reproducible given the same inputs and accumulator state. |
| **Non-adaptive governance** | The governance logic never self-modifies based on observed data. All changes require human ratification. |
| **Fail-safe defaults** | Every ambiguous or error state resolves to blocking execution, never permitting it. |
| **Cumulative awareness** | Authorization considers the integral of all prior state changes, not just the current request. |

---

## 2. High-Level Architecture

### 2.1 Three-Component Model

The framework is composed of three structurally isolated components, each with exactly one capability and two structural incapabilities:

```
+------------------------------------------------------------------+
|                      AUTHORITY PLANE (10)                         |
|                                                                   |
|   +-----------------------------------------------------------+  |
|   |              GOVERNANCE KERNEL (100)                       |  |
|   |                                                            |  |
|   |   - Policy Matrix           - Stateful Accumulator (102)  |  |
|   |   - Internal Logic Engine   - HSM-held Signing Key        |  |
|   |                                                            |  |
|   |   CAN:    Evaluate policy, sign receipts/tokens            |  |
|   |   CANNOT: Execute actions, reach execution targets         |  |
|   +-----------------------------------------------------------+  |
|                                                                   |
+------------------------------------------------------------------+
                    |                          ^
                    | Signed Receipts/         | One-Way
                    | Tokens flow DOWN         | Telemetry UP
                    v                          |
         =====[ SOVEREIGN BOUNDARY (15) ]======
                    |                          ^
                    v                          |
+------------------------------------------------------------------+
|                     EXECUTION PLANE (20)                          |
|                                                                   |
|   +-----------------------------------------------------------+  |
|   |              EXECUTION GATE (200)                          |  |
|   |                                                            |  |
|   |   - Cryptographic Verifier  - Consumption Ledger          |  |
|   |   - Ephemeral Key Shard     - Retraction Revocation List  |  |
|   |                                                            |  |
|   |   CAN:    Enforce/block execution, verify receipts         |  |
|   |   CANNOT: Generate or modify authorization artifacts       |  |
|   +-----------------------------------------------------------+  |
|                                                                   |
+------------------------------------------------------------------+
                    |                          ^
                    | Outbound Actions         | Event Logs
                    v                          |
+------------------------------------------------------------------+
|              ADVISORY TELEMETRY SYSTEM (400)                      |
|              (One-Way Mirror)                                     |
|                                                                   |
|   - Event Ingestion (data diodes, port mirroring, TAP)           |
|   - Degradation Score Engine                                      |
|   - Intent-Action Matching                                        |
|   - Out-of-Band Telemetry (450)                                  |
|                                                                   |
|   CAN:    Observe, compute scores, generate advisories            |
|   CANNOT: Intervene, modify kernel state, trigger actions         |
+------------------------------------------------------------------+
```

### 2.2 Structural Separation of Concerns

Each component is defined not just by what it does, but by what it **structurally cannot** do:

| Component | Has | Structurally Lacks |
|-----------|-----|-------------------|
| Governance Kernel | Authority (policy evaluation, signing) | Execution credentials, API keys, network routes to targets |
| Execution Gate | Enforcement (block/permit at network egress) | Ability to generate, modify, or forge authorization artifacts |
| Advisory Telemetry | Observation (read-only data ingestion) | Write access to Kernel, Gates, or execution targets |

This is not access control -- it is architectural incapability. The Governance Kernel cannot execute actions because it has no credentials for execution targets. The Execution Gate cannot authorize actions because it has no signing key. The Advisory Telemetry system cannot intervene because it is connected via one-way data paths.

### 2.3 Data Flow Overview

```
Autonomous Executive Entity (AEE)
        |
        |  (1) Submit Intent Proposal
        v
  Governance Kernel (100)
        |
        |  (2) Evaluate against Policy Matrix + Stateful Accumulator (102)
        |  (3) If approved: sign Approval Receipt (106) or Fluidity Token (104)
        |
        v
  Execution Gate (200)
        |
        |  (4) Six-step cryptographic verification
        |  (5) If valid: permit outbound action
        |  (6) If invalid/retracted/expired: block and log
        |
        v
  Execution Target (external system)
        |
        |  (mirrored/tapped)
        v
  Advisory Telemetry System (400)
        |
        |  (7) Compute degradation score, detect drift
        |  (8) Emit advisory (non-binding) to human dashboard
        v
  Human Operator Dashboard
```

---

## 3. Governance Kernel (Authority Plane)

**Reference: FIG. 1, FIG. 2, FIG. 5**

The Governance Kernel is the sole source of authorization in the system. It resides in the Authority Plane (10) and is structurally isolated from all execution targets.

### 3.1 Responsibilities

- Receive Intent Proposals from Autonomous Executive Entities (AEEs)
- Evaluate each proposal against the **Policy Matrix** (a set of deterministic rules defining permitted actions, scopes, and thresholds)
- Consult the **Stateful Accumulator (102)** to assess cumulative impact
- Issue signed **Approval Receipts (106)** for individual actions
- Issue signed **Speculative Fluidity Tokens (104)** for latency-sensitive domains
- Maintain and update the Stateful Accumulator
- Broadcast **Poison Pill (302)** signals to all Gates in emergency scenarios

### 3.2 Isolation Model

The Kernel is hosted inside a Trusted Execution Environment (TEE) or hardware enclave. Its isolation is enforced through multiple layers:

- **Process isolation**: TEE / hardware enclave (e.g., Intel SGX, ARM TrustZone)
- **Network isolation**: No routes to execution targets; eBPF filters and namespace separation
- **Credential isolation**: No API keys, OAuth tokens, or service account credentials for external systems
- **Mandatory Access Control (MAC)**: SELinux/AppArmor policies restricting the Kernel process

The Kernel's signing key is held in a Hardware Security Module (HSM) and never exported. The Kernel invokes the HSM to sign artifacts; it cannot extract the private key.

### 3.3 Stateful Accumulator

The Stateful Accumulator (102) is the cumulative state tracker that prevents salami-slicing attacks. It records the integral of all authorized state changes, partitioned by:

- **Entity Path** (hierarchical identifier, e.g., `/org/division/function/agent`)
- **Temporal epoch** (configurable time window)

```
Accumulator State:
{
  entity_path: "/acme/trading/equities/bot-7",
  epoch:       "2026-02-16T00:00:00Z/PT1H",
  integral:    4750.00,       // sum of all delta-S values this epoch
  threshold:   5000.00,       // Omega: safety ceiling for this path+epoch
  remaining:   250.00         // budget remaining before hard block
}
```

The Accumulator is:
- **Read-only** for AEEs and Gates (they can query remaining budget but cannot modify it)
- **Write-only** by the Kernel (updated atomically with each approval)
- **Reset** only at epoch boundaries or via explicit human re-authorization

### 3.4 Safety Invariant

The mathematical invariant enforced by the Kernel on every evaluation:

```
V_current + delta_S <= Omega
```

Where:
- `V_current` = current integral value in the Stateful Accumulator for the relevant entity path and epoch
- `delta_S` = the state-change magnitude of the proposed action
- `Omega` = the safety threshold (ceiling), set by human operators and stored in the Policy Matrix

If this invariant would be violated, the Kernel refuses to sign the receipt. No exceptions, no overrides, no grace periods. The threshold can only be modified by human ratification through a process external to the governance system.

### 3.5 Policy Matrix Evaluation

The Kernel's internal logic engine is:

- **Deterministic**: given the same inputs and accumulator state, produces the same decision
- **Non-adaptive**: it does not learn, adjust weights, or self-modify based on observed outcomes
- **Auditable**: every evaluation can be replayed from logged inputs

Policy changes require human ratification and are applied as versioned, immutable policy snapshots.

---

## 4. Execution Gate (Execution Plane)

**Reference: FIG. 1, FIG. 3, FIG. 6**

The Execution Gate sits at the network egress point between the AEE and its execution targets. Every outbound action from a governed AEE must pass through a Gate. The Gate has enforcement capability but no authorization capability.

### 4.1 Responsibilities

- Verify cryptographic validity of Approval Receipts and Fluidity Tokens
- Enforce single-use semantics (consumption ledger)
- Enforce expiration and retraction
- Block all unauthorized or invalid outbound actions
- Destroy Ephemeral Key Shards on Poison Pill receipt
- Perform metadata stripping and SPI (Sensitive Personal Information) redaction
- Authenticate outbound connections via mTLS

### 4.2 Non-Bypassability

The Gate is deployed such that the AEE has **no alternative network path** to execution targets. This is enforced through infrastructure-level controls:

| Deployment Model | Bypass Prevention Mechanism |
|------------------|-----------------------------|
| Cloud / VPC | VPC security groups, network ACLs restricting egress to Gate only |
| Kubernetes | Network policies, sidecar proxy injection (FIG. 3) |
| On-premises | Firewall rules, VLAN isolation |
| Critical infrastructure | Galvanic isolation, hardware air gap (FIG. 7) |

The AEE cannot route around the Gate because the network topology physically or logically prevents it.

### 4.3 Six-Step Cryptographic Verification

Every Approval Receipt (106) presented to the Gate undergoes a six-step verification sequence. All six checks must pass; failure at any step results in the action being blocked.

```
Step 1: VERIFY SIGNATURE
   Input:  receipt.signature, kernel_public_key
   Action: Verify the Kernel's digital signature on the receipt
   Fail:   Block -- receipt may be forged or tampered

Step 2: GENERATE LOCAL HASH
   Input:  actual outbound request parameters
   Action: Compute hash of the real parameters the AEE is attempting to send
   Output: local_params_hash

Step 3: COMPARE PARAMETER HASHES
   Input:  local_params_hash, receipt.params_hash
   Action: Compare local hash to the params_hash embedded in the receipt
   Fail:   Block -- AEE is attempting to execute different parameters
           than what the Kernel approved (parameter substitution attack)

Step 4: CHECK CONSUMPTION LEDGER
   Input:  receipt.receipt_id, consumption_ledger
   Action: Verify receipt has not been previously consumed
   Fail:   Block -- replay attack detected

Step 5: CHECK EXPIRATION
   Input:  receipt.expires_at, current_time
   Action: Verify receipt has not expired
   Fail:   Block -- stale authorization

Step 6: CHECK RETRACTION REVOCATION LIST
   Input:  receipt.entity_path, retraction_list
   Action: Check if the entity or any ancestor in the entity path hierarchy
           has been retracted
   Fail:   Block -- entity has been retracted (retraction always supersedes
           approval, even for cryptographically valid receipts)
```

After all six steps pass, the Gate:
1. Records the `receipt_id` in the consumption ledger (marking it consumed)
2. Strips metadata and redacts SPI from the outbound request
3. Forwards the action to the execution target via mTLS

### 4.4 Ephemeral Key Shard

The Execution Gate holds an **Ephemeral Key Shard** (denoted as `chi` in the architecture). This key shard:

- Is time-limited (rotated on a configurable schedule)
- Is required for the Gate to forward authenticated requests to execution targets
- Is destroyed immediately upon receiving a Poison Pill Broadcast (302)
- Cannot be regenerated by the Gate itself -- new shards are issued only by the Kernel after human review

Destruction of the key shard renders the Gate incapable of forwarding any actions, regardless of whether valid receipts are presented.

### 4.5 Stealth Retraction

When an entity is retracted, the Gate may optionally issue **mock success responses** to the retracted AEE. This prevents the AEE from detecting the retraction and attempting evasive behavior (e.g., switching communication channels, escalating privileges, or alerting co-conspirators in a multi-agent system).

The AEE believes its actions are succeeding while the Gate silently discards them.

### 4.6 Sidecar Proxy Deployment (FIG. 3)

In cloud-native environments, the Gate is deployed as a **sidecar proxy** within a containerized service mesh:

```
+-----------------------------------------------+
|  Pod / Container Group                         |
|                                                |
|  +----------------+    +-------------------+   |
|  |                |    |  EXECUTION GATE   |   |
|  |  AEE Container | -> |  (Sidecar Proxy)  |   |
|  |                |    |                   |   |
|  +----------------+    | - Interdiction    |   |
|                        |   Logic           |   |
|                        | - Token Validator |   |
|                        | - Local Cache     |   |
|                        +--------+----------+   |
|                                 |              |
+-----------------------------------------------+
                                  |
                                  v
                          Execution Target
```

The application (AEE) is unaware of the governance layer. All outbound network traffic is transparently intercepted by the sidecar. The sidecar contains:

- **Interdiction Logic**: decides whether to permit, block, or mock-respond
- **Token Validator**: performs the six-step cryptographic verification
- **Local Cache**: stores active Fluidity Tokens and the consumption ledger

---

## 5. Advisory Telemetry System (One-Way Mirror)

**Reference: FIG. 1, FIG. 7, FIG. 9**

The Advisory Telemetry System (400) provides continuous observability over the entire governance framework without any ability to intervene, modify, or trigger actions.

### 5.1 Responsibilities

- Ingest event logs, decision traces, and action sequences from all components
- Compute Degradation Scores via deterministic analytical models
- Perform intent-action matching (comparing actual behavior to expected behavior)
- Detect salami-slicing drift patterns
- Generate advisory outputs for human operators
- Monitor human operator behavior for alert fatigue

### 5.2 One-Way Data Ingestion

The Telemetry system receives data exclusively through one-way channels:

| Mechanism | Description |
|-----------|-------------|
| Hardware data diodes (900) | Physical devices that enforce unidirectional data flow at the electrical level |
| Port mirroring / SPAN | Network switch duplicates traffic to a monitoring port |
| TAP (Test Access Point) | Passive optical or electrical tap on network links |
| Read-only event streams | Append-only log subscriptions with no write-back channel |

There is no return channel. The Telemetry system cannot send commands, configuration changes, or signals back to the Kernel, Gates, or execution targets.

### 5.3 Degradation Score Computation

The Telemetry system computes a **Degradation Score** through the following pipeline:

```
(a) INGEST
    - Event logs from Governance Kernel decisions
    - Action sequences from Execution Gates
    - External system responses and state changes

(b) SIMULATE
    - Run a deterministic simulation of expected behavior
    - Compare actual action sequences to simulated expectations
    - Flag divergences (intent-action mismatch)

(c) COMPUTE ENTROPY
    - Calculate Integrated Systemic Entropy over a sliding window:
      ISE = sum(delta_S) over window W
    - Higher entropy indicates greater cumulative deviation from baseline

(d) DETECT DRIFT
    - Apply pattern detection for salami-slicing:
      many small deviations that individually fall below alert thresholds
      but cumulatively represent significant drift
    - Flag when ISE exceeds advisory thresholds
```

All analytical models used in this pipeline are **fixed and non-adaptive**. They do not retrain, adjust weights, or modify their parameters based on observed data. Model updates require human ratification.

### 5.4 Shadow Mode

Shadow Mode allows operators to deploy the governance framework in a **simulation-only** configuration:

- The Kernel evaluates Intent Proposals and produces decisions
- The Gate logs what it would block or permit
- No actual enforcement occurs -- all actions pass through
- The Telemetry system records the full decision trace

This mode is used during initial deployment, policy tuning, and compliance audits. It produces a complete record of governance decisions without impacting production operations.

### 5.5 Out-of-Band Telemetry

The Out-of-Band Telemetry channel (450) provides an **independent physical measurement path** that is separate from the primary data ingestion path. This allows the Telemetry system to verify claims made by in-band data against independent physical observations.

For example, in a clinical healthcare deployment (FIG. 9), biometric sensors provide out-of-band telemetry that can independently verify whether a medication was administered, separate from the electronic health record entry.

### 5.6 Alert Fatigue Detection

The Telemetry system monitors human operator behavior patterns:

- **Approval frequency**: how often the human approves actions
- **Approval latency**: how quickly the human approves after receiving a request
- **Pattern detection**: rapid, uniform approvals suggest rubber-stamping

When alert fatigue is detected (human approving too quickly or too uniformly), the system generates an advisory recommending that governance thresholds be modified to reduce approval volume, and the Kernel may increase attestation requirements for that operator's scope.

---

## 6. Sovereign Boundary

**Reference: FIG. 1**

The Sovereign Boundary (15) is the structural separation between the Authority Plane (10) and the Execution Plane (20). It is not a firewall rule or an access control list -- it is an architectural invariant enforced at multiple layers:

- **No shared credentials**: the Kernel and Gate use entirely separate credential stores
- **No direct network routes**: there is no bidirectional control channel between planes
- **No shared memory or storage**: each plane has independent data stores
- **Unidirectional flows only**:
  - Authority flows **downward** via cryptographically signed receipts and tokens
  - Telemetry flows **upward** via one-way data channels

In multi-domain deployments, multiple Sovereign Boundaries exist:

```
+-------------------+     +-------------------+
| Orbital Domain    |     | Terrestrial Domain|
| Authority Plane   |     | Authority Plane   |
|                   |     |                   |
| Governance Kernel |     | Governance Kernel |
+===================+     +===================+
| Sovereign         |     | Sovereign         |
| Boundary          |     | Boundary          |
+===================+     +===================+
| Orbital Domain    |     | Terrestrial Domain|
| Execution Plane   |     | Execution Plane   |
|                   |     |                   |
| Execution Gate    |     | Execution Gate    |
+-------------------+     +-------------------+
        |                         |
        +---- Cross-Domain -------+
              Fluidity Tokens
              (high-latency link)
```

Each domain maintains its own complete governance stack. Cross-domain coordination uses Fluidity Tokens with extended time bounds appropriate for the link latency (e.g., orbital-to-terrestrial communication delay).

---

## 7. Authorization Artifacts

### 7.1 Approval Receipt (FIG. 15)

The Approval Receipt (106) is a non-fungible, cryptographically signed authorization artifact issued by the Governance Kernel for a single specific action.

```json
{
  "receipt_id":    "ar-20260216-a8f3c901-4e2b",
  "entity_path":   "/acme/trading/equities/bot-7",
  "action":        "order.submit",
  "params_hash":   "sha256:9f86d081884c7d659a2feaa0c55ad015...",
  "issued_at":     "2026-02-16T14:30:00.000Z",
  "expires_at":    "2026-02-16T14:30:05.000Z",
  "accumulator_snapshot": {
    "pre_delta":   4750.00,
    "delta_s":     200.00,
    "post_delta":  4950.00,
    "threshold":   5000.00
  },
  "signature":     "ed25519:<kernel_signature_bytes>"
}
```

Properties:
- **Single-use**: recorded in the consumption ledger after first use; replay attempts are blocked
- **Replay-immune**: the consumption ledger prevents any receipt from being used twice
- **Tamper-evident**: any modification invalidates the Kernel's cryptographic signature
- **Subject to hierarchical retraction**: even a valid, unexpired receipt is blocked if the entity or any ancestor in the entity path has been retracted
- **Parameter-bound**: the `params_hash` binds the receipt to specific action parameters; the AEE cannot substitute different parameters

### 7.2 Speculative Fluidity Token (FIG. 2)

The Speculative Fluidity Token (Tf) (104) solves the latency problem for domains where per-action Kernel round-trips are unacceptable (high-frequency trading, orbital operations, autonomous vehicle swarms).

```json
{
  "token_id":         "tf-20260216-b7e4d012",
  "entity_path":      "/acme/trading/equities/bot-7",
  "risk_budget":      500.00,
  "scope": {
    "permitted_actions": ["order.submit", "order.cancel"],
    "max_single_action": 50.00,
    "asset_classes":     ["equity"],
    "exchanges":         ["NYSE", "NASDAQ"]
  },
  "issued_at":        "2026-02-16T14:00:00.000Z",
  "expires_at":       "2026-02-16T15:00:00.000Z",
  "signature":        "ed25519:<kernel_signature_bytes>"
}
```

Operational behavior:
1. The Kernel evaluates the token request against the Policy Matrix and Stateful Accumulator
2. If approved, the Kernel signs and issues the token with a defined risk budget (`beta`), scope (`sigma`), and expiration
3. The Execution Gate receives the token and caches it locally
4. For each micro-action, the Gate:
   - Verifies the action falls within the token's scope
   - Decrements the remaining risk budget by the action's `delta_S`
   - Permits the action if budget > 0 and scope is satisfied
   - Blocks the action if budget <= 0 or scope is violated
5. The Gate reports consumed budget back to the Kernel's Stateful Accumulator via telemetry

The token is consumed incrementally. When the budget is exhausted or the token expires, the AEE must request a new token from the Kernel.

---

## 8. Key Mechanisms

### 8.1 Dual-Attestation and Intent-Vectoring (FIG. 4)

High-blast-radius actions require **two independent signatures** before the Execution Gate permits execution:

```
+------------------+          +--------------------+
| Human Operator   |          | Edge Sentinel (52) |
|                  |          | (Sentinel Bot)     |
| Signs:           |          | Signs:             |
| Work Plan        |          | Tactical Actions   |
| Envelope (54)    |          | (56)               |
| (strategic       |          | (micro-scope,      |
|  intent)         |          |  operational)      |
|                  |          |                    |
| Key: Human       |          | Key: Ephemeral     |
| Private Key      |          | Key (chi)          |
+--------+---------+          +---------+----------+
         |                              |
         |  Human Intent Signature      |  Machine Integrity Signature
         v                              v
    +----+------------------------------+----+
    |        EXECUTION GATE (200)            |
    |                                        |
    |  BOTH signatures required for          |
    |  high-blast-radius actions             |
    +----------------------------------------+
```

**Mutual veto** ensures neither party can act unilaterally:
- **Human vetoes machine**: by withholding the Work Plan Envelope signature, the human prevents execution even if the machine considers the action operationally correct
- **Machine vetoes human**: the Edge Sentinel withholds its integrity signature when the proposed action would violate safety invariants, even if the human has signed approval

**Intent-Vectoring** binds tactical micro-actions to the strategic boundaries defined by the human's Work Plan:
- The human defines the "what" and "within what bounds"
- The machine determines the "how" and "when," constrained to the human-defined vector
- Any tactical action outside the Work Plan Envelope scope is rejected

**Alert fatigue escalation**: when the system detects that a human operator is approving requests with suspiciously low latency or high uniformity, it increases the attestation requirements -- requiring additional verification steps or reducing the scope of pre-approved actions.

### 8.2 Poison Pill Broadcast (FIG. 6)

The Poison Pill Broadcast (302) is the emergency halt mechanism:

```
Trigger Conditions:
  - Critical safety invariant violation detected
  - Coordinated anomaly across multiple entity paths
  - Manual emergency stop by authorized human operator

Sequence:
  1. Governance Kernel broadcasts Poison Pill signal to ALL Execution Gates
  2. Each Gate immediately:
     a. Destroys its Ephemeral Key Shard (chi)
     b. Enters Lockdown State
     c. Acknowledges receipt to Kernel
  3. In Lockdown State, the Gate refuses ALL execution regardless of:
     - Valid Approval Receipts
     - Valid Fluidity Tokens
     - Any other authorization artifact
  4. Lockdown persists indefinitely until:
     a. Human review is completed
     b. Kernel issues new Ephemeral Key Shards
     c. Gate re-initializes with fresh key material

Propagation latency: bounded only by network latency to each Gate.
```

The Poison Pill is the highest-priority signal in the system. No authorization artifact can override a Lockdown state.

### 8.3 Hierarchical Entity Paths and Retraction Cascade (FIG. 14, FIG. 16)

Entity Paths follow a hierarchical namespace:

```
/organization
/organization/division
/organization/division/function
/organization/division/function/agent-instance
```

Examples:
```
/acme/trading/equities/bot-7
/acme/trading/fixed-income/bot-12
/acme/ops/deployment/ci-runner-3
```

**Retraction cascade**: retracting an entity at any level automatically retracts all descendants:

```
RETRACT /acme/trading
  |
  +-- RETRACTED: /acme/trading/equities/bot-7
  +-- RETRACTED: /acme/trading/equities/bot-8
  +-- RETRACTED: /acme/trading/fixed-income/bot-12
  +-- RETRACTED: /acme/trading/fixed-income/bot-13
  ... (all entities under /acme/trading)
```

Properties of retraction:
- **Retraction always supersedes approval**: even cryptographically valid, unexpired receipts are blocked if the entity or any ancestor has been retracted
- **Immutable record**: retraction state is stored in an immutable distributed ledger
- **Hierarchical inheritance**: authority is inherited downward, retraction cascades downward
- **No self-retraction**: an entity cannot retract itself or its ancestors

### 8.4 Salami-Slicing Accumulator (FIG. 5)

The Stateful Accumulator (102) is specifically designed to defeat salami-slicing attacks, where an adversary (or drifting agent) makes many small authorized actions that individually appear harmless but cumulatively cause significant unauthorized impact.

```
Traditional rate-limiting (DEFEATED by salami-slicing):
  Rule: "Block if single action > $1000"
  Attack: 1000 actions x $1 each = $1000 total, all individually permitted

Invariant Governance accumulator:
  Rule: "Block if SUM(delta_S) > Omega for entity path in epoch"
  Defense: After 1000 x $1, accumulator reads $1000 -- identical to 1 x $1000
           Both hit the same threshold. The integral does not care about
           action granularity.
```

The accumulator is:
- **Historical**: it tracks the integral of all state changes, not just rates or recent history
- **Per entity path**: each entity (and each scope within an entity) has independent tracking
- **Per temporal epoch**: epochs are configurable (hourly, daily, per-shift)
- **Kernel-exclusive**: only the Governance Kernel can write to the accumulator
- **Reset-controlled**: resets occur only at epoch boundaries or via explicit human re-authorization

### 8.5 Atomic Work Plans

Multi-step procedures are validated atomically as a unit:

```
Work Plan: "Deploy new service version"
  Step 1: Scale down current deployment (approved)
  Step 2: Apply database migration (approved)
  Step 3: Scale up new deployment (approved)
  Step 4: Run health checks (approved)

If Step 3 fails:
  -> Rolling retraction of Step 2 (reverse migration)
  -> Rolling retraction of Step 1 (scale back up)
  -> System returns to pre-work-plan state

No intermediate state is left exposed.
```

The Kernel evaluates the entire Work Plan against the Policy Matrix before any step begins. If any step would violate the safety invariant (including cumulative impact of all steps), the entire plan is rejected before execution starts.

---

## 9. Hardware HAL Gate (FIG. 7)

For critical infrastructure (power grids, water treatment, industrial control systems), the Execution Gate is implemented as a **physical hardware device** rather than a software process:

```
+-------------------------------------------------------------------+
|  HARDWARE HAL GATE (700)                                          |
|                                                                   |
|  +----------------------------+  +----------------------------+   |
|  | GOVERNANCE LOGIC MODULE    |  | PHYSICS LOGIC MODULE       |   |
|  | (FPGA)                     |  | (FPGA)                     |   |
|  |                            |  |                            |   |
|  | - Receipt verification     |  | - Physical safety bounds   |   |
|  | - Policy enforcement       |  | - Rate-of-change limits    |   |
|  | - Accumulator checking     |  | - Actuator range clamping  |   |
|  +----------------------------+  +----------------------------+   |
|                                                                   |
|  +----------------------------+  +----------------------------+   |
|  | GALVANIC ISOLATOR          |  | DAC (Digital-to-Analog     |   |
|  |                            |  |  Converter)                |   |
|  | - Electrical isolation     |  | - Proportional actuation   |   |
|  | - Prevents cross-talk      |  | - Continuous control       |   |
|  | - Blocks signal injection  |  |   signals                  |   |
|  +----------------------------+  +----------------------------+   |
|                                                                   |
|  +------------------------------------------------------------+  |
|  | PHYSICAL FEEDBACK LOOP                                      |  |
|  | - Real-time sensor verification                             |  |
|  | - Independent measurement of actuator state                 |  |
|  | - Closes the loop: command -> actuate -> verify -> report   |  |
|  +------------------------------------------------------------+  |
+-------------------------------------------------------------------+
```

The FPGA hosts two distinct logic modules:
- **Governance Logic Module**: implements the same receipt verification and policy enforcement as the software Gate, but in hardware logic
- **Physics Logic Module**: enforces physical safety constraints (e.g., maximum rate of valve opening, voltage ramp limits, temperature change bounds) that exist independently of governance policy

The **Galvanic Isolator** provides electrical isolation between the governance system and the physical actuators, preventing:
- Electrical cross-talk between digital governance signals and analog control signals
- Signal injection attacks where an adversary attempts to bypass governance by injecting signals directly into the actuator path

The **DAC** converts digital governance decisions into proportional analog control signals for continuous actuators (as opposed to binary on/off control).

The **Physical Feedback Loop** provides real-time verification that the physical system responded as expected to the governance-approved command.

---

## 10. Fail-Safe Behavior

Every failure mode in the system resolves to **blocking execution**, never permitting it. The system is designed to fail closed.

| Failure Condition | System Response |
|-------------------|-----------------|
| Loss of telemetry heartbeat | Gate blocks all execution until heartbeat is restored |
| Receipt verification timeout | Gate terminates the connection; action is not forwarded |
| Accumulator threshold breach | Kernel stops issuing receipts for the affected entity path |
| Fluidity Token budget exhausted | Gate stops permitting micro-actions; AEE must request new token |
| Fluidity Token expired | Gate stops permitting micro-actions; AEE must request new token |
| Advisory Telemetry system failure | Observed systems continue operating (telemetry is non-interventional); governance enforcement continues independently |
| Kernel unreachable | Gate continues enforcing already-issued tokens until they expire, then blocks all new actions |
| Gate process crash | No outbound path exists for the AEE; all actions are blocked by infrastructure |
| HSM failure | Kernel cannot sign receipts; no new authorizations are issued |
| Network partition (multi-domain) | Each domain's local governance stack continues independently; cross-domain tokens expire naturally |

---

## 11. Anti-Self-Modification Guarantee

The governance framework enforces a strict prohibition on autonomous self-modification. No component in the system can modify its own governance parameters or the parameters of any other component:

| Parameter | Modification Requires |
|-----------|----------------------|
| Policy Matrix rules | Human ratification via external process |
| Safety thresholds (Omega) | Human ratification via external process |
| Entity Path definitions | Human ratification via external process |
| Behavioral baselines | Human ratification via external process |
| Telemetry analytical models | Human ratification via external process |
| Epoch durations | Human ratification via external process |
| Fluidity Token scope templates | Human ratification via external process |

The Kernel's internal logic engine is non-adaptive: it does not incorporate machine learning, reinforcement learning, or any mechanism that adjusts its decision function based on observed outcomes.

The Advisory Telemetry system's analytical models are fixed: they analyze data using static algorithms and do not retrain or adjust weights from the data they observe.

This guarantee ensures that governance behavior is:
- **Predictable**: the same inputs always produce the same outputs
- **Auditable**: governance decisions can be replayed and verified
- **Resistant to adversarial manipulation**: an attacker who controls an AEE cannot influence the governance system to gradually relax its constraints

---

## 12. Industrial Domain Applications

The architecture is domain-agnostic but has been designed and validated for eight industrial domains:

### 12.1 Financial Trading (FIG. 8)

- **Edge Sentinel** acts as a circuit breaker for trading bots
- Fluidity Tokens issued with per-epoch risk budgets
- Slippage checks: Gate verifies that execution price is within the approved price range
- Accumulator tracks cumulative position exposure, not just individual trade size

### 12.2 Clinical Healthcare (FIG. 9)

- Care plans modeled as Atomic Work Plans
- Nurse handoff: governance state transfers between shifts as Work Plan Envelope re-signatures
- Biometric telemetry (450) provides out-of-band verification of medication administration
- Entity Paths reflect clinical hierarchy: `/hospital/ward/care-team/nurse`

### 12.3 Multi-Domain / Orbital Operations (FIG. 10)

- Disconnected operations: Fluidity Tokens pre-issued with extended time bounds for high-latency links
- Separate Sovereign Boundaries for orbital and terrestrial domains
- Cross-domain tokens carry domain-specific scope restrictions
- Communication delay tolerance via speculative authorization

### 12.4 National Sovereignty and Critical Infrastructure (FIG. 11)

- Federal Reserve operations governed with jurisdictional Entity Paths
- Utility grid: HAL Gate (700) with physics logic for voltage/frequency safety bounds
- Water treatment: proportional actuation via DAC with galvanic isolation
- Jurisdictional boundaries enforced as Sovereign Boundaries

### 12.5 Blockchain and Smart Contracts (FIG. 12)

- Smart Contract Guardrail: Execution Gate wraps smart contract invocation
- Policy-interlocked key vault: signing keys for blockchain transactions are held behind governance verification
- Accumulator tracks cumulative on-chain state changes across the entity path

### 12.6 Autonomous Logistics (FIG. 13)

- Swarm governance: Fluidity Tokens issued to swarm coordinators
- Density invariant: accumulator tracks spatial density of autonomous agents
- Per-vehicle Entity Paths within fleet hierarchy

### 12.7 Enterprise Contract Execution

- Contract terms modeled as Policy Matrix rules
- Cumulative exposure limits tracked per counterparty entity path
- Dual-attestation for contract amendments above threshold

### 12.8 Government Benefits Issuance

- Jurisdictional Entity Paths: `/federal/state/county/agency`
- Fraud detection via salami-slicing accumulator (cumulative disbursement tracking)
- Retraction cascade for organizational restructuring

---

## 13. Reference Diagram Index

| Figure | Title | Primary Content |
|--------|-------|-----------------|
| FIG. 1 | System Overview | Three-component architecture, Authority Plane, Execution Plane, Sovereign Boundary |
| FIG. 2 | Speculative Fluidity Token | Token structure, risk budget decrement, scope enforcement |
| FIG. 3 | Sidecar Proxy Embodiment | Cloud-native Gate deployment in containerized service mesh |
| FIG. 4 | Dual-Attestation and Intent-Vectoring | Human + Machine mutual veto, Work Plan Envelope |
| FIG. 5 | Salami-Slicing Accumulator | Cumulative state-change tracking, threshold enforcement |
| FIG. 6 | Poison Pill Broadcast | Emergency halt, key shard destruction, lockdown state |
| FIG. 7 | Hardware HAL Gate | FPGA, galvanic isolator, DAC, physical feedback loop |
| FIG. 8 | Financial Trading Domain | Sentinel circuit breaker, slippage check |
| FIG. 9 | Clinical Healthcare Domain | Nurse handoff, biometric out-of-band telemetry |
| FIG. 10 | Multi-Domain / Orbital | Disconnected operations, cross-domain Fluidity Tokens |
| FIG. 11 | National Sovereignty | Federal Reserve, utility grid, water purity HAL Gate |
| FIG. 12 | Blockchain / Smart Contract | Smart contract guardrail, policy-interlocked key vault |
| FIG. 13 | Autonomous Logistics | Swarm governance, density invariant |
| FIG. 14 | Hierarchical Entity Paths | Namespace hierarchy, authority inheritance |
| FIG. 15 | Approval Receipt | Receipt structure, field definitions |
| FIG. 16 | Retraction Cascade | Hierarchical retraction, cascade propagation |

---

## 14. Source Tree Map

```
invariant-governance/
  src/
    governance-kernel/     # Governance Kernel implementation (Authority Plane)
    execution-gate/        # Execution Gate implementation (Execution Plane)
    telemetry/             # Advisory Telemetry System (One-Way Mirror)
    types/                 # Shared type definitions, data structures, interfaces
  tests/                   # Test suites
  examples/                # Example configurations and deployment scenarios
  integrations/            # Integration adapters for external systems
  docs/
    architecture.md        # This document
```

---

*This document describes the architecture of the Invariant Governance framework. For patent and licensing information, see [PATENT_NOTICE.md](../PATENT_NOTICE.md) and [LICENSE](../LICENSE).*
