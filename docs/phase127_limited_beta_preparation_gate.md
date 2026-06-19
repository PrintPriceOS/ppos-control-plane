# Phase 127: Limited Beta Preparation Gate

The Limited Beta Preparation Gate governs transition from internal pilot validation into controlled, invite-only beta cohorts. This phase establishes governance boundaries, participant eligibility rules, terms acceptance tracking, role boundaries, support escalation pathways, and incident rollback procedures.

## Safety Invariant Lock

To ensure operational security, all runtime activation flags remain strictly locked to off. The following safety parameters are enforced at all times:
- `betaRuntimeEnabled` = FALSE
- `fullPublicEnabled` = FALSE
- `openMarketplaceEnabled` = FALSE
- `paymentExecutionEnabled` = FALSE
- `refundExecutionEnabled` = FALSE
- `payoutExecutionEnabled` = FALSE
- `liveProviderConnectivityEnabled` = FALSE
- `providerExternalSubmissionEnabled` = FALSE
- `externalTaxSubmissionEnabled` = FALSE
- `externalAccountingSubmissionEnabled` = FALSE
- `sourceMutationEnabled` = FALSE

## Schema Architecture (`072_phase127_limited_beta_preparation_gate.sql`)

Eleven tables are created to audit and govern the limited beta preparation:
1. `limited_beta_preparation_gates`: Root gate tracking overall readiness status.
2. `limited_beta_cohorts`: Logical groups of participants (max size bounded).
3. `limited_beta_cohort_participants`: Eligible tenant mappings with specific statuses (`DRAFT`, `INVITED`, `TERMS_PENDING`, `APPROVED_FOR_LIMITED_BETA_PREPARATION`).
4. `limited_beta_invite_codes`: Invite code tokens for cohort onboarding.
5. `limited_beta_terms_acceptances`: Records of terms acceptance for external participants.
6. `limited_beta_role_boundaries`: Scoped action restrictions per participant.
7. `limited_beta_support_escalations`: Support channels defined prior to beta.
8. `limited_beta_incident_rollback_plans`: Procedural checklist to revert to pilot-only state.
9. `limited_beta_findings`: Open blocker logs preventing gate clearance.
10. `limited_beta_audits`: Immutable ledger of administrative actions.
11. `limited_beta_evidence_packs`: Cryptographically hashed bundles representing prep gate state.

## Preparation Readiness Checks

A gate cannot be marked `READY` unless:
1. Phase 126.1 `runtime_truth_status` is `VERIFIED` and `persistenceStatus` is `PERSISTED` (read from `pilot_evidence_go_no_go_decisions` table).
2. Phase 126.1.3 credential rotation and secret hygiene is verified.
3. No unresolved blocker findings exist in `limited_beta_findings`.
4. Support escalation paths and incident rollback plans are registered.
5. Cohort participants are explicitly approved only after their terms acceptances and role boundaries are recorded.
