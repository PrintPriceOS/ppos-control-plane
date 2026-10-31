'use strict';

const crypto = require('crypto');
const builder = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalReviewBuilderService').serviceInstance;
const auditService = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalReviewAuditService').serviceInstance;
const evidenceService = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalReviewEvidencePackService').serviceInstance;
const guardrailService = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalReviewGuardrailService').serviceInstance;

class CohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalReviewDecisionService {
  async recordDecision(unlockFinalReviewId, decision, rationale, actorId) {
    const record = await builder.getTokenRedemptionUnlockFinalReview(unlockFinalReviewId);
    if (!record) throw new Error('UNLOCK_FINAL_REVIEW_RECORD_NOT_FOUND');

    if (record.unlock_final_review_status === 'FINALIZED') {
      throw new Error('UNLOCK_FINAL_REVIEW_IMMUTABLE: Record is finalized and cannot be modified.');
    }

    if (record.unlock_final_review_status !== 'EVALUATED') {
      throw new Error('UNLOCK_FINAL_REVIEW_NOT_EVALUATED: Evaluation is required before recording decision.');
    }

    if (!['APPROVE_FINAL_REVIEW', 'REJECT_FINAL_REVIEW', 'BLOCK', 'ESCALATE'].includes(decision)) {
      throw new Error('INVALID_DECISION: Supported decisions are APPROVE_FINAL_REVIEW, REJECT_FINAL_REVIEW, BLOCK, ESCALATE.');
    }

    const decisionResult = decision === 'APPROVE_FINAL_REVIEW' ? 'FINAL_REVIEW_PASSED_NOT_UNLOCKED' : 'FINAL_REVIEW_FAILED';
    const decisionStatus = decision === 'APPROVE_FINAL_REVIEW' ? 'APPROVED' : 'REJECTED';

    const fields = {
      unlock_final_review_status: decisionStatus,
      unlock_final_review_result: decisionResult,
      final_review_rationale_json: { rationale, decision, timestamp: new Date() }
    };

    if (decision === 'APPROVE_FINAL_REVIEW') {
      fields.approved_by = actorId;
      fields.approved_at = new Date();
    } else {
      fields.rejected_by = actorId;
      fields.rejected_at = new Date();
    }

    const updated = await builder._internalUpdateUnlockFinalReview(unlockFinalReviewId, fields);
    await auditService.logAction(unlockFinalReviewId, 'UNLOCK_FINAL_REVIEW_DECISION_RECORDED', actorId, { decision, rationale });
    return updated;
  }

  async finalizeUnlockFinalReview(unlockFinalReviewId, actorId) {
    const record = await builder.getTokenRedemptionUnlockFinalReview(unlockFinalReviewId);
    if (!record) throw new Error('UNLOCK_FINAL_REVIEW_RECORD_NOT_FOUND');

    if (record.unlock_final_review_status === 'FINALIZED') {
      throw new Error('UNLOCK_FINAL_REVIEW_IMMUTABLE: Record is already finalized.');
    }

    if (record.unlock_final_review_status !== 'APPROVED' && record.unlock_final_review_status !== 'REJECTED') {
      throw new Error('UNLOCK_FINAL_REVIEW_NOT_DECIDED: A decision must be recorded before finalization.');
    }

    // Run Guardrail Verification
    const safetyRes = await guardrailService.verifySourceSafety();
    if (!safetyRes.passed) {
      throw new Error('GUARDRAILS_FAILED: Source safety checks did not pass.');
    }

    const finalHash = crypto.createHash('sha256').update(JSON.stringify(record) + actorId).digest('hex');

    const updateFields = {
      unlock_final_review_status: 'FINALIZED',
      unlock_final_review_hash: finalHash,
      finalized_by: actorId,
      finalized_at: new Date()
    };

    // Update first so evidencePack reads the correct state
    let updated = await builder._internalUpdateUnlockFinalReview(unlockFinalReviewId, updateFields);

    // Build evidence pack
    const evidencePack = await evidenceService.generateEvidencePack(updated, actorId);

    // Save evidence pack hashes
    updated = await builder._internalUpdateUnlockFinalReview(unlockFinalReviewId, {
      unlock_final_review_evidence_pack_hash: evidencePack.evidence_pack_hash,
      evidence_pack_hash: evidencePack.evidence_pack_hash,
      lineage_hash_chain_json: evidencePack.lineageHashChain
    });

    await auditService.logAction(unlockFinalReviewId, 'UNLOCK_FINAL_REVIEW_FINALIZED', actorId, { evidencePackHash: evidencePack.evidence_pack_hash });
    return updated;
  }
}

module.exports = {
  serviceInstance: new CohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalReviewDecisionService()
};
