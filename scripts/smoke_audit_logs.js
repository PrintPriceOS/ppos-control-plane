require('dotenv').config();
const db = require('../src/api/services/mysqlClient');
const auditLogger = require('../src/api/services/auditLoggerService');

async function runSmokeTest() {
    console.log('--- STARTING AUDIT LOG SMOKE TEST ---');
    try {
        // 1. Create event
        console.log('1. Writing test audit log...');
        const testEvent = {
            type: 'CONTROL_PLANE_AUDIT_SMOKE_TEST',
            tenantId: 'system',
            userId: 'smoke-tester',
            status: 'SUCCESS',
            metadata: {
                actor: 'smoke-tester',
                entity_type: 'SYSTEM',
                entity_id: 'audit-smoke-test',
                message: 'This is a smoke test for the audit logs repair',
                trace_id: `smoke-${Date.now()}`
            }
        };

        await auditLogger.log(testEvent);
        console.log('✓ Successfully called auditLogger.log()');

        // Wait a brief moment to ensure DB flush
        await new Promise(r => setTimeout(r, 1000));

        // 2. Verify in DB directly
        console.log('2. Verifying in DB...');
        const rows = await db.query(
            "SELECT * FROM api_audit_logs WHERE event_type = 'CONTROL_PLANE_AUDIT_SMOKE_TEST' ORDER BY created_at DESC LIMIT 1"
        );
        
        if (!rows || rows.length === 0) {
            throw new Error('Test log not found in api_audit_logs table.');
        }
        
        const row = rows[0];
        console.log(`✓ DB Verification passed. Found ID: ${row.id}`);

        // 3. Verify via Express Route Logic (simulated)
        // We will just do the same query that the route does
        console.log('3. Verifying route logic...');
        const routeData = await db.query("SELECT id, event_type, tenant_id, user_id, status, metadata_json, created_at FROM api_audit_logs WHERE event_type LIKE '%SMOKE_TEST%' ORDER BY created_at DESC LIMIT 1");
        if (!routeData || routeData.length === 0) {
            throw new Error('Test log not found using route query.');
        }
        console.log('✓ Route logic verification passed.');
        
        console.log('--- SMOKE TEST SUCCESS ---');
        process.exit(0);

    } catch (err) {
        console.error('--- SMOKE TEST FAILED ---');
        console.error(err);
        process.exit(1);
    }
}

runSmokeTest();
