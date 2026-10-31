const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..', 'src', 'api');

// These tables shouldn't be queried anywhere
const GLOBALLY_FORBIDDEN = [
    'audit_logs',
    'api_audit_log ',
    'api_api_audit_logs'
];

// These tables shouldn't be queried as "audit sources" in the audit/jobs layers
const AUDIT_LAYER_FORBIDDEN = [
    'manufacturing_dispatch_events',
    'manufacturing_evidence_ledger'
];

const LEGACY_COLUMNS = ['job_id', 'policy_slug', 'ip_address', 'details'];

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
            
            // Global check for forbidden tables
            for (const table of GLOBALLY_FORBIDDEN) {
                const regex = new RegExp(`['"\`\\s]${table.trim()}['"\`\\s]`, 'g');
                if (regex.test(content) && !fullPath.includes('audit_regression_test')) {
                    console.error(`[REGRESSION] File ${fullPath} references globally forbidden table '${table.trim()}'`);
                    hasError = true;
                }
            }

            // Check for legacy `action` combined with `api_audit_logs`
            if (content.includes('api_audit_logs') && !fullPath.includes('audit_regression_test')) {
                // Strict check for SQL usage of action column
                const strictSqlActionRegex = /(api_audit_logs\.action|SELECT\s+(?:[^F]+,\s*)?action(?:\s*,[^F]+)?\s+FROM\s+api_audit_logs|WHERE\s+action\s*=|ORDER\s+BY\s+action)/i;
                if (strictSqlActionRegex.test(content)) {
                     console.error(`[REGRESSION] File ${fullPath} combines api_audit_logs with legacy 'action' column.`);
                     hasError = true;
                }
            }

            // Check for INSERT INTO api_audit_logs using legacy columns
            if (content.includes('INSERT INTO api_audit_logs')) {
                const insertMatch = content.match(/INSERT INTO api_audit_logs\s*\(([^)]+)\)/i);
                if (insertMatch) {
                    const cols = insertMatch[1].split(',').map(c => c.trim());
                    for (const leg of LEGACY_COLUMNS) {
                        if (cols.includes(leg)) {
                             console.error(`[REGRESSION] File ${fullPath} inserts into api_audit_logs using legacy column '${leg}'`);
                             hasError = true;
                        }
                    }
                    if (cols.includes('action')) {
                         console.error(`[REGRESSION] File ${fullPath} inserts into api_audit_logs using legacy column 'action'`);
                         hasError = true;
                    }
                }
            }

            // Audit-layer check for MES tables
            const isAuditOrJobRoute = file === 'auditExplorerAdmin.js' || file === 'jobsAdmin.js' || file === 'auditLoggerService.js' || file === 'admin.js';
            if (isAuditOrJobRoute) {
                for (const table of AUDIT_LAYER_FORBIDDEN) {
                    const regex = new RegExp(`['"\`\\s]${table.trim()}['"\`\\s]`, 'g');
                    if (regex.test(content) && !fullPath.includes('audit_regression_test')) {
                        const matches = content.match(regex);
                        if (matches) {
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
