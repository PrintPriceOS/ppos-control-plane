export interface OperationalReviewReadiness {
  ok: boolean;
  readiness_status: string;
  blocked_reasons: string[];
  checks: Record<string, boolean>;
  runtimeTruthStatus: string;
  persistenceStatus: string;
  safety: { fullPublicEnabled: boolean };
}

export interface OperationalReviewScore {
  operational_score: number;
  risk_score: number;
  evidence_score: number;
  support_score: number;
  sla_score: number;
  access_stability_score: number;
  governance_score: number;
  overall_exit_readiness_score: number;
}

export interface ExpansionRecommendation {
  recommendation: string;
  recommendation_status: string;
  expansion_allowed: boolean;
  expansion_blocked: boolean;
  max_additional_participants: number;
  allowed_tenant_scope: string;
  allowed_cohort_scope: string;
  allowed_feature_scope: string;
  required_approvals: number;
  required_mitigations: string[];
  blocking_reasons: string[];
  evidence_integrity_hash: string;
}

export interface OperationalReviewEvidencePack {
  evidence_schema_version: string;
  review_id: string;
  activation_id: string;
  gate_id: string;
  cohort_id: string;
  tenant_id: string;
  review_period: any;
  phase130_evidence_status: string;
  phase129_evidence_status: string;
  phase128_1_evidence_status: string;
  health_snapshot_summary: any;
  runtime_risk_summary: any;
  incident_summary: any;
  support_summary: any;
  sla_summary: any;
  access_summary: any;
  forbidden_feature_attempt_summary: any;
  monitoring_findings_summary: any;
  exit_criteria_results: any[];
  scoring_summary: any;
  expansion_recommendation: any;
  decision_summary: any;
  approval_summary: any;
  safety_invariants: any;
  runtime_truth_status: string;
  persistence_status: string;
  evidence_integrity_hash: string;
}
