const fs = require('fs');
let code = fs.readFileSync('src/api/routes/adminPreflightJobs.js', 'utf8');

const map = {
  'LIST_JOBS': 'PREFLIGHT_JOBS_LISTED',
  'CREATE_JOB': 'PREFLIGHT_JOB_CREATED',
  'GET_JOB': 'PREFLIGHT_JOB_VIEWED',
  'SYNC_JOB': 'PREFLIGHT_JOB_SYNCED',
  'GLOBAL_SYNC': 'PREFLIGHT_GLOBAL_SYNC_REQUESTED',
  'REQUEST_FIX': 'PREFLIGHT_FIX_REQUEST_FAILED',
  'REQUEST_RETRY': 'PREFLIGHT_RETRY_REQUESTED',
  'DOWNLOAD_ARTIFACT': 'PREFLIGHT_ARTIFACT_DOWNLOAD_REQUESTED',
  'CREATE_BATCH': 'PREFLIGHT_BATCH_CREATED'
};

for (const [action, eventType] of Object.entries(map)) {
    const regex = new RegExp(`logAuditEvent\\(\\{([^}]+)action:\\s*'${action}'([^}]*)\\}\\)`, 'g');
    code = code.replace(regex, `logPreflightAdminEvent({$1eventType: '${eventType}'$2})`);
}

// Check for the endpoint querying old audit rows
// const { tenant, action, status } = req.query;
code = code.replace(/const\s+\{\s*tenant,\s*action,\s*status(.*)\}\s*=\s*req.query;/, 'const { tenant, action, status$1} = req.query;\n        const event_type = action;');

// if (action) { sql += ' AND action = ?'; params.push(action); }
code = code.replace(/if\s*\(action\)\s*\{\s*sql\s*\+=\s*' AND action = \?';\s*params\.push\(action\);\s*\}/g, "if (event_type) { sql += ' AND event_type = ?'; params.push(event_type); }");
code = code.replace(/if\s*\(action\)\s*\{\s*countSql\s*\+=\s*' AND action = \?';\s*countParams\.push\(action\);\s*\}/g, "if (event_type) { countSql += ' AND event_type = ?'; countParams.push(event_type); }");


fs.writeFileSync('src/api/routes/adminPreflightJobs.js', code);
console.log('Replaced logAuditEvent calls successfully.');
