/**
 * Invariant Governance — Cryptographic Hashing
 *
 * SHA-256 hashing for parameter binding, audit chain integrity,
 * and tamper-evident decision logs.
 *
 * Ported from homerhq-bot-empire governance-enforcer/src/governance/hash.ts
 * with Cloudflare-specific APIs replaced by Node.js crypto.
 */

import { createHash } from 'node:crypto';

/**
 * Compute SHA-256 hash of a string, returned as lowercase hex.
 */
export function sha256(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

/**
 * Deterministic JSON stringification for hash binding.
 * Sorts object keys recursively to ensure identical inputs
 * always produce identical hashes regardless of key insertion order.
 */
export function stableStringify(obj: unknown): string {
  if (obj === null || obj === undefined) return '';
  if (typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) {
    return '[' + obj.map(stableStringify).join(',') + ']';
  }

  const sorted = Object.keys(obj as Record<string, unknown>).sort();
  const parts = sorted.map(key => {
    const value = (obj as Record<string, unknown>)[key];
    return JSON.stringify(key) + ':' + stableStringify(value);
  });

  return '{' + parts.join(',') + '}';
}

/**
 * Compute SHA-256 hash of action parameters for receipt binding.
 * The hash binds a specific set of parameters to an Approval Receipt (106),
 * ensuring the receipt cannot be used with different parameters.
 */
export function computeParamsHash(params: Record<string, unknown>): string {
  return sha256(stableStringify(params));
}

/**
 * Compute the hash of an audit entry for chain linkage.
 * Includes all fields except entry_hash itself (which IS this hash).
 */
export function computeEntryHash(entry: {
  entry_id: string;
  sequence: number;
  timestamp: string;
  entity_path: string;
  action: string;
  outcome: string;
  reason?: string;
  params_hash: string;
  receipt_id?: string;
  risk_level?: string;
  prev_hash: string;
}): string {
  const data = stableStringify({
    entry_id: entry.entry_id,
    sequence: entry.sequence,
    timestamp: entry.timestamp,
    entity_path: entry.entity_path,
    action: entry.action,
    outcome: entry.outcome,
    reason: entry.reason ?? '',
    params_hash: entry.params_hash,
    receipt_id: entry.receipt_id ?? '',
    risk_level: entry.risk_level ?? '',
    prev_hash: entry.prev_hash,
  });
  return sha256(data);
}
