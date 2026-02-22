// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Holladay Labs IP, LLC

/**
 * Invariant Governance — Fluidity Token Issuer
 *
 * Issues Speculative Fluidity Tokens (Tf) (104) for high-frequency
 * and high-latency environments. A Fluidity Token grants bounded
 * execution authority that is consumed incrementally.
 *
 * Architecture doc Section 7.2:
 *   - risk_budget (beta): total state-change budget
 *   - scope (sigma): permitted action patterns + max single action
 *   - expiration: time-bounded validity
 *
 * Only the Governance Kernel (100) can issue tokens.
 */

import type { FluidityToken, FluidityTokenRequest } from '../types/receipts.js';
import { signData } from '../crypto/signing.js';
import { stableStringify } from '../crypto/hash.js';
import { generateTokenId } from '../crypto/ids.js';
import { parseDuration } from '../types/common.js';
import { GovernanceError, GovernanceErrorCode } from '../types/errors.js';

/**
 * Fluidity Token Issuer — creates signed pre-authorization tokens.
 *
 * The token binds:
 *   - WHO: entity_path
 *   - WHAT: scope.permitted_actions
 *   - HOW MUCH: risk_budget (consumed incrementally)
 *   - WHEN: issued_at + expires_at
 *   - PROOF: Ed25519 signature
 */
export class FluidityIssuer {
  private readonly privateKey: string;
  private readonly maxBudget: number;

  constructor(options: {
    /** Ed25519 private key (base64) — MUST stay in Authority Plane */
    privateKey: string;
    /** Maximum risk budget that can be granted to a single token */
    maxBudget: number;
  }) {
    this.privateKey = options.privateKey;
    this.maxBudget = options.maxBudget;
  }

  /**
   * Issue a Fluidity Token for pre-authorized bounded execution.
   *
   * @throws GovernanceError if requested budget exceeds maximum
   */
  issue(request: FluidityTokenRequest): FluidityToken {
    // Validate budget
    if (request.risk_budget > this.maxBudget) {
      throw new GovernanceError(
        GovernanceErrorCode.VALIDATION_ERROR,
        `Requested budget ${request.risk_budget} exceeds maximum ${this.maxBudget}`,
        { requested: request.risk_budget, max: this.maxBudget },
      );
    }

    if (request.risk_budget <= 0) {
      throw new GovernanceError(
        GovernanceErrorCode.VALIDATION_ERROR,
        'Risk budget must be positive',
      );
    }

    if (request.scope.permitted_actions.length === 0) {
      throw new GovernanceError(
        GovernanceErrorCode.VALIDATION_ERROR,
        'Fluidity Token must have at least one permitted action',
      );
    }

    const now = new Date();
    const durationMs = parseDuration(request.duration);
    const expiresAt = new Date(now.getTime() + durationMs);

    const token: Omit<FluidityToken, 'signature'> = {
      token_id: generateTokenId(),
      entity_path: request.entity_path,
      risk_budget: request.risk_budget,
      remaining_budget: request.risk_budget,
      scope: request.scope,
      issued_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
    };

    // Sign the token
    const dataToSign = stableStringify(token);
    const signature = signData(dataToSign, this.privateKey);

    return { ...token, signature };
  }
}
