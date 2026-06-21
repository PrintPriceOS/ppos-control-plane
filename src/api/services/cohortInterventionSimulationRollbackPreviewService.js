'use strict';

const crypto = require('crypto');
const db = require('./mysqlClient');
const builderService = require('./cohortInterventionSimulationBuilderService').serviceInstance || require('./cohortInterventionSimulationBuilderService');
const impactAnalysisService = require('./cohortInterventionSimulationImpactAnalysisService').serviceInstance || require('./cohortInterventionSimulationImpactAnalysisService');
const auditService = require('./cohortInterventionSimulationAuditService').serviceInstance || require('./cohortInterventionSimulationAuditService');

class CohortInterventionSimulationRollbackPreviewService {
  _buildRollbackPreview(simulation, impactProjection) {
    const type = simulation.simulation_type;
    const base = {
      simulation_type: type,
      note: 'SIMULATION_ONLY — this is a projected rollback path, not a real rollback plan',
      operational_tables_mutated: [],
      simulation_tables_written: ['controlled_beta_cohort_intervention_simulation_impact_projections']
    };

    if (type === 'SIMULATE_COHORT_PAUSE') {
      return {
        ...base,
        rollback_strategy: 'COHORT_RESUME',
        rollback_steps: [
          'Validate pause root cause is resolved',
          'Re-enable cohort access for all affected participants',
          'Restore active session state or issue new sessions',
          'Notify participants of cohort resumption',
          'Re-evaluate Phase 137 review to confirm health'
        ],
        estimated_rollback_duration_minutes: 30,
        rollback_risk: 'MEDIUM'
      };
    } else if (type === 'SIMULATE_PARTICIPANT_ACCESS_RESTRICTION') {
      return {
        ...base,
        rollback_strategy: 'PARTICIPANT_ACCESS_RESTORE',
        rollback_steps: [
          'Validate restriction root cause is resolved',
          'Re-enable participant access for affected participants',
          'Restore suspended sessions if applicable',
          'Notify affected participants',
          'Re-run Phase 136 observation for affected participants'
        ],
        estimated_rollback_duration_minutes: 15,
        rollback_risk: 'LOW'
      };
    } else if (type === 'SIMULATE_INVITE_REVOCATION') {
      return {
        ...base,
        rollback_strategy: 'INVITE_REISSUANCE',
        rollback_steps: [
          'Validate revocation root cause is resolved',
          'Issue new invitations to affected contacts',
          'Run Phase 133 invite issuance flow for replacement invites',
          'Notify affected invitees with new invite codes',
          'Monitor acceptance rate in Phase 136 observation'
        ],
        estimated_rollback_duration_minutes: 60,
        rollback_risk: 'HIGH',
        rollback_note: 'Original invite codes cannot be reinstated; new codes must be issued'
      };
    } else if (type === 'SIMULATE_CONTROLLED_EXPANSION') {
      return {
        ...base,
        rollback_strategy: 'EXPANSION_RETRACTION',
        rollback_steps: [
          'Halt new invite issuance',
          'Revoke any newly issued invites not yet accepted',
          'Revert cohort capacity to pre-expansion levels',
          'Update Phase 132 preparation records',
          'Notify admin team of expansion retraction'
        ],
        estimated_rollback_duration_minutes: 45,
        rollback_risk: 'MEDIUM'
      };
    } else {
      throw new Error(`UNSUPPORTED_SIMULATION_TYPE_IN_ROLLBACK_PREVIEW: ${type}`);
    }
  }

  async generateRollbackPreview(simulationId, actorId = 'system') {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    const sim = await builderService.getSimulation(simulationId);
    if (!sim) throw new Error('SIMULATION_NOT_FOUND');

    const projection = await impactAnalysisService.getImpactProjection(simulationId);
    if (!projection) throw new Error('IMPACT_ANALYSIS_REQUIRED_BEFORE_ROLLBACK_PREVIEW');

    const rollbackPreview = this._buildRollbackPreview(sim, projection);
    const previewHash = crypto.createHash('sha256').update(JSON.stringify(rollbackPreview)).digest('hex');

    if (!isProdLike) {
      const steps = builderService._mockState.steps.get(simulationId) || [];
      const step = steps.find(s => s.step_key === 'rollback_preview');
      if (step) { step.status = 'COMPLETED'; step.completed_at = new Date(); }
      builderService._mockState.steps.set(simulationId, steps);

      const record = builderService._mockState.simulations.get(simulationId);
      let blockers = typeof record.simulation_blockers_json === 'string'
        ? JSON.parse(record.simulation_blockers_json) : (record.simulation_blockers_json || {});
      blockers.missing_rollback_preview = false;
      record.rollback_preview_hash = previewHash;
      record.simulation_blockers_json = blockers;
      record._rollbackPreview = rollbackPreview;
      builderService._mockState.simulations.set(simulationId, record);
    } else {
      await db.query(
        "UPDATE controlled_beta_cohort_intervention_simulation_steps SET status = 'COMPLETED', completed_at = NOW() WHERE simulation_id = ? AND step_key = 'rollback_preview'",
        [simulationId]
      );

      await db.query(
        "UPDATE controlled_beta_cohort_intervention_simulations SET rollback_preview_hash = ?, simulation_blockers_json = JSON_SET(simulation_blockers_json, '$.missing_rollback_preview', false) WHERE simulation_id = ?",
        [previewHash, simulationId]
      );
    }

    await auditService.recordAuditEvent(simulationId, 'ROLLBACK_PREVIEW_GENERATED', actorId, { rollback_preview_hash: previewHash });

    return { rollback_preview_hash: previewHash, rollback_preview: rollbackPreview };
  }

  async getRollbackPreview(simulationId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (!isProdLike) {
      const record = builderService._mockState.simulations.get(simulationId);
      return record ? record._rollbackPreview : null;
    } else {
      // rollback preview is stored inline as part of the simulation record hash; retrieve projection for reference
      const sim = await builderService.getSimulation(simulationId);
      return sim && sim.rollback_preview_hash ? { rollback_preview_hash: sim.rollback_preview_hash } : null;
    }
  }
}

const serviceInstance = new CohortInterventionSimulationRollbackPreviewService();
module.exports = serviceInstance;
module.exports.serviceInstance = serviceInstance;
module.exports.CohortInterventionSimulationRollbackPreviewService = CohortInterventionSimulationRollbackPreviewService;
