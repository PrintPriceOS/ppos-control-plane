# Release v2.1.0: PrintPrice OS — Certified Control Plane

This release transforms the PrintPrice OS operations experience into a forensic-grade, explainable, and multi-tenant-aware **Control Plane**.

## 1. Architectural Foundation
- **Hierarchical Navigation**: New sidebar-driven IA replacing the monolithic dashboard.
- **Unified Traceability**: `requestId` correlation implemented as the primary indexing axis across all modules.
- **Backward Bridge**: Seamless bridge to the legacy dashboard via `/legacy` route.

## 2. Core Modules
### A. Governance & Policy Enforcement
- **Posture Visualization**: Real-time status of the regional policy authority (Enforcing/Shadow).
- **Enforcement Decisions**: Specialized audit stream for blocked requests and policy violations.
- **Post-R13 Hardening**: Full visibility into multi-tenant isolation and rate-limiting barriers.

### B. Forensic Audit Explorer
- **Deep Traceability**: Searchable log stream powered by the Enterprise `api_audit_log`.
- **Audit Timeline**: Reconstructs the exact lifecycle of a request: `AUTH` -> `POLICY` -> `QUEUE` -> `EXECUTION`.
- **Governance Snapshots**: Point-in-time posture analysis for every recorded log.

### C. Job Intelligence (Evidence View)
- **Pipeline Visibility**: Real-time status tracker for the regional BullMQ cluster.
- **Execution Proof**: Enhanced drilldown correlating job logs with governance decisions and stage latency.

## 3. Operations Guardrails
- **Production Safety**: No simulated data in forensic views.
- **Graceful Degradation**: Intelligent fallbacks for incomplete snapshots or restricted metadata.
- **Performance**: Client-side sorting and real-time filtering in all core DataTables.

## 4. Next Phase: Phase 10 — Intelligence Layer
With the v2.1.0 baseline certified, the next evolution focuses on:
- Predictive routing and printer selection.
- SLA drift detection and anomaly alerting.
- Autonomous ops for pipeline self-recovery.

---
**Status: PRODUCTION CERTIFIED & SIGNED OFF**
**Version: v2.1.0**
**Branch: phase-10-intelligence-layer (ready for extension)**
