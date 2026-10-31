# Phase 191D: Readiness Acceptance

## 1. Goal
Extend the progressive onboarding readiness framework to enforce machinery and capabilities gates, ensuring the tenant cannot bypass configuration milestones before activating live production.

---

## 2. Readiness Evaluation Rules

The `printhouseReadinessService.js` enforces the following gates:

### 2.1 Accounts & Profiles Section
- **Gate**: Company profile completeness and production sites presence.
- **Completeness**:
  - `status: COMPLETE` when name, country, and contact info are provided, and at least one production site exists.

### 2.2 Operational Readiness Section (New Gates)
- **Gate 1: Machinery Configuration**:
  - At least one configured machine must exist (`status != 'ARCHIVED'`).
  - Blocks with `ADD_FIRST_MACHINE` if count is zero.
- **Gate 2: Capability Provenance**:
  - At least one configured machine must have active capability attributes (flags or color modes set).
  - Flags advisories with `CONFIGURE_MACHINE_CAPABILITIES` if capabilities count is zero.

---

## 3. Graceful Degradation & Invariants
- **Schema Missing Safe Guard**:
  - If `printhouse_machines` table does not exist in the database, the readiness evaluator catches the query error, degrades gracefully, and returns status `NOT_AVAILABLE` instead of throwing a fatal 500 exception.
- **Onboarding Locked States**:
  - Operational readiness cannot reach complete (`READY`) in Phase 191D because Materials, Pricing, and Capacity remain unimplemented.
  - Overall activation remains locked with status `IN_PROGRESS`.
