# Phase 49 Preflight Fix Capability Truth Audit

Generated At: 2026-06-05T18:45:44.424Z

## Repository Status
- **engine**
  - Path: `../ppos-preflight-engine`
  - Exists: true
  - Package: @ppos/preflight-engine
  - Branch: phase-10-intelligence-layer
  - Commit: 6bb354e13b8bde2c4572a8da24082b5bb2e3229e
- **worker**
  - Path: `../ppos-preflight-worker-phase-10-intelligence-layer`
  - Exists: true
  - Package: @ppos/preflight-worker
  - Branch: phase-10-intelligence-layer
  - Commit: 7dec86633f6c828deee5e43e71f69089b9dd9be8
- **service**
  - Path: `../ppos-preflight-service`
  - Exists: true
  - Package: @ppos/preflight-service
  - Branch: phase-10-intelligence-layer
  - Commit: 1198c556c69d569541565532d4373efecec54b35
- **control_plane**
  - Path: `.`
  - Exists: true
  - Package: @ppos/control-plane
  - Branch: phase-39.2-tenant-management-console
  - Commit: f23aea95405a28300ac7ca595c6c43e27318ee74

## Capability Truth Matrix
| Issue Area | Fix ID | Truth Status | Risk | Mode | Evidence |
|---|---|---|---|---|---|
| TrimBox missing/invalid | `REBUILD_TRIMBOX` | **REAL_FIX_AVAILABLE** | LOW | SAFE,REVIEW_REQUIRED,EXPERIMENTAL | FixRegistry.js, PdfFixEngine.js, FixCapabilityContract.js, preflightHumanReportService.js |
| BleedBox / missing bleed | `APPLY_BLEED` | **PARTIAL_FIX** | MEDIUM | REVIEW_REQUIRED,EXPERIMENTAL | FixRegistry.js, PdfFixEngine.js, FixCapabilityContract.js, preflightHumanReportService.js |
| RGB / DeviceRGB | `CONVERT_CMYK` | **REAL_FIX_AVAILABLE** | HIGH | REVIEW_REQUIRED,EXPERIMENTAL | FixRegistry.js, PdfFixEngine.js, FixCapabilityContract.js, preflightHumanReportService.js |
| Mixed RGB/CMYK | `CONVERT_CMYK` | **REAL_FIX_AVAILABLE** | HIGH | REVIEW_REQUIRED,EXPERIMENTAL | FixRegistry.js, PdfFixEngine.js, FixCapabilityContract.js, preflightHumanReportService.js |
| Missing OutputIntent | `INJECT_OUTPUT_INTENT` | **REAL_FIX_AVAILABLE** | LOW | SAFE,REVIEW_REQUIRED,EXPERIMENTAL | FixRegistry.js, PdfFixEngine.js, FixCapabilityContract.js, preflightHumanReportService.js |
| ICC mismatch | `INJECT_OUTPUT_INTENT` | **REAL_FIX_AVAILABLE** | LOW | SAFE,REVIEW_REQUIRED,EXPERIMENTAL | FixRegistry.js, PdfFixEngine.js, FixCapabilityContract.js, preflightHumanReportService.js |
| Non-embedded fonts | `EMBED_FONTS` | **DECLARED_NOT_IMPLEMENTED** | HIGH | EXPERIMENTAL | FixRegistry.js, PdfFixEngine.js, FixCapabilityContract.js |
| Type3 fonts | `TYPE3_FONTS` | **UNSUPPORTED** | UNKNOWN | UNKNOWN | PdfFixEngine.js |
| Missing glyphs | `MISSING_GLYPHS` | **UNSUPPORTED** | UNKNOWN | UNKNOWN | PdfFixEngine.js |
| Low image resolution | `LOW_RESOLUTION_IMAGE` | **UNSUPPORTED** | UNKNOWN | UNKNOWN | PdfFixEngine.js |
| Excessive image resolution | `OPTIMIZE_EXCESSIVE_IMAGE_RESOLUTION` | **DECLARED_NOT_IMPLEMENTED** | MEDIUM | EXPERIMENTAL | FixRegistry.js, PdfFixEngine.js |
| JPEG artifacts | `JPEG_ARTIFACTS` | **UNSUPPORTED** | UNKNOWN | UNKNOWN | PdfFixEngine.js |
| RGB images | `CONVERT_CMYK` | **REAL_FIX_AVAILABLE** | HIGH | REVIEW_REQUIRED,EXPERIMENTAL | FixRegistry.js, PdfFixEngine.js, FixCapabilityContract.js, preflightHumanReportService.js |
| Transparencies | `FLATTEN_TRANSPARENCY` | **DECLARED_NOT_IMPLEMENTED** | HIGH | EXPERIMENTAL | FixRegistry.js, PdfFixEngine.js, FixCapabilityContract.js |
| Overprint | `FLATTEN_OVERPRINT` | **DECLARED_NOT_IMPLEMENTED** | HIGH | EXPERIMENTAL | FixRegistry.js, PdfFixEngine.js, FixCapabilityContract.js |
| TAC / excessive ink coverage | `DETECT_TOTAL_INK_COVERAGE` | **DECLARED_NOT_IMPLEMENTED** | LOW | EXPERIMENTAL | FixRegistry.js, PdfFixEngine.js, FixCapabilityContract.js |
| Rich black text | `MAP_RICH_BLACK_TEXT_TO_K_ONLY` | **DECLARED_NOT_IMPLEMENTED** | HIGH | EXPERIMENTAL | FixRegistry.js, PdfFixEngine.js, FixCapabilityContract.js |
| Registration color misuse | `MAP_REGISTRATION_COLOR_TO_BLACK` | **DECLARED_NOT_IMPLEMENTED** | HIGH | EXPERIMENTAL | FixRegistry.js, PdfFixEngine.js, FixCapabilityContract.js |
| Missing crop marks | `ADD_CROP_MARKS` | **UNSUPPORTED** | UNKNOWN | UNKNOWN | PdfFixEngine.js |
| Registration marks present | `REMOVE_MARKS` | **UNSUPPORTED** | UNKNOWN | UNKNOWN | PdfFixEngine.js |
| Missing PDF/X | `GENERATE_PDFX` | **DECLARED_NOT_IMPLEMENTED** | HIGH | EXPERIMENTAL | FixRegistry.js, PdfFixEngine.js, FixCapabilityContract.js |
| Invalid PDF/X | `VALIDATE_PDFX` | **DECLARED_NOT_IMPLEMENTED** | MEDIUM | EXPERIMENTAL | FixRegistry.js, PdfFixEngine.js, FixCapabilityContract.js |
| Annotations | `FLATTEN_ANNOTATIONS` | **REAL_FIX_AVAILABLE** | LOW | SAFE,REVIEW_REQUIRED,EXPERIMENTAL | FixRegistry.js, PdfFixEngine.js, FixCapabilityContract.js, preflightHumanReportService.js |
| AcroForms | `FLATTEN_FORMS` | **REAL_FIX_AVAILABLE** | LOW | SAFE,REVIEW_REQUIRED,EXPERIMENTAL | FixRegistry.js, PdfFixEngine.js, FixCapabilityContract.js, preflightHumanReportService.js |
| PDF JavaScript | `STRIP_JAVASCRIPT` | **REAL_FIX_AVAILABLE** | LOW | SAFE,REVIEW_REQUIRED,EXPERIMENTAL | FixRegistry.js, PdfFixEngine.js, FixCapabilityContract.js, preflightHumanReportService.js |
| Broken XRef | `REBUILD_XREF` | **PARTIAL_FIX** | LOW | SAFE,REVIEW_REQUIRED,EXPERIMENTAL | FixRegistry.js, PdfFixEngine.js, FixCapabilityContract.js |
| Object streams | `OBJECT_STREAMS` | **UNSUPPORTED** | UNKNOWN | UNKNOWN | PdfFixEngine.js |

## Summary
- **Real Fixes Available**: 9 (REBUILD_TRIMBOX, CONVERT_CMYK, CONVERT_CMYK, INJECT_OUTPUT_INTENT, INJECT_OUTPUT_INTENT, CONVERT_CMYK, FLATTEN_ANNOTATIONS, FLATTEN_FORMS, STRIP_JAVASCRIPT)
- **Partial Fixes**: 2 (APPLY_BLEED, REBUILD_XREF)
- **Declared but Not Implemented**: 9 (EMBED_FONTS, OPTIMIZE_EXCESSIVE_IMAGE_RESOLUTION, FLATTEN_TRANSPARENCY, FLATTEN_OVERPRINT, DETECT_TOTAL_INK_COVERAGE, MAP_RICH_BLACK_TEXT_TO_K_ONLY, MAP_REGISTRATION_COLOR_TO_BLACK, GENERATE_PDFX, VALIDATE_PDFX)
