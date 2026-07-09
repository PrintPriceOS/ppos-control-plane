'use strict';

const fs = require('fs');
const path = require('path');

class CohortInterventionExecutionPlanActivationTokenRedemptionUnlockSealGuardrailService {
  constructor() {
    this.forbiddenMethods = [
      'unlockToken',
      'performTokenUnlock',
      'makeTokenRedeemable',
      'redeemActivationToken',
      'unlockAndRedeemToken',
      'redeemAndActivateToken',
      'activateRedeemedToken',
      'activateExecutionPlan',
      'markPlanExecutable',
      'enableExecutionPlan',
      'executePlan',
      'createExecutionJob',
      'enqueueExecution',
      'scheduleExecution',
      'dispatchIntervention',
      'grantRuntimeAccess',
      'createRuntimeSession',
      'activateCredential',
      'writeRuntimeState',
      'applyIntervention',
      'pauseCohort',
      'restrictParticipant',
      'revokeInvite',
      'expandCohort',
      'commitMutation'
    ];
  }

  async verifySourceSafety() {
    const filesToScan = [
      path.join(__dirname, 'cohortInterventionExecutionPlanActivationTokenRedemptionUnlockSealAuditService.js'),
      path.join(__dirname, 'cohortInterventionExecutionPlanActivationTokenRedemptionUnlockSealBuilderService.js'),
      path.join(__dirname, 'cohortInterventionExecutionPlanActivationTokenRedemptionUnlockSealEvaluatorService.js'),
      path.join(__dirname, 'cohortInterventionExecutionPlanActivationTokenRedemptionUnlockSealDecisionService.js'),
      path.join(__dirname, 'cohortInterventionExecutionPlanActivationTokenRedemptionUnlockSealEvidencePackService.js'),
      path.join(__dirname, '../routes/controlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockSealAdmin.js')
    ];

    const violations = [];

    for (const filePath of filesToScan) {
      if (!fs.existsSync(filePath)) continue;
      const content = fs.readFileSync(filePath, 'utf8');

      for (const method of this.forbiddenMethods) {
        const lines = content.split('\n');
        lines.forEach((line, idx) => {
          if (line.includes(method) && !line.trim().startsWith('//') && !line.includes('forbiddenMethods') && !line.includes('forbidden unlock path')) {
            violations.push({
              file: path.basename(filePath),
              line: idx + 1,
              method,
              content: line.trim()
            });
          }
        });
      }
    }

    if (violations.length > 0) {
      console.warn('[GUARDRAIL ALERT] Forbidden high-risk methods detected in source scope:', violations);
      return { passed: false, violations };
    }

    return { passed: true, violations: [] };
  }
}

module.exports = {
  serviceInstance: new CohortInterventionExecutionPlanActivationTokenRedemptionUnlockSealGuardrailService()
};
