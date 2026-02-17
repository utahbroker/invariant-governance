/**
 * Integration Test: Retraction Cascade
 *
 * Retracting an entity path cascades to all descendants.
 * /org retracted -> /org/team/bot also retracted.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  GovernanceKernel,
  InMemoryStorageAdapter,
  RetractedError,
} from '../../src/index.js';
import type { PolicyMatrix, AuthorityManifest } from '../../src/index.js';

describe('Retraction Cascade', () => {
  let kernel: GovernanceKernel;
  let storage: InMemoryStorageAdapter;

  const policy: PolicyMatrix = {
    maxSingleAction: 1000,
    maxCumulativeWindow: 5000,
    windowDuration: '1h',
  };

  beforeEach(async () => {
    storage = new InMemoryStorageAdapter();
    kernel = new GovernanceKernel({ policy, storage });

    // Register hierarchical manifests
    await kernel.registerManifest({
      manifest_id: 'org-root',
      version: '1.0.0',
      entity_path: '/org',
      effective_date: new Date().toISOString(),
      agents: { 'team': { allowed: ['*'] } },
      default_permissions: { allowed: ['*'] },
    });

    await kernel.registerManifest({
      manifest_id: 'org-team',
      version: '1.0.0',
      entity_path: '/org/team',
      effective_date: new Date().toISOString(),
      agents: { 'bot': { allowed: ['*'] } },
    });
  });

  it('should cascade retraction to descendants', async () => {
    // Bot works before retraction
    const result = await kernel.evaluate({
      entity_path: '/org/team/bot',
      action: 'data.read',
      delta_s: 10,
      params: {},
    });
    expect(result.evaluation.outcome).toBe('allowed');

    // Retract parent entity /org
    await kernel.retract('/org', 'Security breach at org level', 'admin');

    // Descendant /org/team/bot should be retracted too
    await expect(
      kernel.evaluate({
        entity_path: '/org/team/bot',
        action: 'data.read',
        delta_s: 10,
        params: {},
      }),
    ).rejects.toThrow(RetractedError);
  });

  it('should not affect sibling entities', async () => {
    // Register a separate org
    await kernel.registerManifest({
      manifest_id: 'org2',
      version: '1.0.0',
      entity_path: '/org2',
      effective_date: new Date().toISOString(),
      agents: { 'bot': { allowed: ['*'] } },
    });

    // Retract /org
    await kernel.retract('/org', 'Breach', 'admin');

    // /org2 should be unaffected
    const result = await kernel.evaluate({
      entity_path: '/org2/bot',
      action: 'data.read',
      delta_s: 10,
      params: {},
    });
    expect(result.evaluation.outcome).toBe('allowed');
  });

  it('should allow reinstatement', async () => {
    await kernel.retract('/org', 'Temporary hold', 'admin');

    // Retracted
    await expect(
      kernel.evaluate({
        entity_path: '/org/team/bot',
        action: 'data.read',
        delta_s: 10,
        params: {},
      }),
    ).rejects.toThrow(RetractedError);

    // Reinstate
    await kernel.reinstate('/org');

    // Should work again
    const result = await kernel.evaluate({
      entity_path: '/org/team/bot',
      action: 'data.read',
      delta_s: 10,
      params: {},
    });
    expect(result.evaluation.outcome).toBe('allowed');
  });
});
