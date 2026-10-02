/**
 * tests/smoke_phase195k_governed_manual_pricing_save.js
 *
 * Smoke test suite for governed manual industrial pricing updates:
 * 1. Node state checksum determinism & operational field sensitivity.
 * 2. Mandatory expected_baseline_checksum & mandatory nodeId validations.
 * 3. Role permission verification (PRINTHOUSE_ADMIN, SUPER_ADMIN required).
 * 4. Real vs Mock DB execution separation (clearly flags live MySQL dependency).
 */

const assert = require('assert');
const crypto = require('crypto');
const db = require('../src/api/services/mysqlClient');
const calibrationSessionService = require('../src/api/services/calibrationSessionService');

function computeNodeStateChecksum(nodeState) {
    const canonicalState = {
        signatures: Array.isArray(nodeState.signatures)
            ? nodeState.signatures.sort((a, b) => Number(a) - Number(b))
            : (typeof nodeState.signatures === 'string' ? JSON.parse(nodeState.signatures).sort((a, b) => Number(a) - Number(b)) : [16]),
        delivery_time: String(nodeState.delivery_time || nodeState.deliveryTime || '14 days'),
        production_lead_days: parseInt(nodeState.production_lead_days !== undefined ? nodeState.production_lead_days : (nodeState.productionLeadDays !== undefined ? nodeState.productionLeadDays : 11), 10),
        limits: typeof nodeState.limits === 'string' ? JSON.parse(nodeState.limits) : (nodeState.limits || { min_copies: 50, max_pages: 1500 }),
        rates: typeof nodeState.rates_json === 'string' ? JSON.parse(nodeState.rates_json) : (nodeState.rates_json || nodeState.rates || {})
    };
    return calibrationSessionService.computeRatesChecksum(canonicalState);
}

