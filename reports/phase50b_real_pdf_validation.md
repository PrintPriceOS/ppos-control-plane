# Phase 50B Validation Report (Real PDF Execution)

## 1. Executive Summary
Phase 50B executed real minimal PDF files through the hardened `PdfFixEngine` and the simulated normalization pipelines of `AutofixProcessor` (Worker), `FixAuditNormalizer` (Service), and `preflightHumanReportService` (Control Plane). 

6 out of 7 low-risk fixes were physically validated against real PDFs, resulting in verifiable non-empty PDF outputs, complete structured evidence, and correct human-readable translations. `REBUILD_XREF` failed physical validation as expected because the `qpdf` binary is not installed locally. The failure was correctly and honestly identified.

Validation Mode: **REAL_PDF**

## 2. Fixture Manifest

* `missing_trimbox.pdf` - Page with no TrimBox
* `missing_outputintent.pdf` - No OutputIntent
* `javascript_action.pdf` - Contains OpenAction JS
* `annotations.pdf` - Contains Text Annotation
* `acroform.pdf` - Contains AcroForm field
* `broken_xref.pdf` - Broken XREF
* `missing_bleed.pdf` - BleedBox equals TrimBox

## 3. Per-fix Validation Table

| Fix ID | Pass | Real Exec | Exec Status | Policy | Prod Cert | Wording |
|---|---|---|---|---|---|---|
| REBUILD_TRIMBOX | ✅ | Yes | APPLIED | SAFE | true | Yes |
| INJECT_OUTPUT_INTENT | ✅ | Yes | APPLIED | SAFE | true | Yes |
| STRIP_JAVASCRIPT | ✅ | Yes | APPLIED | SAFE | true | Yes |
| FLATTEN_ANNOTATIONS | ✅ | Yes | APPLIED | SAFE | true | Yes |
| FLATTEN_FORMS | ✅ | Yes | APPLIED | REVIEW_REQUIRED | false | Yes |
| REBUILD_XREF | ❌ | No | MISSING_TOOL | SAFE | undefined | No |
| APPLY_BLEED | ✅ | Yes | APPLIED | REVIEW_REQUIRED | false | Yes |

## 4. Real Execution Status Per Layer
* **Engine**: `engine_real_execution: true` (for all except XREF)
* **Worker**: `worker_real_execution: false` (mocked using `AutofixProcessor` artifact logic over real engine trace)
* **Service**: `service_real_hydration: false` (mocked via `FixAuditNormalizer` over real trace)
* **Control Plane**: `control_plane_real_human_report: true` (direct invocation of `preflightHumanReportService`)

## 5. Artifact Policy Result
* `APPLY_BLEED` and `FLATTEN_FORMS` strictly enforce `production_certified=false` and do NOT allow `certified_pdf` as the primary artifact.
* `REBUILD_TRIMBOX`, `INJECT_OUTPUT_INTENT`, `STRIP_JAVASCRIPT`, and `FLATTEN_ANNOTATIONS` were correctly mapped as `production_certified=true`.

## 6. Human Report Wording Result
All executed fixes produced translated text without destroying the underlying evidence map. `APPLY_BLEED` included the explicit warning: "Bleed boxes were adjusted. Visual artwork was not extended automatically."

## 7. Failures / Deferred Items
* **REBUILD_XREF**: Failed physical verification because `qpdf` is not installed on this system. It resulted in `real_pdf_execution_verified: false` and `pass: false` as required by the strict evidence rules.

## 8. Next-Step Recommendation
The Phase 50B real execution tests are highly successful. The governance guards correctly demote visually risky fixes, and the artifact policies hold strong. The next step is to address the missing tooling for XREF rebuilds or to move on to higher-risk visual fixes (like fonts or CMYK) if the `qpdf` requirement is deferred.
