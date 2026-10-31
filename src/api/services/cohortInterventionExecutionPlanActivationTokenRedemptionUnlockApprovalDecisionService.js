'use strict';

const crypto = require('crypto');
const builder = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockApprovalBuilderService').serviceInstance;
const auditService = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockApprovalAuditService').serviceInstance;
const evidenceService = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockApprovalEvidencePackService').serviceInstance;
const guardrailService = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockApprovalGuardrailService').serviceInstance;

class CohortInterventionExecutionPlanActivationTokenRedemptionUnlockApprovalDecisionService {
  async recordDecision(unlockApprovalId, decision, rationale, actorId) {
    const record = await builder.getTokenRedemptionUnlockApproval(unlockApprovalId);
    if (!record) throw new Error('UNLOCK_APPROVAL_RECORD_NOT_FOUND');

    if (record.unlock_approval_status === 'FINALIZED') {
      throw new Error('UNLOCK_APPROVAL_IMMUTABLE: Record is finalized and cannot be modified.');
    }

    if (record.unlock_approval_status !== 'EVALUATED') {
      throw new Error('UNLOCK_APPROVAL_NOT_EVALUATED: Evaluation is required before recording decision.');
    }

    if (!['APPROVE', 'DENY', 'BLOCK', 'ESCALATE'].includes(decision)) {
      throw new Error('INVALID_DECISION: Supported decisions are APPROVE, DENY, BLOCK, ESCALATE.');
    }

    const decisionResult = decision === 'APPROVE' ? 'UNLOCK_APPROVAL_PASSED_NOT_UNLOCKED' : 'UNLOCK_APPROVAL_FAILED';
    const decisionStatus = decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';

    const fields = {
      unlock_approval_status: decisionStatus,
      unlock_approval_result: decisionResult,
      approval_rationale_json: { rationale, decision, timestamp: new Date() }
    };

    if (decision === 'APPROVE') {
      fields.approved_by = actorId;
      fields.approved_at = new Date();
    } else {
      fields.rejected_by = actorId;
      fields.rejected_at = new Date();
    }

    const updated = await builder._internalUpdateUnlockApproval(unlockApprovalId, fields);
    await auditService.logAction(unlockApprovalId, 'UNLOCK_APPROVAL_DECISION_RECORDED', actorId, { decision, rationale });
    return updated;
  }

  async finalizeUnlockApproval(unlockApprovalId, actorId) {
    const record = await builder.getTokenRedemptionUnlockApproval(unlockApprovalId);
    if (!record) throw new Error('UNLOCK_APPROVAL_RECORD_NOT_FOUND');

    if (record.unlock_approval_status === 'FINALIZED') {
      throw new Error('UNLOCK_APPROVAL_IMMUTABLE: Record is already finalized.');
    }

    if (record.unlock_approval_status !== 'APPROVED' && record.unlock_approval_status !== 'REJECTED') {
      throw new Error('UNLOCK_APPROVAL_NOT_DECIDED: A decision must be recorded before finalization.');
    }

    // Run Guardrail Verification
    const safetyRes = await guardrailService.verifySourceSafety();
    if (!safetyRes.passed) {
      throw new Error('GUARDRAILS_FAILED: Source safety checks did not pass.');
    }

    const finalHash = crypto.createHash('sha256').update(JSON.stringify(record) + actorId).digest('hex');

    const updateFields = {
      unlock_approval_status: 'FINALIZED',
      unlock_approval_hash: finalHash,
      finalized_by: actorId,
      finalized_at: new Date()
    };

    // Update first so evidencePack reads the correct state
    let updated = await builder._internalUpdateUnlockApproval(unlockApprovalId, updateFields);

    // Build evidence pack
    const evidencePack = await evidenceService.generateEvidencePack(updated, actorId);

    // Save evidence pack hashes
    updated = await builder._internalUpdateUnlockApproval(unlockApprovalId, {
      unlock_approval_evidence_pack_hash: evidencePack.evidence_pack_hash,
      evidence_pack_hash: evidencePack.evidence_pack_hash,
      lineage_hash_chain_json: evidencePack.lineageHashChain
    });

    await auditService.logAction(unlockApprovalId, 'UNLOCK_APPROVAL_FINALIZED', actorId, { evidencePackHash: evidencePack.evidence_pack_hash });
    return updated;
  }
}

module.exports = {
  serviceInstance: new CohortInterventionExecutionPlanActivationTokenRedemptionUnlockApprovalDecisionService()
};
