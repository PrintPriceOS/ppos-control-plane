# Phase 62F — Heavy PDF Probe Semantics Hardening

**Project:** PrintPrice OS / PPOS Marketplace  
**Phase:** 62F  
**Focus:** Heavy PDF probe semantics, degraded analysis classification, qpdf/pdfimages warning handling, artifact trust preservation  
**Trigger case:** 853 MB PDF upload from Control Plane, processed successfully but reported as `DEGRADED` / `PDF_DOCUMENT_FAILURE` due to `qpdf` and `pdfimages` CLI probe exit behavior.

---

## 0. Executive Summary

Phase 62F exists because a heavy PDF upload proved that the infrastructure path is working, but the analysis semantics are too coarse.

The 853 MB PDF:

- Uploaded successfully.
- Was accepted into the Preflight pipeline.
- Was processed by Worker.
- Produced artifacts.
- Correctly suppressed trusted `certified.pdf` output because review was required.
- Failed certification because `qpdf` and `pdfimages` probes returned non-zero statuses.

However, the observed tool output suggests that not all tool failures are equal.

Examples:

- `pdfimages -list` returned a warning such as `Syntax Warning: Invalid Font Weight`.
- `qpdf --check` returned many warnings about hint tables, shared object entries, and object count mismatches.
- These were treated as `TOOL_EXTRACTION_FAILED`.
- The report became `DEGRADED`, `certifiable=false`, `risk_score=77`, `outcome_category=PDF_DOCUMENT_FAILURE`.

This phase hardens the semantics so the OS can distinguish:

```text
1. Tool unavailable
2. Tool crashed / timeout / OOM
3. Tool returned warnings with non-zero exit
4. Tool produced usable partial output
5. Tool produced no usable output
6. PDF structural warning
7. PDF structural fatal error
8. Extraction degraded but analysis still usable
```

The goal is not to make the file “pass”.  
The goal is to make the reason for failure or degradation precise, auditable, and UX-safe.

---

## 1. Repos and Execution Order

Implement iteratively, repo by repo:

```text
62F-A — Engine
62F-B — Worker
62F-C — Service
62F-D — Control Plane
62F-E — End-to-End Heavy PDF Probe Regression
```

Repos:

```text
1. ppos-preflight-engine
2. ppos-preflight-worker
3. ppos-preflight-service
4. ppos-control-plane
```

Optional BFF follow-up:

```text
APP-62F — BFF Heavy PDF Probe UX Alignment
```

Do not mix repo changes in a single implementation pass.

---

## 2. Core Problem Statement

Current behavior appears to classify `qpdf` / `pdfimages` non-zero exit status as generic extraction failure.

That creates a loss of meaning:

```text
qpdf --check warning output
→ command failed
→ TOOL_EXTRACTION_FAILED:qpdf
→ DEGRADED
→ PDF_DOCUMENT_FAILURE
```

But a non-zero exit from a CLI probe may indicate several different states:

```text
WARNING_ONLY_WITH_USABLE_OUTPUT
STRUCTURAL_WARNING
STRUCTURAL_FATAL
TOOL_TIMEOUT
TOOL_OOM
TOOL_CRASH
UNSUPPORTED_PDF_FEATURE
NO_OUTPUT
PARTIAL_OUTPUT
```

Phase 62F introduces a **Probe Semantics Layer**.

---

## 3. Definitions

### Probe

A low-level external or internal tool check, such as:

```text
qpdf --check
pdfimages -list
pdfinfo
pdffonts
mutool
Ghostscript
PDF kernel extraction
```

### Probe Result

Structured output describing execution status, output usability, severity, and semantic classification.

### Probe Semantic Classification

A normalized category that describes the meaning of a tool result.

Example:

```json
{
  "tool": "qpdf",
  "exit_code": 3,
  "raw_status": "FAILED",
  "semantic_status": "WARNING_ONLY",
  "severity": "warning",
  "usable_output": true,
  "structural_warning": true,
  "structural_fatal": false
}
```

### Degraded Analysis

A state where analysis was completed but some probes had warnings, partial extraction, or non-fatal failures.

### Fatal Document Failure

A state where the PDF cannot be safely parsed, inspected, or processed enough to produce reliable findings.

---

## 4. Target Probe Semantic Statuses

Introduce canonical statuses:

```text
SUCCESS
SUCCESS_WITH_WARNINGS
WARNING_ONLY
PARTIAL_SUCCESS
SKIPPED_UNSUPPORTED
FAILED_FATAL
FAILED_TIMEOUT
FAILED_OOM
FAILED_TOOL_MISSING
FAILED_NO_OUTPUT
FAILED_UNCLASSIFIED
```

Suggested mapping:

