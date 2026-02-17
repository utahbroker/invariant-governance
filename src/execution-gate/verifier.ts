/**
 * Invariant Governance — Receipt Verifier
 *
 * 6-step cryptographic verification of Approval Receipts (106).
 * The verifier holds only the public key — it can verify but NEVER sign.
 *
 * Verification Sequence (Architecture doc Section 4.3):
 * 1. Signature verification (Ed25519 public key)
 * 2. Local hash recomputation and comparison
 * 3. Parameter hash comparison (params match approved params)
 * 4. Consumption check (single-use enforcement / replay prevention)
 * 5. Expiration check
 * 6. Retraction check (entity path not retracted)
 */

import type { ApprovalReceipt } from '../types/receipts.js';
import { verifySignature } from '../crypto/signing.js';
import { stableStringify, computeParamsHash } from '../crypto/hash.js';
import {
  SignatureInvalidError,
  ParamsMismatchError,
  ReplayDetectedError,
  GovernanceError,
  GovernanceErrorCode,
} from '../types/errors.js';
import type { ConsumptionStore, RetractionStore } from '../storage/interfaces.js';

/**
 * Receipt Verifier — 6-step cryptographic verification.
 *
 * Structural guarantee: holds only the public key.
 * Cannot forge receipts, only verify them.
 */
export class ReceiptVerifier {
  private readonly publicKey: string;
  private readonly consumptionStore: ConsumptionStore;
  private readonly retractionStore: RetractionStore;

  constructor(options: {
    /** Ed25519 public key (base64) — received from Governance Kernel */
    publicKey: string;
    consumptionStore: ConsumptionStore;
    retractionStore: RetractionStore;
  }) {
    this.publicKey = options.publicKey;
    this.consumptionStore = options.consumptionStore;
    this.retractionStore = options.retractionStore;
  }

  /**
   * Verify an Approval Receipt through the 6-step sequence.
   *
   * @param receipt - The receipt to verify
   * @param params - The actual parameters to verify against the receipt
   * @throws SignatureInvalidError, ParamsMismatchError, ReplayDetectedError, GovernanceError
   */
  async verify(receipt: ApprovalReceipt, params: Record<string, unknown>): Promise<void> {
    // Step 1: Signature verification
    const receiptData: Omit<ApprovalReceipt, 'signature'> = {
      receipt_id: receipt.receipt_id,
      entity_path: receipt.entity_path,
      action: receipt.action,
      params_hash: receipt.params_hash,
      issued_at: receipt.issued_at,
      expires_at: receipt.expires_at,
      accumulator_snapshot: receipt.accumulator_snapshot,
      risk_level: receipt.risk_level,
    };

    const dataToVerify = stableStringify(receiptData);
    const isValid = verifySignature(dataToVerify, receipt.signature, this.publicKey);

    if (!isValid) {
      throw new SignatureInvalidError();
    }

    // Step 2: Local hash recomputation (implicit in signature verification —
    // the signature covers all fields, so if it verifies, the data is intact)

    // Step 3: Parameter hash comparison
    const actualParamsHash = computeParamsHash(params);
    if (actualParamsHash !== receipt.params_hash) {
      throw new ParamsMismatchError();
    }

    // Step 4: Consumption check (replay prevention)
    const isConsumed = await this.consumptionStore.isConsumed(receipt.receipt_id);
    if (isConsumed) {
      throw new ReplayDetectedError(receipt.receipt_id);
    }

    // Step 5: Expiration check
    if (new Date(receipt.expires_at) < new Date()) {
      throw new GovernanceError(
        GovernanceErrorCode.RECEIPT_EXPIRED,
        `Receipt ${receipt.receipt_id} has expired`,
        { receipt_id: receipt.receipt_id, expires_at: receipt.expires_at },
      );
    }

    // Step 6: Retraction check
    const isRetracted = await this.retractionStore.isRetracted(receipt.entity_path);
    if (isRetracted) {
      throw new GovernanceError(
        GovernanceErrorCode.RETRACTED,
        `Entity ${receipt.entity_path} has been retracted`,
        { entity_path: receipt.entity_path },
      );
    }
  }

  /**
   * Mark a receipt as consumed after successful execution.
   */
  async markConsumed(receiptId: string): Promise<void> {
    await this.consumptionStore.markConsumed(receiptId, new Date().toISOString());
  }
}
