-- Migration 079: Phase 131 Controlled Beta Operational Review Exit Gate
-- Governs the transition out of the initial controlled beta cohort to ensure strict
-- observation and manual approval gating before expansion.

CREATE TABLE controlled_beta_operational_reviews (
    review_id VARCHAR(64) PRIMARY KEY,
    activation_id VARCHAR(64) NOT NULL,
    gate_id VARCHAR(64) NOT NULL,
    cohort_id VARCHAR(64) NOT NULL,
    tenant_id VARCHAR(64) NOT NULL,
    review_status VARCHAR(64) NOT NULL DEFAULT 'DRAFT',
    review_period_start DATETIME,
    review_period_end DATETIME,
    evaluated_at DATETIME,
    evaluated_by VARCHAR(64),
    
    -- Safety Constraints
    full_public_enabled TINYINT(1) NOT NULL DEFAULT 0,
    open_marketplace_enabled TINYINT(1) NOT NULL DEFAULT 0,
    public_signup_enabled TINYINT(1) NOT NULL DEFAULT 0,
    public_beta_enabled TINYINT(1) NOT NULL DEFAULT 0,
    payment_execution_enabled TINYINT(1) NOT NULL DEFAULT 0,
    refund_execution_enabled TINYINT(1) NOT NULL DEFAULT 0,
    payout_execution_enabled TINYINT(1) NOT NULL DEFAULT 0,
    provider_external_submission_enabled TINYINT(1) NOT NULL DEFAULT 0,
    external_tax_submission_enabled TINYINT(1) NOT NULL DEFAULT 0,
    external_accounting_submission_enabled TINYINT(1) NOT NULL DEFAULT 0,
    source_mutation_enabled TINYINT(1) NOT NULL DEFAULT 0,
    invite_only TINYINT(1) NOT NULL DEFAULT 1,
    cohort_scoped TINYINT(1) NOT NULL DEFAULT 1,
    tenant_scoped TINYINT(1) NOT NULL DEFAULT 1,
    participant_scoped TINYINT(1) NOT NULL DEFAULT 1,
    manual_review_required TINYINT(1) NOT NULL DEFAULT 1,
    auto_expansion_enabled TINYINT(1) NOT NULL DEFAULT 0,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_cb_or_act (activation_id),
    INDEX idx_cb_or_gate (gate_id),
    INDEX idx_cb_or_cohort (cohort_id),
    INDEX idx_cb_or_tenant (tenant_id),
    INDEX idx_cb_or_status (review_status),
    INDEX idx_cb_or_eval (evaluated_at),
    INDEX idx_cb_or_created (created_at)
);

CREATE TABLE controlled_beta_operational_review_inputs (
    input_id VARCHAR(64) PRIMARY KEY,
    review_id VARCHAR(64) NOT NULL,
    activation_id VARCHAR(64) NOT NULL,
    input_type VARCHAR(64) NOT NULL,
    input_value JSON,
    verified_from_phase130 TINYINT(1) NOT NULL DEFAULT 0,
    verified_from_phase129 TINYINT(1) NOT NULL DEFAULT 0,
    verified_from_phase128_1 TINYINT(1) NOT NULL DEFAULT 0,
    
    -- Safety Constraints
    full_public_enabled TINYINT(1) NOT NULL DEFAULT 0,
    open_marketplace_enabled TINYINT(1) NOT NULL DEFAULT 0,
    public_signup_enabled TINYINT(1) NOT NULL DEFAULT 0,
    public_beta_enabled TINYINT(1) NOT NULL DEFAULT 0,
    payment_execution_enabled TINYINT(1) NOT NULL DEFAULT 0,
    refund_execution_enabled TINYINT(1) NOT NULL DEFAULT 0,
    payout_execution_enabled TINYINT(1) NOT NULL DEFAULT 0,
    provider_external_submission_enabled TINYINT(1) NOT NULL DEFAULT 0,
    external_tax_submission_enabled TINYINT(1) NOT NULL DEFAULT 0,
    external_accounting_submission_enabled TINYINT(1) NOT NULL DEFAULT 0,
    source_mutation_enabled TINYINT(1) NOT NULL DEFAULT 0,
    invite_only TINYINT(1) NOT NULL DEFAULT 1,
    cohort_scoped TINYINT(1) NOT NULL DEFAULT 1,
    tenant_scoped TINYINT(1) NOT NULL DEFAULT 1,
    participant_scoped TINYINT(1) NOT NULL DEFAULT 1,
    manual_review_required TINYINT(1) NOT NULL DEFAULT 1,
    auto_expansion_enabled TINYINT(1) NOT NULL DEFAULT 0,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_cb_ori_rev (review_id),
    INDEX idx_cb_ori_act (activation_id)
);

