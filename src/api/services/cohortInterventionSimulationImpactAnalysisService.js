'use strict';

const crypto = require('crypto');
const db = require('./mysqlClient');
const builderService = require('./cohortInterventionSimulationBuilderService').serviceInstance || require('./cohortInterventionSimulationBuilderService');
const auditService = require('./cohortInterventionSimulationAuditService').serviceInstance || require('./cohortInterventionSimulationAuditService');

class CohortInterventionSimulationImpactAnalysisService {
  _projectImpact(simulation) {
    const type = simulation.simulation_type;
    const cohortId = simulation.cohort_id;
    const tenantId = simulation.tenant_id;

    // All projections are read-only estimates. No operational state is mutated.
    if (type === 'SIMULATE_COHORT_PAUSE') {
      return {
        simulation_type: type,
        projection_scope: 'COHORT_PAUSE',
        note: 'SIMULATION_ONLY — no real cohort pause performed',
        projected_effects: {
          cohort_id: cohortId,
          tenant_id: tenantId,
          projected_cohort_status_change: { from: 'ACTIVE', to: 'PAUSED' },
          projected_affected_participants: '(query controlled_beta_runtime_access_sessions for cohort)',
          projected_affected_active_sessions: '(count active sessions for cohort)',
          projected_affected_pending_invites: '(count pending invites for cohort)',
          projected_intervention_scope: 'ALL_PARTICIPANTS_ALL_SESSIONS'
        },
        operational_tables_mutated: [],
        simulation_tables_written: ['controlled_beta_cohort_intervention_sim_dry_runs']
      };
    } else if (type === 'SIMULATE_PARTICIPANT_ACCESS_RESTRICTION') {
      return {
        simulation_type: type,
        projection_scope: 'PARTICIPANT_ACCESS_RESTRICTION',
        note: 'SIMULATION_ONLY — no real participant access restriction performed',
        projected_effects: {
          cohort_id: cohortId,
          tenant_id: tenantId,
          projected_participant_status_change: { from: 'ACTIVE', to: 'ACCESS_RESTRICTED' },
          projected_affected_sessions: '(count active sessions for affected participants)',
          projected_affected_access_grants: '(count access grants to be suspended)',
          projected_intervention_scope: 'TARGETED_PARTICIPANTS'
        },
        operational_tables_mutated: [],
        simulation_tables_written: ['controlled_beta_cohort_intervention_sim_dry_runs']
      };
    } else if (type === 'SIMULATE_INVITE_REVOCATION') {
      return {
        simulation_type: type,
        projection_scope: 'INVITE_REVOCATION',
        note: 'SIMULATION_ONLY — no real invite revocation performed',
        projected_effects: {
          cohort_id: cohortId,
          tenant_id: tenantId,
          projected_invite_status_change: { from: 'PENDING', to: 'REVOKED' },
          projected_affected_outstanding_invites: '(count outstanding invites for cohort)',
          projected_affected_pending_onboarding: '(count pending onboarding flows)',
          projected_intervention_scope: 'ALL_PENDING_INVITES'
        },
        operational_tables_mutated: [],
        simulation_tables_written: ['controlled_beta_cohort_intervention_sim_dry_runs']
      };
    } else if (type === 'SIMULATE_CONTROLLED_EXPANSION') {
      return {
        simulation_type: type,
        projection_scope: 'CONTROLLED_EXPANSION',
        note: 'SIMULATION_ONLY — no real cohort expansion performed',
        projected_effects: {
          cohort_id: cohortId,
          tenant_id: tenantId,
          projected_new_invite_slots: 10,
          projected_estimated_new_participants: 8,
          projected_capacity_impact: 'MEDIUM',
          projected_intervention_scope: 'COHORT_EXPANSION_ONLY'
        },
        operational_tables_mutated: [],
        simulation_tables_written: ['controlled_beta_cohort_intervention_sim_dry_runs']
      };
    } else {
      throw new Error(`UNSUPPORTED_SIMULATION_TYPE_IN_PHASE_141: ${type}`);
    }
  }

  async generateImpactAnalysis(simulationId, actorId = 'system') {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    const sim = await builderService.getSimulation(simulationId);
    if (!sim) throw new Error('SIMULATION_NOT_FOUND');
    if (sim.simulation_status === 'SIMULATED' || sim.simulation_status === 'SIMULATION_IN_PROGRESS') {
      throw new Error('SIMULATION_ALREADY_IN_PROGRESS_OR_COMPLETED');
    }

    const projection = this._projectImpact(sim);
    const projectionId = 'sip_' + crypto.randomBytes(8).toString('hex');
    const projectionHash = crypto.createHash('sha256').update(JSON.stringify(projection)).digest('hex');

    if (!isProdLike) {
      builderService._mockState.projections.set(simulationId, {
        projection_id: projectionId,
        simulation_id: simulationId,
        simulation_type: sim.simulation_type,
        impact_projection_json: projection,
        impact_projection_hash: projectionHash,
        created_at: new Date()
      });

      const steps = builderService._mockState.steps.get(simulationId) || [];
      const step = steps.find(s => s.step_key === 'impact_analysis');
      if (step) { step.status = 'COMPLETED'; step.completed_at = new Date(); }
      builderService._mockState.steps.set(simulationId, steps);

      const record = builderService._mockState.simulations.get(simulationId);
      let blockers = typeof record.simulation_blockers_json === 'string'
        ? JSON.parse(record.simulation_blockers_json) : (record.simulation_blockers_json || {});
      blockers.missing_impact_analysis = false;
      record.impact_projection_hash = projectionHash;
      record.simulation_blockers_json = blockers;
      builderService._mockState.simulations.set(simulationId, record);
    } else {
      await db.query(
        `INSERT INTO controlled_beta_cohort_intervention_sim_dry_runs
         (projection_id, simulation_id, simulation_type, impact_projection_json, impact_projection_hash)
         VALUES (?, ?, ?, ?, ?)`,
        [projectionId, simulationId, sim.simulation_type, JSON.stringify(projection), projectionHash]
      );

      await db.query(
        "UPDATE controlled_beta_cohort_intervention_simulation_steps SET status = 'COMPLETED', completed_at = NOW() WHERE simulation_id = ? AND step_key = 'impact_analysis'",
        [simulationId]
      );

      await db.query(
        'UPDATE controlled_beta_cohort_intervention_simulations SET impact_projection_hash = ?, simulation_blockers_json = JSON_SET(simulation_blockers_json, \'$.missing_impact_analysis\', false) WHERE simulation_id = ?',
        [projectionHash, simulationId]
      );
    }

    await auditService.recordAuditEvent(simulationId, 'IMPACT_ANALYSIS_GENERATED', actorId, { projection_hash: projectionHash });

    return { projection_id: projectionId, impact_projection_hash: projectionHash, impact_projection: projection };
  }

  async getImpactProjection(simulationId) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';
    if (!isProdLike) {
      return builderService._mockState.projections.get(simulationId);
    } else {
      const list = await db.query('SELECT * FROM controlled_beta_cohort_intervention_sim_dry_runs WHERE simulation_id = ?', [simulationId]);
      return list.length > 0 ? list[0] : null;
    }
  }
}

const serviceInstance = new CohortInterventionSimulationImpactAnalysisService();
module.exports = serviceInstance;
module.exports.serviceInstance = serviceInstance;
module.exports.CohortInterventionSimulationImpactAnalysisService = CohortInterventionSimulationImpactAnalysisService;
