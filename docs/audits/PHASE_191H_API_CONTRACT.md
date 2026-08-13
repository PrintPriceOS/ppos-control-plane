# Phase 191H: API Contract

## 1. Printhouse Self-Service Endpoints (`/api/printhouse/onboarding`)
- `POST /submit-for-review`: Submits setup for admin review and records evidence snapshot.
- `GET  /review-status`: Fetches current review status and readiness summary.

## 2. Admin Governance Endpoints (`/api/admin/printhouse-reviews`)
- `GET  /`: List review queue (optional `status` query parameter).
- `GET  /:reviewId`: Fetch review detail and immutable submission snapshot.
- `POST /:reviewId/start`: Begin review (`READY_FOR_REVIEW` $\rightarrow$ `UNDER_REVIEW`).
- `POST /:reviewId/request-changes`: Request changes with structured reason code and explanation.
- `POST /:reviewId/approve`: Approve review (`MARKETPLACE_APPROVED: true`).
- `POST /:reviewId/reject`: Reject review.
- `POST /:reviewId/activate`: Execute controlled atomic activation (capability grants).
- `POST /:reviewId/suspend`: Suspend active node and revoke capability grants instantly.
