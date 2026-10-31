export interface ObservationSession {
  observation_id: string;
  activation_id: string;
  gate_id: string;
  cohort_id: string;
  tenant_id: string;
  participant_id: string;
  session_id: string;
  observation_status: string;
  observation_severity: string;
  observation_source: string;
  runtime_truth_status: string;
  persistence_status: string;
  verified_from_db: boolean;
  verified_from_phase129: boolean;
  verified_from_phase128_1: boolean;
}

export interface RuntimeHealthSnapshot {
  health: 'HEALTHY' | 'WATCH' | 'DEGRADED' | 'BLOCKED' | 'KILL_SWITCH_ACTIVE';
  summary: {
    activationStatus: string;
    activeParticipants: number;
    activeSessions: number;
    accessAllowedCount: number;
    accessDeniedCount: number;
    forbiddenFeatureAttemptCount: number;
    supportRequestCount: number;
    incidentCount: number;
    killSwitchState: string;
    unresolvedFindingsCount: number;
    slaWarnings: number;
    runtimeRiskScore: number;
    safetyInvariants: any;
  };
}

export interface RuntimeRiskScore {
  risk_score: number;
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  risk_factors: string[];
  recommended_actions: string[];
}

export interface RuntimeObservationReadiness {
  ok: boolean;
  readiness_status: string;
  blocked_reasons: string[];
  checks: any;
  runtimeTruthStatus: string;
  persistenceStatus: string;
  safety: any;
}
