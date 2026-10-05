/**
 * src/api/services/userSessionService.js
 * 
 * Phase 195E — Server-Side Identifiable and Revocable Sessions.
 */
const { v4: uuidv4 } = require('uuid');
const db = require('./mysqlClient');
const logger = require('./logger').child('user-sessions');

const DEFAULT_INACTIVITY_MINUTES = 60;
const DEFAULT_ABSOLUTE_HOURS = 24;

/**
 * Normalizes an identity key (userId, tenantId) to a canonical non-empty string.
 * Returns null if the value is null, undefined, or empty/whitespace.
 */
function canonicalId(val) {
    if (val === null || val === undefined) return null;
    const str = String(val).trim();
    return str.length > 0 ? str : null;
}

class UserSessionService {

    /**
     * Creates a new trackable server session with canonical string IDs.
     */
    async createSession({ userId, tenantId, role, ipAddress = null, userAgent = null, inactivityMinutes = DEFAULT_INACTIVITY_MINUTES, absoluteHours = DEFAULT_ABSOLUTE_HOURS }) {
        const canonicalUserId = canonicalId(userId);
        const canonicalTenantId = canonicalId(tenantId);

        if (!canonicalUserId) {
            throw new Error('Valid userId is required to create a session');
        }
        if (!canonicalTenantId) {
            throw new Error('Valid tenantId is required to create a session');
        }

        const sessionId = uuidv4();
        const now = new Date();
        const expiresAt = new Date(now.getTime() + (absoluteHours * 60 * 60 * 1000));

        await db.query(
            `INSERT INTO user_sessions (id, user_id, tenant_id, role, ip_address, user_agent, status, last_activity_at, expires_at, created_at)
             VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', NOW(), ?, NOW())`,
            [sessionId, canonicalUserId, canonicalTenantId, role, ipAddress, userAgent ? userAgent.slice(0, 500) : null, expiresAt]
        );

        return {
            sessionId,
            userId: canonicalUserId,
            tenantId: canonicalTenantId,
            expiresAt,
            inactivityMinutes
        };
    }

    /**
     * Validates session state, expiry, sub, tenant, and inactivity timeout.
     * Compares canonical representations strictly without weak equality.
     * Preserves internal DB errors without hiding them as missing session.
     */
    async validateSession(sessionId, tenantId = null, userId = null, inactivityMinutes = DEFAULT_INACTIVITY_MINUTES) {
        if (!sessionId) {
            return { valid: false, reason: 'MISSING_SESSION_ID' };
        }

        try {
            let query = `SELECT id, user_id, tenant_id, role, status, last_activity_at, expires_at FROM user_sessions WHERE id = ?`;
            let params = [sessionId];

            const rows = await db.query(query, params);
            const session = rows && rows[0] ? rows[0] : null;

            if (!session) {
                return { valid: false, reason: 'SESSION_NOT_FOUND' };
            }

            const expectedTenantId = canonicalId(tenantId);
            const sessionTenantId = canonicalId(session.tenant_id);

            if (expectedTenantId !== null) {
                if (sessionTenantId === null || sessionTenantId !== expectedTenantId) {
                    return { valid: false, reason: 'SESSION_TENANT_MISMATCH' };
                }
            }

            const expectedUserId = canonicalId(userId);
            const sessionUserId = canonicalId(session.user_id);

            if (expectedUserId !== null) {
                if (sessionUserId === null || sessionUserId !== expectedUserId) {
                    return { valid: false, reason: 'SESSION_USER_MISMATCH' };
                }
            }

            if (session.status === 'REVOKED') {
                return { valid: false, reason: 'SESSION_REVOKED' };
            }

            const now = new Date();

            // 1. Absolute Expiration Check
            if (now > new Date(session.expires_at)) {
                await this.markExpired(session.id, 'ABSOLUTE_EXPIRATION');
                return { valid: false, reason: 'SESSION_EXPIRED' };
            }

            // 2. Inactivity Timeout Check
            const lastActivity = new Date(session.last_activity_at);
            const inactivityMs = inactivityMinutes * 60 * 1000;
            if ((now.getTime() - lastActivity.getTime()) > inactivityMs) {
                await this.markExpired(session.id, 'INACTIVITY_TIMEOUT');
                return { valid: false, reason: 'SESSION_INACTIVE' };
            }

            // 3. Throttled activity update (at most once every 60s)
            if ((now.getTime() - lastActivity.getTime()) > 60000) {
                db.query(`UPDATE user_sessions SET last_activity_at = NOW() WHERE id = ?`, [session.id]).catch(() => {});
            }

            return {
                valid: true,
                session
            };
        } catch (err) {
            logger.error('Session validation database error', { error: err.message, sessionId, stack: err.stack });
            return {
                valid: false,
                isDbError: true,
                reason: 'DATABASE_ERROR',
                internalDiagnostic: `DB_QUERY_FAILED: ${err.message}`
            };
        }
    }

