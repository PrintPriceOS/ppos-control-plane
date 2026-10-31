/**
 * tests/security_frontend_route_visibility_test.js
 * 
 * Tests frontend sidebar navigation configuration to ensure administrative routes
 * are hidden from PRINTHOUSE_ADMIN and PRINTHOUSE_OPERATOR roles.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

async function runTests() {
    console.log('Running Frontend Route Visibility tests...');

    const configPath = path.resolve(__dirname, '../src/ui/config/controlPlaneNavigation.ts');
    const content = fs.readFileSync(configPath, 'utf8');

    // Simple parser to extract NavItems and their permitted roles
    const regex = /\{\s*id:\s*'([^']+)',[^}]+path:\s*'([^']+)',[^}]+roles:\s*\[([^\]]+)\]\s*\}/g;
    let match;
    const items = [];
    
    while ((match = regex.exec(content)) !== null) {
        const id = match[1];
        const routePath = match[2];
        const roles = match[3].replace(/['"\s]/g, '').split(',');
        items.push({ id, path: routePath, roles });
    }

    assert(items.length > 0, 'Should parse navigation config successfully');

    // 1. Printhouse Operator visibility limits
    const operatorItems = items.filter(item => item.roles.includes('PRINTHOUSE_OPERATOR'));
    
    // Should NOT see admin/ops pages
    operatorItems.forEach(item => {
        assert(!item.path.startsWith('/admin'), `PRINTHOUSE_OPERATOR must not see admin routes: ${item.path}`);
        assert(item.id !== 'tenants', `PRINTHOUSE_OPERATOR must not see Tenant Management`);
        assert(item.id !== 'intelligence', `PRINTHOUSE_OPERATOR must not see Intelligence Layer`);
    });
    console.log('✓ PRINTHOUSE_OPERATOR sidebar navigation restricted correctly');

    // 2. Printhouse Admin visibility limits
    const adminItems = items.filter(item => item.roles.includes('PRINTHOUSE_ADMIN'));
    adminItems.forEach(item => {
        assert(!item.path.startsWith('/admin'), `PRINTHOUSE_ADMIN must not see admin routes: ${item.path}`);
        assert(item.id !== 'tenants', `PRINTHOUSE_ADMIN must not see Tenant Management`);
    });
    console.log('✓ PRINTHOUSE_ADMIN sidebar navigation restricted correctly');

    console.log('All Frontend Route Visibility tests passed!');
}

runTests().catch(err => {
    console.error('Frontend Route Visibility test failed:', err);
    process.exit(1);
});