| Raw Condition | Semantic Status | Severity | Certifiable? |
|---|---|---:|---:|
| Exit 0, no warnings | SUCCESS | info | possible |
| Exit 0, warnings | SUCCESS_WITH_WARNINGS | warning | possible, if no blockers |
| Exit non-zero, warnings only, usable stdout/stderr | WARNING_ONLY | warning | possible only after policy review |
| Exit non-zero, partial usable output | PARTIAL_SUCCESS | warning/error | usually not certifiable unless non-critical |
| Tool unavailable | FAILED_TOOL_MISSING | error | degraded |
| Timeout | FAILED_TIMEOUT | error | not certifiable until reprocessed |
| OOM / killed | FAILED_OOM | error | not certifiable until reprocessed |
| Crash / segmentation fault | FAILED_FATAL | error | not certifiable |
| No output at all | FAILED_NO_OUTPUT | error | degraded/fatal depending tool |
| Unknown non-zero | FAILED_UNCLASSIFIED | error | degraded/fatal depending tool |

---

## 5. Target Probe Categories

Introduce canonical finding / event categories:

```text
IND_PROBE_WARNING_QPDF
IND_PROBE_WARNING_PDFIMAGES
IND_PROBE_PARTIAL_QPDF
IND_PROBE_PARTIAL_PDFIMAGES
IND_PROBE_TIMEOUT
IND_PROBE_OOM
IND_PROBE_FATAL
IND_PROBE_TOOL_MISSING
IND_PDF_LINEARIZATION_HINT_WARNING
IND_PDF_SHARED_OBJECT_HINT_MISMATCH
IND_PDF_OBJECT_COUNT_HINT_MISMATCH
IND_PDF_FONT_WEIGHT_WARNING
IND_PDF_IMAGE_LIST_WARNING
IND_PDF_STRUCTURAL_WARNING_NON_FATAL
IND_PDF_STRUCTURAL_ERROR_FATAL
IND_HEAVY_PDF_ANALYSIS_DEGRADED
IND_HEAVY_PDF_PROBE_SEMANTICS_CLASSIFIED
```

---

## 6. Expected Governance Object

Introduce or preserve:

```json
{
  "heavy_pdf_probe_governance": {
    "heavy_pdf_detected": true,
    "file_size_bytes": 853898611,
    "file_size_mb": 814.34,
    "page_count": 64,
    "probe_semantics_applied": true,
    "analysis_degraded": true,
    "degraded_but_usable": true,
    "fatal_document_failure": false,
    "certifiable": false,
    "review_required": true,
    "production_certified": false,
    "standard_certified": false,
    "pdfx_compliance_claimed": false,
    "pdfa_compliance_claimed": false,
    "compliance_claim_allowed": false,
    "probe_summary": {
      "total": 0,
      "success": 0,
      "success_with_warnings": 0,
      "warning_only": 0,
      "partial_success": 0,
      "failed_fatal": 0,
      "failed_timeout": 0,
      "failed_oom": 0,
      "failed_tool_missing": 0
    },
    "tools": {
      "qpdf": {
        "raw_status": "FAILED",
        "semantic_status": "WARNING_ONLY",
        "severity": "warning",
        "usable_output": true,
        "fatal": false,
        "warning_classes": [
          "PDF_LINEARIZATION_HINT_WARNING",
          "PDF_SHARED_OBJECT_HINT_MISMATCH",
          "PDF_OBJECT_COUNT_HINT_MISMATCH"
        ]
      },
      "pdfimages": {
        "raw_status": "FAILED",
        "semantic_status": "WARNING_ONLY",
        "severity": "warning",
        "usable_output": true,
        "fatal": false,
        "warning_classes": [
          "PDF_FONT_WEIGHT_WARNING"
        ]
      }
    },
    "warnings": [],
    "review_required_reasons": [],
    "evidence": {}
  }
}
```

Important:

```text
heavy_pdf_probe_governance explains the analysis quality.
It does not certify the PDF.
It does not override artifact_trust.
It does not allow production by itself.
```

---

# 62F-A — Engine Heavy PDF Probe Semantics