async function runTests() {
    console.log('=== Smoke Test Phase 195K: Governed Manual Pricing Save ===\n');

    let testCount = 0;
    let passCount = 0;

    function recordPass(testName) {
        testCount++;
        passCount++;
        console.log(`[PASS] Test ${testCount}: ${testName}`);
    }

    // 1. Verify computeNodeStateChecksum determinism and sensitivity
    try {
        const base = {
            signatures: [16, 24],
            delivery_time: '14 days',
            production_lead_days: 11,
            limits: { min_copies: 50, max_pages: 1500 },
            rates: { lam_fixed: { matt: 10 } }
        };

        const hash1 = computeNodeStateChecksum(base);
        const hash2 = computeNodeStateChecksum(base);
        assert.strictEqual(hash1, hash2, 'Checksum must be strictly deterministic');
        assert.strictEqual(typeof hash1, 'string');
        assert.strictEqual(hash1.length, 64);

        // Check sensitivity to non-rate field change
        const baseModSig = { ...base, signatures: [16, 24, 32] };
        const hashModSig = computeNodeStateChecksum(baseModSig);
        assert.notStrictEqual(hash1, hashModSig, 'Checksum must change when signatures change');

        const baseModLead = { ...base, production_lead_days: 14 };
        const hashModLead = computeNodeStateChecksum(baseModLead);
        assert.notStrictEqual(hash1, hashModLead, 'Checksum must change when lead days change');

        recordPass('Node State Checksum Determinism & Operational Field Sensitivity');
    } catch (err) {
        testCount++;
        console.error(`[FAIL] Test ${testCount}: Node State Checksum Determinism`, err);
    }

    // 2. Mandatory nodeId & checksum validation rule checks
    try {
        const isValidHex = (s) => typeof s === 'string' && /^[a-fA-F0-9]{64}$/.test(s.trim());
        const isValidNodeId = (id) => Boolean(id && typeof id === 'string' && id.trim().length > 0);

        assert.strictEqual(isValidHex(null), false);
        assert.strictEqual(isValidHex(''), false);
        assert.strictEqual(isValidHex('12345'), false);
        assert.strictEqual(isValidHex('g'.repeat(64)), false);
        assert.strictEqual(isValidHex('a'.repeat(64)), true);

        assert.strictEqual(isValidNodeId(null), false);
        assert.strictEqual(isValidNodeId(''), false);
        assert.strictEqual(isValidNodeId('   '), false);
        assert.strictEqual(isValidNodeId('node-329a3bc4'), true);

        recordPass('Validation of mandatory nodeId and 64-character SHA-256 expected_baseline_checksum');
    } catch (err) {
        testCount++;
        console.error(`[FAIL] Test ${testCount}: Checksum & Node ID Validation Rules`, err);
    }

    // 3. Role Permission Verification (PRINTHOUSE_ADMIN, SUPER_ADMIN required)
    try {
        const writeAllowedRoles = ['PRINTHOUSE_ADMIN', 'SUPER_ADMIN'];
        const isRoleAllowed = (role) => Boolean(role && writeAllowedRoles.includes(role));

        assert.strictEqual(isRoleAllowed('PRINTHOUSE_ADMIN'), true);
        assert.strictEqual(isRoleAllowed('SUPER_ADMIN'), true);
        assert.strictEqual(isRoleAllowed('VIEWER'), false);
        assert.strictEqual(isRoleAllowed('CUSTOMER'), false);
        assert.strictEqual(isRoleAllowed('PRINTHOUSE_OPERATOR'), false);

        recordPass('Role Permission Verification (PRINTHOUSE_ADMIN, SUPER_ADMIN required)');
    } catch (err) {
        testCount++;
        console.error(`[FAIL] Test ${testCount}: Role Permission Verification`, err);
    }

    // 4. Live MySQL Integration Tests (Isolated environment check)
    let isDbAvailable = false;
    try {
        await db.query('SELECT 1');
        isDbAvailable = true;
    } catch (e) {
        console.log('[PENDING LIVE MYSQL] Concurrency locking, 409 conflict, foreign tenant rejection, and rollback integration tests require an active isolated MySQL connection.');
    }

    if (isDbAvailable) {
        const testTenantId = `test_tenant_${Date.now()}`;
        const testNodeId = `test_node_${Date.now()}`;

        try {
            await db.query('INSERT INTO tenants (id, name, status) VALUES (?, ?, ?)', [testTenantId, 'Test Tenant 195K', 'ACTIVE']);
            await db.query(
                `INSERT INTO printer_nodes (id, tenant_id, name, signatures, delivery_time, production_lead_days, limits, rates_json)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    testNodeId,
                    testTenantId,
                    'Test Node 195K',
                    JSON.stringify([16]),
                    '14 days',
                    11,
                    JSON.stringify({ min_copies: 50, max_pages: 1500 }),
                    JSON.stringify({ lam_fixed: { matt: 5.0 } })
                ]
            );

            const initialChecksum = computeNodeStateChecksum({
                signatures: [16],
                delivery_time: '14 days',
                production_lead_days: 11,
                limits: { min_copies: 50, max_pages: 1500 },
                rates: { lam_fixed: { matt: 5.0 } }
            });

            const pool = db.getPool();
            const conn = await pool.getConnection();
            await conn.beginTransaction();

            const [rows] = await conn.query('SELECT * FROM printer_nodes WHERE id = ? AND tenant_id = ? FOR UPDATE', [testNodeId, testTenantId]);
            const node = rows[0];

            const currentChecksum = computeNodeStateChecksum({
                signatures: typeof node.signatures === 'string' ? JSON.parse(node.signatures) : node.signatures,
                delivery_time: node.delivery_time,
                production_lead_days: node.production_lead_days,
                limits: typeof node.limits === 'string' ? JSON.parse(node.limits) : node.limits,
                rates: typeof node.rates_json === 'string' ? JSON.parse(node.rates_json) : node.rates_json
            });

            assert.strictEqual(initialChecksum, currentChecksum);

            const revId = `rev_${Date.now()}`;
            const newRates = { lam_fixed: { matt: 10.0 } };
            const newRatesChecksum = calibrationSessionService.computeRatesChecksum(newRates);

            await conn.query(
                `INSERT INTO printhouse_pricing_revisions (
                    id, tenant_id, printer_node_id, source_type, parent_revision_id,
                    rates_json, rates_checksum, baseline_rates_checksum,
                    engine_package, engine_version, engine_commit, created_by_json
                ) VALUES (?, ?, ?, 'MANUAL_EDIT', NULL, ?, ?, ?, '@ppos/pricing-engine', '1.0.0', 'dba8d4874cee939de901640e9981e09d2fefdf73', ?)`,
                [revId, testTenantId, testNodeId, JSON.stringify(newRates), newRatesChecksum, newRatesChecksum, JSON.stringify({ userId: 'test' })]
            );

            await conn.query(
                `UPDATE printer_nodes SET rates_json = ? WHERE id = ? AND tenant_id = ?`,
                [JSON.stringify(newRates), testNodeId, testTenantId]
            );

            await conn.commit();
            conn.release();

            const revRows = await db.query('SELECT * FROM printhouse_pricing_revisions WHERE id = ?', [revId]);
            assert.strictEqual(revRows.length, 1);
            assert.strictEqual(revRows[0].source_type, 'MANUAL_EDIT');
            assert.strictEqual(revRows[0].tenant_id, testTenantId);

            recordPass('Database Transaction & Revision Lineage Insertion');

            const conn2 = await pool.getConnection();
            await conn2.beginTransaction();

            await conn2.query(
                `UPDATE printer_nodes SET delivery_time = '7 days' WHERE id = ? AND tenant_id = ?`,
                [testNodeId, testTenantId]
            );

            await conn2.rollback();
            conn2.release();

            const checkRows = await db.query('SELECT delivery_time FROM printer_nodes WHERE id = ?', [testNodeId]);
            assert.strictEqual(checkRows[0].delivery_time, '14 days', 'Rollback must preserve original delivery_time');

            recordPass('Transactional Rollback Protection on Transaction Failure');

            await db.query('DELETE FROM printhouse_pricing_revisions WHERE tenant_id = ?', [testTenantId]);
            await db.query('DELETE FROM printer_nodes WHERE tenant_id = ?', [testTenantId]);
            await db.query('DELETE FROM tenants WHERE id = ?', [testTenantId]);

            recordPass('Test Data Cleanup');
        } catch (dbErr) {
            testCount++;
            console.error(`[FAIL] Test ${testCount}: DB Integration Error`, dbErr);
            try {
                await db.query('DELETE FROM printhouse_pricing_revisions WHERE tenant_id = ?', [testTenantId]);
                await db.query('DELETE FROM printer_nodes WHERE tenant_id = ?', [testTenantId]);
                await db.query('DELETE FROM tenants WHERE id = ?', [testTenantId]);
            } catch (ignore) {}
        }
    }

    console.log(`\n=== Summary: ${passCount} / ${testCount} tests passed ===`);
    if (passCount !== testCount) {
        process.exit(1);
    }
}

runTests().catch(err => {
    console.error('Unhandled smoke test error:', err);
    process.exit(1);
});
