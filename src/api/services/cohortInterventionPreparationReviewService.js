'use strict';

const db = require('./mysqlClient');
const builderService = require('./cohortInterventionPreparationBuilderService');
const auditService = require('./cohortInterventionPreparationAuditService');
const guardrailService = require('./cohortInterventionPreparationGuardrailService');
const evidencePackService = require('./cohortInterventionPreparationEvidencePackService');

class CohortInterventionPreparationReviewService {
  async getPreparation(preparationId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (!isProdLike) {
      return builderService._mockState.preparations.get(preparationId);
    } else {
      const list = await db.query("SELECT * FROM controlled_beta_cohort_intervention_preparations WHERE preparation_id = ?", [preparationId]);
      return list.length > 0 ? list[0] : null;
    }
  }

  async getChecklistItems(preparationId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (!isProdLike) {
      return builderService._mockState.items.get(preparationId) || [];
    } else {
      return await db.query("SELECT * FROM controlled_beta_cohort_intervention_preparation_items WHERE preparation_id = ?", [preparationId]);
    }
  }

  async updateChecklistItemStatus(preparationId, itemId, itemStatus, actorId = 'admin') {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    const prep = await this.getPreparation(preparationId);
    if (!prep) throw new Error('PREPARATION_NOT_FOUND');
    if (prep.preparation_status === 'FINALIZED') throw new Error('CANNOT_MODIFY_FINALIZED_PREPARATION');

    if (!isProdLike) {
      const items = builderService._mockState.items.get(preparationId) || [];
      const item = items.find(i => i.item_id === itemId);
      if (!item) throw new Error('ITEM_NOT_FOUND');
      item.item_status = itemStatus;
      builderService._mockState.items.set(preparationId, items);
    } else {
      const result = await db.query(
        "UPDATE controlled_beta_cohort_intervention_preparation_items SET item_status = ? WHERE item_id = ? AND preparation_id = ?",
        [itemStatus, itemId, preparationId]
      );
      if (result.affectedRows === 0) throw new Error('ITEM_NOT_FOUND');
    }

    await auditService.recordAuditEvent(preparationId, 'CHECKLIST_ITEM_UPDATED', actorId, { item_id: itemId, status: itemStatus });
    return { ok: true };
  }

  async approveRole(preparationId, role, actorId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    const prep = await this.getPreparation(preparationId);
    if (!prep) throw new Error('PREPARATION_NOT_FOUND');
    if (prep.preparation_status === 'FINALIZED') throw new Error('CANNOT_MODIFY_FINALIZED_PREPARATION');

    let approvals = [];
    if (typeof prep.required_approvals_json === 'string') {
      approvals = JSON.parse(prep.required_approvals_json);
    } else {
      approvals = prep.required_approvals_json || [];
    }

    const app = approvals.find(a => a.role === role);
    if (!app) throw new Error('ROLE_NOT_REQUIRED');
    app.approved = true;
    app.approved_by = actorId;
    app.approved_at = new Date().toISOString();

    if (!isProdLike) {
      prep.required_approvals_json = approvals;
      builderService._mockState.preparations.set(preparationId, prep);
    } else {
      await db.query(
        "UPDATE controlled_beta_cohort_intervention_preparations SET required_approvals_json = ? WHERE preparation_id = ?",
        [JSON.stringify(approvals), preparationId]
      );
    }

    await auditService.recordAuditEvent(preparationId, 'PREPARATION_ROLE_APPROVED', actorId, { role });
    return { ok: true };
  }