```text
Phase 62F-A — Engine Heavy PDF Probe Semantics Hardening

Repo:
ppos-preflight-engine

Goal:
Introduce a Probe Semantics Layer inside the Engine so qpdf/pdfimages and similar tool outputs are classified precisely instead of becoming generic TOOL_EXTRACTION_FAILED events.

Scope:
Engine only.

Do not modify:
- ppos-preflight-worker
- ppos-preflight-service
- ppos-control-plane
- Preflight BFF App

Context:
A real heavy PDF test produced:
- file size: 853898611 bytes
- page count: 64
- pdf version: 1.6
- qpdf: non-zero exit with many warnings about hint table/shared object/object count mismatch
- pdfimages: non-zero exit with Syntax Warning: Invalid Font Weight
- analysis_status=DEGRADED
- certifiable=false
- outcome_category=PDF_DOCUMENT_FAILURE

The goal is not to force certifiable=true.
The goal is to classify probe output accurately.

Files to inspect and modify:
- analyzers/PdfIntegrityAnalyzer.js
- analyzers/ImageAnalyzer.js
- analyzers/FontAnalyzer.js
- core tool runner utilities
- CLI probe execution utilities
- interpretation/IndustrialFindingCodes.js
- reports/report generation layer
- scripts/

If exact paths differ, locate:
- qpdf --check invocation
- pdfimages -list invocation
- probeResults assembly
- degraded_reasons generation
- extractionErrors generation
- analysisIntegrity construction

Tasks:

1. Add a Probe Semantics utility.

Create a utility such as:

utils/ProbeSemanticsClassifier.js

or similar existing location.

It must export functions:

classifyProbeResult({
  tool,
  command,
  exitCode,
  stdout,
  stderr,
  error,
  timedOut,
  signal,
  durationMs,
  outputAvailable
})

classifyQpdfCheck(...)
classifyPdfImagesList(...)
classifyGenericProbe(...)

2. qpdf semantics.

Implement classification for qpdf output.

Recognize warning-only patterns:

- "WARNING:"
- "page 0 has shared identifier entries"
- "shared object ... in hint table but not computed list"
- "object count mismatch"
- "linearization"
- "hint table"
- "PDF file is damaged but can be repaired" if qpdf indicates repairable
- "checking ..."

Recognize fatal patterns:

- "file is damaged"
- "unable to find trailer dictionary"
- "unable to find /Root dictionary"
- "not a PDF file"
- "invalid xref"
- "operation succeeded with warnings" should not be fatal
- "errors found" should be classified based on context

The classifier must produce:

{
  "tool": "qpdf",
  "raw_status": "FAILED|SUCCESS",
  "semantic_status": "SUCCESS|SUCCESS_WITH_WARNINGS|WARNING_ONLY|PARTIAL_SUCCESS|FAILED_FATAL|FAILED_TIMEOUT|FAILED_OOM|FAILED_NO_OUTPUT|FAILED_UNCLASSIFIED",
  "severity": "info|warning|error|critical",
  "usable_output": true/false,
  "fatal": true/false,
  "structural_warning": true/false,
  "structural_fatal": true/false,
  "warning_classes": [],
  "fatal_classes": [],
  "summary": "...",
  "evidence": {
    "exit_code": 0,
    "stderr_excerpt": "...",
    "stdout_excerpt": "...",
    "duration_ms": 0,
    "signal": null
  }
}

3. pdfimages semantics.

Implement classification for pdfimages output.

Recognize warning-only patterns:

- "Syntax Warning: Invalid Font Weight"
- "Syntax Warning:"
- warnings that do not prevent list extraction if output exists

Recognize fatal patterns:

- "Command failed" with no usable output
- "Couldn't open file"
- "not a PDF file"
- timeout
- OOM/killed

If pdfimages returns non-zero only because of syntax warning and produces usable stdout or only harmless stderr, classify as WARNING_ONLY or SUCCESS_WITH_WARNINGS, not FAILED_FATAL.

4. Generic probe classification.

For all probes:
- timeout => FAILED_TIMEOUT
- signal SIGKILL or killed with memory symptoms => FAILED_OOM or FAILED_FATAL depending evidence
- missing command => FAILED_TOOL_MISSING
- no output and non-zero => FAILED_NO_OUTPUT
- non-zero with warning-only output => WARNING_ONLY
- non-zero with partial output => PARTIAL_SUCCESS

5. Add IndustrialFindingCodes.

Add:
- IND_PROBE_WARNING_QPDF
- IND_PROBE_WARNING_PDFIMAGES
- IND_PROBE_PARTIAL_QPDF
- IND_PROBE_PARTIAL_PDFIMAGES
- IND_PROBE_TIMEOUT
- IND_PROBE_OOM
- IND_PROBE_FATAL
- IND_PROBE_TOOL_MISSING
- IND_PDF_LINEARIZATION_HINT_WARNING
- IND_PDF_SHARED_OBJECT_HINT_MISMATCH
- IND_PDF_OBJECT_COUNT_HINT_MISMATCH
- IND_PDF_FONT_WEIGHT_WARNING
- IND_PDF_STRUCTURAL_WARNING_NON_FATAL
- IND_PDF_STRUCTURAL_ERROR_FATAL
- IND_HEAVY_PDF_ANALYSIS_DEGRADED
- IND_HEAVY_PDF_PROBE_SEMANTICS_CLASSIFIED

6. Update PdfIntegrityAnalyzer.

Instead of emitting generic IND_INTEGRITY_EXTRACTION_ERROR for qpdf warning-only output:
- emit non-fatal structural warning findings.
- preserve raw stderr excerpt.
- preserve warning classes.
- set fixable=false unless existing structural metadata fix applies.
- set safeToAutofix=false unless existing qpdf linearization/object stream repair fix is safely available.
- do not imply certifiability.

If qpdf is fatal:
- emit IND_PDF_STRUCTURAL_ERROR_FATAL or IND_PROBE_FATAL.
- analysis may remain DEGRADED/FAIL.

7. Update ImageAnalyzer / pdfimages path.

Instead of generic extraction failure for warning-only pdfimages:
- emit IND_PDF_FONT_WEIGHT_WARNING or IND_PROBE_WARNING_PDFIMAGES.
- allow analysis to continue if image extraction/list is usable.
- do not block all image analysis solely on warning-only exit.

8. Update analysisIntegrity.

Add:

analysisIntegrity.probeSemantics = {
  "applied": true,
  "version": "phase62f",
  "tools": {
    "qpdf": {...},
    "pdfimages": {...}
  }
}

9. Update degraded_reasons.

Replace coarse reasons:

TOOL_EXTRACTION_FAILED:qpdf
TOOL_EXTRACTION_FAILED:pdfimages

with more precise reasons when applicable:

TOOL_PROBE_WARNING:qpdf
TOOL_PROBE_WARNING:pdfimages
PDF_STRUCTURAL_WARNING:qpdf
PDF_FONT_WEIGHT_WARNING:pdfimages
TOOL_PROBE_PARTIAL:qpdf

Only use TOOL_EXTRACTION_FAILED when semantic_status is actually fatal/no-output/timeout/OOM/unclassified fatal.

10. Add heavy_pdf_probe_governance to Engine report.

The Engine report must include:

heavy_pdf_probe_governance

with:
- file_size_bytes
- file_size_mb
- page_count
- heavy_pdf_detected
- probe_semantics_applied
- analysis_degraded
- degraded_but_usable
- fatal_document_failure
- tools
- probe_summary
- review_required
- certifiable
- production_certified=false
- standard_certified=false
- pdfx_compliance_claimed=false
- pdfa_compliance_claimed=false
- compliance_claim_allowed=false

11. Heavy PDF threshold.

Define:

HEAVY_PDF_THRESHOLD_BYTES = 500 * 1024 * 1024

For files above threshold:
- heavy_pdf_detected=true
- analysis timeout and memory warnings must be more explicit.
- analysis should not be marked successful if probes were skipped or incomplete.
- analysis should not be marked fatal unless probe semantics justify fatal.

12. Create smoke fixtures.

Create:

scripts/create_phase62f_heavy_pdf_probe_semantics_fixtures.js

It does not need to generate an 853 MB file.

Instead, create synthetic probe transcript fixtures under:

fixtures/phase62f/probe_transcripts/

Required transcripts:
- qpdf_warning_hint_table.txt
- qpdf_fatal_xref.txt
- qpdf_timeout.json
- pdfimages_invalid_font_weight_warning.txt
- pdfimages_fatal_no_output.txt
- generic_tool_missing.json
- generic_oom_killed.json

13. Create smoke test.

Create:

scripts/smoke_phase62f_engine_heavy_pdf_probe_semantics.js

Test scenarios:
1. qpdf hint table warnings classify as WARNING_ONLY or SUCCESS_WITH_WARNINGS, not FAILED_FATAL.
2. qpdf fatal xref classifies as FAILED_FATAL.
3. qpdf timeout classifies as FAILED_TIMEOUT.
4. pdfimages Invalid Font Weight warning classifies as WARNING_ONLY or SUCCESS_WITH_WARNINGS.
5. pdfimages no output non-zero classifies as FAILED_NO_OUTPUT or FAILED_FATAL.
6. missing command classifies as FAILED_TOOL_MISSING.
7. SIGKILL/OOM classifies as FAILED_OOM.
8. heavy file warning-only probes create heavy_pdf_probe_governance.
9. degraded_reasons are precise, not generic TOOL_EXTRACTION_FAILED for warning-only probes.
10. no overclaims:
    - production_certified=false
    - standard_certified=false
    - pdfx_compliance_claimed=false
    - pdfa_compliance_claimed=false
    - compliance_claim_allowed=false

14. Generate reports.

Generate:
- reports/phase62f_engine_heavy_pdf_probe_semantics.json
- reports/phase62f_engine_heavy_pdf_probe_semantics.md

Report must include:
- scenario
- tool
- raw_status
- semantic_status
- severity
- usable_output
- fatal
- structural_warning
- structural_fatal
- warning_classes
- fatal_classes
- degraded_reason
- issue_code
- heavy_pdf_probe_governance_present
- overclaim_guard_passed
- pass/fail
- notes

Verification:
node --check utils/ProbeSemanticsClassifier.js
node --check analyzers/PdfIntegrityAnalyzer.js
node --check analyzers/ImageAnalyzer.js
node --check interpretation/IndustrialFindingCodes.js
node --check scripts/create_phase62f_heavy_pdf_probe_semantics_fixtures.js
node --check scripts/smoke_phase62f_engine_heavy_pdf_probe_semantics.js
node scripts/create_phase62f_heavy_pdf_probe_semantics_fixtures.js
node scripts/smoke_phase62f_engine_heavy_pdf_probe_semantics.js

Acceptance criteria:
1. qpdf warning-only output is no longer generic TOOL_EXTRACTION_FAILED.
2. pdfimages warning-only output is no longer generic TOOL_EXTRACTION_FAILED.
3. Fatal probe failures remain fatal.
4. Timeouts and OOM are classified explicitly.
5. heavy_pdf_probe_governance is emitted.
6. degraded_reasons are more precise.
7. analysis remains conservative.
8. No production/standards overclaim.
9. Smoke passes.
10. Reports generated.
```

