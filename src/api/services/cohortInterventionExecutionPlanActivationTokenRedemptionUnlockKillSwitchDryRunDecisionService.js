'use strict';

const db = require('./mysqlClient');
const crypto = require('crypto');
const builderService = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockKillSwitchDryRunBuilderService').serviceInstance;
const auditService = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockKillSwitchDryRunAuditService').serviceInstance;
const evidencePackService = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockKillSwitchDryRunEvidencePackService').serviceInstance;

const isProdLike = process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL;

class CohortInterventionExecutionPlanActivationTokenRedemptionUnlockKillSwitchDryRunDecisionService {
  async recordVerificationOfficer(unlockKillSwitchDryRunId, officerId, role, reason, actorId) {
    const record = await builderService.getTokenRedemptionUnlockKillSwitchDryRun(unlockKillSwitchDryRunId);
    if (!record) throw new Error('Record not found');

    if (record.unlock_kill_switch_dry_run_status !== 'DRAFT') {
      throw new Error('Record must be in DRAFT status to record officer');
    }

    const allowedRoles = ['rollback_officer', 'emergency_stop_authority', 'site_reliability_leader', 'chief_safety_officer', 'security_officer'];
    if (!allowedRoles.includes(role)) {
      throw new Error('KILL_SWITCH_VERIFICATION_OFFICER_ROLE_INVALID');
    }

    const priorIds = [
      record.primary_authorizer_id,
      record.secondary_authorizer_id,
      record.final_human_authorizer_id,
      record.compliance_witness_id,
      record.risk_officer_id,
      record.legal_policy_officer_id
    ];
    if (priorIds.includes(officerId)) {
      throw new Error('KILL_SWITCH_VERIFIER_DUPLICATES_PRIOR_AUTHORIZER_FORBIDDEN');
    }

    const traceId = 'tr_' + crypto.randomBytes(8).toString('hex');
    const updateFields = {
      kill_switch_verification_officer_id: officerId,
      kill_switch_verification_officer_role: role,
      kill_switch_verified_at: new Date(),
      kill_switch_dry_run_trace_id: traceId,
      prior_authorizer_separation_snapshot_json: { priorIds, reason },
      kill_switch_dry_run_response_snapshot_json: { responseCode: 200, status: 'DRY_RUN_COMPLETED' },
      kill_switch_noop_execution_snapshot_json: { dryRunOnly: true, mutated: false }
    };

    await builderService._internalUpdateTokenRedemptionUnlockKillSwitchDryRun(unlockKillSwitchDryRunId, updateFields);
    await auditService.logAction(unlockKillSwitchDryRunId, 'VERIFICATION_OFFICER_RECORDED', actorId);
  }

  async recordDecision(unlockKillSwitchDryRunId, decisionType, rationale, actorId) {
    const record = await builderService.getTokenRedemptionUnlockKillSwitchDryRun(unlockKillSwitchDryRunId);
    if (!record) throw new Error('Record not found');

    if (record.unlock_kill_switch_dry_run_status !== 'EVALUATED') {
      throw new Error('Record must be evaluated before recording decision');
    }

    if (decisionType !== 'APPROVE_KILL_SWITCH_DRY_RUN' && decisionType !== 'REJECT_KILL_SWITCH_DRY_RUN') {
      throw new Error('INVALID_DECISION');
    }

    const updateFields = {
      unlock_kill_switch_dry_run_status: decisionType === 'APPROVE_KILL_SWITCH_DRY_RUN' ? 'APPROVED' : 'REJECTED',
      unlock_kill_switch_dry_run_result: decisionType === 'APPROVE_KILL_SWITCH_DRY_RUN' ? 'KILL_SWITCH_DRY_RUN_VERIFIED_NOT_UNLOCKED' : 'KILL_SWITCH_DRY_RUN_FAILED',
      attestation_rationale_json: { rationale, decidedAt: new Date() }
    };

    await builderService._internalUpdateTokenRedemptionUnlockKillSwitchDryRun(unlockKillSwitchDryRunId, updateFields);
    await auditService.logAction(unlockKillSwitchDryRunId, 'UNLOCK_KILL_SWITCH_DRY_RUN_DECISION_RECORDED', actorId);
  }

  async finalizeUnlockKillSwitchDryRun(unlockKillSwitchDryRunId, actorId) {
    const record = await builderService.getTokenRedemptionUnlockKillSwitchDryRun(unlockKillSwitchDryRunId);
    if (!record) throw new Error('Record not found');

    if (record.unlock_kill_switch_dry_run_status !== 'APPROVED') {
      throw new Error('Record must be APPROVED to finalize');
    }

    const evidencePack = await evidencePackService.generateEvidencePack(unlockKillSwitchDryRunId, actorId);

    const updateFields = {
      unlock_kill_switch_dry_run_status: 'FINALIZED',
      unlock_kill_switch_dry_run_hash: evidencePack.evidence_pack_hash,
      unlock_kill_switch_dry_run_evidence_pack_hash: evidencePack.evidence_pack_hash,
      evidence_pack_hash: evidencePack.evidence_pack_hash,
      lineage_hash_chain_json: evidencePack.evidence_pack_json.lineageHashChain,
      activation_execution_status: 'UNLOCK_KILL_SWITCH_DRY_RUN_FINALIZED_NOT_UNLOCKED_NOT_REDEEMED_NOT_EXECUTED'
    };

    await builderService._internalUpdateTokenRedemptionUnlockKillSwitchDryRun(unlockKillSwitchDryRunId, updateFields);

    if (!isProdLike) {
      evidencePackService._mockState.evidence.set(unlockKillSwitchDryRunId, {
        evidence_id: 'ev_' + crypto.randomBytes(8).toString('hex'),
        act_token_redempt_unlock_kill_switch_dry_run_id: unlockKillSwitchDryRunId,
        evidence_pack_hash: evidencePack.evidence_pack_hash,
        evidence_pack_json: JSON.stringify(evidencePack.evidence_pack_json),
        created_by: actorId
      });
    } else {
      const evidenceId = 'ev_' + crypto.randomBytes(8).toString('hex');
      await db.query(
        `INSERT INTO cb_cohort_intervention_activation_token_redempt_unlock_ksdr_ev
         (evidence_id, act_token_redempt_unlock_kill_switch_dry_run_id, evidence_pack_hash, evidence_pack_json, created_by)
         VALUES (?, ?, ?, ?, ?)`,
        [evidenceId, unlockKillSwitchDryRunId, evidencePack.evidence_pack_hash, JSON.stringify(evidencePack.evidence_pack_json), actorId]
      );
    }

    await auditService.logAction(unlockKillSwitchDryRunId, 'UNLOCK_KILL_SWITCH_DRY_RUN_FINALIZED', actorId);
  }
}

module.exports = {
  serviceInstance: new CohortInterventionExecutionPlanActivationTokenRedemptionUnlockKillSwitchDryRunDecisionService()
};
