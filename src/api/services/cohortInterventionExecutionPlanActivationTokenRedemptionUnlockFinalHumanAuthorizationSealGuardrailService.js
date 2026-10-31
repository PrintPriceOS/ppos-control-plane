'use strict';

const fs = require('fs');
const path = require('path');

class CohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalHumanAuthorizationSealGuardrailService {
  async verifySourceSafety() {
    // Scan source files for high-risk functions to ensure strict separation
    const forbiddenPatterns = [
      /\.executeUnlock\(/g,
      /\.unlockToken\(/g,
      /dispatchToQueue\(/g,
      /triggerExecutionPlan\(/g
    ];

    const violations = [];
    const filesToScan = [
      'src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalHumanAuthorizationSealBuilderService.js',
      'src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalHumanAuthorizationSealEvaluatorService.js',
      'src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalHumanAuthorizationSealDecisionService.js',
      'src/api/services/cohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalHumanAuthorizationSealEvidencePackService.js'
    ];

    for (const relativePath of filesToScan) {
      const absolutePath = path.join(__dirname, '../..', relativePath);
      if (fs.existsSync(absolutePath)) {
        const content = fs.readFileSync(absolutePath, 'utf8');
        for (const pattern of forbiddenPatterns) {
          if (pattern.test(content)) {
            violations.push(`${relativePath} violates safety pattern: ${pattern.toString()}`);
          }
        }
      }
    }

    return {
      passed: violations.length === 0,
      violations
    };
  }
}

module.exports = {
  serviceInstance: new CohortInterventionExecutionPlanActivationTokenRedemptionUnlockFinalHumanAuthorizationSealGuardrailService()
};
