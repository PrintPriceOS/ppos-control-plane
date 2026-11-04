'use strict';

/**
 * src/api/middleware/b2bOrgRbacMiddleware.js
 *
 * PrintPrice OS — Phase 16 (Option 3): B2B Multi-User Governance & Editorial RBAC Matrix
 *
 * Canonical Roles (`B2B_ORG_ROLES`):
 * 1. `ORG_ADMIN`:
 *    - Full administrative control, member lifecycle (invite, role assignment, revocation),
 *      fiscal configuration (VIES VAT, DIR3, Leitweg-ID), file upload, 3D Soft-Proof approval,
 *      and financial settlement/payment execution.
 * 2. `PRODUCTION_MANAGER`:
 *    - Binding 3D Soft-Proof Sign-off (`POST /api/customer/orders/:orderId/soft-proof/approve`),
 *      Escrow lock & CTP release, and production asset upload (`INTERIOR_PDF`, `COVER_PDF`).
 *    - Strictly blocked from executing financial payments (`403 FORBIDDEN_RBAC_FINANCE_RIGHTS_REQUIRED`).
 * 3. `FINANCE_APPROVER`:
 *    - Execution of payments (`POST /api/marketplace/orders/:orderId/checkout/session`,
 *      `POST /api/marketplace/orders/:orderId/payment/wire-proof`), EN 16931 e-Invoicing, and Escrow ledger queries.
 *    - Strictly blocked from binding 3D Soft-Proof Sign-off (`403 FORBIDDEN_RBAC_INSUFFICIENT_SIGN_OFF_RIGHTS`)
 *      and blocked from uploading production print PDFs (`403 FORBIDDEN_RBAC_ASSET_UPLOAD_RIGHTS_REQUIRED`).
 * 4. `PREPRESS_DESIGNER`:
 *    - Production asset ingestion (`/order/:orderId/files`, `/files/upload`, `/files/external-link`),
 *      Preflight report inspection, and 3D viewer inspection.
 *    - Strictly blocked from binding 3D Soft-Proof Sign-off (`403 FORBIDDEN_RBAC_INSUFFICIENT_SIGN_OFF_RIGHTS`)
 *      and blocked from executing financial payments (`403 FORBIDDEN_RBAC_FINANCE_RIGHTS_REQUIRED`).
 */

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const mysqlClient = require('../services/mysqlClient');
const logger = require('../services/logger').child('b2b-org-rbac');

const B2B_ORG_ROLES = Object.freeze({
    ORG_ADMIN: 'ORG_ADMIN',
    PRODUCTION_MANAGER: 'PRODUCTION_MANAGER',
    FINANCE_APPROVER: 'FINANCE_APPROVER',
    PREPRESS_DESIGNER: 'PREPRESS_DESIGNER'
});

const VALID_B2B_ROLES = new Set(Object.values(B2B_ORG_ROLES));

const B2B_MEMBER_STATUSES = Object.freeze({
    ACTIVE: 'ACTIVE',
    INVITED: 'INVITED',
    SUSPENDED: 'SUSPENDED'
});

