# Phase 55D Control Plane Standards Governance Smoke Test

## 1. PDFX_CLAIMED_BUT_NOT_VALIDATED
- **Status:** PASS
- **Outcome:** REVIEW_REQUIRED
- **Severity:** warning
- **Standard Certified:** false
- **PDF/X Claimed:** false
- **Standard Claimed:** null
- **Validator:** null null
- **Customer Wording:** The PDF has not been independently validated as PDF/X or PDF/A. A human review or standards validation is required before claiming standards compliance.
- **Operator Wording:** certified.pdf exists physically but is not production-certified and should not be customer-visible. The PDF appears to claim PDF/X compliance, but no real validator evidence is available. PDF/X compliance was not accepted. A standards compliance claim was present, but required validator evidence was missing. The claim was not accepted.

## 2. PDFX_MISSING only
- **Status:** PASS
- **Outcome:** REVIEW_REQUIRED
- **Severity:** warning
- **Standard Certified:** false
- **PDF/X Claimed:** false
- **Standard Claimed:** null
- **Validator:** null null
- **Customer Wording:** The PDF has not been independently validated as PDF/X or PDF/A. A human review or standards validation is required before claiming standards compliance.
- **Operator Wording:** The PDF does not declare a verified PDF/X standard. No PDF/X compliance was claimed.

## 3. INJECT_OUTPUT_INTENT only
- **Status:** PASS
- **Outcome:** FIXED_REVIEW_REQUIRED
- **Severity:** warning
- **Standard Certified:** false
- **PDF/X Claimed:** false
- **Standard Claimed:** null
- **Validator:** null null
- **Customer Wording:** The PDF has not been independently validated as PDF/X or PDF/A. A human review or standards validation is required before claiming standards compliance.
- **Operator Wording:** An OutputIntent profile was injected. No color values were rewritten. An OutputIntent may have been injected, but OutputIntent injection alone does not prove PDF/X compliance. An OutputIntent may be present or injected, but OutputIntent alone does not prove PDF/X compliance.

## 4. VALIDATE_PDFX validator unavailable
- **Status:** PASS
- **Outcome:** REVIEW_REQUIRED
- **Severity:** warning
- **Standard Certified:** false
- **PDF/X Claimed:** false
- **Standard Claimed:** null
- **Validator:** null null
- **Customer Wording:** The PDF has not been independently validated as PDF/X or PDF/A. A human review or standards validation is required before claiming standards compliance.
- **Operator Wording:** No standards validator was available. PDF/X or PDF/A compliance was not claimed. No standards validator was available.

## 5. Unsupported CONVERT_TO_PDFX
- **Status:** PASS
- **Outcome:** REVIEW_REQUIRED
- **Severity:** warning
- **Standard Certified:** false
- **PDF/X Claimed:** false
- **Standard Claimed:** null
- **Validator:** null null
- **Customer Wording:** The PDF has not been independently validated as PDF/X or PDF/A. A human review or standards validation is required before claiming standards compliance.
- **Operator Wording:** PDF/X conversion is not implemented or validated. PDF/X compliance was not claimed.

## 6. certified.pdf exists but no validator evidence
- **Status:** PASS
- **Outcome:** REVIEW_REQUIRED
- **Severity:** warning
- **Standard Certified:** false
- **PDF/X Claimed:** false
- **Standard Claimed:** null
- **Validator:** null null
- **Customer Wording:** The PDF has not been independently validated as PDF/X or PDF/A. A human review or standards validation is required before claiming standards compliance.
- **Operator Wording:** certified.pdf exists physically but is not production-certified and should not be customer-visible.

## 7. False compliance claim without evidence
- **Status:** PASS
- **Outcome:** REVIEW_REQUIRED
- **Severity:** warning
- **Standard Certified:** false
- **PDF/X Claimed:** false
- **Standard Claimed:** null
- **Validator:** null null
- **Customer Wording:** The PDF has not been independently validated as PDF/X or PDF/A. A human review or standards validation is required before claiming standards compliance.
- **Operator Wording:** A standards compliance claim was present, but required validator evidence was missing. The claim was not accepted.

## 8. Future valid validator evidence
- **Status:** PASS
- **Outcome:** CERTIFIED_READY
- **Severity:** success
- **Standard Certified:** true
- **PDF/X Claimed:** true
- **Standard Claimed:** PDF/X-4
- **Validator:** pdfToolbox 14.0
- **Customer Wording:** Your PDF passed preflight and a certified production-ready file is available.
- **Operator Wording:** File is certified for immediate production routing.

## 9. Public report sanitation
- **Status:** PASS
- **Outcome:** REVIEW_REQUIRED
- **Severity:** warning
- **Standard Certified:** false
- **PDF/X Claimed:** false
- **Standard Claimed:** null
- **Validator:** null null
- **Customer Wording:** The PDF has not been independently validated as PDF/X or PDF/A. A human review or standards validation is required before claiming standards compliance.
- **Operator Wording:** The PDF contains an invalid or conflicting PDF/X declaration. A standards validator is required before PDF/X compliance can be claimed.

## 10. Review decision / readiness / payment simulation
- **Status:** PASS
- **Outcome:** REVIEW_REQUIRED
- **Severity:** warning
- **Standard Certified:** false
- **PDF/X Claimed:** false
- **Standard Claimed:** null
- **Validator:** null null
- **Customer Wording:** The PDF has not been independently validated as PDF/X or PDF/A. A human review or standards validation is required before claiming standards compliance.
- **Operator Wording:** The PDF appears to claim PDF/X compliance, but no real validator evidence is available. PDF/X compliance was not accepted.