---

# 62F-B — Worker Heavy PDF Probe Governance

```text
Phase 62F-B — Worker Heavy PDF Probe Governance

Repo:
ppos-preflight-worker

Goal:
Consume Engine Phase 62F probe semantics and preserve heavy_pdf_probe_governance through fix_audit.json v2, delta_report.json, artifact_trust, and job result payloads.

Scope:
Worker only.

Do not modify:
- ppos-preflight-engine
- ppos-preflight-service
- ppos-control-plane

Input:
../ppos-preflight-engine/reports/phase62f_engine_heavy_pdf_probe_semantics.json

Fallback:
If Engine report is unavailable, use synthetic Engine-equivalent payloads labeled:
input_mode="SYNTHETIC_POLICY_FALLBACK"

Files to inspect and modify:
- processors/AutofixProcessor.js
- job result writer / artifact manifest builder
- scripts/

Tasks:

1. Preserve heavy_pdf_probe_governance.

Worker must preserve:
- heavy_pdf_detected
- file_size_bytes
- file_size_mb
- page_count
- probe_semantics_applied
- analysis_degraded
- degraded_but_usable
- fatal_document_failure
- certifiable
- review_required
- probe_summary
- tools
- warnings
- review_required_reasons
- evidence

2. Add governance to:
- fix_audit.json v2 root
- delta_report.json root
- job result root if convention supports it
- artifact manifest metadata if applicable

3. Artifact trust policy.

If fatal_document_failure=true:
- artifact_trust.production_certified=false
- artifact_trust.standard_certified=false
- artifact_trust.certified_pdf_allowed=false
- artifact_trust.review_required=true
- trust_level=ANALYSIS_FAILED_REVIEW_REQUIRED or equivalent
- blocked_by_governance_domains includes heavy_pdf_probe

If analysis_degraded=true and degraded_but_usable=true:
- artifact_trust.production_certified=false unless explicit later human review approves
- artifact_trust.standard_certified=false
- artifact_trust.review_required=true
- trust_level=DEGRADED_ANALYSIS_REVIEW_REQUIRED or FIXED_REVIEW_REQUIRED depending existing policy
- blocked_by_governance_domains includes heavy_pdf_probe

If only warning-only probe semantics exist and no other blockers:
- still no standards certification.
- review may be required depending strict_forensic_mode.
- preserve warning classes for operator review.

4. Certified artifact suppression.

If heavy_pdf_probe_governance.review_required=true:
- suppress trusted certified artifact.
- certified.pdf may exist only as review-required artifact if policy allows.
- never trust by filename.

5. Warnings.

Add human-readable warnings into artifact_trust.warnings:
- “Heavy PDF analysis completed with probe warnings.”
- “qpdf reported structural warnings that require review.”
- “pdfimages reported warnings during image extraction.”
- “Analysis is degraded but usable; production approval requires review.”

6. Create smoke.

Create:
scripts/smoke_phase62f_worker_heavy_pdf_probe_governance.js

Scenarios:
1. qpdf WARNING_ONLY.
2. pdfimages WARNING_ONLY.
3. qpdf FAILED_FATAL.
4. pdfimages FAILED_NO_OUTPUT.
5. heavy file with degraded_but_usable=true.
6. heavy file with fatal_document_failure=true.
7. certified.pdf filename regression.
8. standards overclaim regression.
9. strict_forensic_mode=true warning-only probes.
10. evidence preservation.

Expected:
- warning-only probes preserve warnings, not generic fatal.
- fatal probes remain fatal.
- review_required true where appropriate.
- artifact_trust conservative.
- no standards overclaim.
- certified.pdf suppressed when review required.

7. Generate:
- reports/phase62f_worker_heavy_pdf_probe_governance.json
- reports/phase62f_worker_heavy_pdf_probe_governance.md

Verification:
node --check processors/AutofixProcessor.js
node --check scripts/smoke_phase62f_worker_heavy_pdf_probe_governance.js
node scripts/smoke_phase62f_worker_heavy_pdf_probe_governance.js

Acceptance:
1. Worker preserves heavy_pdf_probe_governance.
2. Worker preserves tool semantic statuses.
3. Worker does not collapse warnings into generic fatal failure.
4. Worker keeps fatal failures fatal.
5. artifact_trust is conservative.
6. certified.pdf not trusted by filename.
7. Reports generated.
8. Smoke passes.
```