const B2B_RBAC_PERMISSIONS_MATRIX = Object.freeze({
    [B2B_ORG_ROLES.ORG_ADMIN]: {
        role: B2B_ORG_ROLES.ORG_ADMIN,
        label: 'Organization Administrator',
        description: 'Control total, gestión de equipo RBAC, perfil fiscal EN 16931, Imprimátur 3D y pagos.',
        canManageMembers: true,
        canEditFiscalProfile: true,
        canApproveSoftProof: true,
        canExecutePayments: true,
        canUploadProductionFiles: true,
        canViewPreflightAnd3D: true
    },
    [B2B_ORG_ROLES.PRODUCTION_MANAGER]: {
        role: B2B_ORG_ROLES.PRODUCTION_MANAGER,
        label: 'Production & Pre-Press Manager',
        description: 'Firma vinculante de Imprimátur Digital 3D, liberación a plancha CTP y carga de artes finales.',
        canManageMembers: false,
        canEditFiscalProfile: false,
        canApproveSoftProof: true,
        canExecutePayments: false,
        canUploadProductionFiles: true,
        canViewPreflightAnd3D: true
    },
    [B2B_ORG_ROLES.FINANCE_APPROVER]: {
        role: B2B_ORG_ROLES.FINANCE_APPROVER,
        label: 'Finance & Treasury Approver',
        description: 'Ejecución de pagos Stripe/SEPA, carga de wire-proof, facturas EN 16931 y auditoría Escrow.',
        canManageMembers: false,
        canEditFiscalProfile: true,
        canApproveSoftProof: false,
        canExecutePayments: true,
        canUploadProductionFiles: false,
        canViewPreflightAnd3D: true
    },
    [B2B_ORG_ROLES.PREPRESS_DESIGNER]: {
        role: B2B_ORG_ROLES.PREPRESS_DESIGNER,
        label: 'Pre-Press & Layout Designer',
        description: 'Ingesta de PDFs de interior/cubierta, inspección Preflight y visor 3D (sin firma ni pagos).',
        canManageMembers: false,
        canEditFiscalProfile: false,
        canApproveSoftProof: false,
        canExecutePayments: false,
        canUploadProductionFiles: true,
        canViewPreflightAnd3D: true
    }
});

// In-memory store synchronized with MySQL `customer_b2b_members` & `customer_b2b_profiles.members_json`
const organizationMembersStore = new Map(); // organizationId -> Map(memberId -> memberObj)
let membersTableInitialized = false;

function buildDefaultOrgMembers(organizationId = 'org-publisher-default') {
    // Zero mock policy: clean slate organizations have no synthetic team members.
    // Colleagues must be explicitly invited via POST /api/customer/organization/members.
    return [];
}

function ensureOrgSeededInMemory(organizationId = 'org-publisher-default') {
    if (!organizationMembersStore.has(organizationId)) {
        const map = new Map();
        for (const m of buildDefaultOrgMembers(organizationId)) {
            map.set(m.memberId, m);
        }
        organizationMembersStore.set(organizationId, map);
    }
    return organizationMembersStore.get(organizationId);
}

async function ensureB2bMembersSchema() {
    if (membersTableInitialized) return;
    try {
        await mysqlClient.query(`
            CREATE TABLE IF NOT EXISTS customer_b2b_members (
                member_id VARCHAR(64) NOT NULL PRIMARY KEY,
                organization_id VARCHAR(191) NOT NULL,
                email VARCHAR(191) NOT NULL,
                full_name VARCHAR(191) NOT NULL,
                role VARCHAR(64) NOT NULL DEFAULT 'PREPRESS_DESIGNER',
                status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
                department VARCHAR(128) NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_org_id (organization_id),
                INDEX idx_member_email (email)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        try {
            await mysqlClient.query(`
                ALTER TABLE customer_b2b_profiles
                ADD COLUMN members_json JSON NULL
            `);
        } catch (_) {
            // Column already exists or table not yet created
        }
        membersTableInitialized = true;
    } catch (_) {
        // Non-fatal in isolated unit tests when MySQL is offline
    }
}

async function syncOrgMembersWithMySQL(organizationId = 'org-publisher-default') {
    const memMap = ensureOrgSeededInMemory(organizationId);
    await ensureB2bMembersSchema();

    try {
        const rows = await mysqlClient.query(
            `SELECT * FROM customer_b2b_members WHERE organization_id = ? ORDER BY created_at ASC`,
            [organizationId]
        );
        if (Array.isArray(rows) && rows.length > 0) {
            for (const r of rows) {
                const member = {
                    memberId: r.member_id,
                    organizationId: r.organization_id,
                    email: r.email,
                    fullName: r.full_name,
                    role: VALID_B2B_ROLES.has(r.role) ? r.role : B2B_ORG_ROLES.PREPRESS_DESIGNER,
                    status: r.status || B2B_MEMBER_STATUSES.ACTIVE,
                    department: r.department || 'Editorial Team',
                    createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
                    updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : new Date().toISOString()
                };
                memMap.set(member.memberId, member);
            }
        } else {
            // Seed baseline members into MySQL on first access
            for (const m of memMap.values()) {
                await mysqlClient.query(
                    `INSERT IGNORE INTO customer_b2b_members (
                        member_id, organization_id, email, full_name, role, status, department, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
                    [m.memberId, m.organizationId, m.email, m.fullName, m.role, m.status, m.department || 'Editorial']
                );
            }
        }

        // Also mirror into `customer_b2b_profiles.members_json` for backward compatibility
        const allMembers = Array.from(memMap.values());
        await mysqlClient.query(
            `UPDATE customer_b2b_profiles SET members_json = ?, updated_at = NOW() WHERE customer_key = ? OR email = 'publisher@printprice.pro'`,
            [JSON.stringify(allMembers), organizationId]
        );
    } catch (_) {}

    return Array.from(memMap.values());
}

