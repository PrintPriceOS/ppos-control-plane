'use strict';

require('dotenv').config();
const mysqlClient = require('../src/api/services/mysqlClient');
const pricingReadinessService = require('../src/api/services/pricingReadinessService');

async function runAudit() {
    console.log('=== Phase 190.2 Pricing Readiness Audit ===');
    console.log('Validating production cutover status...');
    
    try {
        const summary = await pricingReadinessService.buildSanitizedOperatorSummary();
        console.log('\n[SANITIZED OPERATOR SUMMARY]');
        console.log(`Timestamp: ${summary.timestamp}`);
        console.log(`Total Printhouses: ${summary.summary.totalPrinthouses}`);
        console.log(`READY_FOR_SUPPORTED_CAPABILITIES: ${summary.summary.ready}`);
        console.log(`PARTIALLY_READY: ${summary.summary.partiallyReady}`);
        console.log(`LEGACY_NEEDS_REVIEW: ${summary.summary.legacyNeedsReview}`);
        console.log(`NOT_READY: ${summary.summary.notReady}`);
        console.log(`INVALID_STATE/ERROR: ${summary.summary.invalidState + summary.summary.error}`);
        
        console.log('\nAudit complete. No margins or PII exposed.');
    } catch (e) {
        console.error('Audit failed:', e.message);
    } finally {
        await mysqlClient.close();
    }
}

runAudit();
