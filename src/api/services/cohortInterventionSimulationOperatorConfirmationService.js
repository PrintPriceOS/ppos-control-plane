'use strict';

const db = require('./mysqlClient');
const builderService = require('./cohortInterventionSimulationBuilderService').serviceInstance || require('./cohortInterventionSimulationBuilderService');
const auditService = require('./cohortInterventionSimulationAuditService').serviceInstance || require('./cohortInterventionSimulationAuditService');

const PHASE_141_CONFIRMATION_PHRASE = 'CONFIRM_PHASE_141_HIGH_RISK_SIMULATION';

class CohortInterventionSimulationOperatorConfirmationService {
  async confirmSimulation(simulationId, actorId = 'system', signatoryName, confirmationPhrase) {
    const isProdLike = (process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL || process.env.CI_PRODUCTION_SMOKE === 'true') && process.env.DB_UNREACHABLE !== 'true';

    const sim = await builderService.getSimulation(simulationId);
    if (!sim) throw new Error('SIMULATION_NOT_FOUND');

    if (sim.simulation_status === 'SIMULATED' || sim.simulation_status === 'SIMULATION_IN_PROGRESS') {
      throw new Error('SIMULATION_ALREADY_IN_PROGRESS_OR_COMPLETED');
    }

    if (!signatoryName || signatoryName.trim().length === 0) {
      throw new Error('SIGNATORY_NAME_REQUIRED');
    }

    if (confirmationPhrase !== PHASE_141_CONFIRMATION_PHRASE) {
      throw new Error(
        `INVALID_CONFIRMATION_PHRASE: Expected '${PHASE_141_CONFIRMATION_PHRASE}', received '${confirmationPhrase}'`
      );
    }

    if (!isProdLike) {
      const record = builderService._mockState.simulations.get(simulationId);
      let blockers = typeof record.simulation_blockers_json === 'string'
        ? JSON.parse(record.simulation_blockers_json) : (record.simulation_blockers_json || {});
      blockers.missing_operator_confirmation = false;
      record.operator_confirmed = 1;
      record.operator_confirmation_phrase = confirmationPhrase;
      record.operator_signatory_name = signatoryName;
      record.simulation_blockers_json = blockers;
      builderService._mockState.simulations.set(simulationId, record);

      const steps = builderService._mockState.steps.get(simulationId) || [];
      const step = steps.find(s => s.step_key === 'operator_confirmation');
      if (step) { step.status = 'COMPLETED'; step.completed_at = new Date(); }
      builderService._mockState.steps.set(simulationId, steps);
    } else {
      await db.query(
        `UPDATE controlled_beta_cohort_intervention_simulations
         SET operator_confirmed = 1, operator_confirmation_phrase = ?, operator_signatory_name = ?,
             simulation_blockers_json = JSON_SET(simulation_blockers_json, '$.missing_operator_confirmation', false)
         WHERE simulation_id = ?`,
        [confirmationPhrase, signatoryName, simulationId]
      );

      await db.query(
        "UPDATE controlled_beta_cohort_intervention_simulation_steps SET status = 'COMPLETED', completed_at = NOW() WHERE simulation_id = ? AND step_key = 'operator_confirmation'",
        [simulationId]
      );
    }

    await auditService.recordAuditEvent(simulationId, 'OPERATOR_CONFIRMATION_RECORDED', actorId, {
      signatory: signatoryName,
      phrase_valid: true
    });

    return { confirmed: true, signatory: signatoryName, phrase: confirmationPhrase };
  }
}

const serviceInstance = new CohortInterventionSimulationOperatorConfirmationService();
module.exports = serviceInstance;
module.exports.serviceInstance = serviceInstance;
module.exports.CohortInterventionSimulationOperatorConfirmationService = CohortInterventionSimulationOperatorConfirmationService;
