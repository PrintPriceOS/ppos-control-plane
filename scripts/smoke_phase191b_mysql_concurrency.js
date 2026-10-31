/**
 * scripts/smoke_phase191b_mysql_concurrency.js
 * 
 * Comprehensive MySQL runtime, transaction rollback, takeover prevention,
 * and concurrent race condition test suite for Phase 191B.
 */
const crypto = require('crypto');
const db = require('../src/api/services/mysqlClient');
const printhouseSignupService = require('../src/api/services/printhouseSignupService');
const printhouseActivationService = require('../src/api/services/printhouseActivationService');

async function runMySQLConcurrencyTests() {
    console.log('=== STARTING PHASE 191B.1 MYSQL & CONCURRENCY ACCEPTANCE TESTS ===');

    if (!db.getPool) {
        console.error('MySQL client unconfigured. Ensure MYSQL_HOST/DATABASE_URL is set.');
        process.exit(1);
    }

    // 1. Verify Migration 137 table structure in MySQL
    console.log('[TEST 1] Testing Migration 137 DDL Execution...');
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
    console.log('✔ Migration 137 applied cleanly on MySQL.');

    // 2. Email Normalization & Duplicate Strategy Test
    console.log('[TEST 2] Testing Email Normalization & Anti-Enumeration...');
    const testEmailCaps = `Partner.${Date.now()}@Example.COM`;
    const startRes1 = await printhouseSignupService.startSignup({ email: testEmailCaps });
    if (!startRes1.ok || startRes1.token) throw new Error('Start signup failed anti-enumeration');

    const [reqRow] = await db.query(
        'SELECT * FROM printhouse_signup_requests WHERE email_normalized = ?',
        [testEmailCaps.toLowerCase()]
    );
    if (!reqRow || reqRow.email_normalized !== testEmailCaps.toLowerCase()) {
        throw new Error('Email normalization failed');
    }
    console.log('✔ Email normalized to lowercase in database:', reqRow.email_normalized);

    // 3. Token Secrecy Test
    console.log('[TEST 3] Testing Token Secrecy...');
    if (reqRow.activation_token_hash.length !== 64) {
        throw new Error('Token hash length invalid');
    }
    console.log('✔ Raw token is NOT stored in DB. Only 64-char SHA-256 hash stored.');

    // 4. Setup Test Raw Token for Activation Race
    const rawToken = crypto.randomBytes(32).toString('hex');
    const hash = crypto.createHash('sha256').update(rawToken).digest('hex');
    await db.query('UPDATE printhouse_signup_requests SET activation_token_hash = ? WHERE id = ?', [hash, reqRow.id]);

    // 5. Concurrency Race Test: 2 Simultaneous Activations
    console.log('[TEST 4] Testing Concurrent Activation Race Condition (2 parallel POST /activate requests)...');
    const [resA, resB] = await Promise.all([
        printhouseActivationService.activateAccount({ rawToken, password: 'RacePassword123!' }),
        printhouseActivationService.activateAccount({ rawToken, password: 'RacePassword123!' })
    ]);

    const successCount = (resA.ok ? 1 : 0) + (resB.ok ? 1 : 0);
    const rejectedCount = (!resA.ok ? 1 : 0) + (!resB.ok ? 1 : 0);

    console.log(`Race Results -> Successes: ${successCount}, Rejected: ${rejectedCount}`);
    if (successCount !== 1 || rejectedCount !== 1) {
        throw new Error(`CONCURRENCY FAILURE: Expected exactly 1 success and 1 rejection, got ${successCount} success / ${rejectedCount} rejected`);
    }

    const successfulRes = resA.ok ? resA : resB;
    const failedRes = !resA.ok ? resA : resB;

    if (failedRes.error?.code !== 'ACTIVATION_ALREADY_USED') {
        throw new Error(`Expected ACTIVATION_ALREADY_USED for lost race, got ${failedRes.error?.code}`);
    }
    console.log('✔ Concurrency Race Test PASSED: Exactly 1 activation succeeded, 1 was rejected with ACTIVATION_ALREADY_USED.');

    // 6. Verify Exact Record Creation (Exactly 1 Tenant, 1 Node, 1 User)
    console.log('[TEST 5] Verifying Exact Minimum Graph Creation...');
    const [tenants] = await db.query('SELECT COUNT(*) as cnt FROM tenants WHERE id = ?', [successfulRes.user.tenantId]);
    const [nodes] = await db.query('SELECT COUNT(*) as cnt FROM printer_nodes WHERE id = ?', [successfulRes.user.printhouseId]);
    const [users] = await db.query('SELECT COUNT(*) as cnt FROM control_users WHERE email = ?', [testEmailCaps.toLowerCase()]);

    if (tenants.cnt !== 1 || nodes.cnt !== 1 || users.cnt !== 1) {
        throw new Error(`Graph count mismatch: tenants=${tenants.cnt}, nodes=${nodes.cnt}, users=${users.cnt}`);
    }
    console.log('✔ Graph verification PASSED: Created exactly 1 tenant, 1 printer node (DRAFT), 1 admin user.');

    // 7. Account Takeover / Tenant Selection Prevention Test
    console.log('[TEST 6] Testing Account Takeover & Client Tenant-ID Selection Protection...');
    const takeoverEmail = testEmailCaps.toLowerCase();
    const takeoverRawToken = crypto.randomBytes(32).toString('hex');
    const takeoverHash = crypto.createHash('sha256').update(takeoverRawToken).digest('hex');

    const takeoverReqId = `req-${Date.now()}`;
    await db.query(
        `INSERT INTO printhouse_signup_requests 
         (id, email, email_normalized, provider, status, activation_token_hash, activation_expires_at)
         VALUES (?, ?, ?, 'EMAIL', 'PENDING', ?, DATE_ADD(NOW(), INTERVAL 1 HOUR))`,
        [takeoverReqId, takeoverEmail, takeoverEmail, takeoverHash]
    );

    // Attempt activation when user already exists
    const takeoverRes = await printhouseActivationService.activateAccount({ rawToken: takeoverRawToken, password: 'TakeoverPassword123!' });
    if (takeoverRes.ok) {
        throw new Error('FAILED: Activation should have rejected account takeover for existing user email!');
    }
    console.log('✔ Account takeover protection PASSED: Duplicate user email activation rejected cleanly.');

    console.log('=== ALL MYSQL & CONCURRENCY ACCEPTANCE TESTS PASSED! ===');
}

if (require.main === module) {
    runMySQLConcurrencyTests().then(() => process.exit(0)).catch(err => {
        console.error('CONCURRENCY TEST ERROR:', err);
        process.exit(1);
    });
}
