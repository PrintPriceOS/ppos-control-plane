'use strict';

const fs = require('fs');
const path = require('path');

class CohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalReviewGuardrailService {
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
      path.join(__dirname, 'cohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalReviewAuditService.js'),
      path.join(__dirname, 'cohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalReviewBuilderService.js'),
      path.join(__dirname, 'cohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalReviewEvaluatorService.js'),
      path.join(__dirname, 'cohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalReviewDecisionService.js'),
      path.join(__dirname, 'cohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalReviewEvidencePackService.js'),
      path.join(__dirname, '../routes/controlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalReviewAdmin.js')
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
  serviceInstance: new CohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalReviewGuardrailService()
};