CREATE TABLE controlled_beta_operational_review_criteria (
    criteria_id VARCHAR(64) PRIMARY KEY,
    review_id VARCHAR(64) NOT NULL,
    activation_id VARCHAR(64) NOT NULL,
    criteria_name VARCHAR(128) NOT NULL,
    passed TINYINT(1) NOT NULL DEFAULT 0,
    evaluated_at DATETIME,
    
    -- Safety Constraints
    full_public_enabled TINYINT(1) NOT NULL DEFAULT 0,
    open_marketplace_enabled TINYINT(1) NOT NULL DEFAULT 0,
    public_signup_enabled TINYINT(1) NOT NULL DEFAULT 0,
    public_beta_enabled TINYINT(1) NOT NULL DEFAULT 0,
    payment_execution_enabled TINYINT(1) NOT NULL DEFAULT 0,
    refund_execution_enabled TINYINT(1) NOT NULL DEFAULT 0,
    payout_execution_enabled TINYINT(1) NOT NULL DEFAULT 0,
    provider_external_submission_enabled TINYINT(1) NOT NULL DEFAULT 0,
    external_tax_submission_enabled TINYINT(1) NOT NULL DEFAULT 0,
    external_accounting_submission_enabled TINYINT(1) NOT NULL DEFAULT 0,
    source_mutation_enabled TINYINT(1) NOT NULL DEFAULT 0,
    invite_only TINYINT(1) NOT NULL DEFAULT 1,
    cohort_scoped TINYINT(1) NOT NULL DEFAULT 1,
    tenant_scoped TINYINT(1) NOT NULL DEFAULT 1,
    participant_scoped TINYINT(1) NOT NULL DEFAULT 1,
    manual_review_required TINYINT(1) NOT NULL DEFAULT 1,
    auto_expansion_enabled TINYINT(1) NOT NULL DEFAULT 0,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_cb_orc_rev (review_id),
    INDEX idx_cb_orc_act (activation_id)
);

CREATE TABLE controlled_beta_operational_review_scores (
    score_id VARCHAR(64) PRIMARY KEY,
    review_id VARCHAR(64) NOT NULL,
    activation_id VARCHAR(64) NOT NULL,
    operational_score INT NOT NULL DEFAULT 0,
    risk_score INT NOT NULL DEFAULT 0,
    evidence_score INT NOT NULL DEFAULT 0,
    support_score INT NOT NULL DEFAULT 0,
    sla_score INT NOT NULL DEFAULT 0,
    access_stability_score INT NOT NULL DEFAULT 0,
    governance_score INT NOT NULL DEFAULT 0,
    overall_exit_readiness_score INT NOT NULL DEFAULT 0,
    
    -- Safety Constraints
    full_public_enabled TINYINT(1) NOT NULL DEFAULT 0,
    open_marketplace_enabled TINYINT(1) NOT NULL DEFAULT 0,
    public_signup_enabled TINYINT(1) NOT NULL DEFAULT 0,
    public_beta_enabled TINYINT(1) NOT NULL DEFAULT 0,
    payment_execution_enabled TINYINT(1) NOT NULL DEFAULT 0,
    refund_execution_enabled TINYINT(1) NOT NULL DEFAULT 0,
    payout_execution_enabled TINYINT(1) NOT NULL DEFAULT 0,
    provider_external_submission_enabled TINYINT(1) NOT NULL DEFAULT 0,
    external_tax_submission_enabled TINYINT(1) NOT NULL DEFAULT 0,
    external_accounting_submission_enabled TINYINT(1) NOT NULL DEFAULT 0,
    source_mutation_enabled TINYINT(1) NOT NULL DEFAULT 0,
    invite_only TINYINT(1) NOT NULL DEFAULT 1,
    cohort_scoped TINYINT(1) NOT NULL DEFAULT 1,
    tenant_scoped TINYINT(1) NOT NULL DEFAULT 1,
    participant_scoped TINYINT(1) NOT NULL DEFAULT 1,
    manual_review_required TINYINT(1) NOT NULL DEFAULT 1,
    auto_expansion_enabled TINYINT(1) NOT NULL DEFAULT 0,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_cb_ors_rev (review_id),
    INDEX idx_cb_ors_act (activation_id)
);