/**
 * Lists all members in a B2B Organization.
 */
async function listOrganizationMembers(organizationId = 'org-publisher-default', options = {}) {
    const members = await syncOrgMembersWithMySQL(organizationId);
    const includeSuspended = options.includeSuspended === true || String(options.includeSuspended).toLowerCase() === 'true';
    const filtered = includeSuspended ? members : members.filter(m => m.status === 'ACTIVE' || m.status === 'INVITED');
    return filtered.map(m => ({
        ...m,
        permissions: B2B_RBAC_PERMISSIONS_MATRIX[m.role] || B2B_RBAC_PERMISSIONS_MATRIX.PREPRESS_DESIGNER
    }));
}

/**
 * Invites / creates a new member in the B2B Organization.
 */
async function addOrganizationMember(organizationId = 'org-publisher-default', payload = {}) {
    const email = String(payload.email || '').trim().toLowerCase();
    const fullName = String(payload.fullName || payload.full_name || payload.name || '').trim();
    const rawRole = String(payload.role || B2B_ORG_ROLES.PREPRESS_DESIGNER).trim().toUpperCase();
    const status = String(payload.status || B2B_MEMBER_STATUSES.ACTIVE).trim().toUpperCase();
    const department = String(payload.department || 'Editorial & Production').trim();

    if (!email || !email.includes('@')) {
        const err = new Error('A valid institutional email is required.');
        err.statusCode = 400;
        err.code = 'INVALID_MEMBER_EMAIL';
        throw err;
    }
    if (!fullName) {
        const err = new Error('Member fullName is required.');
        err.statusCode = 400;
        err.code = 'INVALID_MEMBER_NAME';
        throw err;
    }
    if (!VALID_B2B_ROLES.has(rawRole)) {
        const err = new Error(`Invalid B2B role '${rawRole}'. Valid roles: ${Array.from(VALID_B2B_ROLES).join(', ')}`);
        err.statusCode = 400;
        err.code = 'INVALID_B2B_ROLE';
        throw err;
    }

    const memMap = ensureOrgSeededInMemory(organizationId);
    const suffix = crypto.randomBytes(2).toString('hex').toUpperCase();
    const memberId = payload.memberId || `MEM_${new Date().getUTCFullYear()}_${suffix}`;
    const nowIso = new Date().toISOString();

    const newMember = {
        memberId,
        organizationId,
        email,
        fullName,
        role: rawRole,
        status: ['ACTIVE', 'INVITED', 'SUSPENDED'].includes(status) ? status : 'ACTIVE',
        department,
        createdAt: nowIso,
        updatedAt: nowIso
    };

    memMap.set(memberId, newMember);

    try {
        await ensureB2bMembersSchema();
        await mysqlClient.query(
            `INSERT INTO customer_b2b_members (
                member_id, organization_id, email, full_name, role, status, department, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
            ON DUPLICATE KEY UPDATE
                email = VALUES(email),
                full_name = VALUES(full_name),
                role = VALUES(role),
                status = VALUES(status),
                department = VALUES(department),
                updated_at = NOW()`,
            [memberId, organizationId, email, fullName, rawRole, newMember.status, department]
        );
        await syncOrgMembersWithMySQL(organizationId);
    } catch (_) {}

    return {
        ...newMember,
        permissions: B2B_RBAC_PERMISSIONS_MATRIX[newMember.role]
    };
}

