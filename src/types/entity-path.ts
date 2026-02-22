// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Holladay Labs IP, LLC

/**
 * Invariant Governance — Entity Path Utilities
 *
 * Hierarchical entity paths scope authority and enable retraction cascade.
 * Format: /segment/segment/segment/...
 * Examples:
 *   /acme/trading/equities/bot-7
 *   /hospital/ward-a/care-team/nurse-12
 *   /federal/state/county/agency
 */

import type { EntityPath } from './common.js';

/** Validation result for entity paths */
export interface EntityPathValidation {
  valid: boolean;
  segments: string[];
  error?: string;
}

/** Valid segment pattern: alphanumeric, hyphens, underscores */
const SEGMENT_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

/**
 * Validate an entity path.
 * Must start with /, have at least one segment, all segments alphanumeric.
 */
export function validateEntityPath(path: EntityPath): EntityPathValidation {
  if (!path || typeof path !== 'string') {
    return { valid: false, segments: [], error: 'Entity path is required' };
  }

  if (!path.startsWith('/')) {
    return { valid: false, segments: [], error: 'Entity path must start with /' };
  }

  const segments = path.slice(1).split('/').filter(s => s.length > 0);

  if (segments.length === 0) {
    return { valid: false, segments: [], error: 'Entity path must have at least one segment' };
  }

  for (const segment of segments) {
    if (!SEGMENT_PATTERN.test(segment)) {
      return {
        valid: false,
        segments,
        error: `Invalid segment "${segment}": must be alphanumeric with hyphens/underscores`,
      };
    }
  }

  return { valid: true, segments };
}

/**
 * Parse an entity path into its constituent segments.
 * Throws if the path is invalid.
 */
export function parseEntityPath(path: EntityPath): string[] {
  const result = validateEntityPath(path);
  if (!result.valid) {
    throw new Error(`Invalid entity path "${path}": ${result.error}`);
  }
  return result.segments;
}

/**
 * Normalize an entity path (lowercase, remove trailing slashes).
 */
export function normalizeEntityPath(path: EntityPath): EntityPath {
  const segments = parseEntityPath(path);
  return '/' + segments.map(s => s.toLowerCase()).join('/');
}

/**
 * Check if childPath is within parentPath's jurisdiction.
 * A path is within jurisdiction if it equals or starts with the parent path.
 */
export function isWithinJurisdiction(parentPath: EntityPath, childPath: EntityPath): boolean {
  const normalizedParent = normalizeEntityPath(parentPath);
  const normalizedChild = normalizeEntityPath(childPath);
  return normalizedChild === normalizedParent || normalizedChild.startsWith(normalizedParent + '/');
}

/**
 * Get all ancestor paths for a given entity path.
 * Example: /acme/trading/equities/bot-7 returns:
 *   ["/acme", "/acme/trading", "/acme/trading/equities"]
 */
export function getAncestorPaths(path: EntityPath): EntityPath[] {
  const segments = parseEntityPath(path);
  const ancestors: EntityPath[] = [];

  for (let i = 1; i < segments.length; i++) {
    ancestors.push('/' + segments.slice(0, i).join('/'));
  }

  return ancestors;
}

/**
 * Check if ancestor is an ancestor of descendant.
 */
export function isAncestorOf(ancestor: EntityPath, descendant: EntityPath): boolean {
  return isWithinJurisdiction(ancestor, descendant) && ancestor !== descendant;
}

/**
 * Get the depth (number of segments) of an entity path.
 */
export function getPathDepth(path: EntityPath): number {
  return parseEntityPath(path).length;
}

/**
 * Get the parent path of an entity path.
 * Returns null for root-level paths (single segment).
 */
export function getParentPath(path: EntityPath): EntityPath | null {
  const segments = parseEntityPath(path);
  if (segments.length <= 1) return null;
  return '/' + segments.slice(0, -1).join('/');
}
