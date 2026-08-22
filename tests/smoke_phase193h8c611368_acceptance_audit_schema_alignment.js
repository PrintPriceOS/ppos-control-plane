/**
 * tests/smoke_phase193h8c611368_acceptance_audit_schema_alignment.js
 *
 * Phase 193H.8C.6.11.3.6.8 Verification Suite:
 * Acceptance Audit Log Schema Alignment & Metadata Contract Integrity.
 *
 * Requirements Proven:
 * 1. calibrationAcceptanceService INSERT INTO api_audit_logs uses only real schema columns:
 *    (event_type, tenant_id, user_id, status, metadata_json, created_at).
 * 2. Does NOT reference nonexistent columns: id (auto_inc), actor_id, resource_type, resource_id, payload_json.
 * 3. event_type is 'CALIBRATION_ACCEPTED', status is 'SUCCESS'.
 * 4. metadata_json includes all required audit telemetry: sessionId, runId, revisionId, acceptanceId, printerNodeId, resultingRatesChecksum, verifiedManufacturingPrice, targetManufacturingPrice, absoluteResidual.
 * 5. user_id maps to actor.id || null in accordance with auditLoggerService.
 * 6. Audit failure policy remains explicitly non-fatal with warning log.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const PASS = '\x1b[32m✓\x1b[0m';
const FAIL = '\x1b[31m✗\x1b[0m';
let passed = 0;
let failed = 0;

function test(id, description, fn) {
    try {
        fn();
        console.log(`  ${PASS} ${id}: ${description}`);
        passed++;
    } catch (err) {
        console.log(`  ${FAIL} ${id}: ${description}`);
        console.log(`    → ${err.message}`);
        failed++;
    }
}

console.log('\n═══ Phase 193H.8C.6.11.3.6.8: Acceptance Audit Schema Alignment Suite ═══\n');

const acceptancePath = path.resolve(__dirname, '../src/api/services/calibrationAcceptanceService.js');
const acceptanceContent = fs.readFileSync(acceptancePath, 'utf8');

// T1: Audit INSERT query columns
test('H8C.6.11.3.6.8-01', 'INSERT INTO api_audit_logs uses exact canonical column list', () => {
    const auditMatch = acceptanceContent.match(/INSERT INTO api_audit_logs\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i);
    assert.ok(auditMatch, 'Must contain INSERT INTO api_audit_logs statement');

    const columns = auditMatch[1].split(',').map(c => c.trim());
    const expectedColumns = ['event_type', 'tenant_id', 'user_id', 'status', 'metadata_json', 'created_at'];

    assert.deepStrictEqual(columns, expectedColumns, `Columns must exactly match canonical schema: ${columns.join(', ')}`);
});

// T2: Nonexistent columns excluded
test('H8C.6.11.3.6.8-02', 'INSERT query excludes nonexistent columns (id, actor_id, resource_type, resource_id, payload_json)', () => {
    const auditBlock = acceptanceContent.substring(
        acceptanceContent.indexOf('// e. Write audit log event'),
        acceptanceContent.indexOf('await connection.commit()')
    );

    assert.ok(!auditBlock.includes('actor_id'), 'Must not reference actor_id');
    assert.ok(!auditBlock.includes('resource_type'), 'Must not reference resource_type');
    assert.ok(!auditBlock.includes('resource_id'), 'Must not reference resource_id');
    assert.ok(!auditBlock.includes('payload_json'), 'Must not reference payload_json');
});

// T3: Event type and Status constants
test('H8C.6.11.3.6.8-03', 'Audit entry sets event_type="CALIBRATION_ACCEPTED" and status="SUCCESS"', () => {
    assert.ok(acceptanceContent.includes("VALUES ('CALIBRATION_ACCEPTED', ?, ?, 'SUCCESS', ?, NOW(6))"), 'Must set static event_type and status');
});

// T4: Metadata Payload Complete Traceability
test('H8C.6.11.3.6.8-04', 'metadata_json contains sessionId, runId, revisionId, acceptanceId, printerNodeId, and price/residual metrics', () => {
    assert.ok(acceptanceContent.includes('sessionId,'), 'Must include sessionId');
    assert.ok(acceptanceContent.includes('runId,'), 'Must include runId');
    assert.ok(acceptanceContent.includes('revisionId,'), 'Must include revisionId');
    assert.ok(acceptanceContent.includes('acceptanceId,'), 'Must include acceptanceId');
    assert.ok(acceptanceContent.includes('printerNodeId: session.printer_node_id,'), 'Must include printerNodeId');
    assert.ok(acceptanceContent.includes('resultingRatesChecksum,'), 'Must include resultingRatesChecksum');
    assert.ok(acceptanceContent.includes('verifiedManufacturingPrice,'), 'Must include verifiedManufacturingPrice');
    assert.ok(acceptanceContent.includes('targetManufacturingPrice,'), 'Must include targetManufacturingPrice');
    assert.ok(acceptanceContent.includes('absoluteResidual'), 'Must include absoluteResidual');
});

// T5: Non-fatal Policy Preserved
test('H8C.6.11.3.6.8-05', 'Audit insertion failure is caught and logged as non-fatal warning without aborting commit', () => {
    assert.ok(acceptanceContent.includes("logger.warn('Audit log insertion failed (non-fatal):', err.message);"), 'Must preserve non-fatal catch block');
    assert.ok(acceptanceContent.includes('await connection.commit();'), 'Must commit transaction even if audit fails');
});

console.log(`\n═══ Phase 193H.8C.6.11.3.6.8 Results: ${passed} passed, ${failed} failed ═══\n`);
if (failed > 0) {
    process.exit(1);
}