/**
 * Updates an existing member's role or status.
 */
async function updateOrganizationMemberRole(organizationId = 'org-publisher-default', memberId, updates = {}) {
    const memMap = ensureOrgSeededInMemory(organizationId);
    await syncOrgMembersWithMySQL(organizationId);

    const existing = memMap.get(memberId);
    if (!existing) {
        const err = new Error(`Member '${memberId}' not found in organization.`);
        err.statusCode = 404;
        err.code = 'MEMBER_NOT_FOUND';
        throw err;
    }

    const nextRole = updates.role ? String(updates.role).trim().toUpperCase() : existing.role;
    if (!VALID_B2B_ROLES.has(nextRole)) {
        const err = new Error(`Invalid B2B role '${nextRole}'.`);
        err.statusCode = 400;
        err.code = 'INVALID_B2B_ROLE';
        throw err;
    }

    const nextStatus = updates.status ? String(updates.status).trim().toUpperCase() : existing.status;

    const updated = {
        ...existing,
        role: nextRole,
        status: ['ACTIVE', 'INVITED', 'SUSPENDED'].includes(nextStatus) ? nextStatus : existing.status,
        fullName: updates.fullName || existing.fullName,
        department: updates.department || existing.department,
        updatedAt: new Date().toISOString()
    };

    memMap.set(memberId, updated);

    try {
        await mysqlClient.query(
            `UPDATE customer_b2b_members
             SET role = ?, status = ?, full_name = ?, department = ?, updated_at = NOW()
             WHERE member_id = ? AND organization_id = ?`,
            [updated.role, updated.status, updated.fullName, updated.department, memberId, organizationId]
        );
        await syncOrgMembersWithMySQL(organizationId);
    } catch (_) {}

    return {
        ...updated,
        permissions: B2B_RBAC_PERMISSIONS_MATRIX[updated.role]
    };
}

/**
 * Removes / revokes a member from the B2B Organization.
 */
async function removeOrganizationMember(organizationId = 'org-publisher-default', memberId) {
    const memMap = ensureOrgSeededInMemory(organizationId);
    await syncOrgMembersWithMySQL(organizationId);

    const existing = memMap.get(memberId);
    if (!existing) {
        const err = new Error(`Member '${memberId}' not found in organization.`);
        err.statusCode = 404;
        err.code = 'MEMBER_NOT_FOUND';
        throw err;
    }

    const revoked = {
        ...existing,
        status: B2B_MEMBER_STATUSES.SUSPENDED,
        updatedAt: new Date().toISOString()
    };
    memMap.set(memberId, revoked);

    try {
        await mysqlClient.query(
            `UPDATE customer_b2b_members SET status = 'SUSPENDED', updated_at = NOW() WHERE member_id = ? AND organization_id = ?`,
            [memberId, organizationId]
        );
        await syncOrgMembersWithMySQL(organizationId);
    } catch (_) {}

    return {
        ok: true,
        revokedMemberId: memberId,
        member: revoked,
        revokedMember: revoked
    };
}

/**
 * Resolves the B2B Organization Actor & Role from request headers (`x-b2b-role`, `x-b2b-member-id`),
 * JWT Bearer token, or member lookup in `organizationMembersStore`.
 */
