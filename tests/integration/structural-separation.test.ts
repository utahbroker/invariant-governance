/**
 * Integration Test: Structural Separation
 *
 * Verifies that components CANNOT cross boundaries.
 * The Governance Kernel cannot execute.
 * The Execution Gate cannot sign or evaluate.
 * The Telemetry Observer cannot intervene.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  GovernanceKernel,
  ExecutionGate,
  TelemetryObserver,
  InMemoryStorageAdapter,
} from '../../src/index.js';
import type { PolicyMatrix } from '../../src/index.js';

describe('Structural Separation', () => {
  const policy: PolicyMatrix = {
    maxSingleAction: 1000,
    maxCumulativeWindow: 5000,
    windowDuration: '1h',
  };

  let storage: InMemoryStorageAdapter;

  beforeEach(() => {
    storage = new InMemoryStorageAdapter();
  });

  it('GovernanceKernel has NO execute() method', () => {
    const kernel = new GovernanceKernel({ policy, storage });

    // The Kernel is structurally incapable of execution
    expect('execute' in kernel).toBe(false);
    expect('executeWithToken' in kernel).toBe(false);
    expect((kernel as any).execute).toBeUndefined();
  });

  it('ExecutionGate has NO evaluate() or sign() methods', () => {
    const kernel = new GovernanceKernel({ policy, storage });
    const gate = new ExecutionGate({
      publicKey: kernel.publicKey,
      storage,
    });

    // The Gate is structurally incapable of governance decisions
    expect('evaluate' in gate).toBe(false);
    expect('sign' in gate).toBe(false);
    expect('issueFluidityToken' in gate).toBe(false);
    expect('retract' in gate).toBe(false);
    expect('poisonPill' in gate).toBe(false);
    expect((gate as any).evaluate).toBeUndefined();
    expect((gate as any).sign).toBeUndefined();
  });

  it('TelemetryObserver has NO evaluate(), execute(), or sign() methods', () => {
    const observer = new TelemetryObserver({
      auditStore: storage.audit,
    });

    // The Observer is structurally incapable of action
    expect('evaluate' in observer).toBe(false);
    expect('execute' in observer).toBe(false);
    expect('sign' in observer).toBe(false);
    expect('retract' in observer).toBe(false);
    expect('poisonPill' in observer).toBe(false);
    expect((observer as any).evaluate).toBeUndefined();
    expect((observer as any).execute).toBeUndefined();
  });

  it('GovernanceKernel has private key, Gate has only public key', () => {
    const kernel = new GovernanceKernel({ policy, storage });
    const gate = new ExecutionGate({
      publicKey: kernel.publicKey,
      storage,
    });

    // Kernel exposes publicKey
    expect(kernel.publicKey).toBeDefined();
    expect(typeof kernel.publicKey).toBe('string');

    // Kernel does NOT expose privateKey
    expect((kernel as any).privateKey).toBeUndefined();

    // Gate cannot access Kernel's private key
    expect((gate as any).privateKey).toBeUndefined();
  });
});
