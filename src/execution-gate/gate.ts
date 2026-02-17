/**
 * Invariant Governance — Execution Gate (200)
 *
 * The Execution Gate lives in the Execution Plane (20). It wraps
 * action execution with cryptographic receipt verification.
 *
 * Structural guarantees:
 * - Holds only the PUBLIC key (can verify, NEVER sign)
 * - Has NO evaluate() method (cannot make governance decisions)
 * - Has NO sign() method (cannot forge receipts)
 * - Can only execute actions that have valid Approval Receipts
 *
 * Architecture doc Section 4
 */

import type { ApprovalReceipt, ExecutionResult } from '../types/receipts.js';
import type { StorageAdapter } from '../storage/interfaces.js';
import { ReceiptVerifier } from './verifier.js';
import { FluidityManager } from './fluidity-manager.js';
import { PoisonPillHandler } from './poison-pill-handler.js';

/** Options for creating an Execution Gate */
export interface ExecutionGateOptions {
  /** Ed25519 public key (base64) — received from Governance Kernel across Sovereign Boundary */
  publicKey: string;
  /** Storage adapter */
  storage: StorageAdapter;
}

/**
 * Execution Gate (200) — Execution Plane component.
 *
 * Wraps action execution with receipt verification.
 * The Gate is structurally incapable of:
 * - Making governance decisions (no evaluate())
 * - Signing receipts (no private key)
 * - Bypassing verification (execute requires valid receipt)
 */
export class ExecutionGate {
  private readonly verifier: ReceiptVerifier;
  private readonly fluidityManager: FluidityManager;
  private readonly poisonPillHandler: PoisonPillHandler;

  constructor(options: ExecutionGateOptions) {
    this.verifier = new ReceiptVerifier({
      publicKey: options.publicKey,
      consumptionStore: options.storage.consumption,
      retractionStore: options.storage.retractions,
    });

    this.fluidityManager = new FluidityManager({
      publicKey: options.publicKey,
      tokenStore: options.storage.tokens,
    });

    this.poisonPillHandler = new PoisonPillHandler(options.storage.poisonPills);
  }

  /**
   * Execute an action with Approval Receipt verification.
   *
   * Pipeline:
   * 1. Check lockdown (Poison Pill)
   * 2. Verify receipt (6-step cryptographic verification)
   * 3. Execute the action
   * 4. Mark receipt as consumed (single-use)
   * 5. Return execution result
   *
   * @param receipt - Signed Approval Receipt from the Governance Kernel
   * @param params - Action parameters (must match receipt's params_hash)
   * @param action - The function to execute
   * @returns ExecutionResult with success/failure and receipt ID
   */
  async execute<T>(
    receipt: ApprovalReceipt,
    params: Record<string, unknown>,
    action: () => Promise<T>,
  ): Promise<ExecutionResult<T>> {
    // Step 1: Check lockdown
    await this.poisonPillHandler.assertNotLockdown();

    // Step 2: Verify receipt (6-step)
    await this.verifier.verify(receipt, params);

    // Step 3: Execute the action
    try {
      const result = await action();

      // Step 4: Mark receipt as consumed (single-use enforcement)
      await this.verifier.markConsumed(receipt.receipt_id);

      // Step 5: Return success
      return {
        success: true,
        result,
        receipt_id: receipt.receipt_id,
        executed_at: new Date().toISOString(),
      };
    } catch (error) {
      // Execution failed — receipt is NOT consumed (can be retried)
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        receipt_id: receipt.receipt_id,
        executed_at: new Date().toISOString(),
      };
    }
  }

  /**
   * Execute an action using a Fluidity Token (pre-authorization).
   *
   * For high-frequency or high-latency environments where obtaining
   * individual receipts is impractical.
   *
   * @param tokenId - Fluidity Token ID
   * @param actionName - The action being performed (must be within token scope)
   * @param deltaS - State-change magnitude of this micro-action
   * @param action - The function to execute
   */
  async executeWithToken<T>(
    tokenId: string,
    actionName: string,
    deltaS: number,
    action: () => Promise<T>,
  ): Promise<ExecutionResult<T>> {
    // Check lockdown
    await this.poisonPillHandler.assertNotLockdown();

    // Validate and consume budget
    await this.fluidityManager.consume(tokenId, actionName, deltaS);

    // Execute
    try {
      const result = await action();
      return {
        success: true,
        result,
        receipt_id: tokenId,
        executed_at: new Date().toISOString(),
      };
    } catch (error) {
      // Note: budget is already consumed even on failure
      // This is by design — the token tracks risk exposure, not success
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        receipt_id: tokenId,
        executed_at: new Date().toISOString(),
      };
    }
  }
}
