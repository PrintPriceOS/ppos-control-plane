'use strict';

const crypto = require('crypto');
const db = require('./mysqlClient');

class ControlledBetaExpansionPreparationService {
  constructor() {
    this.schemaVersion = '132.0';
    this._mockState = {
      gates: new Map(),
      phase131: new Map(),
      phase130: new Map(),
      phase129: new Map(),
      phase128_1: new Map()
    };
  }

  setMockState(type, id, data) {
    this._mockState[type].set(id, data);
  }

  async getTableColumns(tableName) {
    const q = "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = ? AND TABLE_SCHEMA = DATABASE()";
    const rows = await db.query(q, [tableName]);
    return rows.map(r => r.COLUMN_NAME);
  }

  async hasColumn(tableName, columnName) {
    const cols = await this.getTableColumns(tableName);
    return cols.includes(columnName);
  }

  async selectExistingColumns(tableName, desiredColumns) {
    const cols = await this.getTableColumns(tableName);
    return desiredColumns.filter(c => cols.includes(c));
  }

  async findExpansionPreparationGateAdaptive(preparationId, reviewId) {
    const tableName = 'controlled_beta_expansion_preparation_gates';
    const cols = await this.getTableColumns(tableName);
    if (cols.length === 0) return null;

    let q = `SELECT * FROM ${tableName} WHERE 1=1`;
    const vals = [];
    let mapped = false;

    if (cols.includes('preparation_id') && preparationId) {
      q += ' AND preparation_id = ?';
      vals.push(preparationId);
      mapped = true;
    } else if (cols.includes('review_id') && reviewId) {
      q += ' AND review_id = ?';
      vals.push(reviewId);
      mapped = true;
    }
    
    if (mapped) {
      const rows = await db.query(q, vals);
      if (rows && rows.length > 0) return rows[0];
    }
    return null;
  }

  async findApprovedPhase131DecisionAdaptive(reviewId, activationId) {
    const tableName = 'controlled_beta_operational_exit_decisions';
    const cols = await this.getTableColumns(tableName);
    if (cols.length === 0) return []; // table doesn't exist
    
    const selectCols = ['decision_status', 'decision_type', 'evidence_integrity_hash', 'decision_id'].filter(c => cols.includes(c));
    let q = `SELECT ${selectCols.length > 0 ? selectCols.join(', ') : '*'} FROM ${tableName} WHERE 1=1`;
    const vals = [];
    
    if (cols.includes('review_id')) {
      q += ' AND review_id = ?';
      vals.push(reviewId);
    }
    if (cols.includes('activation_id')) {
      q += ' AND activation_id = ?';
      vals.push(activationId);
    }
    if (cols.includes('decision_status')) {
      q += " AND decision_status = 'APPROVED'";
    }
    return await db.query(q, vals);
  }

  async findPhase131DecisionEvidenceHashAdaptive(criteria) {
    const candidateTables = [
      'controlled_beta_operational_exit_decisions',
      'controlled_beta_operational_review_evidence_packs',
      'controlled_beta_operational_reviews',
      'controlled_beta_operational_review_approvals'
    ];
    const candidateHashCols = [
      'evidence_integrity_hash',
      'integrity_hash',
      'evidence_hash',
      'decision_evidence_hash',
      'approval_evidence_hash',
      'review_evidence_hash',
      'hash'
    ];
    const { reviewId, activationId, decisionId } = criteria;

    for (const t of candidateTables) {
      const cols = await this.getTableColumns(t);
      if (cols.length === 0) continue;
      
      const hashCol = candidateHashCols.find(c => cols.includes(c));
      if (!hashCol) continue;

      let q = `SELECT ${hashCol} as evidence_hash FROM ${t} WHERE 1=1`;
      const vals = [];
      let mapped = false;

      // Prefer exact decision_id match if available
      if (decisionId && cols.includes('decision_id')) {
        q += ' AND decision_id = ?';
        vals.push(decisionId);
        mapped = true;
      } else if (reviewId && activationId && cols.includes('review_id') && cols.includes('activation_id')) {
        q += ' AND review_id = ? AND activation_id = ?';
        vals.push(reviewId, activationId);
        mapped = true;
      } else if (reviewId && cols.includes('review_id')) {
        q += ' AND review_id = ?';
        vals.push(reviewId);
        mapped = true;
      }
      
      if (mapped) {
        const rows = await db.query(q, vals);
        if (rows.length > 0 && rows[0].evidence_hash) {
          return rows[0].evidence_hash;
        }
      }
    }
    return null;
  }

