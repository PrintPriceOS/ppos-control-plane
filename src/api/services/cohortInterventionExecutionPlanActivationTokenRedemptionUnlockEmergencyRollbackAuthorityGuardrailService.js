'use strict';

const fs = require('fs');
const path = require('path');

class CohortInterventionExecutionPlanActivationTokenRedemptionUnlockEmergencyRollbackAuthorityGuardrailService {
  async scanForForbiddenOperations() {
    const violations = [];
    const forbiddenPatterns = [
      { name: 'unlockToken', regex: /\bunlockToken\s*\(/g },
      { name: 'redeemToken', regex: /\bredeemToken\s*\(/g },
      { name: 'executeActivationPlan', regex: /\bexecuteActivationPlan\s*\(/g },
      { name: 'dispatchQueue', regex: /\bdispatchQueue\s*\(/g },
      { name: 'createRealJob', regex: /\bcreateRealJob\s*\(/g },
      { name: 'enableExecution', regex: /\benableExecution\s*\(/g },
      { name: 'markTokenRedeemable', regex: /\bmarkTokenRedeemable\s*\(/g },
      { name: 'mutateRuntimeState', regex: /\bmutateRuntimeState\s*\(/g }
    ];

    const searchDir = path.join(__dirname, '..', '..', '..');
    const filesToScan = [
      path.join(searchDir, 'src', 'api', 'services', 'cohortInterventionExecutionPlanActivationTokenRedemptionUnlockEmergencyRollbackAuthorityDecisionService.js'),
      path.join(searchDir, 'src', 'api', 'services', 'cohortInterventionExecutionPlanActivationTokenRedemptionUnlockEmergencyRollbackAuthorityBuilderService.js'),
      path.join(searchDir, 'src', 'api', 'services', 'cohortInterventionExecutionPlanActivationTokenRedemptionUnlockEmergencyRollbackAuthorityEvaluatorService.js')
    ];

    for (const file of filesToScan) {
      if (fs.existsSync(file)) {
        const content = fs.readFileSync(file, 'utf8');
        for (const pattern of forbiddenPatterns) {
          if (pattern.regex.test(content)) {
            violations.push({
              file: path.basename(file),
              forbiddenCall: pattern.name,
              reason: 'Forbidden execution operation detected inside safety boundary.'
            });
          }
        }
      }
    }

    return violations;
  }
}

module.exports = {
  serviceInstance: new CohortInterventionExecutionPlanActivationTokenRedemptionUnlockEmergencyRollbackAuthorityGuardrailService()
};
