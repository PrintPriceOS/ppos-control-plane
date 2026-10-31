'use strict';

const db = require('./mysqlClient');
const prepBuilderSvc = require('./cohortInterventionSimulationApprovalPreparationBuilderService').serviceInstance || require('./cohortInterventionSimulationApprovalPreparationBuilderService');
const reviewBuilderSvc = require('./cohortInterventionSimulationReviewBuilderService').serviceInstance || require('./cohortInterventionSimulationReviewBuilderService');
const evaluatorSvc = require('./cohortInterventionSimulationApprovalPreparationEvaluatorService').serviceInstance || require('./cohortInterventionSimulationApprovalPreparationEvaluatorService');
const guardrailSvc = require('./cohortInterventionSimulationApprovalPreparationGuardrailService').serviceInstance || require('./cohortInterventionSimulationApprovalPreparationGuardrailService');
const auditService = require('./cohortInterventionSimulationApprovalPreparationAuditService').serviceInstance || require('./cohortInterventionSimulationApprovalPreparationAuditService');

class CohortInterventionSimulationApprovalPreparationDecisionService {
  constructor() {
    this._mockState = {};
  }

  async finalizePrep(prepId, actorId = 'system') {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    // 1. Load prep package
    const prep = await prepBuilderSvc.getPrep(prepId);
    if (!prep) throw new Error('PREP_NOT_FOUND');

    if (prep.prep_status === 'FINALIZED' || prep.prep_status === 'SUPERSEDED') {
      throw new Error(`PREP_ALREADY_FINALIZED: Status is ${prep.prep_status}`);
    }

    // 2. Validate source Phase 142 review finalized & decision present
    const review = await reviewBuilderSvc.getReview(prep.source_review_id);
    if (!review) throw new Error('PHASE142_REVIEW_NOT_FOUND');
    if (review.review_status !== 'FINALIZED') {
      throw new Error('PHASE142_REVIEW_NOT_FINALIZED');
    }
    if (!review.review_decision) {
      throw new Error('PHASE142_REVIEW_DECISION_MISSING');
    }

    // 3. Validate evaluation completed
    if (prep.prep_status !== 'EVALUATED') {
      throw new Error('EVALUATION_NOT_COMPLETED');
    }

    // 4. Validate prep outcome present
    if (!prep.prep_outcome) {
      throw new Error('PREPARATION_OUTCOME_MISSING');
    }

    // 5. Validate findings present
    const findings = await evaluatorSvc.getFindings(prepId);
    if (!findings) {
      throw new Error('FINDINGS_MISSING');
    }

    // 6. Validate evidence pack hash present
    if (!prep.evidence_pack_hash) {
      throw new Error('EVIDENCE_PACK_HASH_MISSING');
    }

    // 7. Validate write-scope attestation clean
    const writeScope = typeof prep.write_scope_attestation_json === 'string'
      ? JSON.parse(prep.write_scope_attestation_json)
      : prep.write_scope_attestation_json;
    if (writeScope.writes_only_phase143_tables !== true || writeScope.wrote_phase128_to_142_operational_tables !== false) {
      throw new Error('WRITE_SCOPE_ATTESTATION_VIOLATION');
    }

    // 8. Validate guardrail passed
    const guardrailCheck = await guardrailSvc.runGuardrailCheck(prepId);
    if (guardrailCheck.status !== 'PASS') {
      throw new Error('GUARDRAIL_VIOLATION_BLOCKED_FINALIZATION');
    }

    // 9. Update state to FINALIZED
    if (!isProdLike) {
      const record = prepBuilderSvc._mockState.preps.get(prepId);
      record.prep_status = 'FINALIZED';
      record.finalized_by = actorId;
      record.finalized_at = new Date();
      prepBuilderSvc._mockState.preps.set(prepId, record);
    } else {
      await db.query(
        `UPDATE controlled_beta_cohort_intervention_app_preps
         SET prep_status = 'FINALIZED',
             finalized_by = ?,
             finalized_at = NOW()
         WHERE prep_id = ?`,
        [actorId, prepId]
      );
    }

    await auditService.recordAuditEvent(prepId, 'PREPARATION_FINALIZED', actorId);

    const updated = await prepBuilderSvc.getPrep(prepId);
    return { prep: updated };
  }

  async requestResimulation(prepId, reason, actorId = 'system') {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (!reason || reason.trim().length === 0) {
      throw new Error('REASON_REQUIRED');
    }

    const prep = await prepBuilderSvc.getPrep(prepId);
    if (!prep) throw new Error('PREP_NOT_FOUND');

    if (!isProdLike) {
      const record = prepBuilderSvc._mockState.preps.get(prepId);
      record.prep_status = 'RE_SIMULATION_REQUESTED';
      record.prep_outcome = 'PREPARE_HIGH_RISK_RE_SIMULATION_REQUEST';
      prepBuilderSvc._mockState.preps.set(prepId, record);
    } else {
      await db.query(
        `UPDATE controlled_beta_cohort_intervention_app_preps
         SET prep_status = 'RE_SIMULATION_REQUESTED',
             prep_outcome = 'PREPARE_HIGH_RISK_RE_SIMULATION_REQUEST'
         WHERE prep_id = ?`,
        [prepId]
      );
    }

    await auditService.recordAuditEvent(prepId, 'PREPARATION_RESIMULATION_REQUESTED', actorId, { reason });
    
    const updated = await prepBuilderSvc.getPrep(prepId);
    return { prep: updated };
  }

  async escalatePrep(prepId, reason, actorId = 'system') {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (!reason || reason.trim().length === 0) {
      throw new Error('REASON_REQUIRED');
    }

    const prep = await prepBuilderSvc.getPrep(prepId);
    if (!prep) throw new Error('PREP_NOT_FOUND');

    if (!isProdLike) {
      const record = prepBuilderSvc._mockState.preps.get(prepId);
      record.prep_status = 'ESCALATED';
      record.prep_outcome = 'PREPARE_HIGH_RISK_GOVERNANCE_ESCALATION';
      prepBuilderSvc._mockState.preps.set(prepId, record);
    } else {
      await db.query(
        `UPDATE controlled_beta_cohort_intervention_app_preps
         SET prep_status = 'ESCALATED',
             prep_outcome = 'PREPARE_HIGH_RISK_GOVERNANCE_ESCALATION'
         WHERE prep_id = ?`,
        [prepId]
      );
    }

    await auditService.recordAuditEvent(prepId, 'PREPARATION_ESCALATED', actorId, { reason });
    
    const updated = await prepBuilderSvc.getPrep(prepId);
    return { prep: updated };
  }
}

const serviceInstance = new CohortInterventionSimulationApprovalPreparationDecisionService();
module.exports = serviceInstance;
module.exports.serviceInstance = serviceInstance;
module.exports.CohortInterventionSimulationApprovalPreparationDecisionService = CohortInterventionSimulationApprovalPreparationDecisionService;
