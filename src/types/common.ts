// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Holladay Labs IP, LLC

/**
 * Invariant Governance — Common Type Definitions
 *
 * Fundamental type aliases used across all components.
 */

/** ISO 8601 timestamp string */
export type Timestamp = string;

/** Hierarchical entity path: /org/division/function/agent */
export type EntityPath = string;

/** Risk classification for governance decisions */
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

/** Duration string: "1h", "30m", "24h", "7d" */
export type Duration = string;

/** Decision outcome from governance evaluation */
export type DecisionOutcome = 'allowed' | 'denied' | 'approval_required';

/** Parse a Duration string into milliseconds */
export function parseDuration(duration: Duration): number {
  const match = duration.match(/^(\d+)(ms|s|m|h|d)$/);
  if (!match) {
    throw new Error(`Invalid duration format: "${duration}". Expected format: "30s", "5m", "1h", "7d"`);
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  const multipliers: Record<string, number> = {
    ms: 1,
    s: 1_000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };

  return value * multipliers[unit];
}
