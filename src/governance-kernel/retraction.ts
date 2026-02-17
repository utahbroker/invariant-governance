/**
 * Invariant Governance — Retraction & Poison Pill
 *
 * Retraction cascade: retracting an entity path cascades to all descendants.
 * Poison Pill (302): emergency halt that revokes all outstanding tokens
 * and receipts, entering lockdown state.
 *
 * Ported from homerhq-bot-empire kill.ts cascade logic.
 */

import type { EntityPath } from '../types/common.js';
import type { PoisonPillOptions, PoisonPillRecord, RetractionRecord } from '../types/receipts.js';
import type { RetractionStore, PoisonPillStore, ReceiptStore, TokenStore } from '../storage/interfaces.js';
import { signData } from '../crypto/signing.js';
import { stableStringify } from '../crypto/hash.js';
import { generatePillId } from '../crypto/ids.js';

/**
 * Retraction Manager — handles entity retraction and Poison Pill broadcast.
 */
export class RetractionManager {
  private readonly retractionStore: RetractionStore;
  private readonly poisonPillStore: PoisonPillStore;
  private readonly receiptStore: ReceiptStore;
  private readonly tokenStore: TokenStore;
  private readonly privateKey: string;

  constructor(options: {
    retractionStore: RetractionStore;
    poisonPillStore: PoisonPillStore;
    receiptStore: ReceiptStore;
    tokenStore: TokenStore;
    /** Ed25519 private key for signing Poison Pill records */
    privateKey: string;
  }) {
    this.retractionStore = options.retractionStore;
    this.poisonPillStore = options.poisonPillStore;
    this.receiptStore = options.receiptStore;
    this.tokenStore = options.tokenStore;
    this.privateKey = options.privateKey;
  }

  /**
   * Retract an entity path. All descendants are also retracted
   * because isRetracted() checks ancestor paths.
   */
  async retract(entityPath: EntityPath, reason: string, retractedBy: string): Promise<RetractionRecord> {
    const record: RetractionRecord = {
      entity_path: entityPath,
      reason,
      retracted_by: retractedBy,
      retracted_at: new Date().toISOString(),
    };

    await this.retractionStore.retract(record);
    return record;
  }

  /**
   * Check if an entity path is retracted (including ancestor check).
   */
  async isRetracted(entityPath: EntityPath): Promise<boolean> {
    return this.retractionStore.isRetracted(entityPath);
  }

  /**
   * Reinstate a previously retracted entity path.
   */
  async reinstate(entityPath: EntityPath): Promise<void> {
    await this.retractionStore.reinstate(entityPath);
  }

  /**
   * Broadcast a Poison Pill (302) — emergency halt.
   *
   * This is the nuclear option:
   * 1. Revokes all outstanding Fluidity Tokens
   * 2. Revokes all outstanding Approval Receipts
   * 3. Enters lockdown state (Gate rejects all requests)
   * 4. Requires human review to clear
   */
  async broadcastPoisonPill(options: PoisonPillOptions): Promise<PoisonPillRecord> {
    // Revoke Fluidity Tokens
    if (options.revokeFluidityTokens) {
      await this.tokenStore.revokeAll();
    }

    // Revoke Approval Receipts
    if (options.revokeApprovalReceipts) {
      await this.receiptStore.revokeAll();
    }

    const record: Omit<PoisonPillRecord, 'signature'> = {
      pill_id: generatePillId(),
      reason: options.reason,
      broadcast_at: new Date().toISOString(),
      revoked: {
        fluidity_tokens: options.revokeFluidityTokens,
        approval_receipts: options.revokeApprovalReceipts,
      },
    };

    // Sign the Poison Pill record
    const dataToSign = stableStringify(record);
    const signature = signData(dataToSign, this.privateKey);

    const signedRecord: PoisonPillRecord = { ...record, signature };

    // Store as active Poison Pill
    await this.poisonPillStore.store(signedRecord);

    return signedRecord;
  }

  /**
   * Check if the system is in lockdown (active Poison Pill).
   */
  async isLockdown(): Promise<boolean> {
    const active = await this.poisonPillStore.getActive();
    return active !== null;
  }

  /**
   * Clear lockdown state after human review.
   */
  async clearLockdown(): Promise<void> {
    await this.poisonPillStore.clearActive();
  }
}
