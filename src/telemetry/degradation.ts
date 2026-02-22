// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Holladay Labs IP, LLC

/**
 * Invariant Governance — Degradation Score
 *
 * Computes Integrated Systemic Entropy (ISE) over a sliding window.
 * Detects systemic drift where behavior gradually degrades.
 *
 * Architecture doc Section 5.3
 */

import type { EntityPath } from '../types/common.js';
import type { DegradationScore } from '../types/decisions.js';
import type { AuditStore } from '../storage/interfaces.js';

/**
 * Compute degradation score for an entity path.
 *
 * ISE factors:
 * - Denial rate (denials / total)
 * - Approval-required rate
 * - Risk level distribution
 * - Anomaly count (unusual patterns)
 */
export class DegradationScorer {
  private readonly store: AuditStore;

  constructor(store: AuditStore) {
    this.store = store;
  }

  /**
   * Compute the degradation score for an entity path over a window.
   */
  async computeScore(
    entityPath: EntityPath,
    windowStartMs: number,
    windowEndMs: number,
  ): Promise<DegradationScore> {
    const length = await this.store.getLength();
    if (length === 0) {
      return {
        entity_path: entityPath,
        ise: 0,
        drift_detected: false,
        anomaly_count: 0,
        window_start: new Date(windowStartMs).toISOString(),
        window_end: new Date(windowEndMs).toISOString(),
      };
    }

    // Get all entries in the window for this entity path
    const allEntries = await this.store.getRange(0, length - 1);
    const entries = allEntries.filter(e => {
      const ts = new Date(e.timestamp).getTime();
      return e.entity_path === entityPath && ts >= windowStartMs && ts <= windowEndMs;
    });

    if (entries.length === 0) {
      return {
        entity_path: entityPath,
        ise: 0,
        drift_detected: false,
        anomaly_count: 0,
        window_start: new Date(windowStartMs).toISOString(),
        window_end: new Date(windowEndMs).toISOString(),
      };
    }

    // Compute ISE components
    const total = entries.length;
    const denials = entries.filter(e => e.outcome === 'denied').length;
    const approvalRequired = entries.filter(e => e.outcome === 'approval_required').length;
    const criticalActions = entries.filter(e => e.risk_level === 'critical').length;
    const highActions = entries.filter(e => e.risk_level === 'high').length;

    // Denial rate contributes heavily to ISE
    const denialRate = denials / total;
    // Approval-required rate indicates elevated risk behavior
    const approvalRate = approvalRequired / total;
    // Risk-weighted action rate
    const riskRate = (criticalActions * 4 + highActions * 2) / (total * 4);

    // ISE: weighted combination normalized to 0-1
    const ise = Math.min(1, denialRate * 0.4 + approvalRate * 0.3 + riskRate * 0.3);

    // Drift detection: ISE above 0.3 suggests systemic drift
    const driftDetected = ise > 0.3;

    // Anomaly count: denials are the primary anomaly signal
    const anomalyCount = denials + criticalActions;

    return {
      entity_path: entityPath,
      ise: Math.round(ise * 1000) / 1000, // 3 decimal places
      drift_detected: driftDetected,
      anomaly_count: anomalyCount,
      window_start: new Date(windowStartMs).toISOString(),
      window_end: new Date(windowEndMs).toISOString(),
    };
  }
}
