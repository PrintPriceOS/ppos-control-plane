'use strict';

const crypto = require('crypto');
const builder = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockOperatorAttestationBuilderService').serviceInstance;
const auditService = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockOperatorAttestationAuditService').serviceInstance;
const evidenceService = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockOperatorAttestationEvidencePackService').serviceInstance;
const guardrailService = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockOperatorAttestationGuardrailService').serviceInstance;

class CohortInterventionExecutionPlanActivationTokenRedemptionUnlockOperatorAttestationDecisionService {
  async recordDecision(unlockOperatorAttestationId, decision, rationale, actorId) {
    const record = await builder.getTokenRedemptionUnlockOperatorAttestation(unlockOperatorAttestationId);
    if (!record) throw new Error('UNLOCK_OPERATOR_ATTESTATION_RECORD_NOT_FOUND');

    if (record.unlock_operator_attestation_status === 'FINALIZED') {
      throw new Error('UNLOCK_OPERATOR_ATTESTATION_IMMUTABLE: Record is finalized and cannot be modified.');
    }

    if (record.unlock_operator_attestation_status !== 'EVALUATED') {
      throw new Error('UNLOCK_OPERATOR_ATTESTATION_NOT_EVALUATED: Evaluation is required before recording decision.');
    }

    if (!['APPROVE_ATTESTATION', 'REJECT_ATTESTATION', 'BLOCK', 'ESCALATE'].includes(decision)) {
      throw new Error('INVALID_DECISION: Supported decisions are APPROVE_ATTESTATION, REJECT_ATTESTATION, BLOCK, ESCALATE.');
    }

    const decisionResult = decision === 'APPROVE_ATTESTATION' ? 'OPERATOR_ATTESTED_NOT_UNLOCKED' : 'OPERATOR_ATTESTATION_FAILED';
    const decisionStatus = decision === 'APPROVE_ATTESTATION' ? 'APPROVED' : 'REJECTED';

    const fields = {
      unlock_operator_attestation_status: decisionStatus,
      unlock_operator_attestation_result: decisionResult,
      attestation_rationale_json: { rationale, decision, timestamp: new Date() }
    };

    if (decision === 'APPROVE_ATTESTATION') {
      fields.approved_by = actorId;
      fields.approved_at = new Date();
    } else {
      fields.rejected_by = actorId;
      fields.rejected_at = new Date();
    }

    const updated = await builder._internalUpdateUnlockOperatorAttestation(unlockOperatorAttestationId, fields);
    await auditService.logAction(unlockOperatorAttestationId, 'UNLOCK_OPERATOR_ATTESTATION_DECISION_RECORDED', actorId, { decision, rationale });
    return updated;
  }

  async finalizeUnlockOperatorAttestation(unlockOperatorAttestationId, actorId) {
    const record = await builder.getTokenRedemptionUnlockOperatorAttestation(unlockOperatorAttestationId);
    if (!record) throw new Error('UNLOCK_OPERATOR_ATTESTATION_RECORD_NOT_FOUND');

    if (record.unlock_operator_attestation_status === 'FINALIZED') {
      throw new Error('UNLOCK_OPERATOR_ATTESTATION_IMMUTABLE: Record is already finalized.');
    }

    if (record.unlock_operator_attestation_status !== 'APPROVED' && record.unlock_operator_attestation_status !== 'REJECTED') {
      throw new Error('UNLOCK_OPERATOR_ATTESTATION_NOT_DECIDED: A decision must be recorded before finalization.');
    }

    // Run Guardrail Verification
    const safetyRes = await guardrailService.verifySourceSafety();
    if (!safetyRes.passed) {
      throw new Error('GUARDRAILS_FAILED: Source safety checks did not pass.');
    }

    const finalHash = crypto.createHash('sha256').update(JSON.stringify(record) + actorId).digest('hex');

    const updateFields = {
      unlock_operator_attestation_status: 'FINALIZED',
      unlock_operator_attestation_hash: finalHash,
      finalized_by: actorId,
      finalized_at: new Date(),
      activation_execution_status: 'UNLOCK_OPERATOR_ATTESTATION_FINALIZED_NOT_UNLOCKED_NOT_REDEEMED_NOT_EXECUTED'
    };

    // Update first so evidencePack reads the correct state
    let updated = await builder._internalUpdateUnlockOperatorAttestation(unlockOperatorAttestationId, updateFields);

    // Build evidence pack
    const evidencePack = await evidenceService.generateEvidencePack(updated, actorId);

    // Save evidence pack hashes
    updated = await builder._internalUpdateUnlockOperatorAttestation(unlockOperatorAttestationId, {
      unlock_operator_attestation_evidence_pack_hash: evidencePack.evidence_pack_hash,
      evidence_pack_hash: evidencePack.evidence_pack_hash,
      lineage_hash_chain_json: evidencePack.lineageHashChain
    });

    await auditService.logAction(unlockOperatorAttestationId, 'UNLOCK_OPERATOR_ATTESTATION_FINALIZED', actorId, { evidencePackHash: evidencePack.evidence_pack_hash });
    return updated;
  }
}

module.exports = {
  serviceInstance: new CohortInterventionExecutionPlanActivationTokenRedemptionUnlockOperatorAttestationDecisionService()
};
