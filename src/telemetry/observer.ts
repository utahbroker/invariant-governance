/**
 * Invariant Governance — Telemetry Observer (400)
 *
 * Advisory Telemetry / One-Way Mirror. The Observer:
 * - Records governance decisions to the hash-chained audit log
 * - Emits telemetry events to sinks (console, webhook, etc.)
 * - Computes degradation scores and detects drift
 * - Can NEVER influence governance decisions (advisory only)
 *
 * Structural guarantees:
 * - Has NO private key (cannot sign)
 * - Has NO evaluate() method (cannot make decisions)
 * - Has NO execute() method (cannot run actions)
 * - Append-only access to audit store
 */

import type { EntityPath, DecisionOutcome, RiskLevel } from '../types/common.js';
import type { TelemetryEntry, DecisionStats, DegradationScore } from '../types/decisions.js';
import type { AuditStore } from '../storage/interfaces.js';
import { AuditChain } from './audit-chain.js';
import { DegradationScorer } from './degradation.js';
import { DriftDetector } from './drift-detector.js';
import type { DriftResult } from './drift-detector.js';
import type { TelemetrySink } from './sinks.js';

/** Options for creating a Telemetry Observer */
export interface TelemetryObserverOptions {
  /** Audit store for hash-chained log */
  auditStore: AuditStore;
  /** Telemetry sinks for event output */
  sinks?: TelemetrySink[];
}

/**
 * Telemetry Observer (400) — Advisory One-Way Mirror.
 *
 * Structural guarantees: NO private key, NO evaluate(), NO execute().
 * Can only observe and record — never influence.
 */
export class TelemetryObserver {
  private readonly chain: AuditChain;
  private readonly scorer: DegradationScorer;
  private readonly driftDetector: DriftDetector;
  private readonly sinks: TelemetrySink[];

  constructor(options: TelemetryObserverOptions) {
    this.chain = new AuditChain(options.auditStore);
    this.scorer = new DegradationScorer(options.auditStore);
    this.driftDetector = new DriftDetector(options.auditStore);
    this.sinks = options.sinks ?? [];
  }

  /**
   * Record a governance decision in the audit chain and emit telemetry.
   */
  async recordDecision(options: {
    entityPath: EntityPath;
    action: string;
    outcome: DecisionOutcome;
    reason?: string;
    paramsHash: string;
    receiptId?: string;
    riskLevel?: RiskLevel;
  }): Promise<void> {
    // Append to hash-chained audit log
    const entry = await this.chain.append(options);

    // Emit telemetry event to sinks
    const telemetryEntry: TelemetryEntry = {
      type: 'decision',
      timestamp: entry.timestamp,
      entity_path: entry.entity_path,
      data: {
        entry_id: entry.entry_id,
        action: entry.action,
        outcome: entry.outcome,
        reason: entry.reason,
        risk_level: entry.risk_level,
        receipt_id: entry.receipt_id,
        sequence: entry.sequence,
      },
    };

    await this.emitToSinks(telemetryEntry);
  }

  /**
   * Record an execution event.
   */
  async recordExecution(options: {
    entityPath: EntityPath;
    action: string;
    receiptId: string;
    success: boolean;
    error?: string;
  }): Promise<void> {
    const entry: TelemetryEntry = {
      type: 'execution',
      timestamp: new Date().toISOString(),
      entity_path: options.entityPath,
      data: {
        action: options.action,
        receipt_id: options.receiptId,
        success: options.success,
        error: options.error,
      },
    };

    await this.emitToSinks(entry);
  }

  /**
   * Record a Poison Pill broadcast.
   */
  async recordPoisonPill(options: {
    pillId: string;
    reason: string;
    revokedTokens: boolean;
    revokedReceipts: boolean;
  }): Promise<void> {
    const entry: TelemetryEntry = {
      type: 'poison_pill',
      timestamp: new Date().toISOString(),
      entity_path: '/',
      data: {
        pill_id: options.pillId,
        reason: options.reason,
        revoked_tokens: options.revokedTokens,
        revoked_receipts: options.revokedReceipts,
      },
    };

    await this.emitToSinks(entry);
  }

  /**
   * Verify the integrity of the audit chain.
   */
  async verifyAuditChain() {
    return this.chain.verifyIntegrity();
  }

  /**
   * Compute degradation score for an entity path.
   */
  async getDegradationScore(
    entityPath: EntityPath,
    windowMs: number = 3_600_000, // 1 hour default
  ): Promise<DegradationScore> {
    const now = Date.now();
    return this.scorer.computeScore(entityPath, now - windowMs, now);
  }

  /**
   * Detect drift patterns for an entity path.
   */
  async detectDrift(entityPath: EntityPath): Promise<DriftResult> {
    return this.driftDetector.detectDrift(entityPath);
  }

  /**
   * Get decision statistics for a time window.
   */
  async getStats(windowMs: number = 3_600_000): Promise<DecisionStats> {
    const now = Date.now();
    const windowStart = now - windowMs;
    const length = await this.chain.getLength();

    if (length === 0) {
      return {
        total: 0,
        by_outcome: { allowed: 0, denied: 0, approval_required: 0 },
        by_action: {},
        window_start: new Date(windowStart).toISOString(),
        window_end: new Date(now).toISOString(),
      };
    }

    const entries = await this.chain.getRange(0, length - 1);
    const windowEntries = entries.filter(e => {
      const ts = new Date(e.timestamp).getTime();
      return ts >= windowStart && ts <= now;
    });

    const byOutcome: Record<DecisionOutcome, number> = {
      allowed: 0,
      denied: 0,
      approval_required: 0,
    };

    const byAction: Record<string, number> = {};

    for (const entry of windowEntries) {
      byOutcome[entry.outcome]++;
      byAction[entry.action] = (byAction[entry.action] ?? 0) + 1;
    }

    return {
      total: windowEntries.length,
      by_outcome: byOutcome,
      by_action: byAction,
      window_start: new Date(windowStart).toISOString(),
      window_end: new Date(now).toISOString(),
    };
  }

  /**
   * Emit a telemetry entry to all configured sinks.
   */
  private async emitToSinks(entry: TelemetryEntry): Promise<void> {
    await Promise.all(this.sinks.map(s => s.write(entry)));
  }
}
