/**
 * Invariant Governance — Type Barrel Export
 *
 * Re-exports all types, interfaces, enums, and utility functions.
 */

// Common type aliases
export type {
  Timestamp,
  EntityPath,
  RiskLevel,
  Duration,
  DecisionOutcome,
} from './common.js';
export { parseDuration } from './common.js';

// Entity path utilities
export type { EntityPathValidation } from './entity-path.js';
export {
  validateEntityPath,
  parseEntityPath,
  normalizeEntityPath,
  isWithinJurisdiction,
  getAncestorPaths,
  isAncestorOf,
  getPathDepth,
  getParentPath,
} from './entity-path.js';

// Error hierarchy
export { GovernanceErrorCode, GovernanceError } from './errors.js';
export {
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
} from './errors.js';

// Policy types
export type {
  AgentPermissions,
  AuthorityManifest,
  ActionRule,
  PolicyMatrix,
  EffectiveAuthority,
} from './policy.js';
export { matchActionPattern, matchesAnyPattern } from './policy.js';

// Authorization artifacts
export type {
  AccumulatorSnapshot,
  ApprovalReceipt,
  FluidityScope,
  FluidityToken,
  IntentProposal,
  FluidityTokenRequest,
  ExecutionResult,
  PoisonPillOptions,
  PoisonPillRecord,
  RetractionRecord,
} from './receipts.js';

// Decision and audit types
export type {
  AuditEntry,
  ChainVerification,
  DecisionStats,
  TelemetryEntry,
  DegradationScore,
  TokenConsumption,
} from './decisions.js';
