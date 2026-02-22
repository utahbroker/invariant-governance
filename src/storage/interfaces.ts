// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Holladay Labs IP, LLC

/**
 * Invariant Governance — Storage Adapter Interfaces
 *
 * Vendor-neutral storage abstractions. The SDK ships with an in-memory
 * default; production deployments plug in Redis, Cloudflare KV/D1,
 * DynamoDB, PostgreSQL, etc.
 *
 * Storage views enforce structural separation:
 * - Governance Kernel: full R/W to KVStore
 * - Execution Gate: read-only KV + write-only ConsumptionStore
 * - Telemetry Observer: append-only AuditStore
 */

import type {
  EntityPath,
  ApprovalReceipt,
  FluidityToken,
  AuditEntry,
  AuthorityManifest,
  PoisonPillRecord,
  RetractionRecord,
} from '../types/index.js';

/** Generic key-value store for governance state */
export interface KVStore {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlMs?: number): Promise<void>;
  delete(key: string): Promise<void>;
  list(prefix: string): Promise<string[]>;
}

/** Receipt consumption tracking (replay prevention) */
export interface ConsumptionStore {
  /** Check if a receipt has been consumed */
  isConsumed(receiptId: string): Promise<boolean>;
  /** Mark a receipt as consumed (single-use enforcement) */
  markConsumed(receiptId: string, consumedAt: string): Promise<void>;
}

/** Append-only audit log storage */
export interface AuditStore {
  /** Append an entry to the audit chain */
  append(entry: AuditEntry): Promise<void>;
  /** Get the latest entry (for chain linkage) */
  getLatest(): Promise<AuditEntry | null>;
  /** Get an entry by sequence number */
  getBySequence(sequence: number): Promise<AuditEntry | null>;
  /** Get entries in a range (inclusive) */
  getRange(startSequence: number, endSequence: number): Promise<AuditEntry[]>;
  /** Get the current chain length */
  getLength(): Promise<number>;
}

/** Receipt storage (issued Approval Receipts) */
export interface ReceiptStore {
  /** Store an issued receipt */
  store(receipt: ApprovalReceipt): Promise<void>;
  /** Get a receipt by ID */
  get(receiptId: string): Promise<ApprovalReceipt | null>;
  /** Revoke all receipts (Poison Pill) */
  revokeAll(): Promise<number>;
  /** List active receipts for an entity path */
  listActive(entityPath: EntityPath): Promise<ApprovalReceipt[]>;
}

/** Fluidity Token storage */
export interface TokenStore {
  /** Store an issued token */
  store(token: FluidityToken): Promise<void>;
  /** Get a token by ID */
  get(tokenId: string): Promise<FluidityToken | null>;
  /** Update a token (e.g., decrement budget) */
  update(token: FluidityToken): Promise<void>;
  /** Revoke all tokens (Poison Pill) */
  revokeAll(): Promise<number>;
  /** List active tokens for an entity path */
  listActive(entityPath: EntityPath): Promise<FluidityToken[]>;
}

/** Authority manifest storage */
export interface ManifestStore {
  /** Store a manifest */
  store(manifest: AuthorityManifest): Promise<void>;
  /** Get a manifest by entity path */
  getByEntityPath(entityPath: EntityPath): Promise<AuthorityManifest | null>;
  /** Get manifests for an entity path and all its ancestors */
  getInheritanceChain(entityPath: EntityPath): Promise<AuthorityManifest[]>;
}

/** Retraction state storage */
export interface RetractionStore {
  /** Record a retraction */
  retract(record: RetractionRecord): Promise<void>;
  /** Check if an entity path is retracted */
  isRetracted(entityPath: EntityPath): Promise<boolean>;
  /** Reinstate a previously retracted entity */
  reinstate(entityPath: EntityPath): Promise<void>;
  /** List all retracted entity paths */
  listRetracted(): Promise<RetractionRecord[]>;
}

/** Poison Pill record storage */
export interface PoisonPillStore {
  /** Store a Poison Pill record */
  store(record: PoisonPillRecord): Promise<void>;
  /** Get the most recent Poison Pill (if active) */
  getActive(): Promise<PoisonPillRecord | null>;
  /** Clear the active Poison Pill (human review completed) */
  clearActive(): Promise<void>;
}

/**
 * Unified storage adapter combining all stores.
 * Implementations can share a single backing store or use separate stores.
 */
export interface StorageAdapter {
  readonly kv: KVStore;
  readonly consumption: ConsumptionStore;
  readonly audit: AuditStore;
  readonly receipts: ReceiptStore;
  readonly tokens: TokenStore;
  readonly manifests: ManifestStore;
  readonly retractions: RetractionStore;
  readonly poisonPills: PoisonPillStore;
}
