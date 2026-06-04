require('dotenv').config();
const db = require('../src/api/services/mysqlClient');
const auditLogger = require('../src/api/services/auditLoggerService');

async function main() {
  console.log('================================================================================');
  console.log('PPOS CONTROL PLANE — PHASE 41');
  console.log('PREFLIGHT MODULE CLOSURE SMOKE TEST');
  console.log('================================================================================\n');

  let failed = false;
  let testJobId = `job_ph41_${Date.now()}`;

  try {
    console.log('[1/4] Testing Preflight UI Audit Logging mechanism...');
    
    await auditLogger.log({
      type: 'PREFLIGHT_UPLOAD_PANEL_OPENED',
      tenantId: 'system',
      userId: 'smoke-tester@printprice.pro',
      status: 'SUCCESS',
      metadata: { test_source: 'smoke_phase_41' }
    });
    console.log('✅ Simulated PREFLIGHT_UPLOAD_PANEL_OPENED audit event successfully.');

    console.log('[2/4] Testing Audit Timeline Database Integration...');
    await db.query(`
      INSERT INTO api_audit_logs (tenant_id, user_id, event_type, status, metadata_json)
      VALUES ('system', 'admin@printprice.pro', 'PREFLIGHT_JOB_SUBMITTED', 'SUCCESS', ?)
    `, [JSON.stringify({ job_id: testJobId, file_name: 'test.pdf' })]);

    const timelineRows = await db.query(`
      SELECT * FROM api_audit_logs 
      WHERE JSON_EXTRACT(metadata_json, '$.job_id') = ?
      ORDER BY created_at ASC
    `, [testJobId]);

    if (timelineRows.length === 0) {
      console.error('❌ Failed to fetch job audit timeline from database.');
      failed = true;
    } else {
      console.log('✅ Audit Timeline query returned events correctly.');
    }

  } catch (error) {
    console.error('❌ Unexpected Error during Phase 41 Smoke Test:', error);
    failed = true;
  }

  // Cleanup
  try {
     await db.query('DELETE FROM api_audit_logs WHERE JSON_EXTRACT(metadata_json, "$.job_id") = ?', [testJobId]);
     await db.query('DELETE FROM api_audit_logs WHERE event_type = "PREFLIGHT_UPLOAD_PANEL_OPENED" AND JSON_EXTRACT(metadata_json, "$.test_source") = "smoke_phase_41"');
  } catch (err) {
     console.error('Cleanup failed:', err.message);
  }

  console.log('\n================================================================================');
  if (failed) {
    console.log('❌ PHASE 41 SMOKE TEST FAILED');
    process.exit(1);
  } else {
    console.log('✅ PHASE 41 SMOKE TEST PASSED');
    process.exit(0);
  }
}

main().catch(console.error);