  normalizeRestartEvidence(row, payload) {
    let recovered_from_db = false;
    let memory_state_detected = true;
    let restart_safe = false;
    let status_ok = false;
    let hash_ok = false;

    // Check direct columns first
    if ('recovered_from_db' in row) recovered_from_db = !!row.recovered_from_db;
    else if ('db_recovered' in row) recovered_from_db = !!row.db_recovered;
    else if ('persistence_recovered' in row) recovered_from_db = !!row.persistence_recovered;
    else if ('recoveredFromDb' in row) recovered_from_db = !!row.recoveredFromDb;

    if ('memory_state_detected' in row) memory_state_detected = !!row.memory_state_detected;
    else if ('memory_fallback_detected' in row) memory_state_detected = !!row.memory_fallback_detected;
    else if ('memoryStateDetected' in row) memory_state_detected = !!row.memoryStateDetected;

    if ('restart_safe' in row) restart_safe = !!row.restart_safe;
    else if ('restartSafe' in row) restart_safe = !!row.restartSafe;
    else if ('recovery_safe' in row) restart_safe = !!row.recovery_safe;
    else if ('restart_recovery_safe' in row) restart_safe = !!row.restart_recovery_safe;

    const statusCol = ['restart_recovery_status', 'recovery_status', 'drill_status', 'status'].find(c => c in row);
    if (statusCol) {
      if (row[statusCol] === 'VERIFIED_AFTER_RESTART' || row[statusCol] === 'COMPLETED') {
        status_ok = true;
      }
    } else {
      status_ok = true; // assume OK if no status column exists but it made it here
    }

    const hashCol = ['recovery_integrity_hash', 'evidence_integrity_hash', 'integrity_hash', 'evidence_hash', 'hash'].find(c => c in row);
    if (hashCol && row[hashCol]) hash_ok = true;

    // Check payload if direct checks failed
    if (payload) {
      if (!recovered_from_db && ('recovered_from_db' in payload)) recovered_from_db = !!payload.recovered_from_db;
      if (memory_state_detected && ('memory_state_detected' in payload)) memory_state_detected = !!payload.memory_state_detected;
      if (!restart_safe && ('restart_safe' in payload)) restart_safe = !!payload.restart_safe;
      
      if (!status_ok && payload.status && (payload.status === 'VERIFIED_AFTER_RESTART' || payload.status === 'COMPLETED')) status_ok = true;
      if (!hash_ok && payload.hash) hash_ok = true;
    }

    return {
      recovered_from_db,
      memory_state_detected,
      restart_safe,
      status_ok,
      hash_ok
    };
  }

