// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Holladay Labs IP, LLC

/**
 * Invariant Governance — Hash-Chained Audit Log
 *
 * Append-only, tamper-evident decision log. Each entry contains:
 * - entry_hash: SHA-256 of this entry's contents
 * - prev_hash: SHA-256 of the previous entry (chain linkage)
 *
 * Any modification to any entry breaks the chain, making
 * tampering detectable by verifyChainIntegrity().
 */

import type { AuditEntry, ChainVerification } from '../types/decisions.js';
import type { EntityPath, RiskLevel, DecisionOutcome } from '../types/common.js';
import type { AuditStore } from '../storage/interfaces.js';
import { computeEntryHash } from '../crypto/hash.js';
import { generateEntryId } from '../crypto/ids.js';

/** Genesis hash — the prev_hash for the first entry in the chain */
const GENESIS_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

/**
 * Audit Chain — append-only hash-chained decision log.
 *
 * Structural guarantee: the Telemetry Observer has NO mutation methods.
 * It can only append entries and read the chain. It cannot modify
 * governance decisions, execute actions, or sign receipts.
 */
export class AuditChain {
  private readonly store: AuditStore;

  constructor(store: AuditStore) {
    this.store = store;
  }

  /**
   * Append a decision to the audit chain.
   */
  async append(options: {
    entityPath: EntityPath;
    action: string;
    outcome: DecisionOutcome;
    reason?: string;
    paramsHash: string;
    receiptId?: string;
    riskLevel?: RiskLevel;
  }): Promise<AuditEntry> {
    // Get previous entry for chain linkage
    const latest = await this.store.getLatest();
    const prevHash = latest?.entry_hash ?? GENESIS_HASH;
    const sequence = latest ? latest.sequence + 1 : 0;

    // Build entry (without entry_hash — we compute it below)
    const entryData = {
      entry_id: generateEntryId(),
      sequence,
      timestamp: new Date().toISOString(),
      entity_path: options.entityPath,
      action: options.action,
      outcome: options.outcome,
      reason: options.reason,
      params_hash: options.paramsHash,
      receipt_id: options.receiptId,
      risk_level: options.riskLevel,
      prev_hash: prevHash,
    };

    // Compute entry hash
    const entryHash = computeEntryHash(entryData);

    const entry: AuditEntry = {
      ...entryData,
      entry_hash: entryHash,
    };

    await this.store.append(entry);
    return entry;
  }

  /**
   * Verify the integrity of the entire audit chain.
   * Detects any tampering with entries or chain linkage.
   */
  async verifyIntegrity(): Promise<ChainVerification> {
    const length = await this.store.getLength();
    if (length === 0) {
      return { valid: true, checked: 0, errors: [] };
    }

    const errors: string[] = [];
    let prevHash = GENESIS_HASH;

    for (let i = 0; i < length; i++) {
      const entry = await this.store.getBySequence(i);
      if (!entry) {
        errors.push(`Entry at sequence ${i} is missing`);
        continue;
      }

      // Check prev_hash linkage
      if (entry.prev_hash !== prevHash) {
        errors.push(
          `Chain break at sequence ${i}: expected prev_hash ${prevHash}, got ${entry.prev_hash}`,
        );
      }

      // Recompute entry hash and compare
      const recomputed = computeEntryHash({
        entry_id: entry.entry_id,
        sequence: entry.sequence,
        timestamp: entry.timestamp,
        entity_path: entry.entity_path,
        action: entry.action,
        outcome: entry.outcome,
        reason: entry.reason,
        params_hash: entry.params_hash,
        receipt_id: entry.receipt_id,
        risk_level: entry.risk_level,
        prev_hash: entry.prev_hash,
      });

      if (recomputed !== entry.entry_hash) {
        errors.push(
          `Tampered entry at sequence ${i}: expected hash ${recomputed}, got ${entry.entry_hash}`,
        );
      }

      prevHash = entry.entry_hash;
    }

    return {
      valid: errors.length === 0,
      checked: length,
      errors,
    };
  }

  /**
   * Get the current chain length.
   */
  async getLength(): Promise<number> {
    return this.store.getLength();
  }

  /**
   * Get the latest entry.
   */
  async getLatest(): Promise<AuditEntry | null> {
    return this.store.getLatest();
  }

  /**
   * Get entries in a range.
   */
  async getRange(startSequence: number, endSequence: number): Promise<AuditEntry[]> {
    return this.store.getRange(startSequence, endSequence);
  }
}
