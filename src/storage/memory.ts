// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Holladay Labs IP, LLC

/**
 * Invariant Governance — In-Memory Storage Adapter
 *
 * Default storage implementation for development, testing, and
 * single-process deployments. All state lives in memory and is
 * lost on process restart.
 */

import type { EntityPath } from '../types/common.js';
import type { ApprovalReceipt, FluidityToken, PoisonPillRecord, RetractionRecord } from '../types/receipts.js';
import type { AuditEntry } from '../types/decisions.js';
import type { AuthorityManifest } from '../types/policy.js';
import { getAncestorPaths } from '../types/entity-path.js';
import type {
  StorageAdapter,
  KVStore,
  ConsumptionStore,
  AuditStore,
  ReceiptStore,
  TokenStore,
  ManifestStore,
  RetractionStore,
  PoisonPillStore,
} from './interfaces.js';

class InMemoryKVStore implements KVStore {
  private store = new Map<string, { value: unknown; expiresAt?: number }>();

  async get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttlMs?: number): Promise<void> {
    this.store.set(key, {
      value,
      expiresAt: ttlMs ? Date.now() + ttlMs : undefined,
    });
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async list(prefix: string): Promise<string[]> {
    const keys: string[] = [];
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        const entry = this.store.get(key)!;
        if (!entry.expiresAt || Date.now() <= entry.expiresAt) {
          keys.push(key);
        }
      }
    }
    return keys;
  }
}

class InMemoryConsumptionStore implements ConsumptionStore {
  private consumed = new Map<string, string>();

  async isConsumed(receiptId: string): Promise<boolean> {
    return this.consumed.has(receiptId);
  }

  async markConsumed(receiptId: string, consumedAt: string): Promise<void> {
    this.consumed.set(receiptId, consumedAt);
  }
}

class InMemoryAuditStore implements AuditStore {
  private entries: AuditEntry[] = [];

  async append(entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
  }

  async getLatest(): Promise<AuditEntry | null> {
    return this.entries.length > 0 ? this.entries[this.entries.length - 1] : null;
  }

  async getBySequence(sequence: number): Promise<AuditEntry | null> {
    return this.entries.find(e => e.sequence === sequence) ?? null;
  }

  async getRange(startSequence: number, endSequence: number): Promise<AuditEntry[]> {
    return this.entries.filter(e => e.sequence >= startSequence && e.sequence <= endSequence);
  }

  async getLength(): Promise<number> {
    return this.entries.length;
  }
}

class InMemoryReceiptStore implements ReceiptStore {
  private receipts = new Map<string, ApprovalReceipt>();
  private revoked = false;

  async store(receipt: ApprovalReceipt): Promise<void> {
    this.receipts.set(receipt.receipt_id, receipt);
  }

  async get(receiptId: string): Promise<ApprovalReceipt | null> {
    if (this.revoked) return null;
    return this.receipts.get(receiptId) ?? null;
  }

  async revokeAll(): Promise<number> {
    const count = this.receipts.size;
    this.revoked = true;
    this.receipts.clear();
    return count;
  }

  async listActive(entityPath: EntityPath): Promise<ApprovalReceipt[]> {
    if (this.revoked) return [];
    const now = new Date().toISOString();
    const active: ApprovalReceipt[] = [];
    for (const receipt of this.receipts.values()) {
      if (receipt.entity_path === entityPath && receipt.expires_at > now) {
        active.push(receipt);
      }
    }
    return active;
  }
}

class InMemoryTokenStore implements TokenStore {
  private tokens = new Map<string, FluidityToken>();
  private revoked = false;

  async store(token: FluidityToken): Promise<void> {
    this.tokens.set(token.token_id, token);
  }

  async get(tokenId: string): Promise<FluidityToken | null> {
    if (this.revoked) return null;
    return this.tokens.get(tokenId) ?? null;
  }

  async update(token: FluidityToken): Promise<void> {
    this.tokens.set(token.token_id, token);
  }

  async revokeAll(): Promise<number> {
    const count = this.tokens.size;
    this.revoked = true;
    this.tokens.clear();
    return count;
  }

  async listActive(entityPath: EntityPath): Promise<FluidityToken[]> {
    if (this.revoked) return [];
    const now = new Date().toISOString();
    const active: FluidityToken[] = [];
    for (const token of this.tokens.values()) {
      if (token.entity_path === entityPath && token.expires_at > now) {
        active.push(token);
      }
    }
    return active;
  }
}

class InMemoryManifestStore implements ManifestStore {
  private manifests = new Map<string, AuthorityManifest>();

  async store(manifest: AuthorityManifest): Promise<void> {
    this.manifests.set(manifest.entity_path, manifest);
  }

  async getByEntityPath(entityPath: EntityPath): Promise<AuthorityManifest | null> {
    return this.manifests.get(entityPath) ?? null;
  }

  async getInheritanceChain(entityPath: EntityPath): Promise<AuthorityManifest[]> {
    const ancestors = getAncestorPaths(entityPath);
    const chain: AuthorityManifest[] = [];

    // Walk from root to leaf
    for (const ancestor of ancestors) {
      const manifest = this.manifests.get(ancestor);
      if (manifest) chain.push(manifest);
    }

    // Include the entity's own manifest
    const own = this.manifests.get(entityPath);
    if (own) chain.push(own);

    return chain;
  }
}

class InMemoryRetractionStore implements RetractionStore {
  private retractions = new Map<string, RetractionRecord>();

  async retract(record: RetractionRecord): Promise<void> {
    this.retractions.set(record.entity_path, record);
  }

  async isRetracted(entityPath: EntityPath): Promise<boolean> {
    // Check if this entity or any ancestor is retracted
    if (this.retractions.has(entityPath)) return true;
    const ancestors = getAncestorPaths(entityPath);
    return ancestors.some(a => this.retractions.has(a));
  }

  async reinstate(entityPath: EntityPath): Promise<void> {
    this.retractions.delete(entityPath);
  }

  async listRetracted(): Promise<RetractionRecord[]> {
    return Array.from(this.retractions.values());
  }
}

class InMemoryPoisonPillStore implements PoisonPillStore {
  private active: PoisonPillRecord | null = null;
  private history: PoisonPillRecord[] = [];

  async store(record: PoisonPillRecord): Promise<void> {
    this.active = record;
    this.history.push(record);
  }

  async getActive(): Promise<PoisonPillRecord | null> {
    return this.active;
  }

  async clearActive(): Promise<void> {
    this.active = null;
  }
}

/**
 * In-memory storage adapter. All state is held in memory.
 * Suitable for development, testing, and single-process deployments.
 */
export class InMemoryStorageAdapter implements StorageAdapter {
  readonly kv: KVStore = new InMemoryKVStore();
  readonly consumption: ConsumptionStore = new InMemoryConsumptionStore();
  readonly audit: AuditStore = new InMemoryAuditStore();
  readonly receipts: ReceiptStore = new InMemoryReceiptStore();
  readonly tokens: TokenStore = new InMemoryTokenStore();
  readonly manifests: ManifestStore = new InMemoryManifestStore();
  readonly retractions: RetractionStore = new InMemoryRetractionStore();
  readonly poisonPills: PoisonPillStore = new InMemoryPoisonPillStore();
}
