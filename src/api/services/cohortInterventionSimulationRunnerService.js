'use strict';

const crypto = require('crypto');
const db = require('./mysqlClient');
const builderService = require('./cohortInterventionSimulationBuilderService').serviceInstance || require('./cohortInterventionSimulationBuilderService');
const guardrailService = require('./cohortInterventionSimulationGuardrailService').serviceInstance || require('./cohortInterventionSimulationGuardrailService');
const impactAnalysisService = require('./cohortInterventionSimulationImpactAnalysisService').serviceInstance || require('./cohortInterventionSimulationImpactAnalysisService');
const rollbackPreviewService = require('./cohortInterventionSimulationRollbackPreviewService').serviceInstance || require('./cohortInterventionSimulationRollbackPreviewService');
const evidencePackService = require('./cohortInterventionSimulationEvidencePackService').serviceInstance || require('./cohortInterventionSimulationEvidencePackService');
const auditService = require('./cohortInterventionSimulationAuditService').serviceInstance || require('./cohortInterventionSimulationAuditService');

class CohortInterventionSimulationRunnerService {
  async runSimulation(simulationId, actorId = 'system') {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    const sim = await builderService.getSimulation(simulationId);
    if (!sim) throw new Error('SIMULATION_NOT_FOUND');

    // One-time use protection
    if (sim.simulation_status === 'SIMULATED' || sim.simulation_status === 'SIMULATION_IN_PROGRESS') {
      throw new Error('SIMULATION_CANNOT_BE_RE_RUN_OR_CONSUMED');
    }

    const steps = await builderService.getSteps(simulationId);

    // Run guardrail checks
    const guardrailRes = await guardrailService.runGuardrailChecks(sim, steps);
    if (!guardrailRes.passed) {
      if (!isProdLike) {
        const record = builderService._mockState.simulations.get(simulationId);
        let blockers = typeof record.simulation_blockers_json === 'string'
          ? JSON.parse(record.simulation_blockers_json) : (record.simulation_blockers_json || {});
        blockers.guardrail_failed = true;
        record.simulation_blockers_json = blockers;
        builderService._mockState.simulations.set(simulationId, record);
      } else {
        await db.query(
          "UPDATE controlled_beta_cohort_intervention_simulations SET simulation_blockers_json = JSON_SET(simulation_blockers_json, '$.guardrail_failed', true) WHERE simulation_id = ?",
          [simulationId]
        );
      }
      throw new Error('SIMULATION_GUARDRAILS_FAILED');
    }

    // Mark as in progress
    if (!isProdLike) {
      const record = builderService._mockState.simulations.get(simulationId);
      record.simulation_status = 'SIMULATION_IN_PROGRESS';
      record.started_at = new Date();
      builderService._mockState.simulations.set(simulationId, record);
    } else {
      await db.query(
        "UPDATE controlled_beta_cohort_intervention_simulations SET simulation_status = 'SIMULATION_IN_PROGRESS', started_at = NOW() WHERE simulation_id = ?",
        [simulationId]
      );
    }

    await auditService.recordAuditEvent(simulationId, 'SIMULATION_STARTED', actorId);

    // Execute simulation logic per type — NO operational state mutations
    // All writes go exclusively to Phase 141 simulation tables.
    const simulatedActions = [];
    if (sim.simulation_type === 'SIMULATE_COHORT_PAUSE') {
      simulatedActions.push({ action: 'COHORT_PAUSE_SIMULATION_MARKER', timestamp: new Date().toISOString(), note: 'SIMULATION_ONLY' });
    } else if (sim.simulation_type === 'SIMULATE_PARTICIPANT_ACCESS_RESTRICTION') {
      simulatedActions.push({ action: 'PARTICIPANT_ACCESS_RESTRICTION_SIMULATION_MARKER', timestamp: new Date().toISOString(), note: 'SIMULATION_ONLY' });
    } else if (sim.simulation_type === 'SIMULATE_INVITE_REVOCATION') {
      simulatedActions.push({ action: 'INVITE_REVOCATION_SIMULATION_MARKER', timestamp: new Date().toISOString(), note: 'SIMULATION_ONLY' });
    } else if (sim.simulation_type === 'SIMULATE_CONTROLLED_EXPANSION') {
      simulatedActions.push({ action: 'CONTROLLED_EXPANSION_SIMULATION_MARKER', timestamp: new Date().toISOString(), note: 'SIMULATION_ONLY' });
    } else {
      throw new Error('FORBIDDEN_SIMULATION_TYPE');
    }

    const resultPayload = {
      simulation_id: simulationId,
      simulation_type: sim.simulation_type,
      cohort_id: sim.cohort_id,
      simulated_actions: simulatedActions,
      write_scope_attestation: 'PHASE_141_TABLES_ONLY',
      operational_tables_mutated: [],
      safety_invariant: 'Phase 141 cannot execute high-risk interventions. Simulations write only to Phase 141 simulation tables.'
    };

    const resultId = 'sres_' + crypto.randomBytes(8).toString('hex');
    const resultHash = crypto.createHash('sha256').update(JSON.stringify(resultPayload)).digest('hex');

    if (!isProdLike) {
      builderService._mockState.results.set(simulationId, {
        result_id: resultId,
        simulation_id: simulationId,
        simulation_type: sim.simulation_type,
        result_status: 'SUCCESS',
        simulation_result_json: resultPayload,
        simulation_result_hash: resultHash,
        created_at: new Date()
      });
    } else {
      await db.query(
        `INSERT INTO controlled_beta_cohort_intervention_simulation_results
         (result_id, simulation_id, simulation_type, result_status, simulation_result_json, simulation_result_hash)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [resultId, simulationId, sim.simulation_type, 'SUCCESS', JSON.stringify(resultPayload), resultHash]
      );
    }

    // Build evidence pack v141.0
    const impactProjection = await impactAnalysisService.getImpactProjection(simulationId);
    const rollbackPreview = await rollbackPreviewService.getRollbackPreview(simulationId);

    // Reload sim for latest hashes before evidence build
    const simLatest = await builderService.getSimulation(simulationId);

    const evidence = await evidencePackService.buildEvidencePack(
      simulationId,
      simLatest || sim,
      steps,
      impactProjection,
      rollbackPreview,
      { simulation_result_hash: resultHash },
      guardrailRes
    );

    // Finalize
    if (!isProdLike) {
      const record = builderService._mockState.simulations.get(simulationId);
      record.simulation_status = 'SIMULATED';
      record.simulation_result_hash = resultHash;
      record.evidence_pack_hash = evidence.evidence_pack_hash;
      record.finished_at = new Date();
      builderService._mockState.simulations.set(simulationId, record);
    } else {
      await db.query(
        "UPDATE controlled_beta_cohort_intervention_simulations SET simulation_status = 'SIMULATED', simulation_result_hash = ?, evidence_pack_hash = ?, finished_at = NOW() WHERE simulation_id = ?",
        [resultHash, evidence.evidence_pack_hash, simulationId]
      );
    }

    await auditService.recordAuditEvent(simulationId, 'SIMULATION_COMPLETED', actorId, {
      evidence_pack_hash: evidence.evidence_pack_hash
    });

    return {
      simulation_status: 'SIMULATED',
      result_status: 'SUCCESS',
      evidence_pack_hash: evidence.evidence_pack_hash,
      lineage_hash_chain: evidence.lineage_hash_chain
    };
  }
}

const serviceInstance = new CohortInterventionSimulationRunnerService();
module.exports = serviceInstance;
module.exports.serviceInstance = serviceInstance;
module.exports.CohortInterventionSimulationRunnerService = CohortInterventionSimulationRunnerService;
