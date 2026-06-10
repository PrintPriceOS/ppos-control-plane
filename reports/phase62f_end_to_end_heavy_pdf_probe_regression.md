# Phase 62F-E — End-to-End Heavy PDF Probe Regression

**Generated:** 2026-06-10T00:10:30.651Z  
**Input Mode:** ALL_LAYER_REPORTS_PRESENT  
**End-to-End Status:** ✅ PASS

## Pipeline Layers

| Layer | Present | Passed |
| --- | --- | --- |
| Engine (62F-A) | ✅ | ✅ |
| Worker (62F-B) | ✅ | ✅ |
| Service (62F-C) | ✅ | ✅ |
| Control Plane (62F-D) | ✅ | ✅ |

## Final Acceptance Criteria

- ✅ 1. qpdf warning-only output is not generic TOOL_EXTRACTION_FAILED
- ✅ 2. pdfimages warning-only output is not generic TOOL_EXTRACTION_FAILED
- ✅ 3. fatal probe failures remain fatal
- ✅ 4. timeout/OOM are explicit
- ✅ 5. heavy_pdf_probe_governance preserved Engine -> Worker -> Service -> Control Plane
- ✅ 6. degraded_but_usable supports review route
- ✅ 7. fatal_document_failure supports remediation/reupload route
- ✅ 8. artifact_trust remains authoritative
- ✅ 9. certified.pdf is not trusted by filename
- ✅ 10. No production, standards, PDF/X, PDF/A, or print-ready overclaim
- ✅ 11. Customer output is sanitized
- ✅ 12. Operator output is useful
- ✅ 13. Aggregate report generated
- ✅ 14. All smoke tests pass

## Non-Negotiable Rules Verified

- Fatal probe failures (qpdf FAILED_FATAL, pdfimages FAILED_NO_OUTPUT) are never downgraded to warnings.
- Warning-only probes (qpdf hint-table warnings, pdfimages Invalid Font Weight) are never upgraded to fatal_document_failure.
- Degraded analysis is never auto-certified (production_certified=false, standard_certified=false).
- certified.pdf is never trusted by filename alone.
- Customer payloads never see raw qpdf/pdfimages transcripts, object IDs, or local paths.
- No PDF/X, PDF/A, production, or print-ready claims are derived from heavy_pdf_probe_governance.
- artifact_trust remains the authoritative gate (DEGRADED_ANALYSIS_REVIEW_REQUIRED / ANALYSIS_FAILED_REVIEW_REQUIRED).
- strict_forensic_mode behavior is preserved end-to-end.
