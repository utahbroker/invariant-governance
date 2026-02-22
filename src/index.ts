// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Holladay Labs IP, LLC

/**
 * Invariant Governance SDK
 *
 * @invariant-governance/core — Deterministic governance for autonomous systems.
 *
 * Three structurally decoupled components:
 *   - GovernanceKernel (100) — Authority Plane: evaluates, signs, decides
 *   - ExecutionGate (200) — Execution Plane: verifies, executes, consumes
 *   - TelemetryObserver (400) — Advisory: observes, records, detects drift
 *
 * They are architecturally INCAPABLE of performing each other's functions.
 *
 * @see https://github.com/utahbroker/invariant-governance
 */

// === Core Components ===
export { GovernanceKernel } from './governance-kernel/index.js';
export type { GovernanceKernelOptions, EvaluationResult } from './governance-kernel/index.js';

export { ExecutionGate } from './execution-gate/index.js';
export type { ExecutionGateOptions } from './execution-gate/index.js';

export { TelemetryObserver } from './telemetry/index.js';
export type { TelemetryObserverOptions } from './telemetry/index.js';

// === Storage ===
export { InMemoryStorageAdapter } from './storage/index.js';
export type { StorageAdapter, KVStore, ConsumptionStore, AuditStore, ReceiptStore, TokenStore, ManifestStore, RetractionStore, PoisonPillStore } from './storage/index.js';

// === Types ===
export type {
  Timestamp,
  EntityPath,
  RiskLevel,
  Duration,
  DecisionOutcome,
} from './types/index.js';

export type {
  ApprovalReceipt,
  FluidityToken,
  FluidityScope,
  IntentProposal,
  FluidityTokenRequest,
  ExecutionResult,
  PoisonPillOptions,
  PoisonPillRecord,
  RetractionRecord,
  AccumulatorSnapshot,
} from './types/index.js';

export type {
  AgentPermissions,
  AuthorityManifest,
  ActionRule,
  PolicyMatrix,
  EffectiveAuthority,
} from './types/index.js';

export type {
  AuditEntry,
  ChainVerification,
  DecisionStats,
  TelemetryEntry,
  DegradationScore,
  TokenConsumption,
} from './types/index.js';

// === Errors ===
export {
  GovernanceErrorCode,
  GovernanceError,
  MissingEntityPathError,
  InvalidEntityPathError,
  ApprovalRequiredError,
  RetractedError,
  AccumulatorBreachError,
  LockdownError,
  SignatureInvalidError,
  ParamsMismatchError,
  ReplayDetectedError,
  BudgetExhaustedError,
  ScopeViolationError,
} from './types/index.js';

// === Utilities ===
export { matchActionPattern, matchesAnyPattern, parseDuration } from './types/index.js';
export {
  validateEntityPath,
  parseEntityPath,
  normalizeEntityPath,
  isWithinJurisdiction,
  getAncestorPaths,
  isAncestorOf,
  getPathDepth,
  getParentPath,
} from './types/index.js';

// === Crypto ===
export { sha256, computeParamsHash, stableStringify } from './crypto/index.js';
export type { KeyPair } from './crypto/index.js';
export { generateKeyPair } from './crypto/index.js';

// === Telemetry Sinks ===
export type { TelemetrySink } from './telemetry/index.js';
export { ConsoleSink, CallbackSink, MultiSink } from './telemetry/index.js';

// === Sub-components (advanced usage) ===
export { StatefulAccumulator } from './governance-kernel/index.js';
export { PolicyEvaluator } from './governance-kernel/index.js';
export type { PolicyEvaluation } from './governance-kernel/index.js';
export { ReceiptIssuer } from './governance-kernel/index.js';
export { FluidityIssuer } from './governance-kernel/index.js';
export { ManifestLoader, mergePermissionsRestrictive } from './governance-kernel/index.js';
export { RetractionManager } from './governance-kernel/index.js';
export { ReceiptVerifier } from './execution-gate/index.js';
export { FluidityManager } from './execution-gate/index.js';
export { AuditChain } from './telemetry/index.js';
export { DegradationScorer } from './telemetry/index.js';
export { DriftDetector } from './telemetry/index.js';
export type { DriftResult } from './telemetry/index.js';
