/**
 * Invariant Governance — Error Hierarchy
 *
 * Typed error classes for all governance error conditions.
 */

/** Error codes for governance decisions */
export enum GovernanceErrorCode {
  // Entity path errors
  MISSING_ENTITY_PATH = 'MISSING_ENTITY_PATH',
  INVALID_ENTITY_PATH = 'INVALID_ENTITY_PATH',

  // Authorization errors
  UNAUTHORIZED = 'UNAUTHORIZED',
  APPROVAL_REQUIRED = 'APPROVAL_REQUIRED',
  APPROVAL_EXPIRED = 'APPROVAL_EXPIRED',
  APPROVAL_CONSUMED = 'APPROVAL_CONSUMED',
  APPROVAL_INVALID = 'APPROVAL_INVALID',

  // Enforcement errors
  RETRACTED = 'RETRACTED',
  ENFORCEMENT_DENIED = 'ENFORCEMENT_DENIED',
  KILL_SWITCH_ACTIVE = 'KILL_SWITCH_ACTIVE',
  LOCKDOWN = 'LOCKDOWN',

  // Accumulator errors
  ACCUMULATOR_BREACH = 'ACCUMULATOR_BREACH',
  BUDGET_EXHAUSTED = 'BUDGET_EXHAUSTED',
  SCOPE_VIOLATION = 'SCOPE_VIOLATION',

  // Signature errors
  SIGNATURE_INVALID = 'SIGNATURE_INVALID',
  PARAMS_MISMATCH = 'PARAMS_MISMATCH',
  REPLAY_DETECTED = 'REPLAY_DETECTED',
  RECEIPT_EXPIRED = 'RECEIPT_EXPIRED',

  // General
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

/** Base error class for all governance errors */
export class GovernanceError extends Error {
  readonly code: GovernanceErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(
    code: GovernanceErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'GovernanceError';
    this.code = code;
    this.details = details;
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      ...(this.details ? { details: this.details } : {}),
    };
  }
}

/** Entity path is missing from request */
export class MissingEntityPathError extends GovernanceError {
  constructor(message = 'Entity path is required') {
    super(GovernanceErrorCode.MISSING_ENTITY_PATH, message);
    this.name = 'MissingEntityPathError';
  }
}

/** Entity path format is invalid */
export class InvalidEntityPathError extends GovernanceError {
  readonly path: string;

  constructor(path: string, message?: string) {
    super(
      GovernanceErrorCode.INVALID_ENTITY_PATH,
      message ?? `Invalid entity path: "${path}"`,
      { path },
    );
    this.name = 'InvalidEntityPathError';
    this.path = path;
  }
}

/** Action requires approval before execution */
export class ApprovalRequiredError extends GovernanceError {
  readonly receiptId: string;
  readonly riskLevel: string;
  readonly expiresAt: string;

  constructor(receiptId: string, riskLevel: string, expiresAt: string, message?: string) {
    super(
      GovernanceErrorCode.APPROVAL_REQUIRED,
      message ?? 'Action requires approval',
      { receiptId, riskLevel, expiresAt },
    );
    this.name = 'ApprovalRequiredError';
    this.receiptId = receiptId;
    this.riskLevel = riskLevel;
    this.expiresAt = expiresAt;
  }
}

/** Entity or agent has been retracted */
export class RetractedError extends GovernanceError {
  readonly target: string;

  constructor(target: string, message?: string) {
    super(
      GovernanceErrorCode.RETRACTED,
      message ?? `Entity retracted: ${target}`,
      { target },
    );
    this.name = 'RetractedError';
    this.target = target;
  }
}

/** Accumulator safety invariant would be violated */
export class AccumulatorBreachError extends GovernanceError {
  readonly current: number;
  readonly deltaS: number;
  readonly threshold: number;

  constructor(current: number, deltaS: number, threshold: number) {
    super(
      GovernanceErrorCode.ACCUMULATOR_BREACH,
      `Accumulator breach: ${current} + ${deltaS} = ${current + deltaS} exceeds threshold ${threshold}`,
      { current, deltaS, threshold },
    );
    this.name = 'AccumulatorBreachError';
    this.current = current;
    this.deltaS = deltaS;
    this.threshold = threshold;
  }
}

/** Gate is in lockdown state (Poison Pill received) */
export class LockdownError extends GovernanceError {
  constructor(message = 'Gate is in lockdown state. All execution is blocked until human review.') {
    super(GovernanceErrorCode.LOCKDOWN, message);
    this.name = 'LockdownError';
  }
}

/** Receipt signature verification failed */
export class SignatureInvalidError extends GovernanceError {
  constructor(message = 'Receipt signature is invalid — may be forged or tampered') {
    super(GovernanceErrorCode.SIGNATURE_INVALID, message);
    this.name = 'SignatureInvalidError';
  }
}

/** Parameters do not match the approved parameters */
export class ParamsMismatchError extends GovernanceError {
  constructor(message = 'Parameter hash mismatch — action parameters differ from approved') {
    super(GovernanceErrorCode.PARAMS_MISMATCH, message);
    this.name = 'ParamsMismatchError';
  }
}

/** Receipt has already been consumed (replay attack) */
export class ReplayDetectedError extends GovernanceError {
  readonly receiptId: string;

  constructor(receiptId: string) {
    super(
      GovernanceErrorCode.REPLAY_DETECTED,
      `Receipt ${receiptId} has already been consumed — replay attack detected`,
      { receiptId },
    );
    this.name = 'ReplayDetectedError';
    this.receiptId = receiptId;
  }
}

/** Fluidity Token budget has been exhausted */
export class BudgetExhaustedError extends GovernanceError {
  readonly remaining: number;
  readonly requested: number;

  constructor(remaining: number, requested: number) {
    super(
      GovernanceErrorCode.BUDGET_EXHAUSTED,
      `Fluidity Token budget exhausted: ${remaining} remaining, ${requested} requested`,
      { remaining, requested },
    );
    this.name = 'BudgetExhaustedError';
    this.remaining = remaining;
    this.requested = requested;
  }
}

/** Action falls outside Fluidity Token scope */
export class ScopeViolationError extends GovernanceError {
  readonly action: string;
  readonly permittedActions: string[];

  constructor(action: string, permittedActions: string[]) {
    super(
      GovernanceErrorCode.SCOPE_VIOLATION,
      `Action "${action}" is outside token scope. Permitted: ${permittedActions.join(', ')}`,
      { action, permittedActions },
    );
    this.name = 'ScopeViolationError';
    this.action = action;
    this.permittedActions = permittedActions;
  }
}
