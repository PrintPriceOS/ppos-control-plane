# Phase 191E: Materials Onboarding Acceptance

## 1. Scope
Ensures that materials are successfully associated with physical printing sites (`printer_nodes`) and paired with compatible machines inside the facility.

---

## 2. Validation Findings

- **Site Association**:
  - Materials created in `materials_catalog` have `printhouse_id` set to the site ID, linking them explicitly to a physical location.
  - Cross-tenant creation attempts are rejected with `403 Forbidden` at the route layer.
- **Machine Pairing with Explicit Provenance**:
  - Associations are stored in `printhouse_machine_materials` junction table.
  - Every connection record requires an explicit `compatibility_provenance` string (e.g. "certified_format_match", "GSM limit fit", etc.) defining the technical or operational origin of the compatibility.
  - Listing compatibilities retrieves these provenance metadata blocks alongside machine names.

---

## 3. Verification Evidence
- **Smoke test output**:
  ```text
  ✅ Material catalog entry created
  ✅ Material name matches
  ✅ GSM set correctly
  ...
  ✅ Compatibility link created
  ✅ Provenance matches expected label
  ```
