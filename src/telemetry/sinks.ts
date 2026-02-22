// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Holladay Labs IP, LLC

/**
 * Invariant Governance — Telemetry Sinks
 *
 * Sink interface for telemetry output. Events flow one-way
 * from the governance system to sinks (console, file, webhook, etc.).
 * This is the "One-Way Mirror" (400) — sinks can observe but
 * NEVER influence governance decisions.
 */

import type { TelemetryEntry } from '../types/decisions.js';

/** Telemetry sink interface — receives events, cannot send commands */
export interface TelemetrySink {
  /** Write a telemetry entry to this sink */
  write(entry: TelemetryEntry): Promise<void>;
  /** Flush any buffered entries */
  flush?(): Promise<void>;
}

/**
 * Console sink — writes telemetry to stdout.
 * Useful for development and debugging.
 */
export class ConsoleSink implements TelemetrySink {
  private readonly prefix: string;

  constructor(prefix: string = '[GOV]') {
    this.prefix = prefix;
  }

  async write(entry: TelemetryEntry): Promise<void> {
    const line = `${this.prefix} ${entry.timestamp} [${entry.type}] ${entry.entity_path} ${JSON.stringify(entry.data)}`;
    console.log(line);
  }
}

/**
 * Callback sink — invokes a function for each entry.
 * Useful for custom integrations.
 */
export class CallbackSink implements TelemetrySink {
  private readonly callback: (entry: TelemetryEntry) => void | Promise<void>;

  constructor(callback: (entry: TelemetryEntry) => void | Promise<void>) {
    this.callback = callback;
  }

  async write(entry: TelemetryEntry): Promise<void> {
    await this.callback(entry);
  }
}

/**
 * Multi-sink — fans out entries to multiple sinks.
 */
export class MultiSink implements TelemetrySink {
  private readonly sinks: TelemetrySink[];

  constructor(sinks: TelemetrySink[]) {
    this.sinks = sinks;
  }

  async write(entry: TelemetryEntry): Promise<void> {
    await Promise.all(this.sinks.map(s => s.write(entry)));
  }

  async flush(): Promise<void> {
    await Promise.all(this.sinks.map(s => s.flush?.()));
  }
}