function resolveB2bActorContext(req) {
    const organizationId = String(
        req.headers['x-b2b-org-id'] ||
        req.headers['x-organization-id'] ||
        req.query?.organizationId ||
        'org-publisher-default'
    ).trim();

    const memMap = ensureOrgSeededInMemory(organizationId);

    // 1. Check explicit headers (`x-b2b-member-id`, `x-b2b-role`)
    const headerMemberId = String(req.headers['x-b2b-member-id'] || '').trim();
    const headerRoleRaw = String(req.headers['x-b2b-role'] || '').trim().toUpperCase();
    const headerEmail = String(
        req.headers['x-b2b-email'] ||
        req.headers['x-customer-email'] ||
        req.query?.email ||
        req.body?.email ||
        ''
    ).trim().toLowerCase();

    // 2. Check JWT if present
    let jwtRole = null;
    let jwtMemberId = null;
    let jwtEmail = null;
    const authHeader = String(req.headers['authorization'] || '');
    if (authHeader.startsWith('Bearer ') && process.env.JWT_SECRET) {
        try {
            const decoded = jwt.verify(authHeader.slice(7).trim(), process.env.JWT_SECRET, {
                ignoreExpiration: true
            });
            if (decoded) {
                jwtRole = decoded.b2bRole || decoded.role || null;
                jwtMemberId = decoded.memberId || decoded.sub || null;
                jwtEmail = decoded.email || null;
            }
        } catch (_) {}
    }

    // 3. Resolve member record from store if `headerMemberId` or `headerEmail` matches
    let matchedMember = null;
    if (headerMemberId && memMap.has(headerMemberId)) {
        matchedMember = memMap.get(headerMemberId);
    } else if (jwtMemberId && memMap.has(jwtMemberId)) {
        matchedMember = memMap.get(jwtMemberId);
    } else if (headerEmail || jwtEmail) {
        const targetEmail = headerEmail || jwtEmail;
        for (const m of memMap.values()) {
            if (m.email.toLowerCase() === targetEmail) {
                matchedMember = m;
                break;
            }
        }
    }

    // 4. Determine effective canonical B2B role
    // Priority: Explicit `x-b2b-role` header -> JWT `b2bRole` -> Matched Member's role -> Default `ORG_ADMIN`
    let resolvedRole = B2B_ORG_ROLES.ORG_ADMIN;
    if (headerRoleRaw && VALID_B2B_ROLES.has(headerRoleRaw)) {
        resolvedRole = headerRoleRaw;
    } else if (jwtRole && VALID_B2B_ROLES.has(String(jwtRole).toUpperCase())) {
        resolvedRole = String(jwtRole).toUpperCase();
    } else if (matchedMember && VALID_B2B_ROLES.has(matchedMember.role)) {
        resolvedRole = matchedMember.role;
    }

    const memberStatus = matchedMember?.status || B2B_MEMBER_STATUSES.ACTIVE;

    const actor = {
        organizationId,
        memberId: headerMemberId || matchedMember?.memberId || jwtMemberId || 'MEM_2026_0001',
        email: headerEmail || matchedMember?.email || jwtEmail || 'publisher@printprice.pro',
        fullName: matchedMember?.fullName || 'Editorial Organization Member',
        role: resolvedRole,
        status: memberStatus,
        permissions: B2B_RBAC_PERMISSIONS_MATRIX[resolvedRole] || B2B_RBAC_PERMISSIONS_MATRIX.ORG_ADMIN
    };

    req.b2bActor = actor;
    return actor;
}

/**
 * Factory middleware enforcing a specific set of allowed `B2B_ORG_ROLES` and returning
 * deterministic `403` error codes required by PrintPriceOS security governance.
 */
