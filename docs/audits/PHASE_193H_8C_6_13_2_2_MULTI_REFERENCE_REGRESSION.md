# PHASE 193H.8C.6.13.2.2 — MULTI-REFERENCE REGRESSION AUDIT REPORT
## Automated Dual-Reference Regression Harness & Revision-2 Certification

```text
================================================================================
PHASE 193H.8C.6.13.2.2 — DUAL-REFERENCE REGRESSION HARNESS: PASS
STAGE 1 CONTROLLED BETA: AUTHORIZED
UNRESTRICTED PRODUCTION: NOT_AUTHORIZED
================================================================================
```

---

### 1. Scope & Invariants

Phase 193H.8C.6.13.2.2 establishes an automated, read-only regression harness that certifies Revision 2 (`prev-0f4796c9`) as the immutable baseline for all subsequent reference calibrations on production node `node-329a3bc4`.

```text
AUTOMATED REGRESSION CRITERIA:
  - Strict 2-decimal equality (Tolerance <= 0.00 EUR drift).
  - Explicit cryptographic checksum parity (397d361b...).
  - Lineage pointer verification (prev-ffb9b4a5 -> prev-0f4796c9).
  - 100% Read-Only isolation (Zero mutations to node rates or session ledger).
```

---

### 2. Dual-Reference Regression Matrix

| Dimension | Reference Job A (`cal-77e4b271`) | Reference Job B (`cal-293cbb29`) | Combined System State |
|---|---|---|---|
| **Book Specification** | 2000 copies, 170×240mm, 128p, 4/4, offset 80g, cover artboard 300g 4/0, gloss lam, perfect bound | 1000 copies, 210×297mm, 48p, 1/1, mc 130g, cover mc 130g 1/0, matt lam, saddle stitch | Orthogonal Dual Coverage |
| **Signature / Sections** | 16p / 8 sections | 16p / 3 sections | Dynamic Node Capabilities Resolved |
| **Target Price** | `3450.00 EUR` | `850.00 EUR` | Governed Convergence Targets |
| **Verified Runtime Price** | **`3449.97 EUR`** | **`850.15 EUR`** | **Deterministic Forward Replay** |
| **Allowed Drift** | **`0.00 EUR`** | **`0.00 EUR`** | **Zero-Tolerance Invariant** |
| **Active Rate Paths** | 10 distinct paths | 10 distinct paths | **Disjoint Path Sets (`shared = []`)** |

---

### 3. Rate Card Certification & Lineage Proof

```text
ACTIVE_RATE_CARD_CHECKSUM: 397d361b7cceeb3d28b04d3ff3fb69bb1f0be0d3374b2b2e83a4eeb168ece989
ACTIVE_PRICING_REVISION:   prev-0f4796c9
PARENT_REVISION_POINTER:   prev-ffb9b4a5
TENANT_ISOLATION_GUARD:    ph-707a5869 (node-329a3bc4)
```

---

### 4. Harness Script Reference

The regression harness is executable on-demand via:
```bash
node scripts/smoke_phase193h8c61322_multi_reference_regression.js
```

---

### 5. Final Certification Sign-off

```text
================================================================================
REVISION 2 (prev-0f4796c9) IS OFFICIALLY CERTIFIED AS THE CANONICAL REGRESSION BASELINE.
AUTHORIZED FOR PHASE 193H.8C.6.13.2.3 — JOB-C COMMERCIAL REFERENCE QUALIFICATION.
================================================================================
```
