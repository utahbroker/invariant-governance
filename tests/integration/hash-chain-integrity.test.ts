// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Holladay Labs IP, LLC

/**
 * Integration Test: Hash Chain Integrity
 *
 * Tampering with any entry in the audit chain is detectable.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  TelemetryObserver,
  InMemoryStorageAdapter,
} from '../../src/index.js';
import { computeParamsHash } from '../../src/crypto/hash.js';

describe('Hash Chain Integrity', () => {
  let observer: TelemetryObserver;
  let storage: InMemoryStorageAdapter;

  beforeEach(() => {
    storage = new InMemoryStorageAdapter();
    observer = new TelemetryObserver({ auditStore: storage.audit });
  });

  it('should verify a valid chain', async () => {
    // Append several entries
    for (let i = 0; i < 10; i++) {
      await observer.recordDecision({
        entityPath: '/org/bot',
        action: 'data.read',
        outcome: 'allowed',
        paramsHash: computeParamsHash({ i }),
        riskLevel: 'low',
      });
    }

    const verification = await observer.verifyAuditChain();
    expect(verification.valid).toBe(true);
    expect(verification.checked).toBe(10);
    expect(verification.errors).toHaveLength(0);
  });

  it('should detect tampered entries', async () => {
    // Append entries
    for (let i = 0; i < 5; i++) {
      await observer.recordDecision({
        entityPath: '/org/bot',
        action: 'data.read',
        outcome: 'allowed',
        paramsHash: computeParamsHash({ i }),
        riskLevel: 'low',
      });
    }

    // Tamper with entry 2 by modifying the store directly
    const entry = await storage.audit.getBySequence(2);
    if (entry) {
      // Modify the action (tampering)
      (entry as any).action = 'data.HACKED';
      // The entry_hash no longer matches
    }

    const verification = await observer.verifyAuditChain();
    expect(verification.valid).toBe(false);
    expect(verification.errors.length).toBeGreaterThan(0);
  });

  it('should link entries with prev_hash', async () => {
    await observer.recordDecision({
      entityPath: '/org/bot',
      action: 'action.first',
      outcome: 'allowed',
      paramsHash: computeParamsHash({ n: 1 }),
    });

    await observer.recordDecision({
      entityPath: '/org/bot',
      action: 'action.second',
      outcome: 'denied',
      paramsHash: computeParamsHash({ n: 2 }),
    });

    const entry0 = await storage.audit.getBySequence(0);
    const entry1 = await storage.audit.getBySequence(1);

    // Entry 1's prev_hash should equal entry 0's entry_hash
    expect(entry1!.prev_hash).toBe(entry0!.entry_hash);

    // Entry 0's prev_hash should be the genesis hash
    expect(entry0!.prev_hash).toBe('0'.repeat(64));
  });
});
