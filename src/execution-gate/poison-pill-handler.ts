// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Holladay Labs IP, LLC

/**
 * Invariant Governance — Poison Pill Handler
 *
 * Gate-side handler for Poison Pill (302) broadcasts.
 * When a Poison Pill is active, the Gate enters lockdown:
 * all execution is blocked until human review clears it.
 */

import type { PoisonPillStore } from '../storage/interfaces.js';
import { LockdownError } from '../types/errors.js';

/**
 * Poison Pill Handler — Gate-side lockdown enforcement.
 */
export class PoisonPillHandler {
  private readonly poisonPillStore: PoisonPillStore;

  constructor(poisonPillStore: PoisonPillStore) {
    this.poisonPillStore = poisonPillStore;
  }

  /**
   * Check if the Gate is in lockdown. Throws if it is.
   */
  async assertNotLockdown(): Promise<void> {
    const active = await this.poisonPillStore.getActive();
    if (active) {
      throw new LockdownError(
        `Gate is in lockdown: ${active.reason}. Poison Pill ${active.pill_id} broadcast at ${active.broadcast_at}. All execution blocked until human review.`,
      );
    }
  }

  /**
   * Check if the Gate is in lockdown (boolean).
   */
  async isLockdown(): Promise<boolean> {
    const active = await this.poisonPillStore.getActive();
    return active !== null;
  }
}