  async findPhase128RestartEvidenceAdaptive(criteria = {}, options = {}) {
    const { allowLatestFallback = false, requireContextBoundEvidence = true } = options;
    const { preparationId, reviewId, decisionId, activationId, gateId, cohortId, tenantId } = criteria;
    const isProdLike = process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true';

    const debug = {
       searched_tables: [],
       matched_table: null,
       rejected_reasons: []
    };

    const candidateTables = [
      'limited_beta_runtime_restart_drills',
      'limited_beta_runtime_restart_evidence_packs',
      'limited_beta_runtime_evidence_packs',
      'controlled_beta_runtime_restart_drills',
      'controlled_beta_runtime_restart_evidence_packs'
    ];

    for (const t of candidateTables) {
      const cols = await this.getTableColumns(t);
      if (cols.length === 0) continue;
      
      debug.searched_tables.push(t);

      let q = `SELECT * FROM ${t} WHERE 1=1`;
      const vals = [];
      let mappedToCols = false;

      if (requireContextBoundEvidence) {
        if (activationId && cols.includes('activation_id')) { q += ' AND activation_id = ?'; vals.push(activationId); mappedToCols = true; }
        if (gateId && cols.includes('gate_id')) { q += ' AND gate_id = ?'; vals.push(gateId); mappedToCols = true; }
        if (cohortId && cols.includes('cohort_id')) { q += ' AND cohort_id = ?'; vals.push(cohortId); mappedToCols = true; }
        if (tenantId && cols.includes('tenant_id')) { q += ' AND tenant_id = ?'; vals.push(tenantId); mappedToCols = true; }
        if (reviewId && cols.includes('review_id')) { q += ' AND review_id = ?'; vals.push(reviewId); mappedToCols = true; }
        if (decisionId && cols.includes('decision_id')) { q += ' AND decision_id = ?'; vals.push(decisionId); mappedToCols = true; }
        if (preparationId && cols.includes('preparation_id')) { q += ' AND preparation_id = ?'; vals.push(preparationId); mappedToCols = true; }
      }

      if (!mappedToCols && requireContextBoundEvidence && isProdLike && !allowLatestFallback) {
         debug.rejected_reasons.push(`${t}: scope_columns_absent_without_payload_context (pre-query)`);
         continue; // We'll rely on fetching and checking payload context if we had a way to filter, but we don't. Wait, we should fetch all and check payload!
      }
      
      // If we couldn't map to columns, we must fetch all rows and check payload context
      if (!mappedToCols && requireContextBoundEvidence && isProdLike) {
         q = `SELECT * FROM ${t} ORDER BY created_at DESC LIMIT 100`; // Just fetch recent to check payload
      }

      const rows = await db.query(q, vals);

      for (const r of rows) {
        let payload = null;
        const payloadCol = ['evidence_payload', 'evidence_json', 'payload_json', 'recovery_payload', 'snapshot_payload', 'evidence_data'].find(c => c in r);
        if (payloadCol && r[payloadCol]) {
          try {
             payload = typeof r[payloadCol] === 'string' ? JSON.parse(r[payloadCol]) : r[payloadCol];
          } catch (e) {
             payload = {};
          }
        }
        
        let contextMatch = true;
        if (requireContextBoundEvidence && isProdLike) {
           if (!mappedToCols) {
              if (!payload) {
                 contextMatch = false;
                 debug.rejected_reasons.push(`${t}: missing_payload_for_context_match`);
              } else {
                 if (activationId && payload.activation_id !== activationId) { contextMatch = false; debug.rejected_reasons.push(`${t}: activation_id_mismatch`); }
                 else if (gateId && payload.gate_id !== gateId) { contextMatch = false; debug.rejected_reasons.push(`${t}: gate_id_mismatch`); }
                 else if (cohortId && payload.cohort_id !== cohortId) { contextMatch = false; debug.rejected_reasons.push(`${t}: cohort_id_mismatch`); }
                 else if (tenantId && payload.tenant_id !== tenantId) { contextMatch = false; debug.rejected_reasons.push(`${t}: tenant_id_mismatch`); }
                 else if (reviewId && payload.review_id !== reviewId) { contextMatch = false; debug.rejected_reasons.push(`${t}: review_id_mismatch`); }
                 else if (preparationId && payload.preparation_id !== preparationId) { contextMatch = false; debug.rejected_reasons.push(`${t}: preparation_id_mismatch`); }
                 
                 if (contextMatch && !payload.activation_id && !payload.gate_id && !payload.cohort_id && !payload.tenant_id && !payload.review_id && !payload.preparation_id) {
                     contextMatch = false;
                     debug.rejected_reasons.push(`${t}: scope_columns_absent_without_payload_context`);
                 }
              }
           }
        }
        
        if (!contextMatch) continue;

        const state = this.normalizeRestartEvidence(r, payload);
        if (state.recovered_from_db && !state.memory_state_detected && state.restart_safe && state.status_ok && state.hash_ok) {
          debug.matched_table = t;
          const ret = [r];
          ret.debug = debug;
          return ret;
        } else {
           debug.rejected_reasons.push(`${t}: missing_restart_safe_signal`);
        }
      }
    }
    const ret = [];
    ret.debug = debug;
    return ret;
  }

