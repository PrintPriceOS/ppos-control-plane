/**
 * src/api/middleware/auth.js
 * 
 * Secure Bearer JWT & Break-glass Auth logic for PPOS Control Plane.
 */
const jwt = require('jsonwebtoken');
const auditLogger = require('../services/auditLoggerService');

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || 'ppos:control';
const JWT_ISSUER = process.env.JWT_ISSUER || 'https://auth.printprice.pro';

if (!JWT_SECRET) {
    console.error('[FATAL-CONFIG-ERROR] JWT_SECRET is not set. Control Plane cannot start securely.');
    process.exit(1);
}

function extractBearerToken(req) {
    return String(req.headers.authorization || '')
        .replace(/^Bearer\s+/i, '')
        .trim()
        .replace(/^['"]|['"]$/g, '');
}

function isInternalControlToken(req) {
    const token = extractBearerToken(req);
    const expected = String(process.env.PPOS_CONTROL_TOKEN || '').trim().replace(/^Bearer\s+/i, '');
    return Boolean(token && expected && token === expected);
}

/**
 * Primary Authentication Middleware.
 * Enforces JWT validation and populates req.user.
 */
async function requireAdmin(req, res, next) {
    const authHeader = req.headers['authorization'];
    
    // Support bypass if already authenticated by Fastify hook
    if (req.user && (req.user.authMode === 'JWT' || req.user.authMode === 'BREAK_GLASS')) {
        return next();
    }

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        if (req.query.ticket) {
            try {
                const decoded = jwt.verify(req.query.ticket, JWT_SECRET, {
                    audience: JWT_AUDIENCE,
                    issuer: JWT_ISSUER
                });
                
                const tenantGuard = require('../services/tenantGuard');
                const db = require('../services/mysqlClient');
                let features = {};
                if (decoded.tenant_id) {
                    const [tenant] = await db.query('SELECT plan, metadata_json FROM tenants WHERE id = ?', [decoded.tenant_id]).catch(() => []);
                    if (tenant) features = tenantGuard.resolveFeatures(tenant);
                }

                req.user = {
                    id: decoded.sub,
                    email: decoded.email,
                    role: (decoded.role || 'VIEWER').toUpperCase(),
                    tenantId: decoded.tenant_id,
                    printhouseId: decoded.printhouse_id,
                    scopes: decoded.scopes || [],
                    features: features,
                    authMode: 'JWT_TICKET',
                    issuedAt: decoded.iat,
                    expiresAt: decoded.exp
                };
                return next();
            } catch (err) {
                return fail(req, res, 'Invalid or expired download ticket');
            }
        }
        return fail(req, res, 'Bearer token required');
    }

    const token = authHeader.split(' ')[1];

    // 0. Support Break-Glass token directly (Master Access)
    const breakGlassToken = process.env.PPOS_CONTROL_TOKEN;
    const enableBreakGlass = process.env.ENABLE_BREAK_GLASS_TOKEN === 'true';
    const requireJwtOnly = process.env.REQUIRE_JWT_ONLY === 'true';

    if (enableBreakGlass && breakGlassToken && token === breakGlassToken && !requireJwtOnly) {
        req.user = {
            id: 'break-glass-session',
            email: 'admin@printprice.pro',
            role: 'SUPER_ADMIN',
            tenantId: 'ppos-production',
            features: {
                DASHBOARD_ACCESS: true,
                API_ACCESS: true,
                AUTO_ROUTING: true,
                AI_MOCKUPS: true,
                AI_CHAT: true
            },
            authMode: 'BREAK_GLASS'
        };
        return next();
    }

    if (isInternalControlToken(req)) {
        req.auth = {
            type: 'system',
            actor: 'preflight-worker',
            role: 'SYSTEM',
            scopes: [
                'preflight:read',
                'preflight:write',
                'jobs:read',
                'jobs:write',
                'artifacts:write'
            ]
        };

        req.user = {
            id: 'preflight-worker',
            email: 'preflight-worker@system.local',
            role: 'SYSTEM',
            appRole: 'SYSTEM',
            tenantId: 'ppos-production-worker',
            features: {
                DASHBOARD_ACCESS: true,
                API_ACCESS: true,
                AUTO_ROUTING: true,
                AI_MOCKUPS: true,
                AI_CHAT: true
            }
        };

        console.log('[CONTROL][AUTH][SERVICE-TOKEN-ACCEPTED]', {
            route: req.originalUrl,
            actor: 'preflight-worker',
            tokenLength: extractBearerToken(req).length,
            authMode: 'PPOS_CONTROL_TOKEN'
        });

        return next();
    }

    // 1. Validate JWT
    try {
        const decoded = jwt.verify(token, JWT_SECRET, {
            audience: [JWT_AUDIENCE, 'ppos:mfa-challenge'],
            issuer: JWT_ISSUER
        });

        // Reject MFA Challenge Tokens on normal protected routes
        if (decoded.is_mfa_challenge || decoded.purpose === 'mfa_challenge' || decoded.aud === 'ppos:mfa-challenge') {
            return res.status(403).json({
                ok: false,
                error: {
                    code: 'MFA_CHALLENGE_PENDING',
                    message: 'MFA challenge token cannot access protected resources. Please complete MFA verification at /api/auth/mfa/verify first.'
                }
            });
        }

        // Transition policy for human user JWTs without jti
        const isSystemActor = decoded.sub === 'preflight-worker' || (decoded.role || '').toUpperCase() === 'SYSTEM';
        if (!decoded.jti && !isSystemActor) {
            const strictJtiRequired = process.env.STRICT_SESSION_JTI_REQUIRED === 'true' || process.env.NODE_ENV === 'production';
            if (strictJtiRequired) {
                return fail(req, res, 'Session tracking ID (jti) is required for user authentication');
            }
        }

        // Resolve Tenant features dynamically
        const tenantGuard = require('../services/tenantGuard');
        const db = require('../services/mysqlClient');
        let features = {};
        if (decoded.tenant_id) {
            const [tenant] = await db.query('SELECT plan, metadata_json FROM tenants WHERE id = ?', [decoded.tenant_id]).catch(() => []);
            if (tenant) features = tenantGuard.resolveFeatures(tenant);
        }

        // Server-Side Session Revocation & Identity Matching Check
        if (decoded.jti) {
            const userSessionService = require('../services/userSessionService');
            const sessionCheck = await userSessionService.validateSession(decoded.jti, decoded.tenant_id, decoded.sub);

            if (!sessionCheck.valid) {
                if (sessionCheck.isDbError) {
                    console.error('[AUTH-DB-ERROR]', sessionCheck.internalDiagnostic);
                    return res.status(500).json({
                        ok: false,
                        error: {
                            code: 'DATABASE_ERROR',
                            message: 'Authentication session verification temporarily unavailable'
                        }
                    });
                }

                const msg = sessionCheck.reason === 'SESSION_REVOKED'
                    ? 'Session has been revoked on the server'
                    : (sessionCheck.reason === 'SESSION_INACTIVE'
                        ? 'Session expired due to inactivity'
                        : (sessionCheck.reason === 'SESSION_USER_MISMATCH' || sessionCheck.reason === 'SESSION_TENANT_MISMATCH'
                            ? 'Session identity mismatch'
                            : 'Invalid or expired session'));
                return fail(req, res, msg);
            }
        }

        // 2. Map Industrial Identity
        req.user = {
            id: String(decoded.sub),
            email: decoded.email,
            role: (decoded.role || 'VIEWER').toUpperCase(),
            tenantId: decoded.tenant_id ? String(decoded.tenant_id) : null,
            printhouseId: decoded.printhouse_id ? String(decoded.printhouse_id) : null,
            supplierId: decoded.supplier_id ? String(decoded.supplier_id) : null,
            supplierRole: decoded.supplier_role || decoded.supplierRole || null,
            hasSupplierCapability: Boolean(decoded.has_supplier_capability || decoded.hasSupplierCapability),
            hasPrinthouseCapability: Boolean(decoded.has_printhouse_capability || decoded.hasPrinthouseCapability),
            activeContext: decoded.active_context || (decoded.supplier_id ? 'supplier' : null),
            scopes: decoded.scopes || [],
            features: features,
            authMode: 'JWT',
            sessionId: decoded.jti || null,
            issuedAt: decoded.iat,
            expiresAt: decoded.exp
        };

        // 3. Log Successful Auth (Sampling or Critical only)
        if (process.env.PPOS_LOG_AUTH_SUCCESS === 'true') {
            auditLogger.log({
                type: 'AUTH_SUCCESS',
                tenantId: req.user.tenantId || 'system',
                userId: req.user.id,
                status: 'SUCCESS',
                metadata: { method: req.method, url: req.originalUrl }
            }).catch(() => {});
        }

        next();
    } catch (err) {
        let message = 'Invalid or malformed token';
        if (err.name === 'TokenExpiredError') message = 'Token expired';
        if (err.name === 'JsonWebTokenError') message = `JWT Error: ${err.message}`;
        
        return fail(req, res, message);
    }
}

function fail(req, res, message) {
    const failureMetadata = { 
        ip: req.ip, 
        method: req.method, 
        url: req.originalUrl,
        agent: req.headers['user-agent']
    };
    
    console.warn(`[AUTH-FAILURE] Unauthorized access attempt: ${message} from ${req.ip}`);
    
    auditLogger.log({
        type: 'AUTH_DENIED',
        tenantId: 'system',
        userId: 'unauthenticated',
        status: 'FAILURE',
        metadata: { ...failureMetadata, error: message }
    }).catch(() => {});

    return res.status(401).json({ 
        ok: false, 
        error: { code: 'UNAUTHORIZED', message } 
    });
}

/**
 * Helper to extract full actor context from request.
 */
function resolveActorContext(req) {
    const user = req.user || {};
    // Industrial Hardening: Ensure role is always a string and uppercase
    const verifiedSupplier = req.verifiedSupplierContext || null;
    let role = verifiedSupplier?.role || String(user.role || user.userRole || 'VIEWER').toUpperCase();
    const email = (user.email || '').toLowerCase();
    const authMode = user.authMode || 'NONE';

    // Break-Glass or explicitly authenticated SUPER_ADMIN role
    if (authMode === 'BREAK_GLASS' || (email === 'admin@printprice.pro' && role === 'SUPER_ADMIN')) {
        role = 'SUPER_ADMIN';
    }
    
    // Header values represent client selection requests, not authoritative grants
    const requestedContext = req.headers?.['x-active-context'] ? String(req.headers['x-active-context']).toLowerCase().trim() : null;
    const requestedSupplierId = req.headers?.['x-supplier-id'] ? String(req.headers['x-supplier-id']).trim() : null;

    const baseSupplierId = verifiedSupplier?.supplierId || user.supplierId || user.supplier_id || null;

    // Check if user identity has verified supplier capabilities or roles
    const hasSupplierTokenRole = ['SUPPLIER_ADMIN', 'SUPPLIER_OPERATOR', 'SUPPLIER_VIEWER'].includes(role);
    const hasPrinthouseTokenRole = ['PRINTHOUSE_ADMIN', 'PRINTHOUSE_OPERATOR'].includes(role);

    // Context validation: Only allow 'supplier' context if user actually possesses supplier capability/role or is SUPER_ADMIN
    let effectiveActiveContext = null;
    if (requestedContext === 'supplier') {
        if (hasSupplierTokenRole || role === 'SUPER_ADMIN' || user.hasSupplierCapability || verifiedSupplier) {
            effectiveActiveContext = 'supplier';
        } else {
            effectiveActiveContext = 'printhouse';
        }
    } else if (requestedContext === 'printhouse') {
        if (hasPrinthouseTokenRole || role === 'SUPER_ADMIN' || user.hasPrinthouseCapability) {
            effectiveActiveContext = 'printhouse';
        } else {
            effectiveActiveContext = 'supplier';
        }
    } else {
        effectiveActiveContext = user.activeContext || (hasSupplierTokenRole ? 'supplier' : (hasPrinthouseTokenRole ? 'printhouse' : (user.supplierId && !user.printhouseId ? 'supplier' : null)));
    }

    // Supplier ID validation: if header requested a supplier ID, verify it matches token or known supplier
    let effectiveSupplierId = baseSupplierId;
    if (requestedSupplierId) {
        if (role === 'SUPER_ADMIN') {
            effectiveSupplierId = requestedSupplierId;
        } else if (baseSupplierId && requestedSupplierId === baseSupplierId) {
            effectiveSupplierId = requestedSupplierId;
        } else if (!baseSupplierId && hasSupplierTokenRole && user.tenantId && requestedSupplierId === user.tenantId) {
            effectiveSupplierId = requestedSupplierId;
        }
        // If mismatched, effectiveSupplierId remains baseSupplierId; header request cannot hijack another supplier
    }

    const hasVerifiedSupplierCapability = Boolean(user.hasSupplierCapability || user.has_supplier_capability || verifiedSupplier);
    const inSupplierContext = effectiveActiveContext === 'supplier';

    const isSupplierUser = hasSupplierTokenRole || (hasVerifiedSupplierCapability && inSupplierContext) || Boolean(verifiedSupplier);
    // Orthogonal RBAC: ZERO inheritance of ADMIN from printhouse roles.
    // Supplier roles are resolved strictly from user supplier role or supplier memberships.
    const effectiveSupplierRole = verifiedSupplier?.role || user.supplierRole || (hasSupplierTokenRole ? role : null);
    const isSupplierAdmin = effectiveSupplierRole === 'SUPPLIER_ADMIN';
    const isSupplierOperator = ['SUPPLIER_ADMIN', 'SUPPLIER_OPERATOR'].includes(effectiveSupplierRole);
    const isSupplierViewer = isSupplierUser;

    const actorContext = {
        userId: user.id || 'anonymous',
        role,
        tenantId: verifiedSupplier?.tenantId || user.tenantId,
        printhouseId: user.printhouseId,
        supplierId: effectiveSupplierId,
        activeContext: effectiveActiveContext,
        isSuperAdmin: role === 'SUPER_ADMIN',
        isMachine: !!user.isMachine || role === 'WORKER_AGENT',
        isPrinthouseUser: hasPrinthouseTokenRole,
        isSupplierUser,
        isSupplierAdmin,
        isSupplierOperator,
        isSupplierViewer,
        authMode
    };

    req.actor = actorContext;
    return actorContext;
}


/**
 * RBAC Enforcement Middleware.
 * Enforces role hierarchy and permission matrix.
 * 
 * Hierarchy:
 * SUPER_ADMIN (100) > OPS_ADMIN / SYSTEM_ADMIN (90) > TENANT_ADMIN / PRINTHOUSE_ADMIN (50) > OPERATOR / PRINTHOUSE_OPERATOR (20) > VIEWER (10)
 * Note: Supplier roles are explicitly orthogonal to printhouse hierarchy and have 0 inheritance.
 */
const ROLE_HIERARCHY = {
    'SUPER_ADMIN': 100,
    'OPS_ADMIN': 90,
    'SYSTEM_ADMIN': 90,
    'TENANT_ADMIN': 50,
    'PRINTHOUSE_ADMIN': 50,
    'OPERATOR': 20,
    'PRINTHOUSE_OPERATOR': 20,
    'VIEWER': 10
};

function requireRole(minRole) {
    const minRoleKey = String(minRole || '').toUpperCase();
    // Fail-closed: Unknown required role requires level 999 (impossibility for normal roles)
    const minLevel = Object.prototype.hasOwnProperty.call(ROLE_HIERARCHY, minRoleKey) ? ROLE_HIERARCHY[minRoleKey] : 999;
    
    return (req, res, next) => {
        const context = resolveActorContext(req);
        // Fail-closed: Unknown user role defaults to level 0 (Supplier roles have level 0 here)
        const userLevel = Object.prototype.hasOwnProperty.call(ROLE_HIERARCHY, context.role) ? ROLE_HIERARCHY[context.role] : 0;

        if (userLevel >= minLevel && minLevel !== 999) {
            return next();
        }

        return res.status(403).json({ 
            ok: false, 
            error: { 
                code: 'FORBIDDEN', 
                message: `Insufficient permissions. Required: ${minRole}, Current: ${context.role}` 
            } 
        });
    };
}

/**
 * Middleware to enforce Printhouse scope.
 * Returns 401 when no authenticated identity is present.
 * Returns 403 when identity is present but role is not Printhouse.
 */
function requirePrinthouseScope() {
    return (req, res, next) => {
        // 401: No identity — token missing, expired, or invalid
        if (!req.user) {
            return res.status(401).json({
                ok: false,
                error: { code: 'UNAUTHORIZED', message: 'Authentication required' }
            });
        }
        const { isPrinthouseUser, isSuperAdmin } = resolveActorContext(req);
        if (isPrinthouseUser || isSuperAdmin) {
            return next();
        }
        // 403: Identity present but role insufficient
        return res.status(403).json({ 
            ok: false, 
            error: { code: 'FORBIDDEN', message: 'This route requires a Printhouse scope' } 
        });
    };
}

const KNOWN_SUPPLIER_CAPABILITIES = ['VIEWER', 'OPERATOR', 'ADMIN'];

/**
 * Middleware to enforce Supplier scope and capabilities.
 * Orthogonal to printhouse roles — rejects printhouse-only users with 403.
 * Fails closed on any unknown capability requested.
 */
function requireSupplierScope(minCapability = 'VIEWER') {
    const cap = String(minCapability || 'VIEWER').toUpperCase();
    const isKnownCap = KNOWN_SUPPLIER_CAPABILITIES.includes(cap);

    return async (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                ok: false,
                error: { code: 'UNAUTHORIZED', message: 'Authentication required' }
            });
        }

        const context = resolveActorContext(req);
        if (context.isSuperAdmin) {
            return next();
        }

        // Fail-closed on unknown required capability
        if (!isKnownCap) {
            return res.status(403).json({
                ok: false,
                error: { code: 'FORBIDDEN_UNKNOWN_CAPABILITY', message: `Unknown required supplier capability: ${minCapability}` }
            });
        }

        // Dynamic server-side verification: Query supplier_memberships and tenant_capabilities
        // Requires SIMULTANEOUS active membership AND active PAPER_SUPPLIER capability on the tenant.
        // Zero catch swallowing DB errors; zero fallback to JWT role.
        try {
            const db = require('../services/mysqlClient');
            const targetSupplierId = context.supplierId;
            const targetTenantId = context.tenantId;

            if (!targetSupplierId || !targetTenantId || !context.userId || !context.isSupplierUser) {
                return res.status(403).json({
                    ok: false,
                    error: { code: 'FORBIDDEN', message: 'This route requires a Paper Supplier role' }
                });
            }

            // 1. Verify active supplier membership in database (no catch swallowing errors)
            const membershipRows = await db.query(
                `SELECT supplier_role, is_active, tenant_id FROM supplier_memberships WHERE user_id = ? AND supplier_id = ?`,
                [context.userId, targetSupplierId]
            );
            const membership = Array.isArray(membershipRows) ? (Array.isArray(membershipRows[0]) ? membershipRows[0][0] : membershipRows[0]) : null;

            if (!membership) {
                return res.status(403).json({
                    ok: false,
                    error: { code: 'FORBIDDEN_MEMBERSHIP_REQUIRED', message: 'No supplier membership found for this user' }
                });
            }

            if (!membership.is_active) {
                return res.status(403).json({
                    ok: false,
                    error: { code: 'FORBIDDEN_MEMBERSHIP_DEACTIVATED', message: 'Supplier membership has been deactivated on the server' }
                });
            }

            // Coherence check: membership tenant must match request tenant
            if (membership.tenant_id && membership.tenant_id !== targetTenantId) {
                return res.status(403).json({
                    ok: false,
                    error: { code: 'FORBIDDEN_MEMBERSHIP_TENANT_MISMATCH', message: 'Supplier membership tenant does not match request tenant' }
                });
            }

            // 2. Verify active PAPER_SUPPLIER capability on tenant (no catch swallowing errors)
            const capRows = await db.query(
                `SELECT is_active FROM tenant_capabilities WHERE tenant_id = ? AND capability = 'PAPER_SUPPLIER'`,
                [targetTenantId]
            );
            const capRow = Array.isArray(capRows) ? (Array.isArray(capRows[0]) ? capRows[0][0] : capRows[0]) : null;

            if (!capRow) {
                return res.status(403).json({
                    ok: false,
                    error: { code: 'FORBIDDEN_CAPABILITY_REQUIRED', message: 'Paper supplier capability is not configured for this tenant' }
                });
            }

            if (!capRow.is_active) {
                return res.status(403).json({
                    ok: false,
                    error: { code: 'FORBIDDEN_CAPABILITY_DEACTIVATED', message: 'Paper supplier capability has been deactivated for this tenant' }
                });
            }

            // 3. Effective supplier role is strictly derived from DB membership
            const effectiveSupplierRole = String(membership.supplier_role || 'SUPPLIER_VIEWER').toUpperCase();

            // Persist verified context into request so subsequent handlers and resolveActorContext reuse it
            req.verifiedSupplierContext = {
                role: effectiveSupplierRole,
                supplierId: targetSupplierId,
                tenantId: targetTenantId,
                userId: context.userId
            };

            // Mutate req.user in place to guarantee no downstream JWT recalculation
            if (req.user) {
                req.user.role = effectiveSupplierRole;
                req.user.supplierRole = effectiveSupplierRole;
                req.user.effectiveSupplierRole = effectiveSupplierRole;
                req.user.isSupplierAdmin = effectiveSupplierRole === 'SUPPLIER_ADMIN';
                req.user.isSupplierOperator = ['SUPPLIER_ADMIN', 'SUPPLIER_OPERATOR'].includes(effectiveSupplierRole);
                req.user.isSupplierViewer = true;
            }

            // Re-resolve or update actor context
            const verifiedActor = resolveActorContext(req);

            if (cap === 'ADMIN' && !verifiedActor.isSupplierAdmin) {
                return res.status(403).json({
                    ok: false,
                    error: { code: 'FORBIDDEN', message: 'This operation requires SUPPLIER_ADMIN role' }
                });
            }
            if (cap === 'OPERATOR' && !verifiedActor.isSupplierOperator) {
                return res.status(403).json({
                    ok: false,
                    error: { code: 'FORBIDDEN', message: 'This operation requires SUPPLIER_OPERATOR or SUPPLIER_ADMIN role' }
                });
            }

            next();
        } catch (dbErr) {
            console.error('[AUTH-SUPPLIER-SCOPE-DB-ERROR]', dbErr);
            return res.status(500).json({
                ok: false,
                error: { code: 'DATABASE_ERROR', message: 'Supplier permission verification temporarily unavailable' }
            });
        }
    };
}

