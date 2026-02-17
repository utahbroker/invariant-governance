/**
 * Invariant Governance — Telemetry Barrel Export
 */

export { TelemetryObserver } from './observer.js';
export type { TelemetryObserverOptions } from './observer.js';
export { AuditChain } from './audit-chain.js';
export { DegradationScorer } from './degradation.js';
export { DriftDetector } from './drift-detector.js';
export type { DriftResult } from './drift-detector.js';
export type { TelemetrySink } from './sinks.js';
export { ConsoleSink, CallbackSink, MultiSink } from './sinks.js';
