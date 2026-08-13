# docs/audits/PHASE_192G_CONTROLLED_BETA_PLAN.md

## Phase 192G — Controlled Beta Plan

### Audit Date
2026-08-13

---

## Objective

Determine whether the governed production runtime chain is safe for a small, supervised real cohort — and whether the evidence warrants a GO, CONDITIONAL_GO, or NO_GO decision.

---

## Beta Cohort Definition

```
COHORT_SIZE: 1-3 Printhouses (explicit allowlist)
PRODUCTION_SITES: 1 per Printhouse
MACHINE_TYPES: Digital (offset or industrial if fully configured)
MATERIALS: Pre-configured per onboarding profile
PRICING_PROFILES: 1 published price book per Printhouse
SHIPPING_REGIONS: At least 1 configured region
INTEGRATION_TYPES: API (JDF/JMF optional)
EXPECTED_JOB_VOLUME: 5-20 jobs per day (supervised)
ENROLLMENT_MODEL: Explicit operator-provisioned, not automatic
```

---

## Beta Formula

```
BETA_RUNTIME_ALLOWED
= NORMAL_EFFECTIVE_CAPABILITY
  AND BETA_COHORT_ALLOWED

BETA_ALLOWLIST_CAN_GRANT_CAPABILITY: NO
```

Beta allowlisting may **further restrict** access. It never grants missing capabilities.

---

## Rollout Stages

```
STAGE 0 — Synthetic only (current: COMPLETE via test suites)
STAGE 1 — One Printhouse, operator supervised (ready pending CONDITIONAL_GO)
STAGE 2 — Small controlled cohort 2-3 Printhouses
STAGE 3 — Expanded beta
STAGE 4 — Production availability (requires all conditions resolved)
```

---

## Stage Promotion Criteria

Each stage requires:
- No critical security event
- No duplicate dispatch
- No sealed pricing mutation
- No kill-switch bypass
- Acceptable runtime health
- Explicit operator review & sign-off

```
AUTOMATIC_BETA_STAGE_PROMOTION: NO
```

---

## Beta Enrollment Restriction

Given:
- `PRODUCTION_EMAIL_DELIVERY: NOT_VERIFIED_BETA_PREPROVISIONED_ONLY`

Stage 1 and Stage 2 beta must use **pre-provisioned and manually activated accounts** only. No live email signup flow is permitted until email delivery is verified.

---

## CONTROLLED_BETA_PLAN: DOCUMENTED
