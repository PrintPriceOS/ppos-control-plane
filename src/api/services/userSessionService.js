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

class UserSessionService {

    /**
     * Creates a new trackable server session.
     */
    async createSession({ userId, tenantId, role, ipAddress = null, userAgent = null, inactivityMinutes = DEFAULT_INACTIVITY_MINUTES, absoluteHours = DEFAULT_ABSOLUTE_HOURS }) {
        const sessionId = uuidv4();
        const now = new Date();
        const expiresAt = new Date(now.getTime() + (absoluteHours * 60 * 60 * 1000));

        await db.query(
            `INSERT INTO user_sessions (id, user_id, tenant_id, role, ip_address, user_agent, status, last_activity_at, expires_at, created_at)
             VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', NOW(), ?, NOW())`,
            [sessionId, userId, tenantId, role, ipAddress, userAgent ? userAgent.slice(0, 500) : null, expiresAt]
        );

        return {
            sessionId,
            userId,
            tenantId,
            expiresAt,
            inactivityMinutes
        };
    }

    /**
     * Validates session state, expiry, sub, tenant, and inactivity timeout.
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

            if (tenantId && session.tenant_id !== tenantId) {
                return { valid: false, reason: 'SESSION_TENANT_MISMATCH' };
            }

            if (userId && session.user_id !== userId) {
                return { valid: false, reason: 'SESSION_USER_MISMATCH' };
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
        if (tenantId) {
            query += ` AND tenant_id = ?`;
            params.push(tenantId);
        }

        const [session] = await db.query(query, params).catch(() => []);
        if (!session) {
            return { ok: false, code: 'SESSION_NOT_FOUND', statusCode: 404, message: 'Session not found' };
        }

        if (requestingUserId && session.user_id !== requestingUserId) {
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
        let query = `UPDATE user_sessions SET status = 'REVOKED', revoked_at = NOW(), revoked_reason = ? WHERE user_id = ? AND status = 'ACTIVE'`;
        let params = [reason, userId];

        if (tenantId) {
            query += ` AND tenant_id = ?`;
            params.push(tenantId);
        }

        const result = await db.query(query, params);
        return { ok: true, revokedCount: result.affectedRows || 0 };
    }

    /**
     * Lists active sessions for a given user or tenant.
     */
    async listSessions(userId, tenantId) {
        const rows = await db.query(
            `SELECT id, user_id, tenant_id, role, ip_address, user_agent, status, last_activity_at, expires_at, created_at
             FROM user_sessions
             WHERE user_id = ? AND tenant_id = ?
             ORDER BY created_at DESC
             LIMIT 50`,
            [userId, tenantId]
        );

        return (rows || []).map(r => ({
            id: r.id,
            userId: r.user_id,
            tenantId: r.tenant_id,
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

module.exports = new UserSessionService();
