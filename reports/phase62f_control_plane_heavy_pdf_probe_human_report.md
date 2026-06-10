# Phase 62F-D — Control Plane Heavy PDF Probe Human Report + UX

**Generated:** 2026-06-09T23:56:35.113Z  
**Input Mode:** SERVICE_REPORT_PRESENT  
**Status:** ✅ PASS  
**Total:** 12 | **Passed:** 12 | **Failed:** 0

## Governance Principles Verified

- heavy_pdf_probe_governance is defensively extracted from job/report/fix_summary/fix_audit/artifact metadata
- degraded_but_usable=true is explained as "completed with warnings, review required" — not as a failure
- qpdf/pdfimages WARNING_ONLY statuses are explained as structural warnings, not corruption
- fatal_document_failure=true is never downgraded to a warning and always recommends remediation/reupload
- strict_forensic_mode prevents automatic certification when probe warnings reduce confidence
- customer output never leaks raw paths, object IDs, qpdf transcripts, or internal IDs
- heavy_pdf_probe_governance.production_certified/standard_certified/pdfx/pdfa/compliance_claim_allowed are always false
- artifact_ux reflects heavy PDF state via "Heavy PDF" / "Analysis warnings" / "Probe warning" / "Review required" / "Technical review required" badges
- certified.pdf is downgraded (production_certified=false, customer_visible=false, artifact_role=REVIEW_REQUIRED) whenever heavy PDF review is required, regardless of filename

## Acceptance Criteria

- ✅ consumes heavy pdf probe governance
- ✅ human report wording clear and safe
- ✅ customer output sanitized
- ✅ operator output useful
- ✅ artifact ux reflects heavy pdf warning state
- ✅ readiness gates remain conservative
- ✅ fatal failures require remediation
- ✅ degraded but usable supports review route
- ✅ no production or standards overclaim
- ✅ no downgrade of fatal to warning
- ✅ no upgrade of warning to fatal
- ✅ certified pdf filename does not bypass review

## Scenarios

### 1. Heavy PDF degraded_but_usable=true — analysis completed with probe warnings, review required
- **Result:** ✅ PASS

### 2. qpdf WARNING_ONLY — operator wording explains linearization/hint-table warnings
- **Result:** ✅ PASS

### 3. pdfimages WARNING_ONLY — operator wording explains image extraction warnings
- **Result:** ✅ PASS

### 4. qpdf FAILED_FATAL — fatal_document_failure blocks production and recommends remediation
- **Result:** ✅ PASS

### 5. Strict forensic mode — operator wording notes certification is blocked under reduced confidence
- **Result:** ✅ PASS

### 6. Customer sanitation — no raw paths, object IDs, transcripts, or overclaims
- **Result:** ✅ PASS

### 7. Operator detail — full per-tool semantic statuses, warning classes, and probe summary exposed
- **Result:** ✅ PASS

### 8. Artifact UX badges — Probe warning (fixed/review_pdf), Review required (certified_pdf)
- **Result:** ✅ PASS

### 9. Readiness gate — heavy PDF review_required blocks production certification end-to-end
- **Result:** ✅ PASS

### 10. Remediation — fatal_document_failure recommends reupload, no production download
- **Result:** ✅ PASS

### 11. Standards overclaim regression — heavy PDF governance never implies certification or compliance
- **Result:** ✅ PASS

### 12. certified.pdf filename regression — filename alone does not bypass heavy PDF review gate
- **Result:** ✅ PASS

