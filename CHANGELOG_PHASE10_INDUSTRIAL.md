# Changelog — Phase 10: Industrial Operations Intelligence

## Summary
Phase 10 transitions the PrintPrice OS Control Plane into a production-ready industrial orchestration engine. This release introduces capability-aware job routing, automated artifact lifecycle governance, and a high-fidelity incident registry.

## New Features
- **Orchestration Service**: Intelligent execution planning with resource-isolated queues (Standard vs. Large Document).
- **Artifact Registry**: Forensic-grade persistence for document metadata, lineage, and checksums.
- **Incident Registry**: Automated tracking of infrastructure degradation and automated response triggers.
- **Lifecycle Manager**: Rule-based storage tiering (HOT/WARM/COLD) and retention governance.
- **Industrial NOC**: Unified administrative surface for managing distributed clusters and document storage.

## Backend Changes
- Added `orchestrationService.js`, `artifactLifecycleManager.js`, `incidentService.js`.
- Integrated `preflightOperationsService` with execution planning.
- Enhanced `telemetryService` with industrial health scores.
- New MySQL schema: `preflight_artifacts`, `worker_nodes`, `operational_incidents`, `lifecycle_policies`.

## Frontend Changes
- New **Industrial Operations** module under `/admin/industrial`.
- High-fidelity tabs for Orchestration, Incidents, and Lifecycle management.
- Real-time fleet health visualization.
- Sidebar navigation reorganization for industrial visibility.

## Security & Governance
- Hardened RBAC for industrial mutations.
- Causal traceability via `forensic_trace_id` across the pipeline.
- Removal of synthetic/mock fallbacks in core telemetry paths.

## Deployment Notes
- Requires MySQL 8.
- Requires execution of `docs/migrations/phase10_industrial_operations.sql`.
- New `.env` variables: `PPOS_ENABLE_SCHEMA_MUTATION`, `PPOS_CONTROL_TOKEN`.

## Known Risks
- Artifact backfill for legacy jobs is not automated in this release.
- Circuit breaker auto-remediation is currently advisory (manual override required).
