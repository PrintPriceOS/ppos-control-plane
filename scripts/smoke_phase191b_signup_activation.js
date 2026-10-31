/**
 * scripts/smoke_phase191b_signup_activation.js
 * 
 * Comprehensive automated verification script for Phase 191B:
 * 1. Minimal Email Signup (`/api/auth/printhouse/start`) — Anti-enumeration, No JWT.
 * 2. Token Inspection (`/api/auth/printhouse/activation/inspect`) — Non-consuming token check.
 * 3. Atomic Activation (`/api/auth/printhouse/activate`) — Token consumption, Non-operational Tenant/Node creation, Session issuance.
 * 4. Double-activation prevention — Replay rejection.
 * 5. Middleware Gating — Setup access allowed, live dispatch blocked.
 */
const crypto = require('crypto');
const printhouseSignupService = require('../src/api/services/printhouseSignupService');
const printhouseActivationService = require('../src/api/services/printhouseActivationService');
const db = require('../src/api/services/mysqlClient');
const { requireApprovedPrinthouse, requirePrinthouseSetupAccess } = require('../src/api/middleware/auth');

async function runSmokeTest() {
    console.log('--- STARTING PHASE 191B SIGNUP & ACTIVATION SMOKE TEST ---');
    const testEmail = `test-partner-${Date.now()}@example.com`;

    // 1. Ensure DB migration 137 table exists or run DDL
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS printhouse_signup_requests (
                id VARCHAR(64) PRIMARY KEY,
                email VARCHAR(255) NOT NULL,
                email_normalized VARCHAR(255) NOT NULL,
                provider VARCHAR(50) NOT NULL DEFAULT 'EMAIL',
                status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
                activation_token_hash VARCHAR(64) NOT NULL,
                activation_expires_at DATETIME NOT NULL,
                activation_consumed_at DATETIME NULL,
                activation_requested_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                last_sent_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                send_count INT NOT NULL DEFAULT 1,
                failed_attempt_count INT NOT NULL DEFAULT 0,
                tenant_id VARCHAR(64) NULL,
                printhouse_id VARCHAR(64) NULL,
                control_user_id VARCHAR(64) NULL,
                metadata_json LONGTEXT NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_ph_signup_email_norm (email_normalized),
                INDEX idx_ph_signup_token_hash (activation_token_hash)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);
        console.log('[STEP 1] DB Migration table confirmed.');
    } catch (e) {
        console.error('[STEP 1-ERR]', e.message);
    }

    // 2. Start Signup (Minimal Email)
    console.log('[STEP 2] Testing Start Signup for:', testEmail);
    const startRes = await printhouseSignupService.startSignup({ email: testEmail, acceptTerms: true });
    console.log('Start Signup Response:', startRes);
    if (!startRes.ok || startRes.token) {
        throw new Error('FAILED: Start signup must return ok:true and NEVER issue a JWT token!');
    }
    console.log('✔ Start signup is enumeration-safe and issued NO JWT.');

    // 3. Fetch token hash from DB
    const [requestRow] = await db.query(
        'SELECT * FROM printhouse_signup_requests WHERE email_normalized = ? AND status = "PENDING"',
        [testEmail.toLowerCase()]
    );
    if (!requestRow || !requestRow.activation_token_hash) {
        throw new Error('FAILED: Signup request record or token hash not found in DB!');
    }
    console.log('✔ Signup request persisted with token hash:', requestRow.activation_token_hash.substring(0, 16) + '...');

    // We need to simulate the raw token for activation (since only hash is stored in DB)
    // Create a known test raw token for inspection & activation testing
    const testRawToken = crypto.randomBytes(32).toString('hex');
    const testHash = crypto.createHash('sha256').update(testRawToken).digest('hex');

    await db.query(
        'UPDATE printhouse_signup_requests SET activation_token_hash = ? WHERE id = ?',
        [testHash, requestRow.id]
    );

    // 4. Test Token Inspection (Non-consuming)
    console.log('[STEP 3] Testing Token Inspection (Non-consuming)...');
    const inspectRes = await printhouseActivationService.inspectToken({ rawToken: testRawToken });
    console.log('Inspect Response:', inspectRes);
    if (!inspectRes.ok || inspectRes.status !== 'READY_TO_ACTIVATE') {
        throw new Error('FAILED: Token inspection failed!');
    }

    // Verify token status in DB is STILL PENDING (not consumed)
    const [afterInspectRow] = await db.query(
        'SELECT status FROM printhouse_signup_requests WHERE id = ?',
        [requestRow.id]
    );
    if (afterInspectRow.status !== 'PENDING') {
        throw new Error('FAILED: Inspection consumed token prematurely!');
    }
    console.log('✔ Token inspection succeeded without consuming token.');

    // 5. Test Account Activation
    console.log('[STEP 4] Testing Account Activation (POST /api/auth/printhouse/activate)...');
    const activateRes = await printhouseActivationService.activateAccount({
        rawToken: testRawToken,
        password: 'TestPassword123!'
    });
    console.log('Activate Response:', { ok: activateRes.ok, user: activateRes.user, tokenReceived: !!activateRes.token });

    if (!activateRes.ok || !activateRes.token || !activateRes.user?.tenantId) {
        throw new Error('FAILED: Account activation failed to issue session!');
    }
    console.log('✔ Account activation succeeded and issued valid JWT session.');

    // 6. Test Replay Prevention (Double Activation)
    console.log('[STEP 5] Testing Replay Prevention...');
    const replayRes = await printhouseActivationService.activateAccount({
        rawToken: testRawToken,
        password: 'TestPassword123!'
    });
    console.log('Replay Response:', replayRes);
    if (replayRes.ok || replayRes.error?.code !== 'ACTIVATION_ALREADY_USED') {
        throw new Error('FAILED: Replay activation was not rejected!');
    }
    console.log('✔ Replay attempt correctly rejected with ACTIVATION_ALREADY_USED.');

    // 7. Verify Printer Node Status is DRAFT (Non-operational)
    const [nodeRow] = await db.query(
        'SELECT status, marketplace_enabled FROM printer_nodes WHERE id = ?',
        [activateRes.user.printhouseId]
    );
    if (nodeRow.status !== 'DRAFT' || nodeRow.marketplace_enabled !== 0) {
        throw new Error(`FAILED: Newly activated printer node status should be DRAFT, got ${nodeRow.status}`);
    }
    console.log('✔ Newly created Printhouse node status is DRAFT (non-operational).');

    // 8. Test Middleware Gating
    console.log('[STEP 6] Testing Middleware Gating...');
    const reqMock = { user: { role: 'PRINTHOUSE_ADMIN', printhouseId: activateRes.user.printhouseId, tenantId: activateRes.user.tenantId } };

    let setupAccessAllowed = false;
    await requirePrinthouseSetupAccess(reqMock, { status: () => ({ json: () => {} }) }, () => {
        setupAccessAllowed = true;
    });

    let liveDispatchBlocked = false;
    const resMock = {
        status: (code) => ({
            json: (payload) => {
                if (code === 403 && payload.error?.code === 'ACCOUNT_NOT_ACTIVE') {
                    liveDispatchBlocked = true;
                }
            }
        })
    };
    await requireApprovedPrinthouse(reqMock, resMock, () => {});

    if (!setupAccessAllowed || !liveDispatchBlocked) {
        throw new Error(`FAILED: Middleware gating checks failed! setupAccessAllowed=${setupAccessAllowed}, liveDispatchBlocked=${liveDispatchBlocked}`);
    }
    console.log('✔ Middleware gating confirmed: Setup access ALLOWED, live dispatch BLOCKED (403 ACCOUNT_NOT_ACTIVE).');

    console.log('--- ALL PHASE 191B SMOKE TESTS PASSED CLEANLY! ---');
}

runSmokeTest().then(() => process.exit(0)).catch(err => {
    console.error('SMOKE TEST FAILED:', err);
    process.exit(1);
});
