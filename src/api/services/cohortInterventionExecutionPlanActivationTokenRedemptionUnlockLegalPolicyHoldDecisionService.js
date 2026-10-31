'use strict';

const db = require('./mysqlClient');
const builder = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockLegalPolicyHoldBuilderService').serviceInstance;
const auditService = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockLegalPolicyHoldAuditService').serviceInstance;
const evidencePackService = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockLegalPolicyHoldEvidencePackService').serviceInstance;

const isProdLike = process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL;

class CohortInterventionExecutionPlanActivationTokenRedemptionUnlockLegalPolicyHoldDecisionService {
  async recordLegalPolicyOfficer(unlockLegalPolicyHoldId, officerId, role, reason, actorId) {
    const record = await builder.getTokenRedemptionUnlockLegalPolicyHold(unlockLegalPolicyHoldId);
    if (!record) {
      throw new Error(`Legal/policy hold record ${unlockLegalPolicyHoldId} not found.`);
    }

    if (record.unlock_legal_policy_hold_status === 'FINALIZED') {
      throw new Error(`Record is finalized.`);
    }

    // Role checks
    const allowedRoles = ['legal_officer', 'policy_officer', 'compliance_legal_officer', 'governance_legal_officer', 'general_counsel'];
    if (!allowedRoles.includes(role)) {
      throw new Error('LEGAL_POLICY_OFFICER_ROLE_INVALID');
    }

    // Separation of Duties
    if (officerId === record.primary_authorizer_id ||
        officerId === record.secondary_authorizer_id ||
        officerId === record.final_human_authorizer_id ||
        officerId === record.compliance_witness_id ||
        officerId === record.risk_officer_id) {
      throw new Error('LEGAL_POLICY_OFFICER_DUPLICATES_PRIOR_AUTHORIZER_FORBIDDEN');
    }

    const separationSnapshot = {
      primary_authorizer_id: record.primary_authorizer_id,
      secondary_authorizer_id: record.secondary_authorizer_id,
      final_human_authorizer_id: record.final_human_authorizer_id,
      compliance_witness_id: record.compliance_witness_id,
      risk_officer_id: record.risk_officer_id,
      legal_policy_officer_id: officerId,
      timestamp: new Date()
    };

    const updated = await builder._internalUpdateUnlockLegalPolicyHold(unlockLegalPolicyHoldId, {
      legal_policy_officer_id: officerId,
      legal_policy_officer_role: role,
      legal_policy_confirmed_at: new Date(),
      legal_policy_hold_confirmation_reason: reason,
      legal_policy_hold_registry_snapshot_json: { status: 'CLEARED', timestamp: new Date() },
      legal_policy_hold_attestation_json: { attested: true, officerId, role, timestamp: new Date() },
      prior_authorizer_separation_snapshot_json: separationSnapshot
    });

    await auditService.logAction(unlockLegalPolicyHoldId, 'LEGAL_POLICY_OFFICER_RECORDED', actorId, { officerId, role });
    return updated;
  }

  async recordDecision(unlockLegalPolicyHoldId, decision, rationale, actorId) {
    const record = await builder.getTokenRedemptionUnlockLegalPolicyHold(unlockLegalPolicyHoldId);
    if (!record) {
      throw new Error(`Legal/policy hold record ${unlockLegalPolicyHoldId} not found.`);
    }

    if (record.unlock_legal_policy_hold_status === 'FINALIZED') {
      throw new Error(`Record is finalized.`);
    }

    if (record.unlock_legal_policy_hold_status !== 'EVALUATED') {
      throw new Error(`Evaluation is required before recording decision.`);
    }

    const allowedDecisions = ['APPROVE_LEGAL_POLICY_HOLD', 'REJECT_LEGAL_POLICY_HOLD', 'BLOCK', 'ESCALATE'];
    if (!allowedDecisions.includes(decision)) {
      throw new Error(`INVALID_DECISION: Supported decisions are APPROVE_LEGAL_POLICY_HOLD, REJECT_LEGAL_POLICY_HOLD, BLOCK, ESCALATE.`);
    }

    if (!record.legal_policy_officer_id) {
      throw new Error('LEGAL_POLICY_OFFICER_MISSING');
    }

    const rules = record.unlock_legal_policy_hold_rules_json || [];
    const hasCritical = rules.some(r => r.severity === 'CRITICAL');
    if (hasCritical && decision === 'APPROVE_LEGAL_POLICY_HOLD') {
      throw new Error('Cannot approve when CRITICAL violations exist.');
    }

    const status = decision === 'APPROVE_LEGAL_POLICY_HOLD' ? 'APPROVED' : 'REJECTED';
    const result = decision === 'APPROVE_LEGAL_POLICY_HOLD' ? 'LEGAL_POLICY_HOLD_CLEARED_NOT_UNLOCKED' : 'LEGAL_POLICY_HOLD_CONFIRMATION_FAILED';

    const updated = await builder._internalUpdateUnlockLegalPolicyHold(unlockLegalPolicyHoldId, {
      unlock_legal_policy_hold_status: status,
      unlock_legal_policy_hold_result: result,
      attestation_rationale_json: { rationale, decision, timestamp: new Date() },
      approved_by: status === 'APPROVED' ? actorId : null,
      approved_at: status === 'APPROVED' ? new Date() : null,
      rejected_by: status === 'REJECTED' ? actorId : null,
      rejected_at: status === 'REJECTED' ? new Date() : null
    });

    await auditService.logAction(unlockLegalPolicyHoldId, 'UNLOCK_LEGAL_POLICY_HOLD_DECISION_RECORDED', actorId, { decision, rationale });
    return updated;
  }

  async finalizeUnlockLegalPolicyHold(unlockLegalPolicyHoldId, actorId) {
    const record = await builder.getTokenRedemptionUnlockLegalPolicyHold(unlockLegalPolicyHoldId);
    if (!record) {
      throw new Error(`Legal/policy hold record ${unlockLegalPolicyHoldId} not found.`);
    }

    if (record.unlock_legal_policy_hold_status === 'FINALIZED') {
      return record;
    }

    if (record.unlock_legal_policy_hold_status !== 'APPROVED') {
      throw new Error(`Legal/policy hold record must be APPROVED before finalization.`);
    }

    const { evidencePack, evidencePackHash, lineageHashChain } = await evidencePackService.generateEvidencePack(unlockLegalPolicyHoldId, actorId);

    const finalized = await builder._internalUpdateUnlockLegalPolicyHold(unlockLegalPolicyHoldId, {
      unlock_legal_policy_hold_status: 'FINALIZED',
      unlock_legal_policy_hold_evidence_pack_hash: evidencePackHash,
      evidence_pack_hash: evidencePackHash,
      lineage_hash_chain_json: lineageHashChain,
      activation_execution_status: 'UNLOCK_LEGAL_POLICY_HOLD_FINALIZED_NOT_UNLOCKED_NOT_REDEEMED_NOT_EXECUTED',
      finalized_by: actorId,
      finalized_at: new Date()
    });

    await auditService.logAction(unlockLegalPolicyHoldId, 'UNLOCK_LEGAL_POLICY_HOLD_FINALIZED', actorId, { evidencePackHash });
    return finalized;
  }
}

module.exports = {
  serviceInstance: new CohortInterventionExecutionPlanActivationTokenRedemptionUnlockLegalPolicyHoldDecisionService()
};
