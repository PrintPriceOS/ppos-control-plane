# Phase 65D Smoke Test Report — Control Plane Selective Image Governance Human Report + UX

**Generated:** 2026-06-08T19:48:36.017Z  
**Status:** ✅ PASS  
**Total:** 10 | **Passed:** 10 | **Failed:** 0

## Governance Principles Enforced

- Selective image governance (RGB→CMYK conversion, ICC profile normalization, downsampling, low-res flagging) never implies print-ready or production certification
- Selective image governance never implies PDF/X or PDF/A validation or standards certification
- certified.pdf remains governed by artifact_trust, not filename
- Customer wording stays generic ("Some images were converted or normalized and require review." / "Low-resolution images could not be safely improved automatically."); operator wording is specific to RGB→CMYK conversion, ICC profile normalization, downsampling, and low-res flagging
- artifact_ux labels surface "Image review required" / "Resolution warning" / "Color-managed image change" badges for customer/operator display
- Low-resolution images are never reported as upscaled or restored — only honestly flagged
- Public/customer output is sanitized (no raw paths, streams, forensic IDs)
- Readiness/payment/production gates are not bypassed

## Scenarios

### 1. CONVERT_IMAGE_RGB_TO_CMYK_SELECTIVE applied — color-managed image wording and review
- **Result:** ✅ PASS

### 2. NORMALIZE_IMAGE_ICC_PROFILE skipped — image profile normalization wording and review
- **Result:** ✅ PASS

### 3. DOWNSAMPLE_EXCESSIVE_RESOLUTION applied — resolution warning wording and badge
- **Result:** ✅ PASS

### 4. FLAG_LOW_RES_IMAGES_UNFIXABLE — low-res unfixable wording and badge
- **Result:** ✅ PASS

### 5. Clean control — no selective image governance findings, no action needed
- **Result:** ✅ PASS

### 6. Standards overclaim regression — selective image fix must not imply PDF/X or PDF/A
- **Result:** ✅ PASS

### 7. certified.pdf downgraded when selective_image_governance.review_required=true
- **Result:** ✅ PASS

### 8. Public/customer sanitation — no raw paths, streams, forensic IDs in selective image evidence
- **Result:** ✅ PASS

### 9. Image review required badge — findings present without specific color/resolution fix
- **Result:** ✅ PASS

### 10. Low-res unfixable regression — must never imply upscaling/restoration was performed
- **Result:** ✅ PASS

