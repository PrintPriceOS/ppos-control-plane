# PHASE_191D2_MACHINE_STATUS_SEMANTICS.md

## Machine status Values and Meanings

The `status` column in `printhouse_machines` represents the **operational status** of a configured machine:
- `ACTIVE`: The machine is fully configured, functional, and currently online/available for production.
- `MAINTENANCE`: The machine is configured but temporarily unavailable due to servicing, calibration, or repairs.
- `DECOMMISSIONED`: The machine is permanently retired and will not accept new jobs, but remains in historical reports.
- `ARCHIVED`: The machine is soft-deleted and removed from the active machinery fleet list and derived capabilities computation.

---

## Onboarding / Configuration Gating
As required by Phase 191D.2:
- Live operational status (e.g. `ACTIVE` vs `MAINTENANCE`) must not be used as an onboarding completion gate.
- Instead, the Machines module of the onboarding checklist is satisfied by a derived configuration-completeness calculation: **at least one machine must exist with any status that is NOT `ARCHIVED`**.
- This allows a user to configure a machine and successfully satisfy the checklist without forcing the machine to be operationally marked `ACTIVE` (or automatically activating production dispatch).

---

## Code Implementation
The `printhouseReadinessService.js` and `printhouseCapabilityOnboardingService.js` have been updated to count and aggregate all machines where `status != 'ARCHIVED'`:
- **Readiness check**: Counts configured machines using `status != 'ARCHIVED'`.
- **Capability compilation**: Computes capabilities from all non-archived equipment. A site-level capability is marked as `active` if at least one supporting machine is `ACTIVE`.
