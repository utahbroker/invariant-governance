/**
 * Invariant Governance — Receipt Issuer
 *
 * Issues cryptographically signed Approval Receipts (106).
 * Each receipt is non-fungible, single-use, and binds a specific action
 * to a specific context at a specific time via parameter hash.
 *
 * Only the Governance Kernel (100) can issue receipts because only it
 * holds the Ed25519 private key.
 */

import type { EntityPath, RiskLevel } from '../types/common.js';
import type { ApprovalReceipt, AccumulatorSnapshot } from '../types/receipts.js';
import { signData } from '../crypto/signing.js';
import { computeParamsHash, stableStringify } from '../crypto/hash.js';
import { generateReceiptId } from '../crypto/ids.js';
import { parseDuration } from '../types/common.js';
import type { Duration } from '../types/common.js';

/** Options for issuing an Approval Receipt */
export interface IssueReceiptOptions {
  entityPath: EntityPath;
  action: string;
  params: Record<string, unknown>;
  deltaS: number;
  riskLevel: RiskLevel;
  accumulatorSnapshot: AccumulatorSnapshot;
  /** Override default TTL for this receipt */
  ttl?: Duration;
}

/**
 * Receipt Issuer — creates signed Approval Receipts.
 *
 * The receipt binds:
 *   - WHO: entity_path
 *   - WHAT: action + params_hash
 *   - WHEN: issued_at + expires_at
 *   - HOW MUCH: accumulator_snapshot (delta_s)
 *   - PROOF: Ed25519 signature over all fields
 */
export class ReceiptIssuer {
  private readonly privateKey: string;
  private readonly defaultTtlMs: number;

  constructor(options: {
    /** Ed25519 private key (base64) — MUST stay in Authority Plane */
    privateKey: string;
    /** Default receipt TTL */
    defaultTtl?: Duration;
  }) {
    this.privateKey = options.privateKey;
    this.defaultTtlMs = parseDuration(options.defaultTtl ?? '5m');
  }

  /**
   * Issue an Approval Receipt for an authorized action.
   */
  issue(options: IssueReceiptOptions): ApprovalReceipt {
    const now = new Date();
    const ttlMs = options.ttl ? parseDuration(options.ttl) : this.defaultTtlMs;
    const expiresAt = new Date(now.getTime() + ttlMs);

    const receipt: Omit<ApprovalReceipt, 'signature'> = {
      receipt_id: generateReceiptId(),
      entity_path: options.entityPath,
      action: options.action,
      params_hash: computeParamsHash(options.params),
      issued_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
      accumulator_snapshot: options.accumulatorSnapshot,
      risk_level: options.riskLevel,
    };

    // Sign the receipt — this is the proof of authorization
    const dataToSign = stableStringify(receipt);
    const signature = signData(dataToSign, this.privateKey);

    return { ...receipt, signature };
  }
}
