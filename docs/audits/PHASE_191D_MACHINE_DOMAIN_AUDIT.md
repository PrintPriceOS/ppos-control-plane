# Phase 191D: Machine & Capability Domain Audit

## 1. Goal
Identify the canonical schema for Machines and Production Capabilities, verify relationships to Production Sites (`printer_nodes`), and map out the current structure to inform the Phase 191D implementation.

## 2. Findings

### 2.1 Canonical Production Site
In Phase 191C, it was established that `IS_PRINTER_NODE_THE_CANONICAL_PRODUCTION_SITE: YES`. 
The `printer_nodes` table is the source of truth for production sites.

### 2.2 Existing Machine Tables
We discovered three distinct tables tracking machines:

1. **`printer_machines`**
   - **Origin:** `printhouse_pricing_restore.sql` (Legacy)
   - **Columns:** `id`, `printer_id` (refs `printer_nodes`), `nickname`, `type`, `status`.
   - **Role:** Historically used for pricing profiles. Minimal capability data.

2. **`printhouse_machines`**
   - **Origin:** Phase 76 (`015_phase76_printhouse_capabilities.sql`)
   - **Columns:** `id`, `printhouse_id` (refs `printhouses`), `tenant_id`, `machine_name`, `machine_type`, `manufacturer`, `model`, `status`.
   - **Capabilities Columns:** Dimensions (`max_sheet_width_mm`, etc.), Print Methods (`supported_print_methods_json`, `supported_color_modes_json`), Features (`supports_white_ink`, etc.), Finishing (`supports_perfect_binding`, `supports_lamination`, etc.).
   - **Role:** Highly detailed schema tailored for exact capability matching and validation.

3. **`print_node_machine_profiles`**
   - **Origin:** Phase 184g (`phase184g_manufacturing_persistence_schema.js`)
   - **Columns:** `id`, `node_id` (refs `print_nodes`/`printer_nodes`), `profile_name`, `profile_type`, `raw_data_json`.
   - **Role:** Used in industrial provisioning/federation. It relies heavily on JSON blobs and was amended with `manufacturer`, `model`, and `status`.

### 2.3 Capability Schema
The explicit capability domains (print processes, finishing, color modes) requested for Phase 191D are already modeled as structured columns within the **`printhouse_machines`** table from Phase 76. 

Other tables in Phase 76 (`printhouse_media`, `printhouse_policy_profiles`, `printhouse_sla_profiles`) handle materials and policies, but per constraints ("Do not implement materials, substrates, detailed pricing"), we will isolate our focus to `printhouse_machines`.

## 3. Recommendations for Canonical Machine Model
The most robust and complete schema for "Machines and Production Capabilities" is **`printhouse_machines`**. 
However, it currently references the legacy `printhouses` table instead of `printer_nodes`. 

**Action Plan:**
- Use `printhouse_machines` as the core canonical table for machine details and production capabilities.
- When creating/updating machines, the `printhouse_id` column will be supplied with the canonical `printer_nodes.id` (site ID).
- We will build `PrinthouseMachineService` (or refactor `printhouseCapabilityService.js`) to strictly scope CRUD operations to `tenant_id` and `printhouse_id` (representing the `printer_node`).
- Expose the capabilities through the `printhouse_machines` structured columns (no need to invent new JSON schemas if the columns already exist).