function requireB2bOrgRoles(allowedRoles = [], options = {}) {
    const allowedSet = new Set(allowedRoles);
    const errorCode = options.errorCode || 'FORBIDDEN_RBAC_INSUFFICIENT_RIGHTS';
    const customMessage = options.message || 'Insufficient B2B organization role permissions for this operation.';

    return (req, res, next) => {
        const actor = resolveB2bActorContext(req);

        if (actor.status === B2B_MEMBER_STATUSES.SUSPENDED) {
            return res.status(403).json({
                ok: false,
                error: 'FORBIDDEN_RBAC_MEMBER_SUSPENDED',
                code: 'FORBIDDEN_RBAC_MEMBER_SUSPENDED',
                message: `Member '${actor.email}' (${actor.memberId}) is suspended.`,
                actorRole: actor.role,
                requiredRoles: Array.from(allowedSet)
            });
        }

        if (!allowedSet.has(actor.role)) {
            logger.warn({
                event: 'b2b_rbac_access_denied',
                path: req.originalUrl,
                method: req.method,
                actorId: actor.memberId,
                actorEmail: actor.email,
                actorRole: actor.role,
                requiredRoles: Array.from(allowedSet),
                errorCode
            });

            return res.status(403).json({
                ok: false,
                error: errorCode,
                code: errorCode,
                message: `${customMessage} Active role '${actor.role}' is not in [${Array.from(allowedSet).join(', ')}].`,
                actorRole: actor.role,
                actor: {
                    memberId: actor.memberId,
                    email: actor.email,
                    role: actor.role
                },
                requiredRoles: Array.from(allowedSet)
            });
        }

        return next();
    };
}

// Pre-configured canonical middlewares for transactional endpoints
const requireSignOffRights = requireB2bOrgRoles(
    [B2B_ORG_ROLES.ORG_ADMIN, B2B_ORG_ROLES.PRODUCTION_MANAGER],
    {
        errorCode: 'FORBIDDEN_RBAC_INSUFFICIENT_SIGN_OFF_RIGHTS',
        message: 'Binding 3D Soft-Proof Sign-Off and CTP release require PRODUCTION_MANAGER or ORG_ADMIN role.'
    }
);

const requireFinanceRights = requireB2bOrgRoles(
    [B2B_ORG_ROLES.ORG_ADMIN, B2B_ORG_ROLES.FINANCE_APPROVER],
    {
        errorCode: 'FORBIDDEN_RBAC_FINANCE_RIGHTS_REQUIRED',
        message: 'Checkout payment execution and SEPA wire-proof submission require FINANCE_APPROVER or ORG_ADMIN role.'
    }
);

const requireAssetUploadRights = requireB2bOrgRoles(
    [B2B_ORG_ROLES.ORG_ADMIN, B2B_ORG_ROLES.PRODUCTION_MANAGER, B2B_ORG_ROLES.PREPRESS_DESIGNER],
    {
        errorCode: 'FORBIDDEN_RBAC_ASSET_UPLOAD_RIGHTS_REQUIRED',
        message: 'Production PDF file ingestion requires PREPRESS_DESIGNER, PRODUCTION_MANAGER, or ORG_ADMIN role.'
    }
);

const requireOrgAdminRights = requireB2bOrgRoles(
    [B2B_ORG_ROLES.ORG_ADMIN],
    {
        errorCode: 'FORBIDDEN_RBAC_ORG_ADMIN_REQUIRED',
        message: 'Organization team membership and RBAC governance require ORG_ADMIN role.'
    }
);

module.exports = {
    B2B_ORG_ROLES,
    B2B_MEMBER_STATUSES,
    B2B_RBAC_PERMISSIONS_MATRIX,
    organizationMembersStore,
    buildDefaultOrgMembers,
    listOrganizationMembers,
    addOrganizationMember,
    updateOrganizationMemberRole,
    removeOrganizationMember,
    resolveB2bActorContext,
    requireB2bOrgRoles,
    requireSignOffRights,
    requireFinanceRights,
    requireAssetUploadRights,
    requireOrgAdminRights
};