/**
 * Middleware to ensure Supplier is ACTIVE/APPROVED.
 * Fails closed if supplier record does not exist or database fails.
 */
async function requireApprovedSupplier(req, res, next) {
    const context = resolveActorContext(req);
    if (context.isSuperAdmin) return next();

    const targetSupplierId = context.supplierId;
    if (!targetSupplierId) {
        return res.status(403).json({
            ok: false,
            error: { code: 'SUPPLIER_IDENTITY_REQUIRED', message: 'No authenticated supplier identity resolved on the server.' }
        });
    }

    try {
        const db = require('../services/mysqlClient');
        const rows = await db.query(
            'SELECT id, status, tenant_id FROM paper_suppliers WHERE id = ?',
            [targetSupplierId]
        );
        const supplier = Array.isArray(rows) ? (Array.isArray(rows[0]) ? rows[0][0] : rows[0]) : null;

        if (!supplier) {
            return res.status(403).json({
                ok: false,
                error: { code: 'SUPPLIER_NOT_FOUND', message: 'Supplier organization record not found.' }
            });
        }

        if (supplier.status === 'SUSPENDED') {
            return res.status(403).json({
                ok: false,
                error: { code: 'SUPPLIER_SUSPENDED', message: 'Supplier organization is currently suspended.' }
            });
        }
        if (supplier.status === 'PENDING_REVIEW') {
            return res.status(403).json({
                ok: false,
                error: { code: 'SUPPLIER_PENDING_REVIEW', message: 'Supplier account is pending review by PrintPrice administration.' }
            });
        }
        if (supplier.status !== 'ACTIVE') {
            return res.status(403).json({
                ok: false,
                error: { code: 'SUPPLIER_NOT_ACTIVE', message: `Supplier account status is ${supplier.status}.` }
            });
        }

        next();
    } catch (err) {
        console.error('[AUTH-SUPPLIER-APPROVAL-CHECK-FAILED]', err);
        return res.status(500).json({ ok: false, error: { code: 'DATABASE_ERROR', message: 'Supplier security verification failed due to internal database error.' } });
    }
}

