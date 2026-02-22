// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Holladay Labs IP, LLC

/**
 * Integration Test: Poison Pill (302)
 *
 * Emergency halt propagation. When a Poison Pill is broadcast:
 * 1. All outstanding tokens are revoked
 * 2. All outstanding receipts are revoked
 * 3. The Gate enters lockdown
 * 4. All execution is blocked until human review
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  GovernanceKernel,
  ExecutionGate,
  InMemoryStorageAdapter,
  LockdownError,
} from '../../src/index.js';
import type { PolicyMatrix, AuthorityManifest } from '../../src/index.js';

describe('Poison Pill: Emergency Halt', () => {
  let kernel: GovernanceKernel;
  let gate: ExecutionGate;
  let storage: InMemoryStorageAdapter;

  const policy: PolicyMatrix = {
    maxSingleAction: 1000,
    maxCumulativeWindow: 5000,
    windowDuration: '1h',
  };

  const manifest: AuthorityManifest = {
    manifest_id: 'test',
    version: '1.0.0',
    entity_path: '/org',
    effective_date: new Date().toISOString(),
    agents: {
      'bot': { allowed: ['*'] },
    },
  };

  beforeEach(async () => {
    storage = new InMemoryStorageAdapter();
    kernel = new GovernanceKernel({ policy, storage });
    gate = new ExecutionGate({ publicKey: kernel.publicKey, storage });
    await kernel.registerManifest(manifest);
  });

  it('should block all execution after Poison Pill', async () => {
    // Get a valid receipt first
    const result = await kernel.evaluate({
      entity_path: '/org/bot',
      action: 'data.read',
      delta_s: 10,
      params: { id: 1 },
    });
    expect(result.receipt).toBeDefined();

    // Broadcast Poison Pill
    const pill = await kernel.poisonPill({
      reason: 'Security incident detected',
      revokeFluidityTokens: true,
      revokeApprovalReceipts: true,
    });

    expect(pill.pill_id).toBeDefined();
    expect(pill.signature).toBeDefined();

    // Gate should reject execution
    await expect(
      gate.execute(result.receipt!, { id: 1 }, async () => 'should not run'),
    ).rejects.toThrow(LockdownError);

    // Kernel should reject new evaluations
    await expect(
      kernel.evaluate({
        entity_path: '/org/bot',
        action: 'data.read',
        delta_s: 10,
        params: { id: 2 },
      }),
    ).rejects.toThrow(LockdownError);
  });

  it('should resume after human review clears lockdown', async () => {
    // Broadcast Poison Pill
    await kernel.poisonPill({
      reason: 'False alarm',
      revokeFluidityTokens: true,
      revokeApprovalReceipts: true,
    });

    // Verify lockdown
    await expect(
      kernel.evaluate({
        entity_path: '/org/bot',
        action: 'data.read',
        delta_s: 10,
        params: {},
      }),
    ).rejects.toThrow(LockdownError);

    // Human review clears lockdown
    await kernel.clearLockdown();

    // Should work again
    const result = await kernel.evaluate({
      entity_path: '/org/bot',
      action: 'data.read',
      delta_s: 10,
      params: { after: 'review' },
    });

    expect(result.evaluation.outcome).toBe('allowed');
  });
});