CREATE TABLE controlled_beta_operational_exit_criteria (
    exit_criteria_id VARCHAR(64) PRIMARY KEY,
    review_id VARCHAR(64) NOT NULL,
    activation_id VARCHAR(64) NOT NULL,
    passed TINYINT(1) NOT NULL DEFAULT 0,
    
    -- Safety Constraints
    full_public_enabled TINYINT(1) NOT NULL DEFAULT 0,
    open_marketplace_enabled TINYINT(1) NOT NULL DEFAULT 0,
    public_signup_enabled TINYINT(1) NOT NULL DEFAULT 0,
    public_beta_enabled TINYINT(1) NOT NULL DEFAULT 0,
    payment_execution_enabled TINYINT(1) NOT NULL DEFAULT 0,
    refund_execution_enabled TINYINT(1) NOT NULL DEFAULT 0,
    payout_execution_enabled TINYINT(1) NOT NULL DEFAULT 0,
    provider_external_submission_enabled TINYINT(1) NOT NULL DEFAULT 0,
    external_tax_submission_enabled TINYINT(1) NOT NULL DEFAULT 0,
    external_accounting_submission_enabled TINYINT(1) NOT NULL DEFAULT 0,
    source_mutation_enabled TINYINT(1) NOT NULL DEFAULT 0,
    invite_only TINYINT(1) NOT NULL DEFAULT 1,
    cohort_scoped TINYINT(1) NOT NULL DEFAULT 1,
    tenant_scoped TINYINT(1) NOT NULL DEFAULT 1,
    participant_scoped TINYINT(1) NOT NULL DEFAULT 1,
    manual_review_required TINYINT(1) NOT NULL DEFAULT 1,
    auto_expansion_enabled TINYINT(1) NOT NULL DEFAULT 0,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_cb_oec_rev (review_id),
    INDEX idx_cb_oec_act (activation_id)
);