  async finalizePreparation(preparationId, actorId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    let prep = await this.getPreparation(preparationId);
    if (!prep) throw new Error('PREPARATION_NOT_FOUND');
    if (prep.preparation_status === 'FINALIZED') throw new Error('PREPARATION_ALREADY_FINALIZED');

    // Run Blocker Evaluation
    const sourceReview = await builderService.getReviewById(prep.source_review_id, isProdLike);
    const sourceReviewNotFinalized = !sourceReview || sourceReview.review_status !== 'FINALIZED';

    let attestation = {};
    if (typeof prep.non_execution_attestation_json === 'string') {
      attestation = JSON.parse(prep.non_execution_attestation_json);
    } else {
      attestation = prep.non_execution_attestation_json || {};
    }
    const nonExecutionAttestationInvalid = !attestation.non_execution_acknowledged || !attestation.readiness_only_attested;

    let approvals = [];
    if (typeof prep.required_approvals_json === 'string') {
      approvals = JSON.parse(prep.required_approvals_json);
    } else {
      approvals = prep.required_approvals_json || [];
    }
    const missingRequiredApprovals = approvals.some(a => !a.approved);

    const guardrailRes = await guardrailService.runGuardrailChecks(prep);
    const guardrailFailed = !guardrailRes.passed;

    const blockers = {
      missing_evidence_pack: false, // will compile evidence pack now
      missing_required_approvals: missingRequiredApprovals,
      non_execution_attestation_invalid: nonExecutionAttestationInvalid,
      guardrail_failed: guardrailFailed,
      source_review_not_finalized: sourceReviewNotFinalized
    };

    const hasBlockers = Object.values(blockers).some(val => val === true);

    if (!isProdLike) {
      prep.finalization_blockers_json = blockers;
      builderService._mockState.preparations.set(preparationId, prep);
    } else {
      await db.query(
        "UPDATE controlled_beta_cohort_intervention_preparations SET finalization_blockers_json = ? WHERE preparation_id = ?",
        [JSON.stringify(blockers), preparationId]
      );
    }

    if (hasBlockers) {
      throw new Error('PREPARATION_FINALIZATION_BLOCKED');
    }

    // Build evidence pack
    const items = await this.getChecklistItems(preparationId);
    const evidence = await evidencePackService.buildEvidencePack(
      preparationId,
      sourceReview,
      { proposedActions: prep.proposed_actions_json },
      items,
      attestation
    );

    // Save final status
    if (!isProdLike) {
      prep.preparation_status = 'FINALIZED';
      prep.reviewed_by = actorId;
      prep.finalized_at = new Date();
      builderService._mockState.preparations.set(preparationId, prep);
    } else {
      await db.query(
        "UPDATE controlled_beta_cohort_intervention_preparations SET preparation_status = 'FINALIZED', reviewed_by = ?, finalized_at = NOW() WHERE preparation_id = ?",
        [actorId, preparationId]
      );
    }

    await auditService.recordAuditEvent(preparationId, 'PREPARATION_FINALIZED', actorId, { evidence_pack_hash: evidence.evidence_pack_hash });

    return {
      preparation: await this.getPreparation(preparationId),
      evidence
    };
  }

  async rejectPreparation(preparationId, reason, actorId) {
    if (!reason || reason.trim() === '') {
      throw new Error('REJECTION_REASON_EXIGENTLY_REQUIRED');
    }

    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    const prep = await this.getPreparation(preparationId);
    if (!prep) throw new Error('PREPARATION_NOT_FOUND');

    if (!isProdLike) {
      prep.preparation_status = 'REJECTED';
      prep.rejected_at = new Date();
      prep.rejected_reason = reason;
      builderService._mockState.preparations.set(preparationId, prep);
    } else {
      await db.query(
        "UPDATE controlled_beta_cohort_intervention_preparations SET preparation_status = 'REJECTED', rejected_at = NOW(), rejected_reason = ? WHERE preparation_id = ?",
        [reason, preparationId]
      );
    }

    await auditService.recordAuditEvent(preparationId, 'PREPARATION_REJECTED', actorId, { reason });
    return { ok: true };
  }

  async supersedePreparation(preparationId, supersededByPreparationId, reason, actorId) {
    if (!reason || reason.trim() === '') {
      throw new Error('SUPERSEDE_REASON_EXIGENTLY_REQUIRED');
    }

    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    const prep = await this.getPreparation(preparationId);
    if (!prep) throw new Error('PREPARATION_NOT_FOUND');

    if (!isProdLike) {
      prep.preparation_status = 'SUPERSEDED';
      prep.superseded_at = new Date();
      prep.superseded_by_preparation_id = supersededByPreparationId;
      prep.superseded_reason = reason;
      builderService._mockState.preparations.set(preparationId, prep);
    } else {
      await db.query(
        "UPDATE controlled_beta_cohort_intervention_preparations SET preparation_status = 'SUPERSEDED', superseded_at = NOW(), superseded_by_preparation_id = ?, superseded_reason = ? WHERE preparation_id = ?",
        [supersededByPreparationId, reason, preparationId]
      );
    }

    await auditService.recordAuditEvent(preparationId, 'PREPARATION_SUPERSEDED', actorId, { superseded_by_preparation_id: supersededByPreparationId, reason });
    return { ok: true };
  }
}

const serviceInstance = new CohortInterventionPreparationReviewService();
module.exports = serviceInstance;
module.exports.serviceInstance = serviceInstance;
