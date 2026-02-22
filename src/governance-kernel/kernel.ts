// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Holladay Labs IP, LLC

/**
 * Invariant Governance — Governance Kernel (100)
 *
 * The Governance Kernel lives in the Authority Plane (10) and is the
 * SOLE authority for governance decisions. It:
 *   - Evaluates intent proposals against policy
 *   - Issues signed Approval Receipts (106)
 *   - Issues signed Fluidity Tokens (104)
 *   - Manages the Stateful Accumulator (102)
 *   - Handles retraction cascade and Poison Pill (302)
 *
 * The Kernel holds the Ed25519 private key. It can sign but NEVER execute.
 * Structural separation: the Kernel has no execute() method.
 */

import type { EntityPath, Duration } from '../types/common.js';
import type {
  IntentProposal,
  ApprovalReceipt,
  FluidityToken,
  FluidityTokenRequest,
  PoisonPillOptions,
  PoisonPillRecord,
  RetractionRecord,
} from '../types/receipts.js';
import type { PolicyMatrix, AuthorityManifest } from '../types/policy.js';
import type { StorageAdapter } from '../storage/interfaces.js';
import { generateKeyPair } from '../crypto/signing.js';
import type { KeyPair } from '../crypto/signing.js';
import { RetractedError, LockdownError } from '../types/errors.js';

import { StatefulAccumulator } from './accumulator.js';
import { PolicyEvaluator } from './policy-evaluator.js';
import type { PolicyEvaluation } from './policy-evaluator.js';
import { ReceiptIssuer } from './receipt-issuer.js';
import { FluidityIssuer } from './fluidity-issuer.js';
import { ManifestLoader } from './manifest-loader.js';
import { RetractionManager } from './retraction.js';

/** Options for creating a Governance Kernel */
export interface GovernanceKernelOptions {
  /** Policy matrix configuration */
  policy: PolicyMatrix;
  /** Storage adapter */
  storage: StorageAdapter;
  /** Pre-generated key pair (if not provided, one will be generated) */
  keyPair?: KeyPair;
  /** Default Approval Receipt TTL */
  receiptTtl?: Duration;
  /** Maximum Fluidity Token risk budget */
  maxFluidityBudget?: number;
}

/** Result of evaluating an intent proposal */
export interface EvaluationResult {
  /** Policy evaluation details */
  evaluation: PolicyEvaluation;
  /** Issued receipt (if outcome is 'allowed') */
  receipt?: ApprovalReceipt;
}

/**
 * Governance Kernel (100) — Authority Plane component.
 *
 * Structural guarantees:
 * - Has private key (can sign)
 * - Has NO execute() method (cannot run actions)
 * - All decisions are deterministic and auditable
 */
export class GovernanceKernel {
  private readonly accumulator: StatefulAccumulator;
  private readonly evaluator: PolicyEvaluator;
  private readonly receiptIssuer: ReceiptIssuer;
  private readonly fluidityIssuer: FluidityIssuer;
  private readonly manifestLoader: ManifestLoader;
  private readonly retractionManager: RetractionManager;
  private readonly storage: StorageAdapter;

  /** Public key — this crosses the Sovereign Boundary to the Gate */
  readonly publicKey: string;

  constructor(options: GovernanceKernelOptions) {
    const keyPair = options.keyPair ?? generateKeyPair();
    this.publicKey = keyPair.publicKey;
    this.storage = options.storage;

    this.accumulator = new StatefulAccumulator({
      threshold: options.policy.maxCumulativeWindow,
      windowDuration: options.policy.windowDuration,
      thresholdOverrides: options.policy.thresholds as Record<string, number> | undefined,
    });

    this.evaluator = new PolicyEvaluator(options.policy);

    this.receiptIssuer = new ReceiptIssuer({
      privateKey: keyPair.privateKey,
      defaultTtl: options.receiptTtl,
    });

    this.fluidityIssuer = new FluidityIssuer({
      privateKey: keyPair.privateKey,
      maxBudget: options.maxFluidityBudget ?? options.policy.maxCumulativeWindow,
    });

    this.manifestLoader = new ManifestLoader(options.storage.manifests);

    this.retractionManager = new RetractionManager({
      retractionStore: options.storage.retractions,
      poisonPillStore: options.storage.poisonPills,
      receiptStore: options.storage.receipts,
      tokenStore: options.storage.tokens,
      privateKey: keyPair.privateKey,
    });
  }

