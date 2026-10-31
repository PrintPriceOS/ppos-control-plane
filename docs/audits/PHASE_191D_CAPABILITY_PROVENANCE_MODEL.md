# PHASE_191D_CAPABILITY_PROVENANCE_MODEL.md

## Capability Provenance Architecture
In the PrintPriceOS Control Plane, capabilities are not independent DB entries. They follow a strict **provenance-based derived model**:
- Source of Truth: The configuration parameters and dimensions of the machines registered in the `printhouse_machines` table.
- Derived Logic: Evaluated dynamically by the `printhouseCapabilityOnboardingService.js`.
- Aggregation: Aggregated at the site level and tenant level on-demand, caching nothing to prevent staleness.

---

## Registry Classification

All capabilities are categorized below by their origin:

| Capability Code | Description | Provenance Model |
| --- | --- | --- |
| `PRINT_CMYK` | Standard CMYK color printing | **DERIVED_FROM_MACHINE** (press has CMYK flag) |
| `PRINT_SPOT` | Spot color printing | **DERIVED_FROM_MACHINE** (press supports spot colors) |
| `PRINT_WHITE` | White ink capability | **DERIVED_FROM_MACHINE** (press supports white ink) |
| `FINISH_LAMINATION` | Film lamination capability | **DERIVED_FROM_MACHINE** (finisher supports lamination) |
| `FINISH_SPOT_UV` | Spot UV varnish finishing | **DERIVED_FROM_MACHINE** (finisher supports spot UV) |
| `FINISH_BIND_SADDLE` | Saddle-stitch booklet binding | **DERIVED_FROM_MACHINE** (binder supports saddle stitch) |
| `FINISH_BIND_PERFECT` | Perfect binding capability | **DERIVED_FROM_MACHINE** (binder supports perfect binding) |
| `FINISH_BIND_CASE` | Hardcover case binding | **DERIVED_FROM_MACHINE** (binder supports case binding) |
| `FORMAT_LARGE` | Sheets wider than 700mm | **DERIVED_FROM_MACHINE** (press dimensions exceed limits) |

---

## Aggregation Rules and Safeguards
- **Exclusion of Archived Entities**: Machines with `status = 'ARCHIVED'` are strictly excluded from site and tenant-level capability aggregation.
- **Exclusion of Incomplete Sites**: Sites with status other than active or sites that are soft-deleted do not contribute to capabilities.
- **Machine Source Tracking**: Every aggregated site-level capability maintains a list of `source_machine_ids` representing the equipment providing the capability.
- **Manual Capability Onboarding**: `MANUAL_CAPABILITY_ONBOARDING: NOT IMPLEMENTED`.
- **Administrator Verified Capabilities**: `ADMIN_VERIFIED_CAPABILITIES: READ_ONLY` (read-only for Phase 191D).