---

# 62F-C — Service Heavy PDF Probe Exposure

```text
Phase 62F-C — Service Heavy PDF Probe Exposure

Repo:
ppos-preflight-service

Goal:
Expose heavy_pdf_probe_governance through Service normalization, job payloads, artifact summaries, and report endpoints.

Scope:
Service only.

Do not modify:
- ppos-preflight-engine
- ppos-preflight-worker
- ppos-control-plane

Input:
../ppos-preflight-worker/reports/phase62f_worker_heavy_pdf_probe_governance.json

Fallback:
If Worker report is unavailable, use synthetic Worker-equivalent payloads labeled:
input_mode="SYNTHETIC_POLICY_FALLBACK"

Files to inspect and modify:
- services/FixAuditNormalizer.js
- services/PreflightService.js
- services/FixCapabilityContract.js if capability exposure is needed
- routes if report endpoint strips fields
- scripts/

Tasks:

1. Preserve heavy_pdf_probe_governance.

FixAuditNormalizer must preserve:
- heavy_pdf_probe_governance
- analysisIntegrity.probeSemantics
- probeResults semantic statuses
- degraded_reasons
- extractionErrors but with semantic detail
- analysis_status
- certifiable
- strict_forensic_mode

2. Normalize safely.

Add helper:
normalizeHeavyPdfProbeGovernance(payload)

Rules:
- review_required=true wins.
- production_certified=false wins.
- standard_certified=false wins.
- certified_pdf_allowed=false wins.
- compliance_claim_allowed=false wins.
- fatal_document_failure=true wins over degraded_but_usable.
- Preserve warning classes.
- Deduplicate warnings.
- Do not expose raw full stderr to customer payloads unless operator/internal endpoint.

3. Public/customer sanitization.

For customer-facing payloads:
- expose summary, not full raw stderr.
- hide local filesystem paths.
- hide giant qpdf transcripts.
- hide object IDs unless operator/internal.
- hide internal temp paths.
- preserve safe warning classes:
  - PDF_LINEARIZATION_HINT_WARNING
  - PDF_SHARED_OBJECT_HINT_MISMATCH
  - PDF_OBJECT_COUNT_HINT_MISMATCH
  - PDF_FONT_WEIGHT_WARNING

4. Operator payload.

For operator/admin payloads:
- may expose more detail.
- still sanitize temp paths if public.
- preserve excerpts, not full giant logs by default.

5. Artifact summaries.

If heavy_pdf_probe_governance.review_required=true:
- artifact_summary.review_required=true
- production_ready_artifact_available=false unless explicit later approval
- certified_pdf_allowed=false
- standard_certified=false
- warnings include heavy PDF probe warnings

6. Capability contract.

If useful, expose:
- HEAVY_PDF_PROBE_SEMANTICS
- QPDF_WARNING_CLASSIFICATION
- PDFIMAGES_WARNING_CLASSIFICATION

Do not expose as “fix” unless implementation uses it as analysis capability.

7. Create smoke.

Create:
scripts/smoke_phase62f_service_heavy_pdf_probe_exposure.js

Scenarios:
1. qpdf warning-only preserved.
2. pdfimages warning-only preserved.
3. fatal qpdf preserved as fatal.
4. degraded_but_usable exposed safely.
5. customer payload sanitized.
6. operator payload preserves semantic detail.
7. certified.pdf downgrade.
8. standards overclaim regression.
9. huge stderr transcript summarized.
10. legacy payload without heavy_pdf_probe_governance still works.

8. Generate:
- reports/phase62f_service_heavy_pdf_probe_exposure.json
- reports/phase62f_service_heavy_pdf_probe_exposure.md

Verification:
node --check services/FixAuditNormalizer.js
node --check services/PreflightService.js
node --check scripts/smoke_phase62f_service_heavy_pdf_probe_exposure.js
node scripts/smoke_phase62f_service_heavy_pdf_probe_exposure.js

Acceptance:
1. Service preserves heavy_pdf_probe_governance.
2. Service preserves semantic statuses.
3. Service sanitizes customer output.
4. Service avoids huge raw stderr dumps in customer payload.
5. certified.pdf remains downgraded.
6. No production/standards overclaim.
7. Reports generated.
8. Smoke passes.
```

