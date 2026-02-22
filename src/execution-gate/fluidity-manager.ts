// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Holladay Labs IP, LLC

/**
 * Invariant Governance — Fluidity Token Manager
 *
 * Local budget tracking and scope enforcement for Fluidity Tokens (104).
 * The manager decrements the token's risk budget on each micro-action
 * and enforces scope constraints.
 *
 * Architecture doc Section 7.2
 */

import type { FluidityToken } from '../types/receipts.js';
import { verifySignature } from '../crypto/signing.js';
import { stableStringify } from '../crypto/hash.js';
import { matchActionPattern } from '../types/policy.js';
import {
  BudgetExhaustedError,
  ScopeViolationError,
  SignatureInvalidError,
  GovernanceError,
  GovernanceErrorCode,
} from '../types/errors.js';
import type { TokenStore } from '../storage/interfaces.js';

/**
 * Fluidity Manager — local token budget tracking.
 *
 * Enforces:
 * - Signature verification (token is authentic)
 * - Scope constraints (action is permitted)
 * - Budget limits (remaining_budget >= delta_s)
 * - Single-action limits (delta_s <= max_single_action)
 * - Expiration (token is still valid)
 */
export class FluidityManager {
  private readonly publicKey: string;
  private readonly tokenStore: TokenStore;

  constructor(options: {
    publicKey: string;
    tokenStore: TokenStore;
  }) {
    this.publicKey = options.publicKey;
    this.tokenStore = options.tokenStore;
  }

  /**
   * Validate and consume budget from a Fluidity Token.
   *
   * @param tokenId - The token to use
   * @param action - The action being performed
   * @param deltaS - The state-change magnitude of this micro-action
   * @returns Updated token with decremented budget
   */
  async consume(tokenId: string, action: string, deltaS: number): Promise<FluidityToken> {
    // Load token
    const token = await this.tokenStore.get(tokenId);
    if (!token) {
      throw new GovernanceError(
        GovernanceErrorCode.VALIDATION_ERROR,
        `Fluidity Token ${tokenId} not found`,
      );
    }

    // Verify signature
    const tokenData: Omit<FluidityToken, 'signature'> = {
      token_id: token.token_id,
      entity_path: token.entity_path,
      risk_budget: token.risk_budget,
      remaining_budget: token.risk_budget, // Verify against original budget
      scope: token.scope,
      issued_at: token.issued_at,
      expires_at: token.expires_at,
    };

    const dataToVerify = stableStringify(tokenData);
    if (!verifySignature(dataToVerify, token.signature, this.publicKey)) {
      throw new SignatureInvalidError();
    }

    // Check expiration
    if (new Date(token.expires_at) < new Date()) {
      throw new GovernanceError(
        GovernanceErrorCode.RECEIPT_EXPIRED,
        `Fluidity Token ${tokenId} has expired`,
      );
    }

    // Check scope
    const inScope = token.scope.permitted_actions.some(
      pattern => matchActionPattern(action, pattern),
    );
    if (!inScope) {
      throw new ScopeViolationError(action, token.scope.permitted_actions);
    }

    // Check single-action limit
    if (deltaS > token.scope.max_single_action) {
      throw new GovernanceError(
        GovernanceErrorCode.VALIDATION_ERROR,
        `Action magnitude ${deltaS} exceeds single-action limit ${token.scope.max_single_action}`,
      );
    }

    // Check budget
    if (deltaS > token.remaining_budget) {
      throw new BudgetExhaustedError(token.remaining_budget, deltaS);
    }

    // Decrement budget
    const updated: FluidityToken = {
      ...token,
      remaining_budget: token.remaining_budget - deltaS,
    };

    await this.tokenStore.update(updated);
    return updated;
  }
}
