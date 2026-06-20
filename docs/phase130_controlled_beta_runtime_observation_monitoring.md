# Phase 130: Controlled Beta Cohort Runtime Observation & Operational Monitoring

## Overview
Phase 130 introduces a robust, DB-backed observation framework tailored for the active controlled beta cohort. This framework strictly focuses on observation and operational awareness without enabling public access, payment execution, or provider submission.

## Architecture

### 1. Database Schema (Migration 077 and 078)
We created 14 new tables to persistently store the observation telemetry:
- **Sessions & Events:** Tracking participant presence and interactions.
- **Health Snapshots:** Rolling aggregates of the cohort state.
- **Guardrails & Incidents:** Monitoring forbidden feature attempts, SLA warnings, kill-switch activations, and incidents.
- **Evidence & Findings:** Providing audit trails and resolution paths for observation findings.

All tables include robust safety constraints with defaulting to disabled (e.g. `full_public_enabled = 0`). Migration 078 specifically aligns the `event_type` column requirement into the `sessions` table.

### 2. Service Layer
The `ControlledBetaRuntimeObservationService` provides the core logic:
- Real-time logging of access, SLA, guardrail events, and incidents.
- Dynamic calculation of the runtime risk score.
- Compilation of aggregated health snapshots.
- Secure redaction and generation of observation evidence packs.

### 3. Admin API & UI
- Exposed 25 granular endpoints via `/api/admin/beta/runtime-observation`.
- Mounted a new dashboard at `ControlledBetaRuntimeObservation.tsx` with high-visibility warnings emphasizing the strictly observational nature of the current deployment phase.

## Safety & Invariants
Phase 130 adheres strictly to the safety gates:
- No real financial transactions.
- No public user registration.
- No external marketplace integrations.
- Fail-closed evaluation if the runtime schema is unavailable.

## Verification
- **Smoke 130A:** Verifies schema installation and integrity.
- **Smoke 130B:** Checks service capabilities.
- **Smoke 130C-G:** Tests specific observation areas (events, risk scoring, SLA logging, evidence generation).
- **Smoke 130H:** Master aggregator, backwards compatible and recursively asserting Phase 129, 128.1, 128, and 127.1 tests.
