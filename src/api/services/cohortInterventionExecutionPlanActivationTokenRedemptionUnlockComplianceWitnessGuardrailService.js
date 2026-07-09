'use strict';

const fs = require('fs');
const path = require('path');

class CohortInterventionExecutionPlanActivationTokenRedemptionUnlockComplianceWitnessGuardrailService {
  async scanForForbiddenOperations() {
    // Scan codebase or critical paths to ensure no job creation, dispatching, or runtime mutations are active
    const searchDirs = [
      path.join(__dirname, '..', 'services'),
      path.join(__dirname, '..', 'routes')
    ];

    const forbiddenPatterns = [
      /dispatchQueue\(/i,
      /createRealJob\(/i,
      /executePlan\(/i,
      /enableHighRiskExecution\(/i
    ];

    const violations = [];

    const scanDir = (dir) => {
      if (!fs.existsSync(dir)) return;
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          scanDir(fullPath);
        } else if (stat.isFile() && (file.endsWith('.js') || file.endsWith('.ts'))) {
          // Avoid scanning ourselves
          if (file.includes('cohortInterventionExecutionPlanActivationTokenRedemptionUnlockComplianceWitnessGuardrailService')) {
            continue;
          }
          const content = fs.readFileSync(fullPath, 'utf8');
          for (const pattern of forbiddenPatterns) {
            if (pattern.test(content)) {
              violations.push({
                file: fullPath,
                pattern: pattern.toString()
              });
            }
          }
        }
      }
    };

    searchDirs.forEach(scanDir);
    return violations;
  }
}

module.exports = {
  serviceInstance: new CohortInterventionExecutionPlanActivationTokenRedemptionUnlockComplianceWitnessGuardrailService()
};
