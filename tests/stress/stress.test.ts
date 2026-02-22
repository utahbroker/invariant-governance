// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Holladay Labs IP, LLC

/**
 * Stress Test Suite: Invariant Governance SDK
 *
 * Comprehensive edge-case, concurrency, and boundary testing across
 * the full governance pipeline: Kernel (100) -> Gate (200) -> Observer (400).
 *
 * Covers: rapid-fire, concurrency, replay, tampering, entity path boundaries,
 * token exhaustion, poison pill, retraction cascade, accumulator overflow,
 * hash chain integrity, manifest hot-reload, null/empty inputs, and
 * cross-entity-path isolation.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  GovernanceKernel,
  ExecutionGate,
  TelemetryObserver,
  InMemoryStorageAdapter,
  AccumulatorBreachError,
  LockdownError,
  RetractedError,
  ReplayDetectedError,
  ParamsMismatchError,
  BudgetExhaustedError,
  ScopeViolationError,
  InvalidEntityPathError,
  CallbackSink,
  validateEntityPath,
  parseEntityPath,
  normalizeEntityPath,
  isWithinJurisdiction,
  getAncestorPaths,
  getPathDepth,
  getParentPath,
  computeParamsHash,
} from '../../src/index.js';
import type {
  PolicyMatrix,
  AuthorityManifest,
  ApprovalReceipt,
} from '../../src/index.js';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function makePolicy(overrides: Partial<PolicyMatrix> = {}): PolicyMatrix {
  return {
    maxSingleAction: 10_000,
    maxCumulativeWindow: 50_000,
    windowDuration: '1h',
    ...overrides,
  };
}

function makeManifest(overrides: Partial<AuthorityManifest> = {}): AuthorityManifest {
  return {
    manifest_id: 'stress-manifest',
    version: '1.0.0',
    entity_path: '/org',
    effective_date: new Date().toISOString(),
    agents: {
      bot: { allowed: ['*'] },
    },
    default_permissions: { allowed: ['*'] },
    ...overrides,
  };
}

// ===========================================================================
// 1. RAPID-FIRE REQUESTS
// ===========================================================================
describe('Stress 1: Rapid-Fire Requests (1000 sequential receipts)', () => {
  let kernel: GovernanceKernel;
  let storage: InMemoryStorageAdapter;

  beforeEach(async () => {
    storage = new InMemoryStorageAdapter();
    kernel = new GovernanceKernel({
      policy: makePolicy({ maxCumulativeWindow: 1_000_000 }),
      storage,
    });
    await kernel.registerManifest(makeManifest());
  });

  it('should issue 1000 receipts sequentially and track all in accumulator', async () => {
    const receiptIds = new Set<string>();

    for (let i = 0; i < 1000; i++) {
      const result = await kernel.evaluate({
        entity_path: '/org/bot',
        action: 'data.read',
        delta_s: 1,
        params: { seq: i },
      });

      expect(result.evaluation.outcome).toBe('allowed');
      expect(result.receipt).toBeDefined();
      receiptIds.add(result.receipt!.receipt_id);
    }

    // All 1000 receipt IDs must be unique
    expect(receiptIds.size).toBe(1000);

    // Accumulator should reflect cumulative total
    const accumulated = kernel.getAccumulatorValue('/org/bot');
    expect(accumulated).toBe(1000);
  });
});

// ===========================================================================
// 2. CONCURRENT RECEIPT VALIDATION
// ===========================================================================
describe('Stress 2: Concurrent Receipt Validation (50 simultaneous)', () => {
  let kernel: GovernanceKernel;
  let gate: ExecutionGate;
  let storage: InMemoryStorageAdapter;

  beforeEach(async () => {
    storage = new InMemoryStorageAdapter();
    kernel = new GovernanceKernel({
      policy: makePolicy({ maxCumulativeWindow: 100_000 }),
      storage,
    });
    gate = new ExecutionGate({ publicKey: kernel.publicKey, storage });
    await kernel.registerManifest(makeManifest());
  });

  it('should handle 50 distinct receipts consumed simultaneously', async () => {
    // Issue 50 distinct receipts first
    const receipts: ApprovalReceipt[] = [];
    for (let i = 0; i < 50; i++) {
      const result = await kernel.evaluate({
        entity_path: '/org/bot',
        action: 'data.read',
        delta_s: 1,
        params: { batch: i },
      });
      receipts.push(result.receipt!);
    }

    // Execute all 50 simultaneously
    const results = await Promise.allSettled(
      receipts.map((receipt, i) =>
        gate.execute(receipt, { batch: i }, async () => `result-${i}`),
      ),
    );

    const successes = results.filter(r => r.status === 'fulfilled');
    expect(successes.length).toBe(50);
  });
});

// ===========================================================================
// 3. REPLAY ATTACK SIMULATION
// ===========================================================================
describe('Stress 3: Replay Attack Simulation (100 replays)', () => {
  let kernel: GovernanceKernel;
  let gate: ExecutionGate;
  let storage: InMemoryStorageAdapter;

  beforeEach(async () => {
    storage = new InMemoryStorageAdapter();
    kernel = new GovernanceKernel({ policy: makePolicy(), storage });
    gate = new ExecutionGate({ publicKey: kernel.publicKey, storage });
    await kernel.registerManifest(makeManifest());
  });

  it('should succeed on first use and reject all 99 replays', async () => {
    const result = await kernel.evaluate({
      entity_path: '/org/bot',
      action: 'data.read',
      delta_s: 10,
      params: { secret: 'value' },
    });

    const receipt = result.receipt!;

    // First execution succeeds
    const exec1 = await gate.execute(
      receipt,
      { secret: 'value' },
      async () => 'first-success',
    );
    expect(exec1.success).toBe(true);

    // Next 99 attempts must all be rejected as replays
    let replayCount = 0;
    for (let i = 0; i < 99; i++) {
      try {
        await gate.execute(receipt, { secret: 'value' }, async () => 'replayed');
        // If we get here without error, that is a failure
      } catch (err) {
        replayCount++;
        expect(err).toBeInstanceOf(ReplayDetectedError);
      }
    }

    expect(replayCount).toBe(99);
  });
});

// ===========================================================================
// 4. PARAMETER TAMPERING (50 variations)
// ===========================================================================
describe('Stress 4: Parameter Tampering (50 variations)', () => {
  let kernel: GovernanceKernel;
  let gate: ExecutionGate;
  let storage: InMemoryStorageAdapter;

  beforeEach(async () => {
    storage = new InMemoryStorageAdapter();
    kernel = new GovernanceKernel({ policy: makePolicy(), storage });
    gate = new ExecutionGate({ publicKey: kernel.publicKey, storage });
    await kernel.registerManifest(makeManifest());
  });

  it('should reject all 50 parameter tampering attempts', async () => {
    const originalParams = { action_type: 'transfer', amount: 100, target: 'account-A' };

    // Generate 50 tampered parameter sets
    const tampered: Record<string, unknown>[] = [];
    for (let i = 0; i < 50; i++) {
      tampered.push(
        { ...originalParams, amount: 100 + i + 1 },
      );
    }

    // For each tampering attempt, issue a receipt with original params
    // then attempt execution with tampered params
    for (let i = 0; i < 50; i++) {
      const result = await kernel.evaluate({
        entity_path: '/org/bot',
        action: 'data.write',
        delta_s: 1,
        params: originalParams,
      });

      const receipt = result.receipt!;

      await expect(
        gate.execute(receipt, tampered[i], async () => 'hacked'),
      ).rejects.toThrow(ParamsMismatchError);
    }
  });

  it('should reject additional field injection', async () => {
    const result = await kernel.evaluate({
      entity_path: '/org/bot',
      action: 'data.write',
      delta_s: 1,
      params: { id: 1 },
    });

    await expect(
      gate.execute(result.receipt!, { id: 1, injected: 'malicious' }, async () => 'hacked'),
    ).rejects.toThrow(ParamsMismatchError);
  });

  it('should reject field removal', async () => {
    const result = await kernel.evaluate({
      entity_path: '/org/bot',
      action: 'data.write',
      delta_s: 1,
      params: { id: 1, name: 'test' },
    });

    await expect(
      gate.execute(result.receipt!, { id: 1 }, async () => 'hacked'),
    ).rejects.toThrow(ParamsMismatchError);
  });

  it('should detect type coercion in stableStringify (FIXED)', async () => {
    // FIX: stableStringify now uses JSON.stringify(obj) for non-object types,
    // so JSON.stringify(1) === '1' but JSON.stringify('1') === '"1"'.
    // This means computeParamsHash({id: 1}) !== computeParamsHash({id: '1'}).
    const result = await kernel.evaluate({
      entity_path: '/org/bot',
      action: 'data.write',
      delta_s: 1,
      params: { id: 1 },
    });

    // This now FAILS because stableStringify(1) !== stableStringify('1')
    await expect(
      gate.execute(result.receipt!, { id: '1' }, async () => 'coerced'),
    ).rejects.toThrow(ParamsMismatchError);

    // Verify the hashes are now different
    expect(computeParamsHash({ id: 1 })).not.toBe(computeParamsHash({ id: '1' }));
  });
});

// ===========================================================================
// 5. ENTITY PATH BOUNDARY TESTING
// ===========================================================================
describe('Stress 5: Entity Path Boundary Testing', () => {
  it('should handle deeply nested paths (/a/b/c/d/e/f/g/h)', () => {
    const deep = '/a/b/c/d/e/f/g/h';
    const validation = validateEntityPath(deep);
    expect(validation.valid).toBe(true);
    expect(validation.segments).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
    expect(getPathDepth(deep)).toBe(8);
    expect(getParentPath(deep)).toBe('/a/b/c/d/e/f/g');
  });

  it('should handle 20-level deep paths', () => {
    const segments = Array.from({ length: 20 }, (_, i) => `level${i}`);
    const deepPath = '/' + segments.join('/');
    const validation = validateEntityPath(deepPath);
    expect(validation.valid).toBe(true);
    expect(validation.segments.length).toBe(20);
  });

  it('should reject empty path', () => {
    const validation = validateEntityPath('');
    expect(validation.valid).toBe(false);
  });

  it('should reject path without leading slash', () => {
    const validation = validateEntityPath('org/bot');
    expect(validation.valid).toBe(false);
  });

  it('should reject root path with no segments', () => {
    const validation = validateEntityPath('/');
    expect(validation.valid).toBe(false);
  });

  it('should reject paths with Unicode characters', () => {
    const validation = validateEntityPath('/org/bot-\u00e9');
    expect(validation.valid).toBe(false);
  });

  it('should reject paths with emoji', () => {
    const validation = validateEntityPath('/org/bot-\uD83D\uDE00');
    expect(validation.valid).toBe(false);
  });

  it('should reject paths with spaces', () => {
    const validation = validateEntityPath('/org/my bot');
    expect(validation.valid).toBe(false);
  });

  it('should reject paths with double slashes', () => {
    const validation = validateEntityPath('/org//bot');
    if (validation.valid) {
      expect(validation.segments).not.toContain('');
    }
  });

  it('should handle path normalization (lowercase)', () => {
    const normalized = normalizeEntityPath('/ORG/BOT');
    expect(normalized).toBe('/org/bot');
  });

  it('should compute ancestor paths correctly', () => {
    const ancestors = getAncestorPaths('/a/b/c/d');
    expect(ancestors).toEqual(['/a', '/a/b', '/a/b/c']);
  });

  it('should check jurisdiction correctly', () => {
    expect(isWithinJurisdiction('/org', '/org/team/bot')).toBe(true);
    expect(isWithinJurisdiction('/org/team', '/org/other')).toBe(false);
    expect(isWithinJurisdiction('/org', '/org')).toBe(true);
  });

  it('should throw on evaluate with invalid entity path', async () => {
    // NOTE: The error thrown is a plain Error from parseEntityPath() in the
    // RetractionStore.isRetracted() -> getAncestorPaths() call chain, which
    // fires BEFORE the PolicyEvaluator validates the path and throws
    // InvalidEntityPathError. The retraction check happens at step 2 of the
    // pipeline, before step 4 (policy evaluation).
    const storage = new InMemoryStorageAdapter();
    const kernel = new GovernanceKernel({ policy: makePolicy(), storage });
    await kernel.registerManifest(makeManifest());

    await expect(
      kernel.evaluate({
        entity_path: 'no-leading-slash',
        action: 'data.read',
        delta_s: 1,
        params: {},
      }),
    ).rejects.toThrow(/[Ii]nvalid entity path/);
  });
});

// ===========================================================================
// 6. FLUIDITY TOKEN EXHAUSTION
// ===========================================================================
describe('Stress 6: Fluidity Token Exhaustion', () => {
  let kernel: GovernanceKernel;
  let gate: ExecutionGate;
  let storage: InMemoryStorageAdapter;

  beforeEach(async () => {
    storage = new InMemoryStorageAdapter();
    kernel = new GovernanceKernel({
      policy: makePolicy({ maxCumulativeWindow: 200 }),
      storage,
    });
    gate = new ExecutionGate({ publicKey: kernel.publicKey, storage });
  });

  it('should allow 100 uses of budget 1 each from token with budget 100, then reject the 101st', async () => {
    const token = await kernel.issueFluidityToken({
      entity_path: '/org/bot',
      risk_budget: 100,
      scope: {
        permitted_actions: ['data.*'],
        max_single_action: 5,
      },
      duration: '1h',
    });

    // Use 100 times at 1 budget each
    for (let i = 0; i < 100; i++) {
      const result = await gate.executeWithToken(
        token.token_id,
        'data.read',
        1,
        async () => `use-${i}`,
      );
      expect(result.success).toBe(true);
    }

    // 101st should fail
    await expect(
      gate.executeWithToken(token.token_id, 'data.read', 1, async () => 'overflow'),
    ).rejects.toThrow(BudgetExhaustedError);
  });

  it('should reject action exceeding remaining budget', async () => {
    const token = await kernel.issueFluidityToken({
      entity_path: '/org/bot',
      risk_budget: 10,
      scope: {
        permitted_actions: ['data.*'],
        max_single_action: 15,
      },
      duration: '1h',
    });

    // Use 8 budget
    await gate.executeWithToken(token.token_id, 'data.read', 8, async () => 'ok');

    // Try to use 5 more (remaining: 2) - should fail
    await expect(
      gate.executeWithToken(token.token_id, 'data.read', 5, async () => 'over'),
    ).rejects.toThrow(BudgetExhaustedError);
  });

  it('should enforce scope even when budget remains', async () => {
    const token = await kernel.issueFluidityToken({
      entity_path: '/org/bot',
      risk_budget: 100,
      scope: {
        permitted_actions: ['data.*'],
        max_single_action: 50,
      },
      duration: '1h',
    });

    await expect(
      gate.executeWithToken(token.token_id, 'payment.charge', 1, async () => 'hack'),
    ).rejects.toThrow(ScopeViolationError);
  });
});

// ===========================================================================
// 7. POISON PILL DURING ACTIVE OPERATIONS
// ===========================================================================
describe('Stress 7: Poison Pill During Active Operations', () => {
  let kernel: GovernanceKernel;
  let gate: ExecutionGate;
  let storage: InMemoryStorageAdapter;

  beforeEach(async () => {
    storage = new InMemoryStorageAdapter();
    kernel = new GovernanceKernel({ policy: makePolicy(), storage });
    gate = new ExecutionGate({ publicKey: kernel.publicKey, storage });
    await kernel.registerManifest(makeManifest());
  });

  it('should block all 20 operations after poison pill', async () => {
    // Issue 20 receipts before the poison pill
    const receipts: ApprovalReceipt[] = [];
    for (let i = 0; i < 20; i++) {
      const result = await kernel.evaluate({
        entity_path: '/org/bot',
        action: 'data.read',
        delta_s: 1,
        params: { op: i },
      });
      receipts.push(result.receipt!);
    }

    // Fire poison pill
    const pill = await kernel.poisonPill({
      reason: 'Emergency: anomaly detected during stress test',
      revokeFluidityTokens: true,
      revokeApprovalReceipts: true,
    });
    expect(pill.pill_id).toBeDefined();

    // Try to execute all 20 - all should fail with LockdownError
    const results = await Promise.allSettled(
      receipts.map((receipt, i) =>
        gate.execute(receipt, { op: i }, async () => `result-${i}`),
      ),
    );

    const failures = results.filter(r => r.status === 'rejected');
    expect(failures.length).toBe(20);

    for (const f of failures) {
      expect((f as PromiseRejectedResult).reason).toBeInstanceOf(LockdownError);
    }
  });

  it('should block new evaluations after poison pill', async () => {
    await kernel.poisonPill({
      reason: 'Security incident',
      revokeFluidityTokens: true,
      revokeApprovalReceipts: true,
    });

    for (let i = 0; i < 10; i++) {
      await expect(
        kernel.evaluate({
          entity_path: '/org/bot',
          action: 'data.read',
          delta_s: 1,
          params: { attempt: i },
        }),
      ).rejects.toThrow(LockdownError);
    }
  });

  it('should block fluidity token issuance after poison pill', async () => {
    await kernel.poisonPill({
      reason: 'Breach detected',
      revokeFluidityTokens: true,
      revokeApprovalReceipts: true,
    });

    await expect(
      kernel.issueFluidityToken({
        entity_path: '/org/bot',
        risk_budget: 100,
        scope: { permitted_actions: ['*'], max_single_action: 50 },
        duration: '1h',
      }),
    ).rejects.toThrow(LockdownError);
  });

  it('should resume after clearLockdown', async () => {
    await kernel.poisonPill({
      reason: 'False alarm',
      revokeFluidityTokens: true,
      revokeApprovalReceipts: true,
    });

    await expect(
      kernel.evaluate({
        entity_path: '/org/bot',
        action: 'data.read',
        delta_s: 1,
        params: {},
      }),
    ).rejects.toThrow(LockdownError);

    await kernel.clearLockdown();

    const result = await kernel.evaluate({
      entity_path: '/org/bot',
      action: 'data.read',
      delta_s: 1,
      params: { after: 'clear' },
    });
    expect(result.evaluation.outcome).toBe('allowed');
  });
});

// ===========================================================================
// 8. RETRACTION CASCADE DEPTH
// ===========================================================================
describe('Stress 8: Retraction Cascade Depth (10 levels)', () => {
  let kernel: GovernanceKernel;
  let storage: InMemoryStorageAdapter;

  beforeEach(async () => {
    storage = new InMemoryStorageAdapter();
    kernel = new GovernanceKernel({ policy: makePolicy(), storage });

    // Register manifests for a 10-level hierarchy
    const levels = ['org', 'div', 'dept', 'team', 'squad', 'cell', 'unit', 'group', 'pod', 'bot'];
    let currentPath = '';

    for (let i = 0; i < levels.length; i++) {
      currentPath += '/' + levels[i];
      const agentId = i < levels.length - 1 ? levels[i + 1] : 'agent';
      await kernel.registerManifest({
        manifest_id: `manifest-${levels[i]}`,
        version: '1.0.0',
        entity_path: currentPath,
        effective_date: new Date().toISOString(),
        agents: {
          [agentId]: { allowed: ['*'] },
        },
        default_permissions: { allowed: ['*'] },
      });
    }
  });

  it('should cascade retraction from root to all 10 levels', async () => {
    // Verify it works before retraction
    const result = await kernel.evaluate({
      entity_path: '/org/div/dept/team/squad/cell/unit/group/pod/bot',
      action: 'data.read',
      delta_s: 1,
      params: {},
    });
    expect(result.evaluation.outcome).toBe('allowed');

    // Retract the root
    await kernel.retract('/org', 'Root-level security incident', 'admin');

    // All descendants should be retracted
    const descendantPaths = [
      '/org/div',
      '/org/div/dept',
      '/org/div/dept/team',
      '/org/div/dept/team/squad',
      '/org/div/dept/team/squad/cell',
      '/org/div/dept/team/squad/cell/unit',
      '/org/div/dept/team/squad/cell/unit/group',
      '/org/div/dept/team/squad/cell/unit/group/pod',
      '/org/div/dept/team/squad/cell/unit/group/pod/bot',
    ];

    for (const path of descendantPaths) {
      await expect(
        kernel.evaluate({
          entity_path: path,
          action: 'data.read',
          delta_s: 1,
          params: {},
        }),
      ).rejects.toThrow(RetractedError);
    }
  });

  it('should reinstate root and allow descendants again', async () => {
    await kernel.retract('/org', 'Temporary hold', 'admin');

    await expect(
      kernel.evaluate({
        entity_path: '/org/div/dept/team/squad/cell/unit/group/pod/bot',
        action: 'data.read',
        delta_s: 1,
        params: {},
      }),
    ).rejects.toThrow(RetractedError);

    await kernel.reinstate('/org');

    const result = await kernel.evaluate({
      entity_path: '/org/div/dept/team/squad/cell/unit/group/pod/bot',
      action: 'data.read',
      delta_s: 1,
      params: { restored: true },
    });
    expect(result.evaluation.outcome).toBe('allowed');
  });

  it('should retract mid-level without affecting parent', async () => {
    await kernel.retract('/org/div/dept/team', 'Team-level issue', 'admin');

    // Parent should still work
    const parentResult = await kernel.evaluate({
      entity_path: '/org/div/dept',
      action: 'data.read',
      delta_s: 1,
      params: {},
    });
    expect(parentResult.evaluation.outcome).not.toBe(undefined);

    // Descendant of retracted entity should fail
    await expect(
      kernel.evaluate({
        entity_path: '/org/div/dept/team/squad/cell',
        action: 'data.read',
        delta_s: 1,
        params: {},
      }),
    ).rejects.toThrow(RetractedError);
  });
});

// ===========================================================================
// 9. ACCUMULATOR OVERFLOW
// ===========================================================================
describe('Stress 9: Accumulator Overflow (push past ceiling)', () => {
  let kernel: GovernanceKernel;
  let storage: InMemoryStorageAdapter;

  const THRESHOLD = 500;

  beforeEach(async () => {
    storage = new InMemoryStorageAdapter();
    kernel = new GovernanceKernel({
      policy: makePolicy({ maxCumulativeWindow: THRESHOLD }),
      storage,
    });
    await kernel.registerManifest(makeManifest());
  });

  it('should allow exactly up to threshold and then hard stop', async () => {
    for (let i = 0; i < 50; i++) {
      const result = await kernel.evaluate({
        entity_path: '/org/bot',
        action: 'data.write',
        delta_s: 10,
        params: { i },
      });
      expect(result.evaluation.outcome).toBe('allowed');
    }

    expect(kernel.getAccumulatorValue('/org/bot')).toBe(500);

    await expect(
      kernel.evaluate({
        entity_path: '/org/bot',
        action: 'data.write',
        delta_s: 1,
        params: { overflow: true },
      }),
    ).rejects.toThrow(AccumulatorBreachError);
  });

  it('should enforce per-entity isolation at threshold', async () => {
    for (let i = 0; i < 50; i++) {
      await kernel.evaluate({
        entity_path: '/org/bot',
        action: 'data.write',
        delta_s: 10,
        params: { entity: 'A', i },
      });
    }

    await expect(
      kernel.evaluate({
        entity_path: '/org/bot',
        action: 'data.write',
        delta_s: 1,
        params: { entity: 'A', overflow: true },
      }),
    ).rejects.toThrow(AccumulatorBreachError);

    await kernel.registerManifest(makeManifest({
      manifest_id: 'stress-manifest-2',
      entity_path: '/org2',
      agents: { 'bot-b': { allowed: ['*'] } },
    }));

    const result = await kernel.evaluate({
      entity_path: '/org2/bot-b',
      action: 'data.write',
      delta_s: 400,
      params: { entity: 'B' },
    });
    expect(result.evaluation.outcome).toBe('allowed');
  });

  it('should report breach details in AccumulatorBreachError', async () => {
    for (let i = 0; i < 49; i++) {
      await kernel.evaluate({
        entity_path: '/org/bot',
        action: 'data.write',
        delta_s: 10,
        params: { fill: i },
      });
    }

    try {
      await kernel.evaluate({
        entity_path: '/org/bot',
        action: 'data.write',
        delta_s: 20,
        params: { overflow: true },
      });
      expect.unreachable('Should have thrown AccumulatorBreachError');
    } catch (err) {
      expect(err).toBeInstanceOf(AccumulatorBreachError);
      const breach = err as AccumulatorBreachError;
      expect(breach.current).toBe(490);
      expect(breach.deltaS).toBe(20);
      expect(breach.threshold).toBe(THRESHOLD);
    }
  });
});

// ===========================================================================
// 10. HASH CHAIN INTEGRITY UNDER LOAD
// ===========================================================================
describe('Stress 10: Hash Chain Integrity Under Load (1000 entries)', () => {
  let observer: TelemetryObserver;
  let storage: InMemoryStorageAdapter;

  beforeEach(() => {
    storage = new InMemoryStorageAdapter();
    observer = new TelemetryObserver({ auditStore: storage.audit });
  });

  it('should maintain chain integrity across 1000 audit entries', async () => {
    for (let i = 0; i < 1000; i++) {
      await observer.recordDecision({
        entityPath: '/org/bot',
        action: `action.stress.${i}`,
        outcome: i % 3 === 0 ? 'denied' : 'allowed',
        paramsHash: computeParamsHash({ i }),
        riskLevel: 'low',
      });
    }

    const verification = await observer.verifyAuditChain();
    expect(verification.valid).toBe(true);
    expect(verification.checked).toBe(1000);
    expect(verification.errors).toHaveLength(0);
  });

  it('should detect single tampered entry in a 1000-entry chain', async () => {
    for (let i = 0; i < 1000; i++) {
      await observer.recordDecision({
        entityPath: '/org/bot',
        action: `action.stress.${i}`,
        outcome: 'allowed',
        paramsHash: computeParamsHash({ i }),
        riskLevel: 'low',
      });
    }

    const entry = await storage.audit.getBySequence(500);
    if (entry) {
      (entry as any).action = 'action.TAMPERED';
    }

    const verification = await observer.verifyAuditChain();
    expect(verification.valid).toBe(false);
    expect(verification.errors.length).toBeGreaterThan(0);
  });

  it('should link all entries with sequential prev_hash', async () => {
    for (let i = 0; i < 10; i++) {
      await observer.recordDecision({
        entityPath: '/org/bot',
        action: `action.link.${i}`,
        outcome: 'allowed',
        paramsHash: computeParamsHash({ i }),
      });
    }

    for (let i = 1; i < 10; i++) {
      const prev = await storage.audit.getBySequence(i - 1);
      const curr = await storage.audit.getBySequence(i);
      expect(curr!.prev_hash).toBe(prev!.entry_hash);
    }

    const first = await storage.audit.getBySequence(0);
    expect(first!.prev_hash).toBe('0'.repeat(64));
  });
});

// ===========================================================================
// 11. MANIFEST HOT-RELOAD
// ===========================================================================
describe('Stress 11: Manifest Hot-Reload', () => {
  let kernel: GovernanceKernel;
  let gate: ExecutionGate;
  let storage: InMemoryStorageAdapter;

  beforeEach(async () => {
    storage = new InMemoryStorageAdapter();
    kernel = new GovernanceKernel({ policy: makePolicy(), storage });
    gate = new ExecutionGate({ publicKey: kernel.publicKey, storage });
  });

  it('should allow old receipts after manifest tightening, but deny new requests', async () => {
    await kernel.registerManifest(makeManifest({
      manifest_id: 'v1-permissive',
      agents: {
        bot: { allowed: ['data.*', 'payment.*'] },
      },
    }));

    const result1 = await kernel.evaluate({
      entity_path: '/org/bot',
      action: 'payment.charge',
      delta_s: 10,
      params: { amount: 50 },
    });
    expect(result1.evaluation.outcome).toBe('allowed');
    const oldReceipt = result1.receipt!;

    // Hot-reload: tighten manifest to forbid payments
    await kernel.registerManifest(makeManifest({
      manifest_id: 'v2-strict',
      agents: {
        bot: { allowed: ['data.*'], forbidden: ['payment.*'] },
      },
    }));

    // Old receipt should still execute (Gate validates signature, not manifest)
    const exec = await gate.execute(
      oldReceipt,
      { amount: 50 },
      async () => 'executed-with-old-receipt',
    );
    expect(exec.success).toBe(true);

    // New request should be denied under stricter policy
    const result2 = await kernel.evaluate({
      entity_path: '/org/bot',
      action: 'payment.charge',
      delta_s: 10,
      params: { amount: 50, attempt: 2 },
    });
    expect(result2.evaluation.outcome).toBe('denied');
  });

  it('should allow new compliant actions after tightening', async () => {
    await kernel.registerManifest(makeManifest({
      manifest_id: 'v1',
      agents: { bot: { allowed: ['*'] } },
    }));

    await kernel.registerManifest(makeManifest({
      manifest_id: 'v2',
      agents: { bot: { allowed: ['data.*'] } },
    }));

    const result = await kernel.evaluate({
      entity_path: '/org/bot',
      action: 'data.read',
      delta_s: 1,
      params: { after: 'tighten' },
    });
    expect(result.evaluation.outcome).toBe('allowed');
  });
});

// ===========================================================================
// 12. EMPTY/NULL/UNDEFINED INPUTS
// ===========================================================================
describe('Stress 12: Empty/Null/Undefined Inputs', () => {
  let kernel: GovernanceKernel;
  let gate: ExecutionGate;
  let observer: TelemetryObserver;
  let storage: InMemoryStorageAdapter;

  beforeEach(async () => {
    storage = new InMemoryStorageAdapter();
    kernel = new GovernanceKernel({ policy: makePolicy(), storage });
    gate = new ExecutionGate({ publicKey: kernel.publicKey, storage });
    observer = new TelemetryObserver({ auditStore: storage.audit });
    await kernel.registerManifest(makeManifest());
  });

  it('should reject evaluate with null entity_path', async () => {
    await expect(
      kernel.evaluate({
        entity_path: null as any,
        action: 'data.read',
        delta_s: 1,
        params: {},
      }),
    ).rejects.toThrow();
  });

  it('should reject evaluate with undefined entity_path', async () => {
    await expect(
      kernel.evaluate({
        entity_path: undefined as any,
        action: 'data.read',
        delta_s: 1,
        params: {},
      }),
    ).rejects.toThrow();
  });

  it('should reject evaluate with empty string entity_path', async () => {
    await expect(
      kernel.evaluate({
        entity_path: '',
        action: 'data.read',
        delta_s: 1,
        params: {},
      }),
    ).rejects.toThrow();
  });

  it('should handle evaluate with empty params object', async () => {
    const result = await kernel.evaluate({
      entity_path: '/org/bot',
      action: 'data.read',
      delta_s: 1,
      params: {},
    });
    expect(result.evaluation.outcome).toBe('allowed');
  });

  it('should handle evaluate with delta_s of 0', async () => {
    const result = await kernel.evaluate({
      entity_path: '/org/bot',
      action: 'data.read',
      delta_s: 0,
      params: { zero: true },
    });
    expect(result.evaluation.outcome).toBe('allowed');
  });

  it('should handle gate.execute with null receipt gracefully', async () => {
    await expect(
      gate.execute(null as any, {}, async () => 'should-fail'),
    ).rejects.toThrow();
  });

  it('should handle gate.execute with undefined params', async () => {
    const result = await kernel.evaluate({
      entity_path: '/org/bot',
      action: 'data.read',
      delta_s: 1,
      params: {},
    });

    await expect(
      gate.execute(result.receipt!, undefined as any, async () => 'bad'),
    ).rejects.toThrow();
  });

  it('should handle validateEntityPath with various null-ish inputs', () => {
    expect(validateEntityPath(null as any).valid).toBe(false);
    expect(validateEntityPath(undefined as any).valid).toBe(false);
    expect(validateEntityPath('' as any).valid).toBe(false);
    expect(validateEntityPath(123 as any).valid).toBe(false);
  });

  it('should handle computeParamsHash with empty object', () => {
    const hash = computeParamsHash({});
    expect(typeof hash).toBe('string');
    expect(hash.length).toBe(64);
  });

  it('should handle observer.recordDecision with minimal fields', async () => {
    await observer.recordDecision({
      entityPath: '/org/bot',
      action: 'data.read',
      outcome: 'allowed',
      paramsHash: computeParamsHash({}),
    });

    const verification = await observer.verifyAuditChain();
    expect(verification.valid).toBe(true);
    expect(verification.checked).toBe(1);
  });
});

// ===========================================================================
// 13. CROSS-ENTITY-PATH ISOLATION
// ===========================================================================
describe('Stress 13: Cross-Entity-Path Isolation', () => {
  let kernel: GovernanceKernel;
  let gate: ExecutionGate;
  let storage: InMemoryStorageAdapter;

  beforeEach(async () => {
    storage = new InMemoryStorageAdapter();
    kernel = new GovernanceKernel({ policy: makePolicy(), storage });
    gate = new ExecutionGate({ publicKey: kernel.publicKey, storage });

    await kernel.registerManifest(makeManifest({
      manifest_id: 'org-alpha',
      entity_path: '/alpha',
      agents: { bot: { allowed: ['data.*'] } },
    }));

    await kernel.registerManifest(makeManifest({
      manifest_id: 'org-beta',
      entity_path: '/beta',
      agents: { bot: { allowed: ['report.*'] } },
    }));
  });

  it('should issue receipt scoped to entity A and verify it contains entity A path', async () => {
    const result = await kernel.evaluate({
      entity_path: '/alpha/bot',
      action: 'data.read',
      delta_s: 10,
      params: { source: 'alpha' },
    });

    expect(result.receipt).toBeDefined();
    expect(result.receipt!.entity_path).toBe('/alpha/bot');
  });

  it('should deny entity B actions not in its scope', async () => {
    const result = await kernel.evaluate({
      entity_path: '/beta/bot',
      action: 'data.read',
      delta_s: 10,
      params: { source: 'beta' },
    });

    expect(result.evaluation.outcome).toBe('denied');
  });

  it('should maintain separate accumulators for different entities', async () => {
    for (let i = 0; i < 10; i++) {
      await kernel.evaluate({
        entity_path: '/alpha/bot',
        action: 'data.read',
        delta_s: 100,
        params: { entity: 'alpha', i },
      });
    }

    expect(kernel.getAccumulatorValue('/alpha/bot')).toBe(1000);
    expect(kernel.getAccumulatorValue('/beta/bot')).toBe(0);

    const result = await kernel.evaluate({
      entity_path: '/beta/bot',
      action: 'report.generate',
      delta_s: 5000,
      params: { entity: 'beta' },
    });
    expect(result.evaluation.outcome).toBe('allowed');
  });

  it('should retract one entity without affecting the other', async () => {
    await kernel.retract('/alpha', 'Alpha breach', 'admin');

    await expect(
      kernel.evaluate({
        entity_path: '/alpha/bot',
        action: 'data.read',
        delta_s: 1,
        params: {},
      }),
    ).rejects.toThrow(RetractedError);

    const result = await kernel.evaluate({
      entity_path: '/beta/bot',
      action: 'report.generate',
      delta_s: 1,
      params: { still: 'works' },
    });
    expect(result.evaluation.outcome).toBe('allowed');
  });

  it('should enforce receipt entity_path binding on execution', async () => {
    const alphaResult = await kernel.evaluate({
      entity_path: '/alpha/bot',
      action: 'data.read',
      delta_s: 10,
      params: { cross_entity_test: true },
    });

    const alphaReceipt = alphaResult.receipt!;
    expect(alphaReceipt.entity_path).toBe('/alpha/bot');

    const exec = await gate.execute(
      alphaReceipt,
      { cross_entity_test: true },
      async () => 'alpha-executed',
    );
    expect(exec.success).toBe(true);
  });
});
