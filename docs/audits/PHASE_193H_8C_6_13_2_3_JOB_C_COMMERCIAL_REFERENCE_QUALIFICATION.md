# PHASE 193H.8C.6.13.2.3 — JOB C COMMERCIAL REFERENCE QUALIFICATION REPORT
## Technical Qualification, Production Geometry & Commercial Evidence Schema

```text
================================================================================
PHASE 193H.8C.6.13.2.3 — JOB C COMMERCIAL REFERENCE QUALIFICATION
STAGE 1 CONTROLLED BETA: AUTHORIZED
UNRESTRICTED PRODUCTION: NOT_AUTHORIZED
================================================================================
```

---

### 1. Executive Status Summary

```text
JOB_C_TECHNICAL_SPEC:   QUALIFIED (100% Schema, Adapter & Node Compatibility)
COMMERCIAL_REFERENCE:   PENDING (Awaiting External Operator Evidence)
SESSION_C_CREATION:     NOT_AUTHORIZED (Strictly Gated on Commercial Evidence)
```

---

### 2. Technical Specification & Canonical Validation

The technical specification for Reference Job C was verified against all validation rules in `calibrationSessionService.js`, `buildPriceCalibrationAdapter.js`, and `deterministicInversePricingSolver.js`.

| Specification Parameter | Value | Schema / Contract Status |
|---|---|---|
| **Volume (copies)** | `500` | Within volume envelope ($\ge 1$) |
| **Geometry** | `148 × 210 mm` (A5) | Within guard rails ($50 \le W \le 500$, $50 \le H \le 700$) |
| **Interior Pages** | `320` | Dynamic signature resolves to `16p` signature, `20` sections |
| **Interior Print** | `'2/2'` | Normalizes to `two` color key $\rightarrow$ `interior_two_colour_*` |
| **Interior Paper** | `lux 80gsm` | Valid paper type `'lux'`, weight within range ($40 \le wt \le 400$) |
| **Cover Print** | `'2/0'` | Normalizes to `'2'` color key $\rightarrow$ `cover_*_by_colours.2` |
| **Cover Paper** | `offset 140gsm` | Valid cover paper `'offset'`, weight within range ($100 \le wt \le 600$) |
| **Binding Method** | `'thread sewn'` | Normalizes to binding code `'ts'` $\rightarrow$ `binding_ts_*_by_sections.20` |
| **Lamination / Finish** | `'varnish'` | Normalizes to `'varnish'` $\rightarrow$ `lam_*.varnish` |
| **Delivery Country** | `'ES'` | Valid ISO-2 country |

---

### 3. Active Rate Paths & Orthogonality Proof

`solver.extractActiveRatePaths()` derives exactly **10 leaf rate paths** for Reference Job C:

```text
JOB C ACTIVE RATE PATHS:
  1. binding_ts_fixed_by_sections.20
  2. binding_ts_var_per_1000_by_sections.20
  3. cover_fixed_by_colours.2
  4. cover_var_per_1000_by_colours.2
  5. interior_two_colour_fixed.16p
  6. interior_two_colour_var.16p
  7. lam_fixed.varnish
  8. lam_var_per_1000.varnish
  9. paper_price_cover_by_kilo.offset
 10. paper_price_interior_by_kilo.lux
```

#### Orthogonality Intersection Ledger:
```text
Job C Paths ∩ Job A Paths = [] (0 shared paths)
Job C Paths ∩ Job B Paths = [] (0 shared paths)
Job C Paths ∩ (Job A ∪ Job B) = [] (0 shared paths)

ORTHOGONALITY VERDICT: STRICT_ORTHOGONAL (+10 new leaf dimensions gained)
```

---

### 4. Diagnostic Baseline Forward Price Replay

Against active Revision 2 (`prev-0f4796c9` / `397d361b...`), all 10 active paths for Job C are currently zero-anchored (`0.0 EUR`).

```text
DIAGNOSTIC UNCALIBRATED REPLAY:
  - Manufacturing Price: 0.00 EUR
  - Signature Size:      16p
  - Sections Count:      20
  - Invariant: Zero forward price is expected prior to zero-anchor solver promotion.
  - CAUTION: This price is diagnostic only and MUST NOT be used as the target price.
```

---

### 5. Required Commercial Reference Evidence Schema

Before `Session C` can be authorized and created in production, the operator must provide an authentic commercial reference adhering to the following schema:

```json
{
  "commercial_reference": {
    "target_manufacturing_price": "<NUMBER > 0>",
    "currency": "EUR",
    "includesPaper": true,
    "includesBinding": true,
    "includesFinishing": true,
    "includesPackaging": true,
    "source_type": "<HISTORICAL_JOB_INVOICE | PRODUCTION_SUPPLIER_QUOTE | PUBLISHED_RATE_BENCHMARK>",
    "source_reference": "<INVOICE_ID / QUOTE_REF / BENCHMARK_ID>",
    "source_date": "<YYYY-MM-DD>",
    "commercial_scope": "<DESCRIPTION_OF_COMMERCIAL_CONTEXT>"
  }
}
```

---

### 6. Qualification Sign-off & Next Phase Gate

```text
================================================================================
JOB C TECHNICAL SPECIFICATION IS FULLY QUALIFIED.
SESSION C CREATION IS NOT AUTHORIZED UNTIL OPERATOR DELIVERS COMMERCIAL REFERENCE.
================================================================================
```
