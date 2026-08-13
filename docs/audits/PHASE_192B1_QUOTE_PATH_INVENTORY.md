# Phase 192B.1: Runtime Quote Path Inventory

```text
LIVE_QUOTE_PATHS_BYPASSING_CAPABILITY_ADAPTER: 0
UNKNOWN_QUOTE_PATHS: 0
```

## 1. Inventory of Executable Quote Paths

| Route / Service Path | Governance Classification | Governed By Adapter? |
| :--- | :--- | :--- |
| `POST /api/marketplace/quotes/eligibility` | `GOVERNED_LIVE_QUOTE` | YES (`liveQuoteEligibilityService` $\rightarrow$ `printhouseActivationAdapter`) |
| `POST /api/marketplace/quotes/calculate` | `GOVERNED_LIVE_QUOTE` | YES (`liveQuoteEligibilityService` $\rightarrow$ `printhouseActivationAdapter`) |
| `POST /api/printhouse/onboarding/pricing/preview` | `PREVIEW_ONLY` | Read-Only (Non-binding setup preview) |
| `GET /api/admin/pricing/jobs/:jobId/quotes` | `INTERNAL_NON_BINDING` | Read-Only (Admin historical pricing analysis) |
