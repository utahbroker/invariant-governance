/**
 * Invariant Governance — Policy Evaluator
 *
 * Deterministic policy evaluation pipeline. Evaluates an intent proposal
 * against the effective authority manifest and policy matrix.
 *
 * Ported from homerhq-bot-empire enforce.ts 7-step pipeline,
 * generalized to be domain-agnostic.
 *
 * Evaluation Steps:
 * 1. Validate entity path
 * 2. Check retraction status (entity + ancestors)
 * 3. Resolve effective authority manifest (with restrictive inheritance)
 * 4. Check action against forbidden patterns (explicit deny)
 * 5. Check action against allowed patterns
 * 6. Check if action requires approval
 * 7. Classify risk level
 */

import type { RiskLevel, DecisionOutcome } from '../types/common.js';
import type { IntentProposal } from '../types/receipts.js';
import type { AgentPermissions, PolicyMatrix } from '../types/policy.js';
import { matchActionPattern, matchesAnyPattern } from '../types/policy.js';
import { validateEntityPath } from '../types/entity-path.js';
import { InvalidEntityPathError } from '../types/errors.js';

/** Result of policy evaluation */
export interface PolicyEvaluation {
  /** The decision outcome */
  outcome: DecisionOutcome;
  /** Risk level classification */
  riskLevel: RiskLevel;
  /** Reason for the decision */
  reason: string;
  /** Resolved agent permissions used */
  permissions?: AgentPermissions;
  /** Authority manifest reference */
  manifestRef?: string;
}

/**
 * Policy Evaluator — deterministic governance decision engine.
 *
 * Evaluates intent proposals against policy matrix and authority manifests.
 * This is a pure decision engine: it does NOT sign receipts, modify state,
 * or perform any side effects. The Governance Kernel orchestrates those.
 */
export class PolicyEvaluator {
  private readonly policy: PolicyMatrix;

  constructor(policy: PolicyMatrix) {
    this.policy = policy;
  }

  /**
   * Evaluate an intent proposal against policy.
   *
   * @param proposal - The intent proposal to evaluate
   * @param permissions - Resolved agent permissions (from manifest)
   * @param manifestRef - Reference to the authority manifest used
   * @returns PolicyEvaluation with outcome and reasoning
   */
  evaluate(
    proposal: IntentProposal,
    permissions: AgentPermissions | null,
    manifestRef?: string,
  ): PolicyEvaluation {
    // Step 1: Validate entity path
    const pathValidation = validateEntityPath(proposal.entity_path);
    if (!pathValidation.valid) {
      throw new InvalidEntityPathError(proposal.entity_path, pathValidation.error);
    }

    // Step 2: Check single-action magnitude limit
    if (proposal.delta_s > this.policy.maxSingleAction) {
      return {
        outcome: 'denied',
        riskLevel: 'critical',
        reason: `Action magnitude ${proposal.delta_s} exceeds single-action limit ${this.policy.maxSingleAction}`,
        permissions: permissions ?? undefined,
        manifestRef,
      };
    }

    // Step 3: If no permissions resolved, deny by default
    if (!permissions) {
      return {
        outcome: 'denied',
        riskLevel: this.classifyRiskLevel(proposal.action, proposal.delta_s),
        reason: 'No authority manifest found for entity path',
        manifestRef,
      };
    }

    // Step 4: Check forbidden patterns (explicit deny overrides everything)
    if (permissions.forbidden && permissions.forbidden.length > 0) {
      if (matchesAnyPattern(proposal.action, permissions.forbidden)) {
        return {
          outcome: 'denied',
          riskLevel: this.classifyRiskLevel(proposal.action, proposal.delta_s),
          reason: `Action "${proposal.action}" is explicitly forbidden`,
          permissions,
          manifestRef,
        };
      }
    }

    // Step 5: Check allowed patterns
    const isAllowed = !permissions.allowed || permissions.allowed.length === 0 ||
      matchesAnyPattern(proposal.action, permissions.allowed);

    if (!isAllowed) {
      return {
        outcome: 'denied',
        riskLevel: this.classifyRiskLevel(proposal.action, proposal.delta_s),
        reason: `Action "${proposal.action}" is not in the allowed list`,
        permissions,
        manifestRef,
      };
    }

    // Step 6: Check if action requires approval
    const requiresApproval =
      (permissions.requires_approval && matchesAnyPattern(proposal.action, permissions.requires_approval)) ||
      (this.policy.requireDualAttestation?.(proposal.delta_s));

    if (requiresApproval) {
      return {
        outcome: 'approval_required',
        riskLevel: this.classifyRiskLevel(proposal.action, proposal.delta_s),
        reason: `Action "${proposal.action}" requires approval`,
        permissions,
        manifestRef,
      };
    }

    // Step 7: All checks passed — action is allowed
    return {
      outcome: 'allowed',
      riskLevel: this.classifyRiskLevel(proposal.action, proposal.delta_s),
      reason: `Action "${proposal.action}" allowed`,
      permissions,
      manifestRef,
    };
  }

  /**
   * Classify risk level for an action using policy rules.
   */
  classifyRiskLevel(action: string, deltaS: number): RiskLevel {
    // Check action rules first
    if (this.policy.actionRules) {
      for (const rule of this.policy.actionRules) {
        if (matchActionPattern(action, rule.pattern)) {
          return rule.risk_level;
        }
      }
    }

    // Fall back to delta_s-based classification
    if (deltaS >= this.policy.maxSingleAction * 0.8) return 'critical';
    if (deltaS >= this.policy.maxSingleAction * 0.5) return 'high';
    if (deltaS >= this.policy.maxSingleAction * 0.2) return 'medium';

    return this.policy.defaultRiskLevel ?? 'low';
  }
}
