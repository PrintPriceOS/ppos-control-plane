-- Migration 130: Phase 176 - Legal/Policy Hold Status Column Width Hotfix

ALTER TABLE cb_cohort_intervention_activation_token_redempt_unlock_lph
  MODIFY activation_execution_status VARCHAR(191) NOT NULL,
  MODIFY unlock_legal_policy_hold_status VARCHAR(191) NOT NULL,
  MODIFY unlock_legal_policy_hold_result VARCHAR(191) NOT NULL,
  MODIFY unlock_legal_policy_hold_mode VARCHAR(191) NOT NULL,
  MODIFY execution_capability_status VARCHAR(191) NOT NULL,
  MODIFY package_freeze_status VARCHAR(191) NOT NULL,
  MODIFY redemption_package_freeze_status VARCHAR(191) NOT NULL,
  MODIFY plan_executable_status VARCHAR(191) NOT NULL,
  MODIFY job_creation_status VARCHAR(191) NOT NULL,
  MODIFY queue_dispatch_status VARCHAR(191) NOT NULL,
  MODIFY runtime_mutation_status VARCHAR(191) NOT NULL;
