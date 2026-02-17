/**
 * Invariant Governance — ID Generation
 *
 * Unique identifier generation for receipts, tokens, audit entries,
 * and other governance artifacts.
 *
 * Ported from homerhq-bot-empire governance-enforcer/src/governance/hash.ts
 */

import { randomUUID } from 'node:crypto';

/** Generate a UUID v4 */
export function generateUUID(): string {
  return randomUUID();
}

/** Generate a unique Approval Receipt ID */
export function generateReceiptId(): string {
  return `rcpt_${randomUUID()}`;
}

/** Generate a unique Fluidity Token ID */
export function generateTokenId(): string {
  return `ft_${randomUUID()}`;
}

/** Generate a unique Audit Entry ID */
export function generateEntryId(): string {
  return `aud_${randomUUID()}`;
}

/** Generate a unique Poison Pill ID */
export function generatePillId(): string {
  return `pill_${randomUUID()}`;
}

/** Generate a unique Manifest ID */
export function generateManifestId(): string {
  return `mfst_${randomUUID()}`;
}
