# Phase 191D.1 Diff Inventory

## Modified Files
The following files were modified during the initial Phase 191D attempt and their classification:

* `migrations/080_phase132_controlled_invite_only_expansion_preparation_gate.sql`: MUST_REVERT
* `migrations/081_phase133_controlled_invite_only_expansion_execution_gate.sql`: MUST_REVERT
* `migrations/082_phase134_controlled_invite_acceptance_participant_onboarding_gate.sql`: MUST_REVERT
* `migrations/083_phase135_controlled_runtime_access_session_gate.sql`: MUST_REVERT
* `migrations/084_phase136_runtime_activity_observation_participant_usage_audit_gate.sql`: MUST_REVERT
* `migrations/085_phase137_runtime_activity_review_cohort_health_decision_gate.sql`: MUST_REVERT
* `migrations/086_phase138_governed_cohort_intervention_preparation_gate.sql`: MUST_REVERT
* `migrations/087_phase139_governed_cohort_intervention_approval_gate.sql`: MUST_REVERT
* `migrations/088_phase140_controlled_cohort_intervention_execution_gate.sql`: MUST_REVERT
* `migrations/089_phase141_restricted_high_risk_cohort_intervention_simulation_gate.sql`: MUST_REVERT
* `migrations/090_phase142_high_risk_cohort_intervention_simulation_review_gate.sql`: MUST_REVERT
* `migrations/091_phase143_high_risk_cohort_intervention_approval_preparation_gate.sql`: MUST_REVERT
* `migrations/092_phase144_governed_high_risk_cohort_intervention_approval_gate.sql`: MUST_REVERT
* `migrations/migration-integrity-baseline.json`: MUST_REVERT
* `src/api/services/migrationService.js`: MUST_REVERT
* `server.js`: IN_SCOPE (needs audit for canonical mounting)
* `src/api/middleware/auth.js`: IN_SCOPE
* `src/api/routes/admin.js`: IN_SCOPE
* `src/api/routes/authRoutes.js`: IN_SCOPE
* `src/ui/App.tsx`: IN_SCOPE
* `src/ui/pages/PrinthouseRegistrationPage.tsx`: IN_SCOPE

## Untracked / Created Files
The following files were created during the initial Phase 191D (and previous related attempts):

* `docker-compose.phase191b-test.yml`: TEST_ONLY
* `migrations/137_phase191b_printhouse_signup_requests.sql`: IN_SCOPE
* `migrations/138_phase191c_printhouse_onboarding_profiles.sql`: IN_SCOPE
* `migrations/139_phase191d_machine_capabilities_migration.sql`: REQUIRES_SEPARATE_PHASE (Needs amendment for tenant enforcement)
* `scripts/clean_schema_versions.js`: TEMPORARY (Delete)
* `scripts/init_test_db.js`: TEST_ONLY (Keep if useful, otherwise delete)
* `scripts/lib/sqlParser.js`: MUST_REVERT (Delete, part of the migration framework modification)
* `scripts/regen_baseline.js`: TEMPORARY (Delete)
* `scripts/smoke_phase191b_mysql_concurrency.js`: TEST_ONLY
* `scripts/smoke_phase191b_signup_activation.js`: TEST_ONLY
* `scripts/smoke_phase191c_setup_hub.js`: TEST_ONLY
* `scripts/test_phase191b_logic.js`: TEST_ONLY
* `src/api/routes/printhouseMachinesRoutes.js`: IN_SCOPE
* `src/api/routes/printhouseOnboardingRoutes.js`: IN_SCOPE
* `src/api/services/emailDeliveryService.js`: IN_SCOPE
* `src/api/services/printhouseActivationService.js`: IN_SCOPE
* `src/api/services/printhouseMachineService.js`: IN_SCOPE
* `src/api/services/printhouseOnboardingService.js`: IN_SCOPE
* `src/api/services/printhouseReadinessService.js`: IN_SCOPE
* `src/api/services/printhouseSignupService.js`: IN_SCOPE
* `src/ui/pages/PrinthouseActivationPage.tsx`: IN_SCOPE
* `src/ui/pages/printhouse/PrinthouseSetupHub.tsx`: IN_SCOPE