---

# 62F-D — Control Plane Heavy PDF Probe Human Report + UX

```text
Phase 62F-D — Control Plane Heavy PDF Probe Human Report + UX

Repo:
ppos-control-plane

Goal:
Translate heavy_pdf_probe_governance into safe Human Report, artifact UX, operator diagnostics, and readiness gate behavior.

Scope:
Control Plane only.

Do not modify:
- ppos-preflight-engine
- ppos-preflight-worker
- ppos-preflight-service

Input:
../ppos-preflight-service/reports/phase62f_service_heavy_pdf_probe_exposure.json

Fallback:
If Service report is unavailable, use synthetic Service-equivalent payloads labeled:
input_mode="SYNTHETIC_POLICY_FALLBACK"

Files to inspect and modify:
- src/api/services/preflightHumanReportService.js
- src/api/services/artifactUxLabelService.js
- marketplace/order readiness gate services if heavy PDF warnings affect gates
- frontend components displaying human report / job details
- scripts/

Tasks:

1. Extract governance.

Update preflightHumanReportService.js to defensively extract:
- heavy_pdf_probe_governance
- analysisIntegrity.probeSemantics
- analysis_status
- degraded_reasons
- certifiable
- strict_forensic_mode

From:
- job root
- job.report
- job.fix_summary
- job.artifact_summary
- job.fix_audit
- job.delta_report
- artifact metadata

2. Human Report wording.

Add operator-safe wording:

If degraded_but_usable=true:
“Analysis completed, but some heavy-PDF probes returned warnings. The file requires review before production approval.”

If qpdf WARNING_ONLY:
“qpdf reported structural warnings, such as linearization or hint-table inconsistencies. These do not necessarily mean the file is unreadable, but they prevent automatic certification.”

If pdfimages WARNING_ONLY:
“Image extraction reported warnings. The analysis continued, but image-related results should be reviewed.”

If fatal_document_failure=true:
“The PDF could not be reliably inspected because a critical probe failed. Re-exporting or repairing the source PDF is recommended.”

If strict_forensic_mode=true:
“Strict forensic mode prevents automatic certification when probe warnings reduce analysis confidence.”

3. Customer-safe wording.

Customer wording must be simple:

- “The file was uploaded and analyzed, but the analysis found technical warnings in the PDF structure.”
- “The file is not automatically approved for production.”
- “A review is required before this file can proceed.”
- “If requested, please re-export the PDF from the source application and upload it again.”

Forbidden customer wording:
- “corrupt” unless fatal_document_failure=true
- raw qpdf transcript
- raw object IDs
- local paths
- “certified”
- “print-ready”
- “PDF/X validated”
- “PDF/A validated”

4. Artifact UX.

Update artifactUxLabelService.js.

Badges:
- “Heavy PDF”
- “Analysis warnings”
- “Review required”
- “Probe warning”
- “Technical review required”

Tooltips:
- “The file was analyzed, but one or more PDF probes returned warnings.”
- “Automatic certification is not allowed until review is completed.”
- “The PDF may need to be re-exported if the warnings cannot be resolved.”

5. Readiness gates.

If heavy_pdf_probe_governance.review_required=true:
- invoice/payment/production should remain blocked unless explicit review decision approves.
- production_certified=false.
- standard_certified=false.
- certified_pdf_allowed=false.

If fatal_document_failure=true:
- require reupload/remediation.
- do not offer final production download.

If degraded_but_usable=true:
- allow operator review route.
- do not automatically fail upload.
- do not automatically certify.

6. UI panel.

Add or update a panel:
HeavyPdfProbePanel.tsx

Display:
- file size
- page count
- analysis quality
- probe warnings
- whether review is required
- next action

Customer view:
- summary only.

Operator view:
- warning classes and tool semantic statuses.

7. Create smoke.

Create:
scripts/smoke_phase62f_control_plane_heavy_pdf_probe_human_report.js

Scenarios:
1. heavy file degraded_but_usable=true.
2. qpdf warning-only.
3. pdfimages warning-only.
4. qpdf fatal.
5. strict forensic mode.
6. customer sanitation.
7. operator detail.
8. artifact_ux badges.
9. readiness gate blocked.
10. remediation/reupload recommendation for fatal.
11. standards overclaim regression.
12. certified.pdf filename regression.

8. Generate:
- reports/phase62f_control_plane_heavy_pdf_probe_human_report.json
- reports/phase62f_control_plane_heavy_pdf_probe_human_report.md

Verification:
node --check src/api/services/preflightHumanReportService.js
node --check src/api/services/artifactUxLabelService.js
node --check scripts/smoke_phase62f_control_plane_heavy_pdf_probe_human_report.js
node scripts/smoke_phase62f_control_plane_heavy_pdf_probe_human_report.js
npm run build

Acceptance:
1. Control Plane consumes heavy_pdf_probe_governance.
2. Human Report wording is clear and safe.
3. Customer output sanitized.
4. Operator output useful.
5. artifact_ux reflects heavy PDF warning state.
6. readiness gates remain conservative.
7. fatal failures require remediation.
8. degraded-but-usable supports review route.
9. No production/standards overclaim.
10. Smoke passes.
11. Build passes.
```

