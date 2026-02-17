/**
 * Invariant Governance — Manifest Loader
 *
 * Loads Authority Manifests and resolves effective permissions through
 * the inheritance chain using RESTRICTIVE merge:
 *   - allowed: intersection (child can only restrict)
 *   - forbidden: union (child can only add restrictions)
 *   - requires_approval: union (child can only add requirements)
 *   - spend_limit: minimum (child can only reduce)
 *   - can_delegate_to: intersection (child can only reduce targets)
 *   - alert_on: union (child can only add alerts)
 *
 * Ported from homerhq-bot-empire load.ts mergePermissionsRestrictive().
 */

import type { EntityPath } from '../types/common.js';
import type { AgentPermissions, AuthorityManifest, EffectiveAuthority } from '../types/policy.js';
import { matchActionPattern } from '../types/policy.js';
import type { ManifestStore } from '../storage/interfaces.js';

const MAX_INHERITANCE_DEPTH = 10;

/**
 * Merge agent permissions with restrictive inheritance.
 * Child can only RESTRICT, never EXPAND parent permissions.
 */
export function mergePermissionsRestrictive(
  parent: AgentPermissions,
  child: AgentPermissions,
): AgentPermissions {
  const merged: AgentPermissions = { ...parent };

  // allowed: intersection (child can only restrict)
  if (child.allowed) {
    if (parent.allowed?.includes('*')) {
      // Parent allows everything — child specifies subset
      merged.allowed = child.allowed;
    } else if (parent.allowed) {
      // Intersection: only keep what parent also allows
      merged.allowed = child.allowed.filter(
        a => parent.allowed!.some(p => matchActionPattern(a, p) || matchActionPattern(p, a)),
      );
    } else {
      // Parent has no allowed list — child cannot expand
      merged.allowed = [];
    }
  }

  // forbidden: union (child can only add restrictions)
  if (child.forbidden) {
    merged.forbidden = [...new Set([...(parent.forbidden ?? []), ...child.forbidden])];
  }

  // requires_approval: union (child can only add requirements)
  if (child.requires_approval) {
    merged.requires_approval = [
      ...new Set([...(parent.requires_approval ?? []), ...child.requires_approval]),
    ];
  }

  // spend_limit: minimum (child can only reduce)
  if (child.spend_limit !== undefined) {
    merged.spend_limit = Math.min(parent.spend_limit ?? Infinity, child.spend_limit);
  }

  // can_delegate_to: intersection (child can only reduce delegation targets)
  if (child.can_delegate_to) {
    if (parent.can_delegate_to && parent.can_delegate_to.length > 0) {
      const parentDelegates = new Set(parent.can_delegate_to);
      merged.can_delegate_to = child.can_delegate_to.filter(d => parentDelegates.has(d));
    } else {
      // Parent has no delegation — child cannot add
      merged.can_delegate_to = [];
    }
  }

  // alert_on: union (child can only add alerts)
  if (child.alert_on) {
    merged.alert_on = [...new Set([...(parent.alert_on ?? []), ...child.alert_on])];
  }

  return merged;
}

/**
 * Merge two full Authority Manifests with restrictive inheritance.
 * All agent permissions are merged restrictively.
 */
export function mergeManifestsRestrictive(
  parent: AuthorityManifest,
  child: AuthorityManifest,
): AuthorityManifest {
  const mergedAgents: Record<string, AgentPermissions> = {};

  // Start with parent agents
  for (const [agentId, parentPerms] of Object.entries(parent.agents)) {
    mergedAgents[agentId] = { ...parentPerms };
  }

  // Apply child overrides (restrictive only)
  for (const [agentId, childPerms] of Object.entries(child.agents)) {
    if (!mergedAgents[agentId]) {
      // New agent not in parent — apply default_permissions as baseline
      const baseline = parent.default_permissions ?? { allowed: [], forbidden: ['*'] };
      mergedAgents[agentId] = mergePermissionsRestrictive(baseline, childPerms);
    } else {
      // Merge with parent permissions restrictively
      mergedAgents[agentId] = mergePermissionsRestrictive(mergedAgents[agentId], childPerms);
    }
  }

  // Merge global rules
  const mergedGlobalRules = child.global_rules || parent.global_rules
    ? {
        always_log: [
          ...new Set([
            ...(parent.global_rules?.always_log ?? []),
            ...(child.global_rules?.always_log ?? []),
          ]),
        ],
        always_alert: [
          ...new Set([
            ...(parent.global_rules?.always_alert ?? []),
            ...(child.global_rules?.always_alert ?? []),
          ]),
        ],
        approval_timeout_minutes: Math.min(
          parent.global_rules?.approval_timeout_minutes ?? 60,
          child.global_rules?.approval_timeout_minutes ?? 60,
        ),
        max_delegation_depth: Math.min(
          parent.global_rules?.max_delegation_depth ?? 3,
          child.global_rules?.max_delegation_depth ?? 3,
        ),
      }
    : undefined;

  return {
    ...child,
    agents: mergedAgents,
    default_permissions: mergePermissionsRestrictive(
      parent.default_permissions ?? { allowed: [], forbidden: ['*'] },
      child.default_permissions ?? {},
    ),
    global_rules: mergedGlobalRules,
    inheritance: child.inheritance ?? parent.inheritance,
  };
}

/**
 * Manifest Loader — resolves effective authority through inheritance chain.
 */
export class ManifestLoader {
  private readonly store: ManifestStore;

  constructor(store: ManifestStore) {
    this.store = store;
  }

  /**
   * Resolve effective authority for an entity path.
   * Walks the inheritance chain and applies restrictive merge at each level.
   */
  async resolveEffectiveAuthority(entityPath: EntityPath): Promise<EffectiveAuthority | null> {
    const chain = await this.store.getInheritanceChain(entityPath);

    if (chain.length === 0) return null;

    const inheritanceChain: string[] = [];
    let effective = chain[0];
    inheritanceChain.push(effective.manifest_id);

    // Merge from root toward leaf
    for (let i = 1; i < chain.length && i < MAX_INHERITANCE_DEPTH; i++) {
      inheritanceChain.push(chain[i].manifest_id);
      effective = mergeManifestsRestrictive(effective, chain[i]);
    }

    return {
      manifest: effective,
      inheritanceChain,
      resolvedAt: new Date().toISOString(),
      entityPath,
    };
  }

  /**
   * Get resolved permissions for a specific agent at an entity path.
   */
  async getAgentPermissions(
    entityPath: EntityPath,
    agentId: string,
  ): Promise<AgentPermissions | null> {
    const authority = await this.resolveEffectiveAuthority(entityPath);
    if (!authority) return null;

    return authority.manifest.agents[agentId] ??
           authority.manifest.default_permissions ??
           null;
  }
}
