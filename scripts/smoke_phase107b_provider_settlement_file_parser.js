'use strict';

const fs = require('fs');
const path = require('path');
const FinancialOperationsProviderSettlementFileParserService = require('../src/api/services/financialOperationsProviderSettlementFileParserService');

let PASS = 0, FAIL = 0;
function assert(condition, label) {
    if (condition) {
        PASS++;
        console.log(`  ✅  [PASS] ${label}`);
    } else {
        FAIL++;
        console.error(`  ❌  [FAIL] ${label}`);
    }
    return condition;
}

const ROOT = path.resolve(__dirname, '..');

async function runSmoke() {
    console.log('\n━━━ Phase 107B — Provider Settlement File Parser Smoke ━━━\n');

    const svc = new FinancialOperationsProviderSettlementFileParserService();
    const actorAdmin = { role: 'SYSTEM_ADMIN', userId: 'a_1' };

    const commonPayload = {
        fileMode: 'MOCK_SETTLEMENT_FILE',
        providerKey: 'stripe_mock',
        providerType: 'PAYMENT_PROVIDER'
    };

    // SC1: Parse mock CSV settlement file
    const csvContent = "transaction_id,gross,fee,net,currency\ntxn_1,100.00,2.90,97.10,USD";
    const resCsv = await svc.parseSettlementFile({ ...commonPayload, fileFormat: 'CSV' }, csvContent, actorAdmin);
    assert(resCsv.parsed_row_count === 1 && resCsv.normalized_rows[0].transaction_reference === 'txn_1', 'SC1: Parse mock CSV settlement file');

    // SC2: Parse stubbed JSON settlement file
    const jsonContent = JSON.stringify([{ ref: 'txn_2', gross: 50.00, currency: 'EUR' }]);
    const resJson = await svc.parseSettlementFile({ ...commonPayload, fileMode: 'STUBBED_SETTLEMENT_FILE', fileFormat: 'JSON' }, jsonContent, actorAdmin);
    assert(resJson.parsed_row_count === 1 && resJson.normalized_rows[0].transaction_reference === 'txn_2', 'SC2: Parse stubbed JSON settlement file');

    // SC3: Parse dry-run NDJSON settlement file
    const ndjsonContent = '{"ref":"txn_3", "net": 9.00}\n{"ref":"txn_4", "net": 19.00}';
    const resNdjson = await svc.parseSettlementFile({ ...commonPayload, fileMode: 'DRY_RUN_SETTLEMENT_FILE', fileFormat: 'NDJSON' }, ndjsonContent, actorAdmin);
    assert(resNdjson.parsed_row_count === 2 && resNdjson.normalized_rows[1].transaction_reference === 'txn_4', 'SC3: Parse dry-run NDJSON settlement file');

    // SC4: Reject live settlement marker
    try {
        await svc.parseSettlementFile(commonPayload, '{"livemode": true, "ref":"txn_5"}', actorAdmin);
        assert(false, 'SC4: Reject live settlement marker');
    } catch (e) {
        assert(e.message.includes('Live settlement marker detected'), 'SC4: Reject live settlement marker');
    }

    // SC5: Reject plaintext secret/API key in payload
    try {
        await svc.parseSettlementFile(commonPayload, '{"ref":"txn_6", "secret_key": "sk_live_1234567890"}', actorAdmin);
        assert(false, 'SC5: Reject plaintext secret/API key in payload');
    } catch (e) {
        assert(e.message.includes('Plaintext secret detected in settlement payload'), 'SC5: Reject plaintext secret/API key in payload');
    }

    // SC6: Redacted payload does not expose secrets
    const jsonSecret = JSON.stringify([{ ref: 'txn_7', my_secret_token: 'abc123_test' }]);
    const resSecret = await svc.parseSettlementFile({ ...commonPayload, fileFormat: 'JSON' }, jsonSecret, actorAdmin);
    assert(resSecret.normalized_rows[0].redacted_payload_json.my_secret_token === '[REDACTED]', 'SC6: Redacted payload does not expose secrets');

    // SC7: Source string remains unchanged
    assert(jsonSecret.includes('abc123_test'), 'SC7: Source file object remains unchanged');

    console.log(`\n${'─'.repeat(64)}`);
    console.log(`Phase 107B Smoke Results: PASS: ${PASS} | FAIL: ${FAIL}`);
    console.log(`${'─'.repeat(64)}\n`);

    if (FAIL > 0) process.exit(1);
}

runSmoke().catch(err => {
    console.error('Smoke crashed:', err);
    process.exit(1);
});
