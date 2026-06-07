# Phase 60: Post-Reupload Lifecycle Verification

## 1. Preflight Review Required
### Checks:
- ✅ Readiness is false
- ✅ Invoice blocked
- ✅ Payment link blocked
- ✅ Unlock blocked
- ✅ Queue blocked
Blockers: MISSING_COVER_SLOT, PREFLIGHT_REVIEW_DECISION_REQUIRED_INTERIOR_PDF
Warnings: 

## 2. Operator Rejects Review
### Checks:
- ✅ Readiness is false
- ✅ Blocker PREFLIGHT_REVIEW_REJECTED_REUPLOAD_REQUIRED present
- ✅ Invoice blocked
Blockers: MISSING_COVER_SLOT, PREFLIGHT_REVIEW_REJECTED_REUPLOAD_REQUIRED_INTERIOR_PDF
Warnings: 

## 3. Customer Action Created
### Checks:
- ✅ Customer action created safely
- ✅ Token preview is safe

## 4. UX Sanitation Check
### Checks:
- ✅ Customer UX says remediation required
- ✅ No operator summary in customer UX
- ✅ Mapped to Interior PDF safely
- ✅ No raw token internals in customer UX

## 5. Replacement File Uploaded
### Checks:
- ✅ Readiness is false after upload
- ✅ Blocker PENDING or UNACCEPTABLE present
- ✅ Invoice remains blocked after upload
Blockers: PREFLIGHT_UNACCEPTABLE_INTERIOR_PDF, PREFLIGHT_REVIEW_REJECTED_REUPLOAD_REQUIRED_INTERIOR_PDF, PREFLIGHT_UNACCEPTABLE_COVER_PDF, PREFLIGHT_REVIEW_REJECTED_REUPLOAD_REQUIRED_COVER_PDF
Warnings: 

## 6. Replacement Preflight Requires Review
### Checks:
- ✅ Readiness is false
- ✅ Blocker PREFLIGHT_REVIEW_DECISION_REQUIRED present
- ✅ Invoice remains blocked pending review
Blockers: PREFLIGHT_REVIEW_DECISION_REQUIRED_INTERIOR_PDF, PREFLIGHT_REVIEW_DECISION_REQUIRED_COVER_PDF
Warnings: 

## 7. Operator Approves with Warnings
### Checks:
- ✅ Readiness is true after approval
- ✅ Old rejection blocker removed
- ✅ Warning preserved
- ✅ Invoice generation allowed
Blockers: 
Warnings: PREFLIGHT_APPROVED_WITH_WARNINGS_INTERIOR_PDF, PREFLIGHT_APPROVED_WITH_WARNINGS_COVER_PDF

## 8. Payment Check
### Checks:
- ✅ Payment link allowed
Blockers: 
Warnings: PREFLIGHT_APPROVED_WITH_WARNINGS_INTERIOR_PDF, PREFLIGHT_APPROVED_WITH_WARNINGS_COVER_PDF

## 9. Payment Confirmation
### Checks:
- ✅ Payment confirmation succeeded

## 10. Production Unlock
### Checks:
- ✅ Production unlocked

## 11. Production Queue Eligibility
### Checks:
- ✅ Queue is eligible
- ✅ Warnings are preserved in queue check
Warnings: FILE_ACCESS_NOT_VERIFIED_BY_AUDIT, PREFLIGHT_APPROVED_WITH_WARNINGS_INTERIOR_PDF, PREFLIGHT_APPROVED_WITH_WARNINGS_COVER_PDF