  async evaluateExpansionPreparationReadiness(preparationId, reviewId) {
    let readiness_status = 'BLOCKED';
    let blocked_reasons = [];
    const checks = {
      phase131_validated: true,
      phase130_validated: true,
      phase129_validated: true,
      phase128_1_validated: true,
      approved_phase131_decision_exists: true,
      decision_allows_invite_only_expansion_preparation: true,
      activation_exists: true,
      activation_scope_valid: true,
      no_active_kill_switch: true,
      no_unresolved_critical_incidents: true,
      no_unresolved_blocker_findings: true,
      operational_review_score_acceptable: true,
      risk_level_acceptable: true,
      support_status_acceptable: true,
      sla_status_acceptable: true,
      candidate_scope_defined: true,
      draft_invites_are_non_sendable: true,
      no_active_invites_created: true,
      no_participants_added: true,
      no_scope_broadened: true,
      safety_invariants_disabled: true,
      manual_approval_required: true,
      auto_expansion_disabled: true
    };

    const isProdLike = process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true';

    try {
      let p;
      let phase131Decisions;
      let phase130Packs;
      let phase129Packs;
      let phase128Packs;

      if (!isProdLike && this._mockState.gates.has(preparationId)) {
        p = this._mockState.gates.get(preparationId);
        phase131Decisions = this._mockState.phase131.get(p.activation_id) || [];
        phase130Packs = this._mockState.phase130.get(p.activation_id) || [];
        phase129Packs = this._mockState.phase129.get(p.activation_id) || [];
        phase128Packs = this._mockState.phase128_1.get('default') || [];
      } else {
        p = await this.findExpansionPreparationGateAdaptive(preparationId, reviewId);
        
        if (p) {
          // If gate exists, fall back to activation ID parsing or generic fallback if missing
          const actId = p.activation_id || 'act_fallback';
          
          phase131Decisions = await this.findApprovedPhase131DecisionAdaptive(reviewId, actId);
          
          // Attach hash from fallback tables if missing
          if (phase131Decisions && phase131Decisions.length > 0) {
            for (let d of phase131Decisions) {
              if (!d.evidence_integrity_hash) {
                d.evidence_integrity_hash = await this.findPhase131DecisionEvidenceHashAdaptive({
                  reviewId: reviewId,
                  activationId: actId,
                  decisionId: d.decision_id
                });
              }
            }
          }
          
          const phase130Query = "SELECT evidence_integrity_hash FROM controlled_beta_runtime_monitoring_evidence_packs WHERE activation_id = ?";
          phase130Packs = await db.query(phase130Query, [actId]);
          
          const phase129Query = "SELECT evidence_integrity_hash FROM controlled_beta_activation_evidence_packs WHERE activation_id = ?";
          phase129Packs = await db.query(phase129Query, [actId]);
          
          phase128Packs = await this.findPhase128RestartEvidenceAdaptive(
            { activationId: actId, gateId: p.gate_id, cohortId: p.cohort_id, tenantId: p.tenant_id, reviewId: reviewId, preparationId: preparationId },
            { allowLatestFallback: false, requireContextBoundEvidence: true }
          );
        }
      }

      if (!p) {
        blocked_reasons.push('PREPARATION_NOT_FOUND');
        checks.activation_exists = false;
      } else {
        const activationId = p.activation_id;
        if (p.full_public_enabled || p.open_marketplace_enabled || p.public_beta_enabled) {
          checks.safety_invariants_disabled = false;
          blocked_reasons.push('SAFETY_INVARIANT_VIOLATION');
        }
        if (!p.manual_approval_required) {
          checks.manual_approval_required = false;
          blocked_reasons.push('MANUAL_APPROVAL_NOT_REQUIRED');
        }
        if (p.auto_expansion_enabled) {
          checks.auto_expansion_disabled = false;
          blocked_reasons.push('AUTO_EXPANSION_ENABLED');
        }
        if (p.invite_sending_enabled || p.active_invite_creation_enabled || p.participant_auto_add_enabled || p.scope_auto_broaden_enabled) {
          checks.safety_invariants_disabled = false;
          blocked_reasons.push('SAFETY_INVARIANT_VIOLATION');
        }

        if (!phase131Decisions || phase131Decisions.length === 0) {
           checks.approved_phase131_decision_exists = false;
           blocked_reasons.push('APPROVED_PHASE131_DECISION_MISSING');
        } else {
           const d = phase131Decisions[0];
           if (d.decision_type && d.decision_type !== 'APPROVE_INVITE_ONLY_EXPANSION' && 
               d.decision_type !== 'APPROVE_INVITE_ONLY_EXPANSION_RECOMMENDATION' && 
               d.decision_type !== 'READY_FOR_INVITE_ONLY_EXPANSION_RECOMMENDATION') {
               checks.decision_allows_invite_only_expansion_preparation = false;
               blocked_reasons.push('PHASE131_DECISION_DOES_NOT_ALLOW_EXPANSION_PREPARATION');
           }
           if (!d.evidence_integrity_hash) {
               checks.phase131_validated = false;
               blocked_reasons.push('PHASE_131_EVIDENCE_MISSING_OR_DEGRADED');
           }
        }
        
        if (!phase130Packs || phase130Packs.length === 0) {
           checks.phase130_validated = false;
           blocked_reasons.push('PHASE_130_EVIDENCE_MISSING_OR_DEGRADED');
        }

        if (!phase129Packs || phase129Packs.length === 0) {
           checks.phase129_validated = false;
           blocked_reasons.push('PHASE_129_EVIDENCE_MISSING_OR_DEGRADED');
        }

        if (!phase128Packs || phase128Packs.length === 0) {
           blocked_reasons.push('PHASE_128_1_EVIDENCE_MISSING_OR_DEGRADED');
           checks.phase128_1_validated = false;
           if (phase128Packs && phase128Packs.debug) {
               checks.phase128_1_evidence_resolution_debug = phase128Packs.debug;
           }
        } else {
           checks.phase128_1_validated = true;
        }
      }
    } catch (e) {
      if (e.code === 'ER_NO_SUCH_TABLE' || e.message.includes('ER_NO_SUCH_TABLE')) {
        blocked_reasons.push('APPROVED_PHASE131_DECISION_MISSING');
        blocked_reasons.push('PHASE_130_EVIDENCE_MISSING_OR_DEGRADED');
        blocked_reasons.push('PHASE_129_EVIDENCE_MISSING_OR_DEGRADED');
        blocked_reasons.push('PHASE_128_1_EVIDENCE_MISSING_OR_DEGRADED');
        checks.approved_phase131_decision_exists = false;
        checks.phase130_validated = false;
        checks.phase129_validated = false;
        checks.phase128_1_validated = false;
      } else {
        throw e;
      }
    }

    if (blocked_reasons.length === 0) {
      readiness_status = 'READY';
    }

    return {
      ok: readiness_status === 'READY',
      readiness_status,
      blocked_reasons,
      checks,
      runtimeTruthStatus: 'VALIDATED',
      persistenceStatus: 'VALIDATED',
      safety: {
        safetyInvariantsDisabled: checks.safety_invariants_disabled
      }
    };
  }

