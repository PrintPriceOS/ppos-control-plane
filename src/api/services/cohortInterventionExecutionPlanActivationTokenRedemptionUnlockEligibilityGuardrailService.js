'use strict';

const fs = require('fs');
const path = require('path');
const builder = require('./cohortInterventionExecutionPlanActivationTokenRedemptionUnlockEligibilityBuilderService').serviceInstance;

class CohortInterventionExecutionPlanActivationTokenRedemptionUnlockEligibilityGuardrailService {
  async performSafetyScannerCheck(unlockEligibilityId) {
    const findings = [];
    const forbiddenMethods = [
      'unlockToken', 'makeTokenRedeemable', 'redeemActivationToken', 'unlockAndRedeemToken',
      'redeemAndActivateToken', 'activateRedeemedToken', 'activateExecutionPlan', 'markPlanExecutable',
      'enableExecutionPlan', 'executePlan', 'createExecutionJob', 'enqueueExecution',
      'scheduleExecution', 'dispatchIntervention', 'grantRuntimeAccess', 'createRuntimeSession',
      'activateCredential', 'writeRuntimeState', 'applyIntervention', 'pauseCohort',
      'restrictParticipant', 'revokeInvite', 'expandCohort', 'commitMutation'
    ];

    const sourceDir = path.join(__dirname, '..');
    const filesToScan = [
      'services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockEligibilityBuilderService.js',
      'services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockEligibilityEvaluatorService.js',
      'services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockEligibilityDecisionService.js',
      'services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockEligibilityEvidencePackService.js'
    ];

    for (const relativePath of filesToScan) {
      const fullPath = path.join(sourceDir, relativePath);
      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, 'utf8');
        for (const method of forbiddenMethods) {
          const regex = new RegExp(`[^a-zA-Z0-9_${forbiddenMethods.join('|')}]${method}\\(`, 'g');
          if (regex.test(content)) {
            findings.push({
              file: relativePath,
              finding: `Active call to forbidden unlock/execution/mutation path: ${method}`,
              severity: 'CRITICAL'
            });
          }
        }
      }
    }

    return findings;
  }

  async verifyWriteScope(unlockEligibilityId) {
    const findings = [];
    const record = await builder.getTokenRedemptionUnlockEligibility(unlockEligibilityId);
    if (!record) return findings;

    const ws = record.write_scope_attestation_json;
    if (!ws || ws.writes_only_phase166_tables !== true || ws.wrote_phase128_to_165_operational_tables !== false) {
      findings.push({
        finding: 'Invalid write scope detected. Attempting to write to prior phases or operational structures.',
        severity: 'CRITICAL'
      });
    }

    return findings;
  }
}

module.exports = {
  serviceInstance: new CohortInterventionExecutionPlanActivationTokenRedemptionUnlockEligibilityGuardrailService()
};
