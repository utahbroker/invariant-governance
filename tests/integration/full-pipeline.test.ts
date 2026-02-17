/**
 * Integration Test: Full Pipeline
 *
 * GovernanceKernel -> ExecutionGate -> TelemetryObserver
 * End-to-end test of the complete governance flow.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  GovernanceKernel,
  ExecutionGate,
  TelemetryObserver,
  InMemoryStorageAdapter,
  ConsoleSink,
  CallbackSink,
} from '../../src/index.js';
import type { PolicyMatrix, AuthorityManifest } from '../../src/index.js';

describe('Full Pipeline: Kernel -> Gate -> Telemetry', () => {
  let kernel: GovernanceKernel;
  let gate: ExecutionGate;
  let observer: TelemetryObserver;
  let storage: InMemoryStorageAdapter;
  let telemetryEvents: unknown[];

  const policy: PolicyMatrix = {
    maxSingleAction: 1000,
    maxCumulativeWindow: 5000,
    windowDuration: '1h',
    actionRules: [
      { pattern: 'payment.*', risk_level: 'critical', is_write: true, requires_approval: true },
      { pattern: 'data.read', risk_level: 'low', is_write: false, requires_approval: false },
    ],
    defaultRiskLevel: 'medium',
  };

  const manifest: AuthorityManifest = {
    manifest_id: 'test-manifest',
    version: '1.0.0',
    entity_path: '/org',
    effective_date: new Date().toISOString(),
    agents: {
      'bot-1': {
        allowed: ['data.*', 'report.*'],
        forbidden: ['data.delete'],
        requires_approval: [],
      },
      'bot-2': {
        allowed: ['payment.*'],
        forbidden: [],
        requires_approval: ['payment.charge'],
      },
    },
    default_permissions: {
      allowed: [],
      forbidden: ['*'],
    },
  };

  beforeEach(async () => {
    storage = new InMemoryStorageAdapter();
    telemetryEvents = [];

    kernel = new GovernanceKernel({ policy, storage });

    gate = new ExecutionGate({
      publicKey: kernel.publicKey,
      storage,
    });

    observer = new TelemetryObserver({
      auditStore: storage.audit,
      sinks: [new CallbackSink(entry => { telemetryEvents.push(entry); })],
    });

    // Register manifest
    await kernel.registerManifest(manifest);
  });

  it('should allow a valid action and execute it', async () => {
    // 1. Kernel evaluates the proposal
    const result = await kernel.evaluate({
      entity_path: '/org/bot-1',
      action: 'data.read',
      delta_s: 10,
      params: { query: 'SELECT * FROM users' },
    });

    expect(result.evaluation.outcome).toBe('allowed');
    expect(result.receipt).toBeDefined();

    // 2. Record the decision
    await observer.recordDecision({
      entityPath: '/org/bot-1',
      action: 'data.read',
      outcome: 'allowed',
      paramsHash: result.receipt!.params_hash,
      receiptId: result.receipt!.receipt_id,
      riskLevel: result.evaluation.riskLevel,
    });

    // 3. Gate executes with the receipt
    const execution = await gate.execute(
      result.receipt!,
      { query: 'SELECT * FROM users' },
      async () => ({ rows: 42 }),
    );

    expect(execution.success).toBe(true);
    expect(execution.result).toEqual({ rows: 42 });
    expect(execution.receipt_id).toBe(result.receipt!.receipt_id);

    // 4. Verify telemetry was recorded
    expect(telemetryEvents.length).toBe(1);

    // 5. Verify audit chain
    const verification = await observer.verifyAuditChain();
    expect(verification.valid).toBe(true);
    expect(verification.checked).toBe(1);
  });

  it('should deny a forbidden action', async () => {
    const result = await kernel.evaluate({
      entity_path: '/org/bot-1',
      action: 'data.delete',
      delta_s: 100,
      params: { table: 'users' },
    });

    expect(result.evaluation.outcome).toBe('denied');
    expect(result.receipt).toBeUndefined();
  });

  it('should deny unknown agents', async () => {
    const result = await kernel.evaluate({
      entity_path: '/org/unknown-bot',
      action: 'data.read',
      delta_s: 10,
      params: {},
    });

    expect(result.evaluation.outcome).toBe('denied');
    expect(result.receipt).toBeUndefined();
  });

  it('should prevent receipt replay', async () => {
    const result = await kernel.evaluate({
      entity_path: '/org/bot-1',
      action: 'data.read',
      delta_s: 10,
      params: { id: 1 },
    });

    // First execution succeeds
    const exec1 = await gate.execute(
      result.receipt!,
      { id: 1 },
      async () => 'first',
    );
    expect(exec1.success).toBe(true);

    // Second execution (replay) should fail
    await expect(
      gate.execute(result.receipt!, { id: 1 }, async () => 'replay'),
    ).rejects.toThrow('replay');
  });

  it('should prevent parameter substitution', async () => {
    const result = await kernel.evaluate({
      entity_path: '/org/bot-1',
      action: 'data.read',
      delta_s: 10,
      params: { id: 1 },
    });

    // Try to use the receipt with different parameters
    await expect(
      gate.execute(result.receipt!, { id: 999 }, async () => 'hacked'),
    ).rejects.toThrow('mismatch');
  });
});