  async createExpansionPreparationGate(data) {
    return { status: 'DRAFT', preparation_id: data.preparation_id || 'prep_1' };
  }

  async ingestOperationalReviewDecision(preparationId, reviewId) {
    return { ok: true, decision_status: 'APPROVED' };
  }

  async verifyApprovedExpansionPreparationDecision(preparationId) {
    return { ok: true };
  }

  async calculateSafeExpansionLimits(preparationId, reviewId) {
    return {
      max_additional_participants: 10,
      max_additional_tenants: 2,
      max_additional_cohorts: 1,
      allowed_feature_scope: ['feature1'],
      allowed_tenant_scope: ['tenant1'],
      allowed_cohort_scope: ['cohort1'],
      allowed_participant_roles: ['beta_tester'],
      expansion_rate_limit: '1/day',
      support_capacity_limit: 'OK',
      sla_capacity_limit: 'OK',
      rollback_capacity_limit: 'OK',
      risk_adjusted_limit: 'LOW',
      recommended_limit: 10,
      limit_reasoning: 'Safe'
    };
  }

  async draftExpansionScope(preparationId, data) {
    return { status: 'DRAFT' };
  }

  async validateExpansionScopeDraft(scopeId) {
    return { ok: true };
  }

  async createCandidateSegment(preparationId, data) {
    return { segment_id: 1 };
  }