---

# 62F-E — End-to-End Heavy PDF Probe Regression

```text
Phase 62F-E — End-to-End Heavy PDF Probe Regression

Repos:
Engine → Worker → Service → Control Plane

Goal:
Validate heavy_pdf_probe_governance and probe semantic statuses end-to-end.

Scope:
All four OS repos, iterated separately.

Do not modify BFF App in this phase.

Inputs:
Use either:
1. Synthetic probe transcript fixtures from Engine, or
2. A real heavy PDF report fixture based on the 853 MB case, with local paths sanitized.

Tasks:

1. Engine:
- Generate:
  reports/phase62f_engine_heavy_pdf_probe_semantics.json
  reports/phase62f_engine_heavy_pdf_probe_semantics.md
- Validate qpdf/pdfimages warning-only semantics.
- Validate fatal probe semantics.
- Validate heavy_pdf_probe_governance.

2. Worker:
- Consume Engine report.
- Generate:
  reports/phase62f_worker_heavy_pdf_probe_governance.json
  reports/phase62f_worker_heavy_pdf_probe_governance.md
- Validate artifact_trust.

3. Service:
- Consume Worker report.
- Generate:
  reports/phase62f_service_heavy_pdf_probe_exposure.json
  reports/phase62f_service_heavy_pdf_probe_exposure.md
- Validate public/operator sanitization.

4. Control Plane:
- Consume Service report.
- Generate:
  reports/phase62f_control_plane_heavy_pdf_probe_human_report.json
  reports/phase62f_control_plane_heavy_pdf_probe_human_report.md
  reports/phase62f_end_to_end_heavy_pdf_probe_regression.json
  reports/phase62f_end_to_end_heavy_pdf_probe_regression.md
- Validate Human Report, artifact UX, readiness gates.

Final acceptance:
1. qpdf warning-only output is not generic TOOL_EXTRACTION_FAILED.
2. pdfimages warning-only output is not generic TOOL_EXTRACTION_FAILED.
3. fatal probe failures remain fatal.
4. timeout/OOM are explicit.
5. heavy_pdf_probe_governance is preserved Engine → Worker → Service → Control Plane.
6. degraded_but_usable supports review route.
7. fatal_document_failure supports remediation/reupload route.
8. artifact_trust remains authoritative.
9. certified.pdf is not trusted by filename.
10. No production, standards, PDF/X, PDF/A, or print-ready overclaim.
11. Customer output is sanitized.
12. Operator output is useful.
13. Aggregate report generated.
14. All smoke tests pass.
```

