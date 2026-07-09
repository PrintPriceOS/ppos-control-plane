'use strict';

const crypto = require('crypto');
const builder = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockComplianceWitnessBuilderService').serviceInstance;
const auditService = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockComplianceWitnessAuditService').serviceInstance;
const evidencePackService = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockComplianceWitnessEvidencePackService').serviceInstance;

class CohortInterventionExecutionPlanActivationTokenRedemptionUnlockComplianceWitnessDecisionService {
  async recordComplianceWitness(unlockComplianceWitnessId, complianceWitnessId, complianceWitnessRole, reason, actorId) {
    const record = await builder.getTokenRedemptionUnlockComplianceWitness(unlockComplianceWitnessId);
    if (!record) {
      throw new Error(`Compliance witness record ${unlockComplianceWitnessId} not found.`);
    }

    if (record.unlock_compliance_witness_status === 'FINALIZED') {
      throw new Error(`Compliance witness record is finalized and cannot be modified.`);
    }

    if (!complianceWitnessId || !complianceWitnessId.trim()) {
      throw new Error(`Compliance witness ID is required.`);
    }

    const allowedRoles = ['compliance_officer', 'security_officer', 'risk_officer', 'audit_officer'];
    if (!allowedRoles.includes(complianceWitnessRole)) {
      throw new Error(`Invalid compliance witness role: ${complianceWitnessRole}. Allowed roles: ${allowedRoles.join(', ')}`);
    }

    // Separation of duties checks
    if (complianceWitnessId === record.primary_authorizer_id) {
      throw new Error(`Compliance witness cannot duplicate the primary authorizer.`);
    }
    if (complianceWitnessId === record.secondary_authorizer_id) {
      throw new Error(`Compliance witness cannot duplicate the secondary authorizer.`);
    }
    if (complianceWitnessId === record.final_human_authorizer_id) {
      throw new Error(`Compliance witness cannot duplicate the final human authorizer.`);
    }

    const attestation = {
      compliance_witness_attestation_confirmation: true,
      witness_attested_at: new Date().toISOString(),
      witness_role: complianceWitnessRole,
      confirms_no_unlock_executed: true,
      confirms_token_non_redeemable: true,
      confirms_execution_disabled: true
    };

    const separationSnapshot = {
      primary_authorizer_id: record.primary_authorizer_id,
      secondary_authorizer_id: record.secondary_authorizer_id,
      final_human_authorizer_id: record.final_human_authorizer_id,
      compliance_witness_id: complianceWitnessId,
      verified_independent: true
    };

    const updated = await builder._internalUpdateUnlockComplianceWitness(unlockComplianceWitnessId, {
      compliance_witness_id: complianceWitnessId,
      compliance_witness_role: complianceWitnessRole,
      compliance_witness_attested_at: new Date(),
      compliance_witness_reason: reason,
      compliance_witness_attestation_json: attestation,
      authorizer_witness_separation_snapshot_json: separationSnapshot
    });

    await auditService.logAction(unlockComplianceWitnessId, 'COMPLIANCE_WITNESS_RECORDED', actorId, {
      complianceWitnessId,
      complianceWitnessRole
    });

    return updated;
  }

  async recordDecision(unlockComplianceWitnessId, payload, actorId) {
    const record = await builder.getTokenRedemptionUnlockComplianceWitness(unlockComplianceWitnessId);
    if (!record) {
      throw new Error(`Compliance witness record ${unlockComplianceWitnessId} not found.`);
    }

    if (record.unlock_compliance_witness_status === 'FINALIZED') {
      throw new Error(`Compliance witness record is finalized.`);
    }

    if (payload.compliance_witness_id) {
      await this.recordComplianceWitness(
        unlockComplianceWitnessId,
        payload.compliance_witness_id,
        payload.compliance_witness_role,
        payload.compliance_witness_reason || '',
        actorId
      );
    }

    const rec = await builder.getTokenRedemptionUnlockComplianceWitness(unlockComplianceWitnessId);

    const decision = payload.decision; // APPROVE_COMPLIANCE_WITNESS, REJECT_COMPLIANCE_WITNESS, etc.
    let status = rec.unlock_compliance_witness_status;
    let result = rec.unlock_compliance_witness_result;

    if (decision === 'APPROVE_COMPLIANCE_WITNESS') {
      status = 'APPROVED';
      result = 'COMPLIANCE_WITNESSED_NOT_UNLOCKED';
    } else if (decision === 'REJECT_COMPLIANCE_WITNESS') {
      status = 'REJECTED';
      result = 'COMPLIANCE_WITNESS_FAILED';
    } else if (decision === 'BLOCK') {
      status = 'BLOCKED';
      result = 'COMPLIANCE_WITNESS_BLOCKED_BY_GUARDRAIL';
    }

    const updated = await builder._internalUpdateUnlockComplianceWitness(unlockComplianceWitnessId, {
      unlock_compliance_witness_status: status,
      unlock_compliance_witness_result: result,
      approved_by: decision === 'APPROVE_COMPLIANCE_WITNESS' ? actorId : null,
      approved_at: decision === 'APPROVE_COMPLIANCE_WITNESS' ? new Date() : null,
      rejected_by: decision === 'REJECT_COMPLIANCE_WITNESS' ? actorId : null,
      rejected_at: decision === 'REJECT_COMPLIANCE_WITNESS' ? new Date() : null
    });

    await auditService.logAction(unlockComplianceWitnessId, 'UNLOCK_COMPLIANCE_WITNESS_DECISION_RECORDED', actorId, {
      decision,
      status,
      result
    });

    return updated;
  }

  async finalizeUnlockComplianceWitness(unlockComplianceWitnessId, actorId) {
    const record = await builder.getTokenRedemptionUnlockComplianceWitness(unlockComplianceWitnessId);
    if (!record) {
      throw new Error(`Compliance witness record ${unlockComplianceWitnessId} not found.`);
    }

    if (record.unlock_compliance_witness_status === 'FINALIZED') {
      return record;
    }

    if (record.unlock_compliance_witness_status !== 'APPROVED') {
      throw new Error(`Compliance witness record must be APPROVED before finalization. Current status: ${record.unlock_compliance_witness_status}`);
    }

    if (!record.compliance_witness_id) {
      throw new Error(`Compliance witness identity is missing.`);
    }

    // Evidence pack generation
    const epResult = await evidencePackService.generateEvidencePack(record);

    const updated = await builder._internalUpdateUnlockComplianceWitness(unlockComplianceWitnessId, {
      unlock_compliance_witness_status: 'FINALIZED',
      unlock_compliance_witness_hash: crypto.createHash('sha256').update(JSON.stringify(record)).digest('hex'),
      unlock_compliance_witness_evidence_pack_hash: epResult.evidence_pack_hash,
      evidence_pack_hash: epResult.evidence_pack_hash,
      lineage_hash_chain_json: epResult.lineageHashChain,
      finalized_by: actorId,
      finalized_at: new Date()
    });

    await auditService.logAction(unlockComplianceWitnessId, 'UNLOCK_COMPLIANCE_WITNESS_FINALIZED', actorId, {
      evidencePackHash: epResult.evidence_pack_hash
    });

    return updated;
  }
}

module.exports = {
  serviceInstance: new CohortInterventionExecutionPlanActivationTokenRedemptionUnlockComplianceWitnessDecisionService()
};
