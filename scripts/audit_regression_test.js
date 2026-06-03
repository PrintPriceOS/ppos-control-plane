const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..', 'src');

// These tables shouldn't be queried anywhere
const GLOBALLY_FORBIDDEN = [
    'audit_logs',
    'api_audit_log '
];

// These tables shouldn't be queried as "audit sources" in the audit/jobs layers
const AUDIT_LAYER_FORBIDDEN = [
    'manufacturing_dispatch_events',
    'manufacturing_evidence_ledger'
];

function scanDirectory(dir) {
    let hasError = false;
    const files = fs.readdirSync(dir);

    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
            if (scanDirectory(fullPath)) {
                hasError = true;
            }
        } else if (file.endsWith('.js') || file.endsWith('.ts')) {
            const content = fs.readFileSync(fullPath, 'utf8');
            
            // Global check for audit_logs / api_audit_log
            for (const table of GLOBALLY_FORBIDDEN) {
                const regex = new RegExp(`['"\`\\s]${table.trim()}['"\`\\s]`, 'g');
                if (regex.test(content) && !fullPath.includes('audit_regression_test')) {
                    console.error(`[REGRESSION] File ${fullPath} references globally forbidden table '${table.trim()}'`);
                    hasError = true;
                }
            }

            // Audit-layer check for MES tables
            const isAuditOrJobRoute = file === 'auditExplorerAdmin.js' || file === 'jobsAdmin.js' || file === 'auditLoggerService.js' || file === 'admin.js';
            if (isAuditOrJobRoute) {
                for (const table of AUDIT_LAYER_FORBIDDEN) {
                    const regex = new RegExp(`['"\`\\s]${table.trim()}['"\`\\s]`, 'g');
                    if (regex.test(content) && !fullPath.includes('audit_regression_test')) {
                        // Exclude comments
                        const matches = content.match(regex);
                        if (matches) {
                            // Quick check if it's commented out. It's sufficient to check if there are any active queries.
                            if (content.includes(`FROM ${table}`) || content.includes(`INTO ${table}`)) {
                                console.error(`[REGRESSION] File ${fullPath} has an active query to MES table '${table}' in the audit path.`);
                                hasError = true;
                            }
                        }
                    }
                }
            }
        }
    }
    return hasError;
}

console.log('--- STARTING AUDIT REGRESSION TEST ---');
const failed = scanDirectory(ROOT_DIR);

if (failed) {
    console.error('--- REGRESSION TEST FAILED ---');
    process.exit(1);
} else {
    console.log('✓ No forbidden table references found in the audit paths.');
    console.log('--- REGRESSION TEST PASSED ---');
    process.exit(0);
}
