'use strict';

const fs = require('fs');
const path = require('path');

class CohortInterventionExecutionPlanActivationTokenRedemptionUnlockApprovalGuardrailService {
  constructor() {
    this.forbiddenMethods = [
      'unlockToken',
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
      path.join(__dirname, 'cohortInterventionExecutionPlanActivationTokenRedemptionUnlockApprovalAuditService.js'),
      path.join(__dirname, 'cohortInterventionExecutionPlanActivationTokenRedemptionUnlockApprovalBuilderService.js'),
      path.join(__dirname, 'cohortInterventionExecutionPlanActivationTokenRedemptionUnlockApprovalEvaluatorService.js'),
      path.join(__dirname, 'cohortInterventionExecutionPlanActivationTokenRedemptionUnlockApprovalDecisionService.js'),
      path.join(__dirname, 'cohortInterventionExecutionPlanActivationTokenRedemptionUnlockApprovalEvidencePackService.js'),
      path.join(__dirname, '../routes/controlledBetaCohortInterventionExecutionPlanActivationTokenRedemptionUnlockApprovalAdmin.js')
    ];

    const violations = [];

    for (const filePath of filesToScan) {
      if (!fs.existsSync(filePath)) continue;
      const content = fs.readFileSync(filePath, 'utf8');

      for (const method of this.forbiddenMethods) {
        // Simple regex scan to see if forbidden method is called or declared (ignoring comments)
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
  serviceInstance: new CohortInterventionExecutionPlanActivationTokenRedemptionUnlockApprovalGuardrailService()
};
