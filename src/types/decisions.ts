// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Holladay Labs IP, LLC

/**
 * Invariant Governance — Decision and Audit Types
 *
 * Hash-chained decision log entries for tamper-evident audit trails.
 */

import type { EntityPath, Timestamp, RiskLevel, DecisionOutcome } from './common.js';

/** A single entry in the hash-chained audit log */
export interface AuditEntry {
  /** Unique entry identifier */
  entry_id: string;
  /** Sequence number in the chain */
  sequence: number;
  /** When this decision was made */
  timestamp: Timestamp;
  /** Entity path of the requesting agent */
  entity_path: EntityPath;
  /** The action that was evaluated */
  action: string;
  /** The governance decision */
  outcome: DecisionOutcome;
  /** Reason for the decision */
  reason?: string;
  /** SHA-256 hash of the request parameters */
  params_hash: string;
  /** Associated approval receipt ID (if applicable) */
  receipt_id?: string;
  /** Risk level classification */
  risk_level?: RiskLevel;
  /** SHA-256 hash of this entire entry */
  entry_hash: string;
  /** SHA-256 hash of the previous entry (chain linkage) */
  prev_hash: string;
}

/** Result of verifying audit chain integrity */
export interface ChainVerification {
  /** Whether the entire chain is valid */
  valid: boolean;
  /** Number of entries checked */
  checked: number;
  /** Errors found during verification */
  errors: string[];
}

/** Aggregated decision statistics */
export interface DecisionStats {
  /** Total decisions in the window */
  total: number;
  /** Decisions by outcome */
  by_outcome: Record<DecisionOutcome, number>;
  /** Decisions by action */
  by_action: Record<string, number>;
  /** Time window for these stats */
  window_start: Timestamp;
  window_end: Timestamp;
}

/** Telemetry entry written to sinks */
export interface TelemetryEntry {
  /** Entry type */
  type: 'decision' | 'execution' | 'retraction' | 'poison_pill' | 'token_consumption';
  /** When this event occurred */
  timestamp: Timestamp;
  /** Entity path */
  entity_path: EntityPath;
  /** Event-specific data */
  data: Record<string, unknown>;
}

/** Degradation score for an entity path */
export interface DegradationScore {
  /** Entity path being scored */
  entity_path: EntityPath;
  /** Integrated Systemic Entropy (ISE) */
  ise: number;
  /** Drift indicators */
  drift_detected: boolean;
  /** Number of anomalies in the window */
  anomaly_count: number;
  /** Window for this score */
  window_start: Timestamp;
  window_end: Timestamp;
}

/** Token consumption event for telemetry */
export interface TokenConsumption {
  /** Token that was consumed */
  token_id: string;
  /** Action performed */
  action: string;
  /** Budget consumed */
  delta_s: number;
  /** Remaining budget after consumption */
  remaining: number;
  /** When consumed */
  consumed_at: Timestamp;
}
