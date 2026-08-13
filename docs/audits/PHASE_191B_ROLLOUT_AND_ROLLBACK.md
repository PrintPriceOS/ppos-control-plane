# Phase 191B — Rollout and Rollback Guide

## 1. Feature Flag Control
The minimal email signup UI is guarded by `PRINTHOUSE_MINIMAL_SIGNUP_ENABLED`.

* **To Enable Minimal Signup:** Ensure environment / feature flag `PRINTHOUSE_MINIMAL_SIGNUP_ENABLED=true` (or visit `/printhouse/register` directly without `legacy=true`).
* **To Access Legacy 7-Step Wizard:** Append `?legacy=true` to the URL or access via `/admin/printhouse-onboarding/new` in admin mode.

## 2. Rollback Procedure
If issues occur:
1. Set `PRINTHOUSE_MINIMAL_SIGNUP_ENABLED=false` or direct public traffic back to the legacy wizard.
2. The additive table `printhouse_signup_requests` remains intact; no already-activated accounts lose access.
3. Legacy endpoint `POST /api/auth/printhouse/register` remains fully functional for fallback.
