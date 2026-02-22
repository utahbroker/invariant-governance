// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Holladay Labs IP, LLC

/**
 * Integration Test: Accumulator Salami-Slicing
 *
 * Verifies that 1000 x $1 hits the same threshold as 1 x $1000.
 * The Stateful Accumulator prevents salami-slicing attacks.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  GovernanceKernel,
  InMemoryStorageAdapter,
  AccumulatorBreachError,
} from '../../src/index.js';
import type { PolicyMatrix, AuthorityManifest } from '../../src/index.js';

describe('Accumulator: Salami-Slicing Prevention', () => {
  let storage: InMemoryStorageAdapter;

  const policy: PolicyMatrix = {
    maxSingleAction: 1000,
    maxCumulativeWindow: 100, // Low threshold for testing
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
  });

  it('1 x $100 triggers threshold exactly at limit', async () => {
    const kernel = new GovernanceKernel({ policy, storage });
    await kernel.registerManifest(manifest);

    // $100 should succeed (equals threshold exactly)
    const result = await kernel.evaluate({
      entity_path: '/org/bot',
      action: 'transfer.funds',
      delta_s: 100,
      params: { amount: 100 },
    });

    expect(result.evaluation.outcome).toBe('allowed');
    expect(result.receipt).toBeDefined();
  });

  it('1 x $101 breaches threshold', async () => {
    const kernel = new GovernanceKernel({ policy, storage });
    await kernel.registerManifest(manifest);

    // $101 exceeds threshold
    await expect(
      kernel.evaluate({
        entity_path: '/org/bot',
        action: 'transfer.funds',
        delta_s: 101,
        params: { amount: 101 },
      }),
    ).rejects.toThrow(AccumulatorBreachError);
  });

  it('100 x $1 = same as 1 x $100 (salami-slicing prevention)', async () => {
    const kernel = new GovernanceKernel({ policy, storage });
    await kernel.registerManifest(manifest);

    // 100 small actions of $1 each
    for (let i = 0; i < 100; i++) {
      const result = await kernel.evaluate({
        entity_path: '/org/bot',
        action: 'transfer.funds',
        delta_s: 1,
        params: { amount: 1, iteration: i },
      });
      expect(result.evaluation.outcome).toBe('allowed');
    }

    // The 101st $1 action should breach (100 + 1 = 101 > 100)
    await expect(
      kernel.evaluate({
        entity_path: '/org/bot',
        action: 'transfer.funds',
        delta_s: 1,
        params: { amount: 1, iteration: 100 },
      }),
    ).rejects.toThrow(AccumulatorBreachError);
  });

  it('per-entity-path accumulation (no cross-contamination)', async () => {
    const kernel = new GovernanceKernel({ policy, storage });
    await kernel.registerManifest(manifest);

    // Bot A accumulates $90
    for (let i = 0; i < 9; i++) {
      await kernel.evaluate({
        entity_path: '/org/bot',
        action: 'transfer.funds',
        delta_s: 10,
        params: { amount: 10, bot: 'A', i },
      });
    }

    // A different manifest for bot-b
    await kernel.registerManifest({
      ...manifest,
      manifest_id: 'test-b',
      entity_path: '/org2',
      agents: { 'bot-b': { allowed: ['*'] } },
    });

    // Bot B should have its own clean accumulator
    const result = await kernel.evaluate({
      entity_path: '/org2/bot-b',
      action: 'transfer.funds',
      delta_s: 90,
      params: { amount: 90, bot: 'B' },
    });

    expect(result.evaluation.outcome).toBe('allowed');
  });
});
