# Phase 191H: Immutable Review Snapshot Contract

## 1. Immutable Evidence Recording
Upon calling `POST /api/printhouse/onboarding/submit-for-review`, the backend creates an immutable snapshot entry in `printhouse_review_snapshots`.

## 2. Structure & Hashing
- **`snapshot_hash`**: SHA-256 digest of the canonical normalized JSON representation of readiness evidence.
- **`snapshot_json`**: Captures machine count, capability list, material count, lead times, price book version, and shipping region status at the moment of submission.
- **Immutability Guarantee**: Read-only after insertion. Ensures review reproducibility even if tenant configuration changes afterwards.
