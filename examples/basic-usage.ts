/**
 * Invariant Governance — Basic Usage Example
 *
 * Demonstrates the complete governance flow:
 * 1. Create Kernel, Gate, and Observer
 * 2. Register an Authority Manifest
 * 3. Evaluate an intent proposal
 * 4. Execute with receipt verification
 * 5. Record telemetry and verify audit chain
 */

import {
  GovernanceKernel,
  ExecutionGate,
  TelemetryObserver,
  InMemoryStorageAdapter,
  ConsoleSink,
} from '../src/index.js';
import type { PolicyMatrix, AuthorityManifest } from '../src/index.js';

async function main() {
  // === Storage ===
  const storage = new InMemoryStorageAdapter();

  // === Policy Matrix ===
  const policy: PolicyMatrix = {
    maxSingleAction: 10_000,         // No single action > $10k
    maxCumulativeWindow: 50_000,     // No more than $50k per hour
    windowDuration: '1h',
    actionRules: [
      { pattern: 'payment.*', risk_level: 'critical', is_write: true, requires_approval: true },
      { pattern: 'data.read', risk_level: 'low', is_write: false, requires_approval: false },
      { pattern: 'data.write', risk_level: 'medium', is_write: true, requires_approval: false },
    ],
    defaultRiskLevel: 'medium',
  };

  // === Create Components ===
  const kernel = new GovernanceKernel({ policy, storage });
  const gate = new ExecutionGate({ publicKey: kernel.publicKey, storage });
  const observer = new TelemetryObserver({
    auditStore: storage.audit,
    sinks: [new ConsoleSink()],
  });

  // === Register Authority Manifest ===
  const manifest: AuthorityManifest = {
    manifest_id: 'acme-trading',
    version: '1.0.0',
    entity_path: '/acme',
    effective_date: new Date().toISOString(),
    agents: {
      'equities': {
        allowed: ['data.*', 'report.*'],
        forbidden: ['data.delete'],
      },
      'bot-7': {
        allowed: ['data.read', 'data.write', 'report.generate'],
        forbidden: [],
        requires_approval: ['data.write'],
        spend_limit: 5000,
      },
    },
    default_permissions: {
      allowed: [],
      forbidden: ['*'],
    },
  };

  await kernel.registerManifest(manifest);
  console.log('Manifest registered:', manifest.manifest_id);

  // === Evaluate Intent ===
  console.log('\n--- Evaluating: data.read ---');
  const result = await kernel.evaluate({
    entity_path: '/acme/bot-7',
    action: 'data.read',
    delta_s: 5,
    params: { symbol: 'AAPL', range: '1d' },
  });

  console.log('Outcome:', result.evaluation.outcome);
  console.log('Risk Level:', result.evaluation.riskLevel);
  console.log('Receipt ID:', result.receipt?.receipt_id);

  // === Execute with Receipt ===
  if (result.receipt) {
    console.log('\n--- Executing with receipt ---');
    const execution = await gate.execute(
      result.receipt,
      { symbol: 'AAPL', range: '1d' },
      async () => {
        // Simulated action
        return { price: 185.42, volume: 52_341_000 };
      },
    );

    console.log('Success:', execution.success);
    console.log('Result:', execution.result);

    // Record telemetry
    await observer.recordDecision({
      entityPath: '/acme/bot-7',
      action: 'data.read',
      outcome: 'allowed',
      paramsHash: result.receipt.params_hash,
      receiptId: result.receipt.receipt_id,
      riskLevel: result.evaluation.riskLevel,
    });
  }

  // === Verify Audit Chain ===
  console.log('\n--- Audit Chain Verification ---');
  const verification = await observer.verifyAuditChain();
  console.log('Valid:', verification.valid);
  console.log('Entries checked:', verification.checked);

  // === Decision Stats ===
  const stats = await observer.getStats();
  console.log('\n--- Decision Stats ---');
  console.log('Total:', stats.total);
  console.log('By outcome:', stats.by_outcome);

  console.log('\nDone.');
}

main().catch(console.error);
