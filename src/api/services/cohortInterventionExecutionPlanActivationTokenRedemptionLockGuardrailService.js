'use strict';

const fs = require('fs');
const path = require('path');
const builder = require('./cohortInterventionExecutionPlanActivationTokenRedemptionLockBuilderService').serviceInstance;

class CohortInterventionExecutionPlanActivationTokenRedemptionLockGuardrailService {
  async performSafetyScannerCheck(lockId) {
    const findings = [];
    const forbiddenMethods = [
      'redeemActivationToken', 'makeTokenRedeemable', 'unlockRedeemableToken', 'activateRedeemedToken',
      'redeemAndActivateToken', 'finalApproveAndRedeemToken', 'lockAndRedeemToken', 'freezeAndRedeemToken',
      'executeRedemptionEnvelope', 'activateExecutionPlan', 'authorizeAndActivate', 'goAndExecute',
      'markPlanExecutable', 'enableExecutionPlan', 'executePlan', 'createExecutionJob',
      'enqueueExecution', 'scheduleExecution', 'dispatchIntervention', 'pauseCohort',
      'restrictParticipant', 'revokeInvite', 'expandCohort', 'commitMutation',
      'applyIntervention', 'writeRuntimeState', 'grantRuntimeAccess', 'createRuntimeSession',
      'activateCredential'
    ];

    const sourceDir = path.join(__dirname, '..');
    const filesToScan = [
      'services/cohortInterventionExecutionPlanActivationTokenRedemptionLockBuilderService.js',
      'services/cohortInterventionExecutionPlanActivationTokenRedemptionLockEvaluatorService.js',
      'services/cohortInterventionExecutionPlanActivationTokenRedemptionLockDecisionService.js',
      'services/cohortInterventionExecutionPlanActivationTokenRedemptionLockEvidencePackService.js'
    ];

    for (const relativePath of filesToScan) {
      const fullPath = path.join(sourceDir, relativePath);
      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, 'utf8');
        for (const method of forbiddenMethods) {
          // Verify it's not a definition but an actual active call
          const regex = new RegExp(`[^a-zA-Z0-9_${forbiddenMethods.join('|')}]${method}\\(`, 'g');
          if (regex.test(content)) {
            findings.push({
              file: relativePath,
              finding: `Active call to forbidden execution/mutation path: ${method}`,
              severity: 'CRITICAL'
            });
          }
        }
      }
    }

    return findings;
  }

  async verifyWriteScope(lockId) {
    const findings = [];
    const record = await require('./cohortInterventionExecutionPlanActivationTokenRedemptionLockBuilderService').serviceInstance.getTokenRedemptionLock(lockId);
    if (!record) return findings;

    const ws = record.write_scope_attestation_json;
    if (!ws || ws.writes_only_phase165_tables !== true || ws.wrote_phase128_to_164_operational_tables !== false) {
      findings.push({
        finding: 'Invalid write scope detected. Attempting to write to prior phases or operational structures.',
        severity: 'CRITICAL'
      });
    }

    return findings;
  }
}

module.exports = {
  serviceInstance: new CohortInterventionExecutionPlanActivationTokenRedemptionLockGuardrailService()
};
