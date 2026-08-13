# Phase 191E: Implementation Report

## 1. Goal
Summarize the complete implementation details for Phase 191E – Materials, Production Capacity, and Lead Times.

---

## 2. Deliverables List

### 2.1 Schema Migrations
- **`140_phase191e_materials_capacity_leadtimes.sql`**: Configured unique indexes, created `printhouse_machine_materials` junction, `printhouse_site_capacities` and `printhouse_site_lead_times` tables, and added machine capacity columns.

### 2.2 Backend Services
- **`printhouseMaterialService.js`**: Managed materials catalog CRUD, soft archival, and machine-material compatibility connections with explicit provenance records.
- **`printhouseCapacityService.js`**: Handled site jobs/sheets capacity constraints and machine-level daily throughput variables.
- **`printhouseLeadTimeService.js`**: Computed dynamic production completion estimate, incorporating cutoff time rules, timezone offset adjustments, and weekend skipping.
- **`printhouseReadinessService.js`**: Integrated checking for Materials, Capacity, and Lead Times milestones.

### 2.3 Onboarding REST Routes
- Mounted route group `/api/printhouse/onboarding` in Fastify (`server.js`) mapping to `printhouseOnboardingRoutes.js`.
- Implemented role validation, suspended tenant database locks, and strict payload protection filters.

### 2.4 Frontend Panels
- **`MaterialsPanel.tsx`**: Configures material inventory catalog and pairs/unpairs compatible machines.
- **`CapacityPanel.tsx`**: Sets site jobs/sheets daily capacity limits and machine throughput variables.
- **`LeadTimesPanel.tsx`**: Localized timezone/workdays checkboxes and interactive completion calculator.