    async markExpired(sessionId, reason = 'EXPIRED') {
        await db.query(
            `UPDATE user_sessions SET status = 'EXPIRED', revoked_reason = ? WHERE id = ? AND status = 'ACTIVE'`,
            [reason, sessionId]
        ).catch(() => {});
    }

    /**
     * Revokes a specific session after checking ownership or administrative role.
     * Supports both options object { sessionId, tenantId, requestingUserId, requestingUserRole, reason }
     * and positional arguments (sessionId, tenantId, reason).
     */
    async revokeSession(optsOrSessionId, tenantIdParam = null, reasonParam = 'USER_LOGOUT') {
        let sessionId, tenantId = tenantIdParam, requestingUserId = null, requestingUserRole = null, reason = reasonParam;
        if (typeof optsOrSessionId === 'object' && optsOrSessionId !== null) {
            sessionId = optsOrSessionId.sessionId;
            tenantId = optsOrSessionId.tenantId || tenantId;
            requestingUserId = optsOrSessionId.requestingUserId || null;
            requestingUserRole = optsOrSessionId.requestingUserRole || null;
            reason = optsOrSessionId.reason || reason;
        } else {
            sessionId = optsOrSessionId;
        }

        if (!sessionId) {
            return { ok: false, code: 'MISSING_SESSION_ID', statusCode: 400, message: 'Session ID is required' };
        }

        let query = `SELECT id, user_id, tenant_id FROM user_sessions WHERE id = ?`;
        let params = [sessionId];
        const canonicalTenantId = canonicalId(tenantId);
        if (canonicalTenantId !== null) {
            query += ` AND tenant_id = ?`;
            params.push(canonicalTenantId);
        }

        const [session] = await db.query(query, params).catch(() => []);
        if (!session) {
            return { ok: false, code: 'SESSION_NOT_FOUND', statusCode: 404, message: 'Session not found' };
        }

        const canonicalReqUserId = canonicalId(requestingUserId);
        const sessionUserId = canonicalId(session.user_id);
        if (canonicalReqUserId !== null && (sessionUserId === null || sessionUserId !== canonicalReqUserId)) {
            const role = (requestingUserRole || '').toUpperCase();
            const isAdmin = role === 'SUPER_ADMIN' || role === 'TENANT_ADMIN' || role === 'ADMIN';
            if (!isAdmin) {
                return {
                    ok: false,
                    code: 'FORBIDDEN_SESSION_REVOCATION',
                    statusCode: 403,
                    message: 'Cannot revoke a session belonging to another user'
                };
            }
        }

        const result = await db.query(
            `UPDATE user_sessions SET status = 'REVOKED', revoked_at = NOW(), revoked_reason = ? WHERE id = ?`,
            [reason, sessionId]
        );

        return { ok: true, affectedRows: result.affectedRows || 0 };
    }

    /**
     * Revokes all active sessions for a user.
     */
    async revokeAllUserSessions(userId, tenantId = null, reason = 'REVOKE_ALL') {
        const canonicalUserId = canonicalId(userId);
        const canonicalTenantId = canonicalId(tenantId);

        if (!canonicalUserId) {
            return { ok: false, code: 'MISSING_USER_ID', message: 'Valid userId is required' };
        }

        let query = `UPDATE user_sessions SET status = 'REVOKED', revoked_at = NOW(), revoked_reason = ? WHERE user_id = ? AND status = 'ACTIVE'`;
        let params = [reason, canonicalUserId];

        if (canonicalTenantId !== null) {
            query += ` AND tenant_id = ?`;
            params.push(canonicalTenantId);
        }

        const result = await db.query(query, params);
        return { ok: true, revokedCount: result.affectedRows || 0 };
    }

    /**
     * Lists active sessions for a given user or tenant.
     */
    async listSessions(userId, tenantId) {
        const canonicalUserId = canonicalId(userId);
        const canonicalTenantId = canonicalId(tenantId);

        const rows = await db.query(
            `SELECT id, user_id, tenant_id, role, ip_address, user_agent, status, last_activity_at, expires_at, created_at
             FROM user_sessions
             WHERE user_id = ? AND tenant_id = ?
             ORDER BY created_at DESC
             LIMIT 50`,
            [canonicalUserId, canonicalTenantId]
        );

        return (rows || []).map(r => ({
            id: r.id,
            userId: canonicalId(r.user_id),
            tenantId: canonicalId(r.tenant_id),
            role: r.role,
            ipAddress: r.ip_address,
            userAgent: r.user_agent,
            status: r.status,
            lastActivityAt: r.last_activity_at,
            expiresAt: r.expires_at,
            createdAt: r.created_at
        }));
    }
}

UserSessionService.canonicalId = canonicalId;

module.exports = new UserSessionService();
