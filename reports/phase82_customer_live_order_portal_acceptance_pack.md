# Phase 82 — Customer Live Order Portal Acceptance Pack

## 1. Purpose
To establish a safe, action-oriented customer portal for the limited commercial pilot without leaking operational details or bypassing governance.

## 2. What Phase 82 Enables
- Customer-safe view of live order status.
- Secure, tokenized actions (proof approval, file reupload, payment reference).
- Customer-safe messaging and notifications.
- Strict isolation of tenant and customer data.

## 3. What Phase 82 Does Not Enable
- Unrestricted public ordering.
- Bypassing production guards (artifact trust, machine compatibility).

## 4. Customer Portal Scope
- Read-only safe statuses, documents, timeline.
- Actionable panels for proof, upload, payment reference.

## 5. Customer-Safe Status Model
Internal statuses map securely to safe customer messages (e.g., `PREPARING_FOR_PRODUCTION`, `IN_PRODUCTION`).

## 6. Customer Actions
Available strictly when requested by the backend system.

## 7. Proof Approval Boundary
Customer proof approval unlocks the proof gate ONLY. It does NOT bypass artifact trust or live guards.

## 8. Payment Reference Boundary
Payment references are captured but do NOT automatically mark the payment gate as passed. Verification is required.

## 9. File Reupload Boundary
File reuploads reset the preflight, artifact trust, proof, and queue eligibility gates automatically.

## 10. Incident Communication Boundary
Incidents are surfaced as safe delay messages without technical stack traces or operator internals.

## 11. SLA / Schedule Communication Boundary
Estimated schedules are shown but never guaranteed.

## 12. Customer Message Templates
Templates enforce safe wording and hide internal details.

## 13. Customer / Operator Data Boundary
Operator snapshots and governance logs are completely omitted from customer responses.

## 14. Tenant Isolation
Middleware ensures customers can only read their own data.

## 15. Forbidden Claims
No "guaranteed delivery", "certified", or "print-ready" wording without evidence.

## 16. Known Limitations
Payment integration is manual/reference-based until Phase 83.

## 17. Phase 83 Entry Criteria
Portal fully active, customer actions scoped, boundaries intact.

## 18. Final Acceptance Statement
PRINTPRICE OS — PHASE 82 CUSTOMER LIVE ORDER PORTAL / COMMUNICATIONS
STATUS: VALIDATED
CUSTOMER_PORTAL: ACTIVE
CUSTOMER_SAFE_STATUS: ACTIVE
CUSTOMER_ACTIONS: ACTIVE
PROOF_APPROVAL: CUSTOMER_SCOPED
PAYMENT_REFERENCE: VERIFICATION_REQUIRED
REUPLOAD_FLOW: GATE_RESET_VALIDATED
CUSTOMER_MESSAGES: ACTIVE
PUBLIC_MARKETPLACE_LAUNCH: NOT_ENABLED
READY_FOR_PHASE_83: YES
