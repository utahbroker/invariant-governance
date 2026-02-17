/**
 * Invariant Governance — Policy Types
 *
 * Policy Matrix, Agent Permissions, and Authority Manifests.
 */

import type { EntityPath, RiskLevel, Timestamp, Duration } from './common.js';

/** Permissions for a specific agent within a manifest */
export interface AgentPermissions {
  /** Action patterns this agent is allowed to perform */
  allowed?: string[];
  /** Action patterns explicitly forbidden (overrides allowed) */
  forbidden?: string[];
  /** Action patterns that require human approval */
  requires_approval?: string[];
  /** Agents this agent can delegate to */
  can_delegate_to?: string[];
  /** Maximum spend per action (USD) */
  spend_limit?: number;
  /** Action patterns that trigger alerts */
  alert_on?: string[];
}

/** Authority manifest defining permissions for a scope */
export interface AuthorityManifest {
  manifest_id: string;
  version: string;
  entity_path: EntityPath;
  parent_path?: EntityPath;
  description?: string;
  effective_date: Timestamp;
  expires_at?: Timestamp;
  /** Agent-specific permissions */
  agents: Record<string, AgentPermissions>;
  /** Default permissions for unknown agents */
  default_permissions?: AgentPermissions;
  /** Global rules that apply to all agents */
  global_rules?: {
    always_log?: string[];
    always_alert?: string[];
    approval_timeout_minutes?: number;
    max_delegation_depth?: number;
  };
  /** Inheritance configuration */
  inheritance?: {
    mode: 'restrictive' | 'permissive';
    child_can_expand: boolean;
    child_can_restrict: boolean;
    explicit_deny_overrides: boolean;
  };
}

/** Action classification rule */
export interface ActionRule {
  /** Action pattern (supports wildcards: *, domain.*, *.operation) */
  pattern: string;
  /** Risk level for matching actions */
  risk_level: RiskLevel;
  /** Whether matching actions are considered writes */
  is_write: boolean;
  /** Whether matching actions require approval */
  requires_approval: boolean;
}

/** Policy matrix configuration for the Governance Kernel */
export interface PolicyMatrix {
  /** Maximum state-change magnitude for a single action */
  maxSingleAction: number;
  /** Maximum cumulative state-change within a window (Omega) */
  maxCumulativeWindow: number;
  /** Duration of the accumulator window */
  windowDuration: Duration;
  /** Function to determine if an action requires multi-signature */
  requireDualAttestation?: (deltaS: number) => boolean;
  /** Per-entity-path threshold overrides */
  thresholds?: Record<EntityPath, number>;
  /** Action classification rules */
  actionRules?: ActionRule[];
  /** Default risk level for unclassified actions */
  defaultRiskLevel?: RiskLevel;
}

/** Result of resolving effective authority through inheritance chain */
export interface EffectiveAuthority {
  manifest: AuthorityManifest;
  inheritanceChain: string[];
  resolvedAt: Timestamp;
  entityPath: EntityPath;
}

/**
 * Match an action string against a pattern.
 * Supports: "*" (all), "domain.*" (domain wildcard),
 * "*.operation" (operation wildcard), "domain.operation" (exact).
 */
export function matchActionPattern(action: string, pattern: string): boolean {
  if (pattern === '*') return true;

  const normalizedAction = action.toLowerCase();
  const normalizedPattern = pattern.toLowerCase();

  if (normalizedPattern.endsWith('.*')) {
    const prefix = normalizedPattern.slice(0, -2);
    return normalizedAction.startsWith(prefix + '.') || normalizedAction === prefix;
  }

  if (normalizedPattern.startsWith('*.')) {
    const suffix = normalizedPattern.slice(2);
    return normalizedAction.endsWith('.' + suffix);
  }

  return normalizedAction === normalizedPattern;
}

/**
 * Check if an action matches any pattern in a list.
 */
export function matchesAnyPattern(action: string, patterns: string[]): boolean {
  return patterns.some(p => matchActionPattern(action, p));
}
