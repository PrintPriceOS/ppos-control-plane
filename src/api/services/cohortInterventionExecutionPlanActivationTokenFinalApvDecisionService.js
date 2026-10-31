'use strict';

const db = require('./mysqlClient');
const builder = require('./cohortInterventionExecutionPlanActivationTokenFinalApvBuilderService').serviceInstance;
const auditSvc = require('./cohortInterventionExecutionPlanActivationTokenFinalApvAuditService').serviceInstance;
const evidenceSvc = require('./cohortInterventionExecutionPlanActivationTokenFinalApvEvidencePackService').serviceInstance;

class CohortInterventionExecutionPlanActivationTokenFinalApvDecisionService {
  async recordDecision(activationTokenFinalApvId, result, rationale, actorId = 'system') {
    const record = await builder.getTokenFinalApv(activationTokenFinalApvId);
    if (!record) throw new Error('TOKEN_FINAL_APV_RECORD_NOT_FOUND');

    if (record.activation_token_final_apv_status === 'FINALIZED') {
      throw new Error('TOKEN_FINAL_APV_RECORD_ALREADY_FINALIZED');
    }

    const allowedResults = [
      'FINAL_APPROVED_NOT_ISSUED',
      'FINAL_APPROVAL_REJECTED_NOT_ISSUED',
      'FINAL_APPROVAL_BLOCKED_BY_PARENT_ENV',
      'FINAL_APPROVAL_BLOCKED_BY_GUARDRAIL',
      'FINAL_APPROVAL_BLOCKED_BY_HASH_MISMATCH',
      'FINAL_APPROVAL_BLOCKED_BY_WRITE_SCOPE',
      'FINAL_APPROVAL_BLOCKED_BY_REDEEMABLE_TOKEN',
      'REQUIRE_ENV_REVALIDATION',
      'ESCALATE_TO_BOARD_OF_DIRECTORS'
    ];

    if (!allowedResults.includes(result)) {
      throw new Error('INVALID_TOKEN_FINAL_APV_RESULT');
    }

    if (!rationale || rationale.trim().length < 5) {
      throw new Error('DECISION_RATIONALE_REQUIRED');
    }

    const updates = {
      activation_token_final_apv_result: result,
      activation_token_final_apv_status: 'READY_FOR_DECISION',
      final_approval_rationale_json: { rationale, logged_by: actorId, logged_at: new Date() }
    };

    if (result === 'FINAL_APPROVED_NOT_ISSUED') {
      updates.approved_by = actorId;
      updates.approved_at = new Date();
    } else {
      updates.rejected_by = actorId;
      updates.rejected_at = new Date();
    }

    const updated = await builder.updateTokenFinalApv(activationTokenFinalApvId, updates);
    await auditSvc.createAuditLog(activationTokenFinalApvId, 'TOKEN_FINAL_APV_RESULT_RECORDED', actorId, { result, rationale });
    return { tokenFinalApv: updated };
  }

  async finalizeTokenFinalApv(activationTokenFinalApvId, actorId = 'system') {
    const record = await builder.getTokenFinalApv(activationTokenFinalApvId);
    if (!record) throw new Error('TOKEN_FINAL_APV_RECORD_NOT_FOUND');

    if (record.activation_token_final_apv_status === 'FINALIZED') {
      throw new Error('TOKEN_FINAL_APV_RECORD_ALREADY_FINALIZED');
    }

    if (record.activation_token_final_apv_status === 'DRAFT') {
      throw new Error('TOKEN_FINAL_APV_EVALUATION_NOT_COMPLETED');
    }

    if (!record.activation_token_final_apv_result) {
      throw new Error('TOKEN_FINAL_APV_RESULT_REQUIRED');
    }

    let evidence = await evidenceSvc.getEvidence(activationTokenFinalApvId);
    if (!evidence) {
      await evidenceSvc.buildEvidencePack(activationTokenFinalApvId, actorId);
      evidence = await evidenceSvc.getEvidence(activationTokenFinalApvId);
    }

    const updated = await builder.updateTokenFinalApv(activationTokenFinalApvId, {
      activation_token_final_apv_status: 'FINALIZED',
      finalized_by: actorId,
      finalized_at: new Date()
    });

    await auditSvc.createAuditLog(activationTokenFinalApvId, 'TOKEN_FINAL_APV_RECORD_FINALIZED', actorId, { evidence_pack_hash: evidence.evidence_pack_hash });
    return { tokenFinalApv: updated };
  }
}

const serviceInstance = new CohortInterventionExecutionPlanActivationTokenFinalApvDecisionService();
module.exports = {
  CohortInterventionExecutionPlanActivationTokenFinalApvDecisionService,
  serviceInstance
};
