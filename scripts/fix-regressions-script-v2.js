const fs = require('fs');
const path = require('path');

const filesToPatch = [
    'src/api/routes/forensicsAdmin.js',
    'src/api/routes/jobsAdmin.js',
    'src/api/routes/productionDispatchAdmin.js',
    'src/api/routes/routingAdmin.js',
    'src/api/services/anomalyDetectionService.js',
    'src/api/services/anomalyDetectors.js',
    'src/api/services/auditService.js',
    'src/api/services/controlPlaneSchemaService.js',
    'src/api/services/deploymentRiskScorer.js',
    'src/api/services/dispatch/DispatchExecutionService.js',
    'src/api/services/industrialProvisioningService.js',
    'src/api/services/ManufacturingBundleService.js',
    'src/api/services/ManufacturingEvidenceLedgerService.js',
    'src/api/services/ManufacturingOrchestrationService.js',
    'src/api/services/ManufacturingPersistenceService.js',
    'src/api/services/tenantRiskScorer.js',
    'src/api/upstream/src/services/auditLogger.js',
    'src/ui/config/moduleReadiness.ts'
];

for (const relPath of filesToPatch) {
    const fullPath = path.join(__dirname, '..', relPath);
    if (!fs.existsSync(fullPath)) continue;

    let content = fs.readFileSync(fullPath, 'utf8');

    // Safe replacements
    content = content.replace(/INTO audit_logs/g, 'INTO api_audit_logs');
    content = content.replace(/FROM audit_logs/g, 'FROM api_audit_logs');
    content = content.replace(/UPDATE audit_logs/g, 'UPDATE api_audit_logs');
    
    content = content.replace(/FROM api_audit_log([\s;])/g, 'FROM api_audit_logs$1');
    content = content.replace(/INTO api_audit_log([\s(])/g, 'INTO api_audit_logs$1');
    content = content.replace(/UPDATE api_audit_log\s/g, 'UPDATE api_audit_logs ');

    fs.writeFileSync(fullPath, content);
}
console.log('Safe patches applied.');
