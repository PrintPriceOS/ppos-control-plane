# Phase 191D: Machine Field Ownership Matrix

## 1. Goal
Define which fields in the machine registry (`printhouse_machines`) are editable by the Printhouse Administrator via public API routes versus those restricted to the Control Plane/Super Admin or calculated automatically by system processes.

---

## 2. Field Ownership Matrix

| Field | Description | Ownership / Mutability |
| --- | --- | --- |
| `id` | Machine UUID | **SYSTEM** (Read-Only) |
| `tenant_id` | Tenant Identifier | **SYSTEM** (Read-Only) |
| `printhouse_id` | Associated Site ID | **SYSTEM** (Read-Only) |
| `machine_name` | Name of the equipment | **PRINTHOUSE_ADMIN** (Editable) |
| `machine_type` | Equipment type enum | **PRINTHOUSE_ADMIN** (Editable) |
| `manufacturer` | Manufacturer name | **PRINTHOUSE_ADMIN** (Editable) |
| `model` | Model name | **PRINTHOUSE_ADMIN** (Editable) |
| `status` | Operational status | **PRINTHOUSE_ADMIN** (Editable: ACTIVE, MAINTENANCE, DECOMMISSIONED) |
| `max_sheet_width_mm` | Max sheet width | **PRINTHOUSE_ADMIN** (Editable) |
| `max_sheet_height_mm`| Max sheet height | **PRINTHOUSE_ADMIN** (Editable) |
| `min_sheet_width_mm` | Min sheet width | **PRINTHOUSE_ADMIN** (Editable) |
| `min_sheet_height_mm`| Min sheet height | **PRINTHOUSE_ADMIN** (Editable) |
| `max_print_width_mm` | Max printable width | **PRINTHOUSE_ADMIN** (Editable) |
| `max_print_height_mm`| Max printable height | **PRINTHOUSE_ADMIN** (Editable) |
| `supported_color_modes_json`| Color capability | **PRINTHOUSE_ADMIN** (Editable) |
| `supported_print_methods_json`| Print processes | **PRINTHOUSE_ADMIN** (Editable) |
| `supported_sides_json`| Sides (SIMPLEX/DUPLEX) | **PRINTHOUSE_ADMIN** (Editable) |
| `max_pages_per_job` | Job capacity limits | **PRINTHOUSE_ADMIN** (Editable) |
| `max_file_size_mb`  | File size limits | **PRINTHOUSE_ADMIN** (Editable) |
| `max_tac_percent`   | Total Area Coverage | **PRINTHOUSE_ADMIN** (Editable) |
| `supports_pdfx`     | PDF/X compliance | **PRINTHOUSE_ADMIN** (Editable) |
| `supports_pdfa`     | PDF/A compliance | **PRINTHOUSE_ADMIN** (Editable) |
| `supports_variable_data`| VDP support | **PRINTHOUSE_ADMIN** (Editable) |
| `supports_white_ink`| White ink support | **PRINTHOUSE_ADMIN** (Editable) |
| `supports_spot_uv`  | Spot UV support | **PRINTHOUSE_ADMIN** (Editable) |
| `supports_lamination`| Film lamination | **PRINTHOUSE_ADMIN** (Editable) |
| `supports_hardcover`| hardcover binding | **PRINTHOUSE_ADMIN** (Editable) |
| `supports_softcover`| Softcover binding | **PRINTHOUSE_ADMIN** (Editable) |
| `supports_saddle_stitch`| Saddle stitch bind | **PRINTHOUSE_ADMIN** (Editable) |
| `supports_perfect_binding`| Perfect binding | **PRINTHOUSE_ADMIN** (Editable) |
| `supports_case_binding`| Case binding | **PRINTHOUSE_ADMIN** (Editable) |
| `metadata_json`     | Custom metadata | **PRINTHOUSE_ADMIN** (Editable) |
| `approved`          | Approval status | **SUPER_ADMIN** (Read-Only) |
| `verified`          | Verification status | **SUPER_ADMIN** (Read-Only) |
| `marketplace_enabled`| Marketplace eligibility | **SUPER_ADMIN** (Read-Only) |
| `routing_enabled`   | Job routing enabled | **SUPER_ADMIN** (Read-Only) |
| `production_enabled`| Production live status | **SUPER_ADMIN** (Read-Only) |
| `license_status`    | Licensing status | **SUPER_ADMIN** (Read-Only) |
| `risk_status`       | Fraud risk status | **SUPER_ADMIN** (Read-Only) |
| `internal_score`    | Quality rating score | **SUPER_ADMIN** (Read-Only) |
| `created_at`        | Timestamp created | **SYSTEM** (Read-Only) |
| `created_by`        | Creator user ID | **SYSTEM** (Read-Only) |
| `updated_at`        | Timestamp modified | **SYSTEM** (Read-Only) |

---

## 3. Enforcement Policy
All fields classified as **SUPER_ADMIN** or **SYSTEM** are marked as protected. Attempting to submit or modify any of these fields in creation (POST) or update (PUT) payloads will be rejected with an explicit `FIELD_NOT_EDITABLE` (HTTP 400) error listing the offending fields.