CREATE TABLE controlled_beta_operational_exit_decisions (
    decision_id VARCHAR(64) PRIMARY KEY,
    review_id VARCHAR(64) NOT NULL,
    activation_id VARCHAR(64) NOT NULL,
    gate_id VARCHAR(64) NOT NULL,
    cohort_id VARCHAR(64) NOT NULL,
    tenant_id VARCHAR(64) NOT NULL,
    decision_status VARCHAR(64) NOT NULL DEFAULT 'DRAFT',
    decision_type VARCHAR(64) NOT NULL,
    decision_reason TEXT,
    
    -- Safety Constraints
    full_public_enabled TINYINT(1) NOT NULL DEFAULT 0,
    open_marketplace_enabled TINYINT(1) NOT NULL DEFAULT 0,
    public_signup_enabled TINYINT(1) NOT NULL DEFAULT 0,
    public_beta_enabled TINYINT(1) NOT NULL DEFAULT 0,
    payment_execution_enabled TINYINT(1) NOT NULL DEFAULT 0,
    refund_execution_enabled TINYINT(1) NOT NULL DEFAULT 0,
    payout_execution_enabled TINYINT(1) NOT NULL DEFAULT 0,
    provider_external_submission_enabled TINYINT(1) NOT NULL DEFAULT 0,
    external_tax_submission_enabled TINYINT(1) NOT NULL DEFAULT 0,
    external_accounting_submission_enabled TINYINT(1) NOT NULL DEFAULT 0,
    source_mutation_enabled TINYINT(1) NOT NULL DEFAULT 0,
    invite_only TINYINT(1) NOT NULL DEFAULT 1,
    cohort_scoped TINYINT(1) NOT NULL DEFAULT 1,
    tenant_scoped TINYINT(1) NOT NULL DEFAULT 1,
    participant_scoped TINYINT(1) NOT NULL DEFAULT 1,
    manual_review_required TINYINT(1) NOT NULL DEFAULT 1,
    auto_expansion_enabled TINYINT(1) NOT NULL DEFAULT 0,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_cb_oed_rev (review_id),
    INDEX idx_cb_oed_act (activation_id),
    INDEX idx_cb_oed_status (decision_status),
    INDEX idx_cb_oed_type (decision_type)
);

CREATE TABLE controlled_beta_operational_expansion_recommendations (
    recommendation_id VARCHAR(64) PRIMARY KEY,
    review_id VARCHAR(64) NOT NULL,
    activation_id VARCHAR(64) NOT NULL,
    expansion_allowed TINYINT(1) NOT NULL DEFAULT 0,
    expansion_blocked TINYINT(1) NOT NULL DEFAULT 0,
    pause_recommended TINYINT(1) NOT NULL DEFAULT 0,
    remediation_required TINYINT(1) NOT NULL DEFAULT 0,
    max_additional_participants INT DEFAULT 0,
    allowed_tenant_scope VARCHAR(255),
    allowed_cohort_scope VARCHAR(255),
    allowed_feature_scope VARCHAR(255),
    blocking_reasons JSON,
    
    -- Safety Constraints
    full_public_enabled TINYINT(1) NOT NULL DEFAULT 0,
    open_marketplace_enabled TINYINT(1) NOT NULL DEFAULT 0,
    public_signup_enabled TINYINT(1) NOT NULL DEFAULT 0,
    public_beta_enabled TINYINT(1) NOT NULL DEFAULT 0,
    payment_execution_enabled TINYINT(1) NOT NULL DEFAULT 0,
    refund_execution_enabled TINYINT(1) NOT NULL DEFAULT 0,
    payout_execution_enabled TINYINT(1) NOT NULL DEFAULT 0,
    provider_external_submission_enabled TINYINT(1) NOT NULL DEFAULT 0,
    external_tax_submission_enabled TINYINT(1) NOT NULL DEFAULT 0,
    external_accounting_submission_enabled TINYINT(1) NOT NULL DEFAULT 0,
    source_mutation_enabled TINYINT(1) NOT NULL DEFAULT 0,
    invite_only TINYINT(1) NOT NULL DEFAULT 1,
    cohort_scoped TINYINT(1) NOT NULL DEFAULT 1,
    tenant_scoped TINYINT(1) NOT NULL DEFAULT 1,
    participant_scoped TINYINT(1) NOT NULL DEFAULT 1,
    manual_review_required TINYINT(1) NOT NULL DEFAULT 1,
    auto_expansion_enabled TINYINT(1) NOT NULL DEFAULT 0,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_cb_oer_rev (review_id),
    INDEX idx_cb_oer_act (activation_id)
);

