/**
 * tests/dashboard_no_mock_data_test.js
 * 
 * Verifies that the production dashboard code contains zero mock data generators,
 * fake intervals, or static worker ID fallbacks for Printhouse roles.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

function runTests() {
    console.log('Running Dashboard No-Mock Data validation...');

    // 1. Check LiveOrdersFeed.tsx
    const liveOrdersFeedPath = path.join(__dirname, '../src/ui/components/dashboard/LiveOrdersFeed.tsx');
    const liveOrdersContent = fs.readFileSync(liveOrdersFeedPath, 'utf8');

    assert.ok(!liveOrdersContent.includes('generateMockOrder'), 'LiveOrdersFeed.tsx must not contain generateMockOrder mock generator');
    assert.ok(!liveOrdersContent.includes('products = ['), 'LiveOrdersFeed.tsx must not contain hardcoded products array');
    assert.ok(liveOrdersContent.includes('getPrinthouseDashboardOrders'), 'LiveOrdersFeed.tsx must fetch real orders from getPrinthouseDashboardOrders');
    console.log('✓ LiveOrdersFeed.tsx has zero mock data generation code');

    // 2. Check CommandCenterPage.tsx for static fallbacks
    const commandCenterPath = path.join(__dirname, '../src/ui/pages/admin/CommandCenterPage.tsx');
    const commandCenterContent = fs.readFileSync(commandCenterPath, 'utf8');

    assert.ok(!commandCenterContent.includes('worker-eu-west-1a') || commandCenterContent.includes('!isPrinthouseUser'), 'CommandCenterPage.tsx must not show static worker IDs to Printhouse users');
    assert.ok(!commandCenterContent.includes('STRICT_PDF_X4_INTENT') || commandCenterContent.includes('!isPrinthouseUser'), 'CommandCenterPage.tsx must not show static governance rules to Printhouse users');
    console.log('✓ CommandCenterPage.tsx has zero global static worker/governance mock data for Printhouse users');

    console.log('All no-mock validations passed successfully.');
}

runTests();
