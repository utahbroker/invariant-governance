// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Holladay Labs IP, LLC

/**
 * Integration Test: Fluidity Token (104)
 *
 * Pre-authorization for high-frequency environments.
 * Budget decrement, exhaustion, scope enforcement, expiry.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  GovernanceKernel,
  ExecutionGate,
  InMemoryStorageAdapter,
  BudgetExhaustedError,
  ScopeViolationError,
} from '../../src/index.js';
import type { PolicyMatrix, AuthorityManifest } from '../../src/index.js';

describe('Fluidity Token: Pre-Authorization', () => {
  let kernel: GovernanceKernel;
  let gate: ExecutionGate;
  let storage: InMemoryStorageAdapter;

  const policy: PolicyMatrix = {
    maxSingleAction: 1000,
    maxCumulativeWindow: 5000,
    windowDuration: '1h',
  };

  beforeEach(async () => {
    storage = new InMemoryStorageAdapter();
    kernel = new GovernanceKernel({ policy, storage });
    gate = new ExecutionGate({ publicKey: kernel.publicKey, storage });
  });

  it('should issue and consume a fluidity token', async () => {
    const token = await kernel.issueFluidityToken({
      entity_path: '/org/bot',
      risk_budget: 100,
      scope: {
        permitted_actions: ['data.*'],
        max_single_action: 50,
      },
      duration: '1h',
    });

    expect(token.token_id).toMatch(/^ft_/);
    expect(token.risk_budget).toBe(100);
    expect(token.remaining_budget).toBe(100);
    expect(token.signature).toBeDefined();

    // Execute with the token
    const result = await gate.executeWithToken(
      token.token_id,
      'data.read',
      10,
      async () => 'result',
    );

    expect(result.success).toBe(true);
    expect(result.result).toBe('result');
  });

  it('should decrement budget on each use', async () => {
    const token = await kernel.issueFluidityToken({
      entity_path: '/org/bot',
      risk_budget: 30,
      scope: {
        permitted_actions: ['data.*'],
        max_single_action: 20,
      },
      duration: '1h',
    });

    // Use 10 budget (remaining: 20)
    await gate.executeWithToken(token.token_id, 'data.read', 10, async () => 'a');

    // Use another 10 (remaining: 10)
    await gate.executeWithToken(token.token_id, 'data.read', 10, async () => 'b');

    // Try to use 15 — within single-action limit (20) but exceeds remaining budget (10)
    await expect(
      gate.executeWithToken(token.token_id, 'data.read', 15, async () => 'fail'),
    ).rejects.toThrow(BudgetExhaustedError);
  });

  it('should enforce scope constraints', async () => {
    const token = await kernel.issueFluidityToken({
      entity_path: '/org/bot',
      risk_budget: 100,
      scope: {
        permitted_actions: ['data.*'],
        max_single_action: 50,
      },
      duration: '1h',
    });

    // Action outside scope should fail
    await expect(
      gate.executeWithToken(token.token_id, 'payment.charge', 10, async () => 'hacked'),
    ).rejects.toThrow(ScopeViolationError);
  });

  it('should enforce single-action limits', async () => {
    const token = await kernel.issueFluidityToken({
      entity_path: '/org/bot',
      risk_budget: 1000,
      scope: {
        permitted_actions: ['data.*'],
        max_single_action: 20,
      },
      duration: '1h',
    });

    // Action exceeding single-action limit should fail
    await expect(
      gate.executeWithToken(token.token_id, 'data.write', 25, async () => 'too big'),
    ).rejects.toThrow('single-action limit');
  });
});