CREATE TABLE controlled_beta_operational_review_findings (
    finding_id VARCHAR(64) PRIMARY KEY,
    review_id VARCHAR(64) NOT NULL,
    activation_id VARCHAR(64) NOT NULL,
    finding_status VARCHAR(64) NOT NULL DEFAULT 'OPEN',
    finding_severity VARCHAR(64) NOT NULL,
    finding_description TEXT,
    
    -- Safety Constraints
    full_public_enabled TINYINT(1) NOT NULL DEFAULT 0,
    open_marketplace_enabled TINYINT(1) NOT NULL DEFAULT 0,
    public_signup_enabled TINYINT(1) NOT NULL DEFAULT 0,
    public_beta_enabled TINYINT(1) NOT NULL DEFAULT 0,
    payment_execution_enabled TINYINT(1) NOT NULL DEFAULT 0,
    refund_execution_enabled TINYINT(1) NOT NULL DEFAULT 0,
    payout_execution_enabled TINYINT(1) NOT NULL DEFAULT 0,
    provider_external_submission_enabled TINYINT(1) NOT NULL DEFAULT 0,
    external_tax_submission_enabled TINYINT(1) NOT NULL DEFAULT 0,
    external_accounting_submission_enabled TINYINT(1) NOT NULL DEFAULT 0,
    source_mutation_enabled TINYINT(1) NOT NULL DEFAULT 0,
    invite_only TINYINT(1) NOT NULL DEFAULT 1,
    cohort_scoped TINYINT(1) NOT NULL DEFAULT 1,
    tenant_scoped TINYINT(1) NOT NULL DEFAULT 1,
    participant_scoped TINYINT(1) NOT NULL DEFAULT 1,
    manual_review_required TINYINT(1) NOT NULL DEFAULT 1,
    auto_expansion_enabled TINYINT(1) NOT NULL DEFAULT 0,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_cb_orf_rev (review_id),
    INDEX idx_cb_orf_act (activation_id)
);

CREATE TABLE controlled_beta_operational_review_approvals (
    approval_id VARCHAR(64) PRIMARY KEY,
    review_id VARCHAR(64) NOT NULL,
    activation_id VARCHAR(64) NOT NULL,
    approval_status VARCHAR(64) NOT NULL,
    approved_by VARCHAR(64),
    rejected_by VARCHAR(64),
    evidence_integrity_hash VARCHAR(255),
    
    -- Safety Constraints
    full_public_enabled TINYINT(1) NOT NULL DEFAULT 0,
    open_marketplace_enabled TINYINT(1) NOT NULL DEFAULT 0,
    public_signup_enabled TINYINT(1) NOT NULL DEFAULT 0,
    public_beta_enabled TINYINT(1) NOT NULL DEFAULT 0,
    payment_execution_enabled TINYINT(1) NOT NULL DEFAULT 0,
    refund_execution_enabled TINYINT(1) NOT NULL DEFAULT 0,
    payout_execution_enabled TINYINT(1) NOT NULL DEFAULT 0,
    provider_external_submission_enabled TINYINT(1) NOT NULL DEFAULT 0,
    external_tax_submission_enabled TINYINT(1) NOT NULL DEFAULT 0,
    external_accounting_submission_enabled TINYINT(1) NOT NULL DEFAULT 0,
    source_mutation_enabled TINYINT(1) NOT NULL DEFAULT 0,
    invite_only TINYINT(1) NOT NULL DEFAULT 1,
    cohort_scoped TINYINT(1) NOT NULL DEFAULT 1,
    tenant_scoped TINYINT(1) NOT NULL DEFAULT 1,
    participant_scoped TINYINT(1) NOT NULL DEFAULT 1,
    manual_review_required TINYINT(1) NOT NULL DEFAULT 1,
    auto_expansion_enabled TINYINT(1) NOT NULL DEFAULT 0,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_cb_ora_rev (review_id),
    INDEX idx_cb_ora_act (activation_id),
    INDEX idx_cb_ora_status (approval_status),
    INDEX idx_cb_ora_hash (evidence_integrity_hash)
);

