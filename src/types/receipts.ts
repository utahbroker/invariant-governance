/**
 * Invariant Governance — Authorization Artifacts
 *
 * Approval Receipts (106) and Speculative Fluidity Tokens (104).
 */

import type { EntityPath, Timestamp, RiskLevel } from './common.js';

/** Accumulator state snapshot embedded in receipts */
export interface AccumulatorSnapshot {
  /** Accumulator value before this action */
  pre_delta: number;
  /** State-change magnitude of this action */
  delta_s: number;
  /** Accumulator value after this action */
  post_delta: number;
  /** Safety threshold (Omega) */
  threshold: number;
}

/**
 * Approval Receipt (106) — Non-fungible, cryptographically signed,
 * single-use authorization token. Binds a specific action to a
 * specific context at a specific time.
 */
export interface ApprovalReceipt {
  /** Unique receipt identifier */
  receipt_id: string;
  /** Scoped entity path for this authorization */
  entity_path: EntityPath;
  /** The authorized action */
  action: string;
  /** SHA-256 hash of the authorized parameters */
  params_hash: string;
  /** When this receipt was issued */
  issued_at: Timestamp;
  /** When this receipt expires */
  expires_at: Timestamp;
  /** Accumulator state at time of issuance */
  accumulator_snapshot: AccumulatorSnapshot;
  /** Risk level classification */
  risk_level: RiskLevel;
  /** Ed25519 signature from the Governance Kernel */
  signature: string;
}

/** Scope constraints for a Fluidity Token */
export interface FluidityScope {
  /** Action patterns permitted under this token */
  permitted_actions: string[];
  /** Maximum state-change for any single micro-action */
  max_single_action: number;
  /** Additional domain-specific constraints */
  constraints?: Record<string, unknown>;
}

/**
 * Speculative Fluidity Token (Tf) (104) — Pre-authorization for
 * high-frequency and high-latency environments. Grants bounded
 * execution authority consumed incrementally.
 */
export interface FluidityToken {
  /** Unique token identifier */
  token_id: string;
  /** Scoped entity path */
  entity_path: EntityPath;
  /** Total risk budget (beta) */
  risk_budget: number;
  /** Remaining risk budget */
  remaining_budget: number;
  /** Scope constraints (sigma) */
  scope: FluidityScope;
  /** When this token was issued */
  issued_at: Timestamp;
  /** When this token expires */
  expires_at: Timestamp;
  /** Ed25519 signature from the Governance Kernel */
  signature: string;
}

/** Intent proposal submitted to the Governance Kernel for evaluation */
export interface IntentProposal {
  /** Entity path of the requesting agent */
  entity_path: EntityPath;
  /** The action being proposed */
  action: string;
  /** State-change magnitude of the proposed action */
  delta_s: number;
  /** Action parameters (will be hashed for receipt binding) */
  params: Record<string, unknown>;
  /** Optional context for audit trail */
  context?: Record<string, unknown>;
}

/** Request to issue a Fluidity Token */
export interface FluidityTokenRequest {
  /** Entity path for the token */
  entity_path: EntityPath;
  /** Requested risk budget */
  risk_budget: number;
  /** Scope constraints for the token */
  scope: FluidityScope;
  /** Token duration */
  duration: string;
}

/** Result of executing a gated action */
export interface ExecutionResult<T> {
  /** Whether execution succeeded */
  success: boolean;
  /** The result of the action (if successful) */
  result?: T;
  /** Error message (if failed) */
  error?: string;
  /** The receipt that authorized this execution */
  receipt_id: string;
  /** When the execution completed */
  executed_at: Timestamp;
}

/** Poison Pill broadcast options */
export interface PoisonPillOptions {
  /** Reason for the emergency halt */
  reason: string;
  /** Revoke all outstanding Fluidity Tokens */
  revokeFluidityTokens: boolean;
  /** Revoke all outstanding Approval Receipts */
  revokeApprovalReceipts: boolean;
}

/** Poison Pill broadcast record */
export interface PoisonPillRecord {
  /** Unique identifier */
  pill_id: string;
  /** Reason for the halt */
  reason: string;
  /** When the Poison Pill was broadcast */
  broadcast_at: Timestamp;
  /** What was revoked */
  revoked: {
    fluidity_tokens: boolean;
    approval_receipts: boolean;
  };
  /** Signature proving this came from the Kernel */
  signature: string;
}

/** Retraction record */
export interface RetractionRecord {
  /** Entity path being retracted */
  entity_path: EntityPath;
  /** Reason for retraction */
  reason: string;
  /** Who initiated the retraction */
  retracted_by: string;
  /** When the retraction occurred */
  retracted_at: Timestamp;
}
