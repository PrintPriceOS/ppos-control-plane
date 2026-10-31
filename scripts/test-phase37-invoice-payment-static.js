/**
 * scripts/test-phase37-invoice-payment-static.js
 *
 * Static verification test suite for Phase 37.1.
 * Confirms syntax validity and ensures all required exports exist
 * in the marketplaceInvoicePaymentService.
 */

'use strict';

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function assert(condition, message) {
    if (condition) {
        passed++;
        console.log(`  ✅ PASS: ${message}`);
    } else {
        failed++;
        console.error(`  ❌ FAIL: ${message}`);
    }
}

console.log('\n=============================================================');
console.log('📋 PHASE 37.1 STATIC VERIFICATION TESTS 📋');
console.log('=============================================================\n');

// 1. Check exports from marketplaceInvoicePaymentService
console.log('--- Checking service exports ---');
try {
    const servicePath = path.join(__dirname, '../src/api/services/marketplaceInvoicePaymentService.js');
    assert(fs.existsSync(servicePath), 'marketplaceInvoicePaymentService.js file exists');

    const service = require(servicePath);
    
    assert(typeof service.generateMarketplaceInvoice === 'function', 'Exports generateMarketplaceInvoice');
    assert(typeof service.requestMarketplacePaymentLink === 'function', 'Exports requestMarketplacePaymentLink');
    assert(typeof service.getMarketplaceInvoicePaymentStatus === 'function', 'Exports getMarketplaceInvoicePaymentStatus');
    assert(typeof service.markMarketplacePaymentConfirmed === 'function', 'Exports markMarketplacePaymentConfirmed');
} catch (err) {
    failed++;
    console.error('Failed to load/verify marketplaceInvoicePaymentService:', err);
}

// 2. Check route file syntax and existence
console.log('\n--- Checking routes file ---');
try {
    const routesPath = path.join(__dirname, '../src/api/routes/adminMarketplaceOrders.js');
    assert(fs.existsSync(routesPath), 'adminMarketplaceOrders.js file exists');
    
    // Attempting to require it. Express router might require dependencies but since
    // it's a module, requiring it directly will verify syntax of all imported dependencies.
    const router = require(routesPath);
    assert(typeof router === 'function', 'adminMarketplaceOrders.js exports express router function');
} catch (err) {
    failed++;
    console.error('Failed to load/verify adminMarketplaceOrders.js:', err);
}

console.log('\n=============================================================');
console.log(`📋 STATIC TESTS RESULT: ${passed} PASSED, ${failed} FAILED`);
console.log('=============================================================');

process.exit(failed > 0 ? 1 : 0);