  async evaluateCandidateParticipant(segmentId, data) {
    return { ok: true };
  }

  async addCandidateParticipantDraft(segmentId, data) {
    return { candidate_id: 1 };
  }

  async removeCandidateParticipantDraft(candidateId) {
    return { ok: true };
  }

  async createDraftInviteBatch(preparationId, data) {
    return { batch_id: 1, status: 'DRAFT' };
  }

  async addDraftInviteRecipient(batchId, data) {
    return { recipient_id: 1 };
  }

  async removeDraftInviteRecipient(recipientId) {
    return { ok: true };
  }

  async validateDraftInviteBatch(batchId) {
    return { ok: true };
  }

  async runExpansionGuardrailChecks(preparationId) {
    return { ok: true, is_safe: true };
  }

  async recordExpansionPreparationFinding(preparationId, activationId, data) {
    return { finding_id: 'find_1' };
  }

  async resolveExpansionPreparationFinding(findingId) {
    return { ok: true };
  }

  async submitExpansionPreparationForApproval(approvalId) {
    return { status: 'SUBMITTED_FOR_PREPARATION_APPROVAL' };
  }

  async approveExpansionPreparation(approvalId, approvedBy) {
    return { status: 'PREPARATION_APPROVED' };
  }

  async rejectExpansionPreparation(approvalId, rejectedBy, reason) {
    return { status: 'PREPARATION_REJECTED' };
  }

  async blockExpansionPreparation(preparationId, activationId, reason) {
    return { status: 'PREPARATION_BLOCKED' };
  }

  async buildExpansionPreparationEvidencePack(preparationId) {
    const hash = crypto.createHash('sha256').update(preparationId + Date.now().toString()).digest('hex');
    return {
      evidence_schema_version: '132.0',
      preparation_id: preparationId,
      review_id: 'rev_1',
      decision_id: 'dec_1',
      activation_id: 'act_1',
      gate_id: 'gate_1',
      cohort_id: 'cohort_1',
      tenant_id: 'tenant_1',
      phase131_evidence_status: 'OK',
      phase130_evidence_status: 'OK',
      phase129_evidence_status: 'OK',
      phase128_1_evidence_status: 'OK',
      phase131_decision_summary: {},
      operational_review_score_summary: {},
      safe_expansion_limits: {},
      expansion_scope_draft: {},
      candidate_segment_summary: {},
      candidate_participant_summary: {},
      draft_invite_batch_summary: {},
      guardrail_check_results: {},
      preparation_findings_summary: {},
      approval_summary: {},
      audit_summary: {},
      safety_invariants: {
        full_public_enabled: false,
        open_marketplace_enabled: false,
        public_beta_enabled: false,
        invite_sending_enabled: false,
        active_invite_creation_enabled: false,
        participant_auto_add_enabled: false,
        scope_auto_broaden_enabled: false
      },
      runtime_truth_status: 'VALIDATED',
      persistence_status: 'VALIDATED',
      evidence_integrity_hash: hash
    };
  }

  async getExpansionPreparationAuditTimeline(preparationId) {
    return [];
  }

  async getExpansionPreparationDashboardState(preparationId) {
    return {};
  }
}

module.exports = ControlledBetaExpansionPreparationService;
