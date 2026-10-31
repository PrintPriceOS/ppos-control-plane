/**
 * src/api/services/PrinthouseAccessScopeService.js
 * 
 * Access Scope Resolver Service.
 * Resolves user identity, tenant scopes, and checks ownership.
 */
const { resolveActorContext } = require('../middleware/auth');

class PrinthouseAccessScopeService {
    resolveScope(req) {
        const context = resolveActorContext(req);
        
        // Clean and sanitize the scope
        return {
            userId: context.userId,
            role: context.role,
            tenantId: context.tenantId || null,
            printhouseId: context.printhouseId || null,
            isSuperAdmin: context.isSuperAdmin || false,
            isPrinthouseUser: context.isPrinthouseUser || false
        };
    }

    assertTenantAccess(scope, resourceTenantId) {
        if (scope.isSuperAdmin) return;
        if (!scope.tenantId || scope.tenantId !== resourceTenantId) {
            const error = new Error('Access Denied: Resource belongs to another tenant.');
            error.status = 403;
            throw error;
        }
    }

    assertPrinthouseAccess(scope, resourcePrinthouseId) {
        if (scope.isSuperAdmin) return;
        if (!scope.printhouseId || scope.printhouseId !== resourcePrinthouseId) {
            const error = new Error('Access Denied: Resource belongs to another printhouse.');
            error.status = 403;
            throw error;
        }
    }
}

module.exports = new PrinthouseAccessScopeService();