  /**
   * Evaluate an intent proposal and, if approved, issue an Approval Receipt.
   *
   * Pipeline:
   * 1. Check lockdown (Poison Pill active)
   * 2. Check retraction status
   * 3. Resolve effective authority manifest
   * 4. Evaluate against policy
   * 5. Check accumulator invariant
   * 6. Issue receipt (if allowed)
   * 7. Record in accumulator
   * 8. Store receipt
   */
  async evaluate(proposal: IntentProposal): Promise<EvaluationResult> {
    // Step 1: Check lockdown
    if (await this.retractionManager.isLockdown()) {
      throw new LockdownError();
    }

    // Step 2: Check retraction
    if (await this.retractionManager.isRetracted(proposal.entity_path)) {
      throw new RetractedError(proposal.entity_path);
    }

    // Step 3: Resolve effective authority
    const agentId = this.extractAgentId(proposal.entity_path);
    const permissions = await this.manifestLoader.getAgentPermissions(
      proposal.entity_path,
      agentId,
    );

    const authority = await this.manifestLoader.resolveEffectiveAuthority(proposal.entity_path);
    const manifestRef = authority?.manifest.manifest_id;

    // Step 4: Evaluate against policy
    const evaluation = this.evaluator.evaluate(proposal, permissions, manifestRef);

    // If not allowed, return early (no receipt)
    if (evaluation.outcome !== 'allowed') {
      return { evaluation };
    }

    // Step 5: Check accumulator invariant
    const snapshot = this.accumulator.check(proposal.entity_path, proposal.delta_s);

    // Step 6: Issue receipt
    const receipt = this.receiptIssuer.issue({
      entityPath: proposal.entity_path,
      action: proposal.action,
      params: proposal.params,
      deltaS: proposal.delta_s,
      riskLevel: evaluation.riskLevel,
      accumulatorSnapshot: snapshot,
    });

    // Step 7: Record in accumulator
    this.accumulator.record(proposal.entity_path, proposal.delta_s);

    // Step 8: Store receipt
    await this.storage.receipts.store(receipt);

    return { evaluation, receipt };
  }

  /**
   * Issue a Fluidity Token for pre-authorized bounded execution.
   */
  async issueFluidityToken(request: FluidityTokenRequest): Promise<FluidityToken> {
    // Check lockdown
    if (await this.retractionManager.isLockdown()) {
      throw new LockdownError();
    }

    // Check retraction
    if (await this.retractionManager.isRetracted(request.entity_path)) {
      throw new RetractedError(request.entity_path);
    }

    const token = this.fluidityIssuer.issue(request);
    await this.storage.tokens.store(token);
    return token;
  }

  /**
   * Retract an entity path (cascades to all descendants).
   */
  async retract(entityPath: EntityPath, reason: string, retractedBy: string): Promise<RetractionRecord> {
    return this.retractionManager.retract(entityPath, reason, retractedBy);
  }

  /**
   * Reinstate a previously retracted entity path.
   */
  async reinstate(entityPath: EntityPath): Promise<void> {
    return this.retractionManager.reinstate(entityPath);
  }

  /**
   * Broadcast a Poison Pill (302) — emergency halt.
   */
  async poisonPill(options: PoisonPillOptions): Promise<PoisonPillRecord> {
    return this.retractionManager.broadcastPoisonPill(options);
  }

  /**
   * Clear lockdown state after human review.
   */
  async clearLockdown(): Promise<void> {
    return this.retractionManager.clearLockdown();
  }

  /**
   * Register an Authority Manifest.
   */
  async registerManifest(manifest: AuthorityManifest): Promise<void> {
    await this.storage.manifests.store(manifest);
  }

  /**
   * Get the current accumulator value for an entity path.
   */
  getAccumulatorValue(entityPath: EntityPath): number {
    return this.accumulator.getCurrentValue(entityPath);
  }

  /**
   * Extract agent ID from entity path (last segment).
   */
  private extractAgentId(entityPath: EntityPath): string {
    const segments = entityPath.split('/').filter(s => s.length > 0);
    return segments[segments.length - 1] ?? '';
  }
}
