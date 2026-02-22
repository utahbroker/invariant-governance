// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Holladay Labs IP, LLC

/**
 * Invariant Governance — Stateful Accumulator (102)
 *
 * Tracks cumulative state-change magnitude within a sliding window.
 * Enforces the safety invariant: V_current + delta_S <= Omega
 *
 * The accumulator prevents "salami-slicing" attacks where many small
 * actions individually pass but collectively exceed safe thresholds.
 * 1000 x $1 hits the same threshold as 1 x $1000.
 *
 * Architecture doc Section 3.3-3.4
 */

import type { EntityPath } from '../types/common.js';
import type { AccumulatorSnapshot } from '../types/receipts.js';
import { AccumulatorBreachError } from '../types/errors.js';
import { parseDuration } from '../types/common.js';
import type { Duration } from '../types/common.js';

/** A single accumulator entry within the sliding window */
interface AccumulatorEntry {
  deltaS: number;
  timestamp: number; // epoch ms
}

/** Per-entity-path accumulator state */
interface AccumulatorState {
  entries: AccumulatorEntry[];
}

/**
 * Stateful Accumulator (102) — cumulative risk tracking.
 *
 * Maintains a sliding window of state-change magnitudes per entity path.
 * Before any action is authorized, the accumulator checks:
 *   V_current + delta_S <= Omega
 *
 * Where:
 *   V_current = sum of all delta_S values within the current window
 *   delta_S = state-change magnitude of the proposed action
 *   Omega = safety threshold (from PolicyMatrix.maxCumulativeWindow)
 */
export class StatefulAccumulator {
  private state = new Map<string, AccumulatorState>();
  private readonly windowMs: number;
  private readonly threshold: number;
  private readonly thresholdOverrides: Record<string, number>;

  constructor(options: {
    /** Maximum cumulative state-change within the window (Omega) */
    threshold: number;
    /** Duration of the sliding window */
    windowDuration: Duration;
    /** Per-entity-path threshold overrides */
    thresholdOverrides?: Record<string, number>;
  }) {
    this.threshold = options.threshold;
    this.windowMs = parseDuration(options.windowDuration);
    this.thresholdOverrides = options.thresholdOverrides ?? {};
  }

  /**
   * Get the effective threshold for an entity path.
   * Checks for per-path overrides, falls back to global.
   */
  private getThreshold(entityPath: EntityPath): number {
    return this.thresholdOverrides[entityPath] ?? this.threshold;
  }

  /**
   * Prune expired entries from the window.
   */
  private prune(state: AccumulatorState, now: number): void {
    const cutoff = now - this.windowMs;
    state.entries = state.entries.filter(e => e.timestamp > cutoff);
  }

  /**
   * Get the current accumulated value for an entity path.
   */
  getCurrentValue(entityPath: EntityPath): number {
    const state = this.state.get(entityPath);
    if (!state) return 0;

    this.prune(state, Date.now());
    return state.entries.reduce((sum, e) => sum + e.deltaS, 0);
  }

  /**
   * Check if an action with the given delta_S would breach the threshold.
   * Does NOT record the action — use record() after authorization.
   *
   * @returns AccumulatorSnapshot with pre/post values
   * @throws AccumulatorBreachError if V_current + delta_S > Omega
   */
  check(entityPath: EntityPath, deltaS: number): AccumulatorSnapshot {
    const now = Date.now();
    const omega = this.getThreshold(entityPath);

    // Get or create state
    let state = this.state.get(entityPath);
    if (!state) {
      state = { entries: [] };
      this.state.set(entityPath, state);
    }

    // Prune expired entries
    this.prune(state, now);

    // Calculate current accumulation
    const vCurrent = state.entries.reduce((sum, e) => sum + e.deltaS, 0);

    // Check invariant: V_current + delta_S <= Omega
    if (vCurrent + deltaS > omega) {
      throw new AccumulatorBreachError(vCurrent, deltaS, omega);
    }

    return {
      pre_delta: vCurrent,
      delta_s: deltaS,
      post_delta: vCurrent + deltaS,
      threshold: omega,
    };
  }

  /**
   * Record a state-change after authorization.
   * Called after an action is approved to update the accumulator.
   */
  record(entityPath: EntityPath, deltaS: number): void {
    let state = this.state.get(entityPath);
    if (!state) {
      state = { entries: [] };
      this.state.set(entityPath, state);
    }

    state.entries.push({
      deltaS,
      timestamp: Date.now(),
    });
  }

  /**
   * Reset accumulator state for an entity path.
   * Used during testing or administrative reset.
   */
  reset(entityPath: EntityPath): void {
    this.state.delete(entityPath);
  }

  /**
   * Reset all accumulator state.
   */
  resetAll(): void {
    this.state.clear();
  }
}
