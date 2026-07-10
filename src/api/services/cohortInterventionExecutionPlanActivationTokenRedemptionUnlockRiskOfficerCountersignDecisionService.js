'use strict';

const crypto = require('crypto');
const builder = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockRiskOfficerCountersignBuilderService').serviceInstance;
const auditService = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockRiskOfficerCountersignAuditService').serviceInstance;
const evidencePackService = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockRiskOfficerCountersignEvidencePackService').serviceInstance;

class CohortInterventionExecutionPlanActivationTokenRedemptionUnlockRiskOfficerCountersignDecisionService {
  async recordRiskOfficer(unlockRiskOfficerCountersignId, riskOfficerId, riskOfficerRole, reason, actorId) {
    const record = await builder.getTokenRedemptionUnlockRiskOfficerCountersign(unlockRiskOfficerCountersignId);
    if (!record) {
      throw new Error(`Risk officer countersign record ${unlockRiskOfficerCountersignId} not found.`);
    }

    if (record.unlock_risk_officer_countersign_status === 'FINALIZED') {
      throw new Error(`Risk officer countersign record is finalized and cannot be modified.`);
    }

    if (!riskOfficerId || !riskOfficerId.trim()) {
      throw new Error(`Risk Officer ID is required.`);
    }

    const allowedRoles = ['risk_officer', 'chief_risk_officer', 'security_risk_officer', 'governance_risk_officer'];
    if (!allowedRoles.includes(riskOfficerRole)) {
      throw new Error(`Invalid Risk Officer role: ${riskOfficerRole}. Allowed roles: ${allowedRoles.join(', ')}`);
    }

    // Separation of duties
    if (riskOfficerId === record.primary_authorizer_id) {
      throw new Error('Risk Officer cannot duplicate the primary authorizer.');
    }
    if (riskOfficerId === record.secondary_authorizer_id) {
      throw new Error('Risk Officer cannot duplicate the secondary authorizer.');
    }
    if (riskOfficerId === record.final_human_authorizer_id) {
      throw new Error('Risk Officer cannot duplicate the final human authorizer.');
    }
    if (riskOfficerId === record.compliance_witness_id) {
      throw new Error('Risk Officer cannot duplicate the compliance witness.');
    }

    const updated = await builder._internalUpdateUnlockRiskOfficerCountersign(unlockRiskOfficerCountersignId, {
      risk_officer_id: riskOfficerId,
      risk_officer_role: riskOfficerRole,
      risk_officer_countersigned_at: new Date(),
      risk_officer_countersign_reason: reason,
      risk_officer_countersign_attestation_json: { attested: true, role: riskOfficerRole, riskOfficerId },
      prior_authorizer_separation_snapshot_json: {
        primary_authorizer_id: record.primary_authorizer_id,
        secondary_authorizer_id: record.secondary_authorizer_id,
        final_human_authorizer_id: record.final_human_authorizer_id,
        compliance_witness_id: record.compliance_witness_id
      }
    });

    await auditService.logAction(unlockRiskOfficerCountersignId, 'RISK_OFFICER_RECORDED', riskOfficerId, { riskOfficerRole, reason });
    return updated;
  }

  async recordDecision(unlockRiskOfficerCountersignId, decision, rationale, actorId) {
    const record = await builder.getTokenRedemptionUnlockRiskOfficerCountersign(unlockRiskOfficerCountersignId);
    if (!record) {
      throw new Error(`Risk officer countersign record ${unlockRiskOfficerCountersignId} not found.`);
    }

    if (record.unlock_risk_officer_countersign_status === 'FINALIZED') {
      throw new Error(`Risk officer countersign record is finalized and cannot be modified.`);
    }

    if (record.unlock_risk_officer_countersign_status !== 'EVALUATED') {
      throw new Error(`Evaluation is required before recording decision.`);
    }

    if (!record.risk_officer_id) {
      throw new Error(`Risk Officer must be recorded before recording decision.`);
    }

    const allowedDecisions = ['APPROVE_RISK_COUNTERSIGN', 'REJECT_RISK_COUNTERSIGN', 'BLOCK', 'ESCALATE'];
    if (!allowedDecisions.includes(decision)) {
      throw new Error(`Invalid decision: ${decision}. Supported decisions: ${allowedDecisions.join(', ')}`);
    }

    const result = decision === 'APPROVE_RISK_COUNTERSIGN' ? 'RISK_OFFICER_COUNTERSIGNED_NOT_UNLOCKED' : 'RISK_OFFICER_COUNTERSIGN_FAILED';
    const status = decision === 'APPROVE_RISK_COUNTERSIGN' ? 'APPROVED' : 'REJECTED';

    const updated = await builder._internalUpdateUnlockRiskOfficerCountersign(unlockRiskOfficerCountersignId, {
      unlock_risk_officer_countersign_status: status,
      unlock_risk_officer_countersign_result: result,
      approved_by: decision === 'APPROVE_RISK_COUNTERSIGN' ? record.risk_officer_id : null,
      approved_at: decision === 'APPROVE_RISK_COUNTERSIGN' ? new Date() : null,
      rejected_by: decision !== 'APPROVE_RISK_COUNTERSIGN' ? record.risk_officer_id : null,
      rejected_at: decision !== 'APPROVE_RISK_COUNTERSIGN' ? new Date() : null,
      attestation_rationale_json: { decision, rationale, actorId }
    });

    await auditService.logAction(unlockRiskOfficerCountersignId, 'UNLOCK_RISK_OFFICER_COUNTERSIGN_DECISION_RECORDED', record.risk_officer_id, { decision, rationale });
    return updated;
  }

  async finalizeUnlockRiskOfficerCountersign(unlockRiskOfficerCountersignId, actorId) {
    const record = await builder.getTokenRedemptionUnlockRiskOfficerCountersign(unlockRiskOfficerCountersignId);
    if (!record) {
      throw new Error(`Risk officer countersign record ${unlockRiskOfficerCountersignId} not found.`);
    }

    if (record.unlock_risk_officer_countersign_status === 'FINALIZED') {
      return record;
    }

    if (record.unlock_risk_officer_countersign_status !== 'APPROVED') {
      throw new Error(`Risk officer countersign record must be APPROVED before finalization. Current status: ${record.unlock_risk_officer_countersign_status}`);
    }

    // Generate evidence pack and sign
    const evidence = await evidencePackService.generateEvidencePack(unlockRiskOfficerCountersignId, actorId);

    const finalized = await builder._internalUpdateUnlockRiskOfficerCountersign(unlockRiskOfficerCountersignId, {
      unlock_risk_officer_countersign_status: 'FINALIZED',
      finalized_by: actorId,
      finalized_at: new Date(),
      evidence_pack_hash: evidence.evidence_pack_hash,
      unlock_risk_officer_countersign_evidence_pack_hash: evidence.evidence_pack_hash,
      lineage_hash_chain_json: evidence.lineage_hash_chain_json,
      security_signature_json: {
        signed: true,
        signature: 'sig_roc_' + crypto.randomBytes(16).toString('hex'),
        timestamp: new Date()
      }
    });

    await auditService.logAction(unlockRiskOfficerCountersignId, 'UNLOCK_RISK_OFFICER_COUNTERSIGN_FINALIZED', actorId);
    return finalized;
  }
}

module.exports = {
  serviceInstance: new CohortInterventionExecutionPlanActivationTokenRedemptionUnlockRiskOfficerCountersignDecisionService()
};
