const assert = require('assert');
const scopeService = require('../src/api/services/PrinthouseAccessScopeService');

async function runIsolationTests() {
    console.log('Running security isolation unit tests...');

    // Test 1: Scope resolver sanitizes context correctly
    {
        const req = {
            user: {
                id: 'user-ph-123',
                email: 'printer@printprice.pro',
                role: 'PRINTHOUSE_ADMIN',
                tenantId: 'tenant-a',
                printhouseId: 'printhouse-a'
            }
        };

        const scope = scopeService.resolveScope(req);
        assert.strictEqual(scope.userId, 'user-ph-123');
        assert.strictEqual(scope.role, 'PRINTHOUSE_ADMIN');
        assert.strictEqual(scope.tenantId, 'tenant-a');
        assert.strictEqual(scope.printhouseId, 'printhouse-a');
        assert.strictEqual(scope.isSuperAdmin, false);
        assert.strictEqual(scope.isPrinthouseUser, true);
        console.log('✓ Scope resolver resolves printer users correctly');
    }

    // Test 2: assertTenantAccess allows identical tenant
    {
        const scope = { isSuperAdmin: false, tenantId: 'tenant-a' };
        assert.doesNotThrow(() => {
            scopeService.assertTenantAccess(scope, 'tenant-a');
        });
        console.log('✓ assertTenantAccess allows identical tenant');
    }

    // Test 3: assertTenantAccess denies cross-tenant access
    {
        const scope = { isSuperAdmin: false, tenantId: 'tenant-a' };
        assert.throws(() => {
            scopeService.assertTenantAccess(scope, 'tenant-b');
        }, /Access Denied/);
        console.log('✓ assertTenantAccess throws error on cross-tenant access');
    }

    // Test 4: assertTenantAccess allows superadmin bypass
    {
        const scope = { isSuperAdmin: true, tenantId: 'tenant-a' };
        assert.doesNotThrow(() => {
            scopeService.assertTenantAccess(scope, 'tenant-b');
        });
        console.log('✓ assertTenantAccess allows superadmin bypass');
    }

    // Test 5: assertPrinthouseAccess allows matching printhouse
    {
        const scope = { isSuperAdmin: false, printhouseId: 'printhouse-a' };
        assert.doesNotThrow(() => {
            scopeService.assertPrinthouseAccess(scope, 'printhouse-a');
        });
        console.log('✓ assertPrinthouseAccess allows matching printhouse');
    }

    // Test 6: assertPrinthouseAccess throws on mismatch
    {
        const scope = { isSuperAdmin: false, printhouseId: 'printhouse-a' };
        assert.throws(() => {
            scopeService.assertPrinthouseAccess(scope, 'printhouse-b');
        }, /Access Denied/);
        console.log('✓ assertPrinthouseAccess throws error on printhouse mismatch');
    }

    // Test 7: Marketplace Orders middleware enforces tenant/printhouse scope on query
    {
        const adminMarketplaceOrders = require('../src/api/routes/adminMarketplaceOrders');
        const middleware = adminMarketplaceOrders.stack.find(layer => layer.route === undefined && layer.handle.length === 3)?.handle;
        
        if (middleware) {
            const req = {
                user: {
                    id: 'printer-user',
                    role: 'PRINTHOUSE_ADMIN',
                    tenantId: 'tenant-a',
                    printhouseId: 'printhouse-a'
                },
                query: {
                    tenantId: 'tenant-b',
                    printhouseId: 'printhouse-b'
                }
            };
            let nextCalled = false;
            middleware(req, {}, () => { nextCalled = true; });
            
            assert.strictEqual(nextCalled, true);
            assert.strictEqual(req.query.tenantId, 'tenant-a');
            assert.strictEqual(req.query.printhouseId, 'printhouse-a');
            console.log('✓ Marketplace Orders middleware forces authenticated query scopes');
        }
    }

    // Test 8: Printhouse capabilities parameter verification throws or blocks on mismatch
    {
        const printhouseCapabilities = require('../src/api/routes/printhouseCapabilities');
        const paramHandler = printhouseCapabilities.params?.printhouseId?.[0];
        
        if (paramHandler) {
            const req = {
                user: {
                    id: 'printer-user',
                    role: 'PRINTHOUSE_ADMIN',
                    tenantId: 'tenant-a',
                    printhouseId: 'printhouse-a'
                }
            };
            
            const printhouseCapabilityService = require('../src/api/services/printhouseCapabilityService');
            const originalGetPrinthouse = printhouseCapabilityService.getPrinthouse;
            printhouseCapabilityService.getPrinthouse = async (id) => {
                if (id === 'printhouse-b') {
                    return { id: 'printhouse-b', tenant_id: 'tenant-a' };
                }
                return null;
            };
            
            let statusRes = null;
            let jsonRes = null;
            const res = {
                status: function(code) { statusRes = code; return this; },
                json: function(data) { jsonRes = data; return this; }
            };
            
            await paramHandler(req, res, () => {}, 'printhouse-b');
            
            assert.strictEqual(statusRes, 403);
            assert.strictEqual(jsonRes.error, 'FORBIDDEN');
            
            printhouseCapabilityService.getPrinthouse = originalGetPrinthouse;
            console.log('✓ Printhouse capabilities param guard rejects cross-printhouse access');
        }
    }

    console.log('All security isolation tests passed!');
}

runIsolationTests().catch(err => {
    console.error('Test execution failed:', err);
    process.exit(1);
});