---

# Optional APP-62F — BFF Heavy PDF Probe UX Alignment

```text
APP-62F — BFF Heavy PDF Probe UX Alignment

Repo:
PrintPricePro_Preflight / Preflight BFF App

Goal:
Align the BFF App with heavy_pdf_probe_governance so customer/operator views explain heavy PDF probe warnings safely.

Scope:
BFF App only.

Input:
Service / Control Plane payloads containing heavy_pdf_probe_governance.

Files to inspect and modify:
- app/services/preflightNormalizer.js
- frontend/types.ts
- frontend/components/steps/Step4ReviewV2_4.tsx
- frontend/components/steps/Step5DownloadV2_4.tsx
- frontend/components/reports/ClientChangeReportDrawer.tsx
- frontend/i18n/en.ts
- frontend/i18n/es.ts
- scripts/

Tasks:
1. Preserve heavy_pdf_probe_governance in preflightNormalizer.js.
2. Add frontend type HeavyPdfProbeGovernance.
3. Add component:
   frontend/components/reports/HeavyPdfProbePanel.tsx
4. Customer wording:
   - “The file was uploaded and analyzed, but technical warnings were found.”
   - “A review is required before production.”
   - “If requested, please re-export the PDF and upload it again.”
5. Operator wording:
   - show tool semantic statuses
   - show warning classes
   - show degraded_but_usable vs fatal_document_failure
6. Step5Download:
   - hide production-ready wording if review_required=true.
   - hide final download if fatal_document_failure=true and remediation required.
7. Create:
   scripts/smoke_app62f_bff_heavy_pdf_probe_ux_alignment.js

Acceptance:
- BFF preserves heavy_pdf_probe_governance.
- Customer output is simple and safe.
- Operator output includes useful semantic status.
- no raw temp paths.
- no qpdf giant transcript in customer view.
- no certified/print-ready overclaim.
- smoke passes.
- build passes.
```

---

# Deployment / Validation Notes

## Production smoke commands after implementation

### Engine

```bash
cd /opt/printprice-os/ppos-preflight-engine
node scripts/smoke_phase62f_engine_heavy_pdf_probe_semantics.js
```

### Worker

```bash
cd /opt/printprice-os/ppos-preflight-worker
node scripts/smoke_phase62f_worker_heavy_pdf_probe_governance.js
```

### Service

```bash
cd /opt/printprice-os/ppos-preflight-service
node scripts/smoke_phase62f_service_heavy_pdf_probe_exposure.js
```

### Control Plane

```bash
cd /opt/printprice-os/ppos-control-plane
node scripts/smoke_phase62f_control_plane_heavy_pdf_probe_human_report.js
npm run build
```

## Live heavy PDF validation checklist

After deploy, upload a heavy PDF again and verify:

```text
1. Upload does not fail with 413.
2. Control Plane does not crash.
3. Service returns a job result.
4. Worker completes or fails honestly.
5. qpdf warning-only output is not shown as generic extraction failure.
6. pdfimages warning-only output is not shown as generic extraction failure.
7. heavy_pdf_probe_governance exists.
8. Human Report explains the issue clearly.
9. certified.pdf remains suppressed if review is required.
10. Customer UI does not say print-ready.
```

## Grep commands for production logs

```bash
grep -RniE "TOOL_EXTRACTION_FAILED|TOOL_PROBE_WARNING|PDF_STRUCTURAL_WARNING|PDF_FONT_WEIGHT_WARNING|heavy_pdf_probe|qpdf|pdfimages|DEGRADED|FAILED_FATAL|WARNING_ONLY|PARTIAL_SUCCESS" \
  /root/.pm2/logs/ppos-control-plane-out.log \
  /root/.pm2/logs/ppos-control-plane-error.log
```

```bash
docker logs --tail=500 ppos-preflight-service 2>&1 | grep -Ei "heavy_pdf_probe|qpdf|pdfimages|TOOL_PROBE_WARNING|TOOL_EXTRACTION_FAILED|WARNING_ONLY|FAILED_FATAL|DEGRADED"
```

```bash
docker logs --tail=500 ppos-preflight-worker 2>&1 | grep -Ei "heavy_pdf_probe|qpdf|pdfimages|TOOL_PROBE_WARNING|TOOL_EXTRACTION_FAILED|WARNING_ONLY|FAILED_FATAL|DEGRADED"
```

---

# Non-Negotiable Rules

```text
1. Do not downgrade true fatal probe failures into warnings.
2. Do not upgrade warning-only probes into fatal document failure.
3. Do not certify degraded analysis automatically.
4. Do not trust certified.pdf by filename.
5. Do not expose huge raw qpdf/pdfimages transcripts to customers.
6. Do not leak temp paths.
7. Do not claim PDF/X/PDF/A compliance from probe semantics.
8. Do not claim production readiness from probe semantics.
9. Always preserve artifact_trust authority.
10. Always preserve strict_forensic_mode behavior.
```