/**
 * Middleware to ensure Printhouse is ACTIVE/APPROVED.
 * Prevents pending_review or suspended printers from operating.
 */
async function requireApprovedPrinthouse(req, res, next) {
    const context = resolveActorContext(req);
    
    // Super Admin bypass
    if (context.isSuperAdmin) return next();
    
    if (!context.printhouseId) {
        return res.status(403).json({ ok: false, error: 'Printhouse context missing' });
    }

    try {
        const db = require('../services/mysqlClient');
        const [node] = await db.query('SELECT status FROM printer_nodes WHERE id = ?', [context.printhouseId]);
        
        if (!node) {
            return res.status(404).json({ ok: false, error: 'Printhouse node not found' });
        }

        if (node.status !== 'active') {
            const msg = node.status === 'pending_review' 
                ? 'Your Printhouse account is pending review by our team.'
                : `Your Printhouse account is ${node.status}. Operations are restricted.`;
            
            return res.status(403).json({ 
                ok: false, 
                error: { code: 'ACCOUNT_NOT_ACTIVE', message: msg, status: node.status } 
            });
        }

        next();
    } catch (err) {
        console.error('[AUTH-APPROVAL-CHECK-FAILED]', err);
        res.status(500).json({ ok: false, error: 'Internal security check failed' });
    }
}

module.exports = {
    requireAdmin,
    resolveActorContext,
    requireRole,
    requirePrinthouseScope,
    requireApprovedPrinthouse,
    requireSupplierScope,
    requireApprovedSupplier
};

