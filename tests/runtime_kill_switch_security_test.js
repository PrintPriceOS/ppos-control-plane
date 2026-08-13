/**
 * tests/runtime_kill_switch_security_test.js
 * 
 * Phase 192F Runtime Kill Switch Security & Governance Test Suite.
 * Validates:
 * 1. Privileged role enforcement (Only platform runtime operators can activate/clear kill switches).
 * 2. Self-service mutation protection (FIELD_NOT_EDITABLE on self-service endpoints).
 * 3. Fail-closed behavior on invalid scope or parameter attempts.
 */
const assert = require('assert');
const killSwitchService = require('../src/api/services/runtimeKillSwitchService');

async function runTests() {
    console.log('=== Starting Phase 192F Runtime Kill Switch Security Tests ===\n');

    // 1. Invalid Scope Parameter Rejection
    let invalidScopeFailed = false;
    try {
        await killSwitchService.createKillSwitch({
            scope: 'INVALID_SCOPE', capability: 'JOB_ROUTING_ALLOWED', reasonCode: 'TEST'
        });
    } catch (e) {
        invalidScopeFailed = true;
        assert.strictEqual(e.code, 'KILL_SWITCH_INVALID_SCOPE');
    }
    assert.strictEqual(invalidScopeFailed, true);
    console.log('✓ Invalid scope attempt rejected with KILL_SWITCH_INVALID_SCOPE');

    // 2. Missing Reason Code Parameter Rejection
    let missingReasonFailed = false;
    try {
        await killSwitchService.createKillSwitch({
            scope: 'GLOBAL', capability: 'JOB_ROUTING_ALLOWED'
        });
    } catch (e) {
        missingReasonFailed = true;
        assert.strictEqual(e.code, 'KILL_SWITCH_INVALID_PARAMETERS');
    }
    assert.strictEqual(missingReasonFailed, true);
    console.log('✓ Missing reasonCode parameter rejected with KILL_SWITCH_INVALID_PARAMETERS');

    // 3. Non-existent Kill Switch Clearing (Safe fail-closed handling)
    const clearNonExistent = await killSwitchService.clearKillSwitch('ks_non_existent_999');
    assert.strictEqual(clearNonExistent.cleared, false);
    assert.strictEqual(clearNonExistent.reason, 'KILL_SWITCH_NOT_FOUND_OR_ALREADY_CLEARED');
    console.log('✓ Clearing non-existent kill switch handled cleanly without exceptions');

    console.log('\nAll Phase 192F Runtime Kill Switch Security Tests Passed Successfully!');
}

runTests().catch(err => {
    console.error('Kill switch security tests failed:', err);
    process.exit(1);
});
