/**
 * Invariant Governance — Drift Detector
 *
 * Detects "salami-slicing" patterns where an entity repeatedly
 * performs small actions that individually pass but collectively
 * indicate adversarial or degraded behavior.
 *
 * Architecture doc Section 5.3
 */

import type { EntityPath } from '../types/common.js';
import type { AuditEntry } from '../types/decisions.js';
import type { AuditStore } from '../storage/interfaces.js';

/** Drift detection result */
export interface DriftResult {
  /** Whether drift was detected */
  detected: boolean;
  /** Pattern type if detected */
  pattern?: 'salami_slicing' | 'escalation' | 'repetition';
  /** Description of the detected pattern */
  description?: string;
  /** Relevant entries */
  evidence?: AuditEntry[];
}

/**
 * Drift Detector — identifies adversarial behavioral patterns.
 */
export class DriftDetector {
  private readonly store: AuditStore;

  constructor(store: AuditStore) {
    this.store = store;
  }

  /**
   * Check for drift patterns in an entity's recent behavior.
   */
  async detectDrift(entityPath: EntityPath, windowEntries: number = 100): Promise<DriftResult> {
    const length = await this.store.getLength();
    if (length === 0) {
      return { detected: false };
    }

    const start = Math.max(0, length - windowEntries);
    const entries = await this.store.getRange(start, length - 1);
    const entityEntries = entries.filter(e => e.entity_path === entityPath);

    if (entityEntries.length < 3) {
      return { detected: false };
    }

    // Check for salami-slicing: many small allowed actions in rapid succession
    const salamiResult = this.detectSalamiSlicing(entityEntries);
    if (salamiResult.detected) return salamiResult;

    // Check for escalation: increasing denial rate over time
    const escalationResult = this.detectEscalation(entityEntries);
    if (escalationResult.detected) return escalationResult;

    // Check for repetition: same action repeated excessively
    const repetitionResult = this.detectRepetition(entityEntries);
    if (repetitionResult.detected) return repetitionResult;

    return { detected: false };
  }

  /**
   * Detect salami-slicing: many small allowed actions suggest
   * an entity is trying to stay below thresholds.
   */
  private detectSalamiSlicing(entries: AuditEntry[]): DriftResult {
    const allowed = entries.filter(e => e.outcome === 'allowed');
    if (allowed.length < 10) return { detected: false };

    // Check for high-frequency identical actions
    const actionCounts = new Map<string, number>();
    for (const e of allowed) {
      actionCounts.set(e.action, (actionCounts.get(e.action) ?? 0) + 1);
    }

    for (const [action, count] of actionCounts) {
      if (count >= 10 && count / allowed.length > 0.5) {
        return {
          detected: true,
          pattern: 'salami_slicing',
          description: `Action "${action}" repeated ${count} times (${Math.round(count / allowed.length * 100)}% of allowed actions) — possible salami-slicing`,
          evidence: allowed.filter(e => e.action === action).slice(-5),
        };
      }
    }

    return { detected: false };
  }

  /**
   * Detect escalation: increasing denial rate suggests
   * the entity is testing boundaries.
   */
  private detectEscalation(entries: AuditEntry[]): DriftResult {
    if (entries.length < 10) return { detected: false };

    const halfPoint = Math.floor(entries.length / 2);
    const firstHalf = entries.slice(0, halfPoint);
    const secondHalf = entries.slice(halfPoint);

    const firstDenialRate = firstHalf.filter(e => e.outcome === 'denied').length / firstHalf.length;
    const secondDenialRate = secondHalf.filter(e => e.outcome === 'denied').length / secondHalf.length;

    // Denial rate increased significantly
    if (secondDenialRate > firstDenialRate + 0.2 && secondDenialRate > 0.3) {
      return {
        detected: true,
        pattern: 'escalation',
        description: `Denial rate escalating: ${Math.round(firstDenialRate * 100)}% → ${Math.round(secondDenialRate * 100)}%`,
        evidence: secondHalf.filter(e => e.outcome === 'denied').slice(-5),
      };
    }

    return { detected: false };
  }

  /**
   * Detect repetition: same action repeated excessively
   * after being denied — probing for policy gaps.
   */
  private detectRepetition(entries: AuditEntry[]): DriftResult {
    const denied = entries.filter(e => e.outcome === 'denied');
    if (denied.length < 3) return { detected: false };

    // Check for the same action being denied repeatedly
    const deniedActions = new Map<string, number>();
    for (const e of denied) {
      deniedActions.set(e.action, (deniedActions.get(e.action) ?? 0) + 1);
    }

    for (const [action, count] of deniedActions) {
      if (count >= 3) {
        return {
          detected: true,
          pattern: 'repetition',
          description: `Action "${action}" denied ${count} times — possible probing`,
          evidence: denied.filter(e => e.action === action).slice(-5),
        };
      }
    }

    return { detected: false };
  }
}