CREATE TABLE controlled_beta_operational_review_evidence_packs (
    pack_id VARCHAR(64) PRIMARY KEY,
    review_id VARCHAR(64) NOT NULL,
    activation_id VARCHAR(64) NOT NULL,
    evidence_schema_version VARCHAR(64) NOT NULL DEFAULT '131.0',
    evidence_payload JSON NOT NULL,
    evidence_integrity_hash VARCHAR(255) NOT NULL,
    runtime_truth_status VARCHAR(64) NOT NULL DEFAULT 'VERIFIED',
    persistence_status VARCHAR(64) NOT NULL DEFAULT 'PERSISTED',
    verified_from_db TINYINT(1) NOT NULL DEFAULT 1,
    
    -- Safety Constraints
    full_public_enabled TINYINT(1) NOT NULL DEFAULT 0,
    open_marketplace_enabled TINYINT(1) NOT NULL DEFAULT 0,
    public_signup_enabled TINYINT(1) NOT NULL DEFAULT 0,
    public_beta_enabled TINYINT(1) NOT NULL DEFAULT 0,
    payment_execution_enabled TINYINT(1) NOT NULL DEFAULT 0,
    refund_execution_enabled TINYINT(1) NOT NULL DEFAULT 0,
    payout_execution_enabled TINYINT(1) NOT NULL DEFAULT 0,
    provider_external_submission_enabled TINYINT(1) NOT NULL DEFAULT 0,
    external_tax_submission_enabled TINYINT(1) NOT NULL DEFAULT 0,
    external_accounting_submission_enabled TINYINT(1) NOT NULL DEFAULT 0,
    source_mutation_enabled TINYINT(1) NOT NULL DEFAULT 0,
    invite_only TINYINT(1) NOT NULL DEFAULT 1,
    cohort_scoped TINYINT(1) NOT NULL DEFAULT 1,
    tenant_scoped TINYINT(1) NOT NULL DEFAULT 1,
    participant_scoped TINYINT(1) NOT NULL DEFAULT 1,
    manual_review_required TINYINT(1) NOT NULL DEFAULT 1,
    auto_expansion_enabled TINYINT(1) NOT NULL DEFAULT 0,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_cb_orep_rev (review_id),
    INDEX idx_cb_orep_act (activation_id),
    INDEX idx_cb_orep_hash (evidence_integrity_hash)
);

CREATE TABLE controlled_beta_operational_review_audits (
    audit_id VARCHAR(64) PRIMARY KEY,
    review_id VARCHAR(64) NOT NULL,
    activation_id VARCHAR(64) NOT NULL,
    action_type VARCHAR(64) NOT NULL,
    action_payload JSON,
    actor VARCHAR(64),
    
    -- Safety Constraints
    full_public_enabled TINYINT(1) NOT NULL DEFAULT 0,
    open_marketplace_enabled TINYINT(1) NOT NULL DEFAULT 0,
    public_signup_enabled TINYINT(1) NOT NULL DEFAULT 0,
    public_beta_enabled TINYINT(1) NOT NULL DEFAULT 0,
    payment_execution_enabled TINYINT(1) NOT NULL DEFAULT 0,
    refund_execution_enabled TINYINT(1) NOT NULL DEFAULT 0,
    payout_execution_enabled TINYINT(1) NOT NULL DEFAULT 0,
    provider_external_submission_enabled TINYINT(1) NOT NULL DEFAULT 0,
    external_tax_submission_enabled TINYINT(1) NOT NULL DEFAULT 0,
    external_accounting_submission_enabled TINYINT(1) NOT NULL DEFAULT 0,
    source_mutation_enabled TINYINT(1) NOT NULL DEFAULT 0,
    invite_only TINYINT(1) NOT NULL DEFAULT 1,
    cohort_scoped TINYINT(1) NOT NULL DEFAULT 1,
    tenant_scoped TINYINT(1) NOT NULL DEFAULT 1,
    participant_scoped TINYINT(1) NOT NULL DEFAULT 1,
    manual_review_required TINYINT(1) NOT NULL DEFAULT 1,
    auto_expansion_enabled TINYINT(1) NOT NULL DEFAULT 0,

    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_cb_orau_rev (review_id),
    INDEX idx_cb_orau_act (activation_id)
);
