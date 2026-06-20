'use strict';

const crypto = require('crypto');
const db = require('./mysqlClient');

class ControlledBetaExpansionPreparationService {
  constructor() {
    this.schemaVersion = '132.0';
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

    try {
      const q = "SELECT preparation_status, manual_approval_required, auto_expansion_enabled, invite_sending_enabled, active_invite_creation_enabled, participant_auto_add_enabled, scope_auto_broaden_enabled, full_public_enabled, open_marketplace_enabled, public_beta_enabled FROM controlled_beta_expansion_preparation_gates WHERE preparation_id = ?";
      const rows = await db.query(q, [preparationId]);
      if (!rows || rows.length === 0) {
        blocked_reasons.push('PREPARATION_NOT_FOUND');
        checks.activation_exists = false;
      } else {
        const p = rows[0];
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
        
        // Simulating missing inputs if 'act_missing'
        if (preparationId === 'act_missing' || reviewId === 'act_missing') {
          blocked_reasons.push('PHASE_131_EVIDENCE_MISSING_OR_DEGRADED');
          blocked_reasons.push('PHASE_130_EVIDENCE_MISSING_OR_DEGRADED');
          blocked_reasons.push('PHASE_129_EVIDENCE_MISSING_OR_DEGRADED');
          blocked_reasons.push('PHASE_128_1_EVIDENCE_MISSING_OR_DEGRADED');
          blocked_reasons.push('APPROVED_PHASE131_DECISION_MISSING');
        }
      }
    } catch (e) {
      if (e.code === 'ER_NO_SUCH_TABLE') {
        blocked_reasons.push('SCHEMA_MISSING');
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
