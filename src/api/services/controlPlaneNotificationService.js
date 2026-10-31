const db = require('./mysqlClient');
const logger = require('./logger').child('control-plane-notifications');

class ControlPlaneNotificationService {
    /**
     * Create a new notification if it doesn't already exist.
     * Uses UPSERT logic based on ID.
     */
    async createNotification({
        id,
        tenant_id,
        user_id = null,
        scope = 'USER',
        type,
        severity = 'info',
        title,
        message = null,
        entity_type = null,
        entity_id = null,
        action_url = null,
        metadata_json = null,
        expires_at = null
    }) {
        try {
            logger.info({
                event: 'control_plane_notification_create_attempt',
                message: '[CONTROL][NOTIFICATIONS][CREATE_ATTEMPT]',
                notificationId: id,
                tenantId: tenant_id,
                userId: user_id
            });

            const result = await db.query(`
                INSERT INTO control_plane_notifications 
                (id, tenant_id, user_id, scope, type, severity, title, message, entity_type, entity_id, action_url, metadata_json, expires_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    id = id
            `, [
                id, tenant_id, user_id, scope, type, severity, title, message, entity_type, entity_id, action_url,
                metadata_json ? (typeof metadata_json === 'string' ? metadata_json : JSON.stringify(metadata_json)) : null,
                expires_at
            ]);

            const isDuplicate = result && result.affectedRows !== 1;

            if (isDuplicate) {
                logger.info({
                    event: 'control_plane_notification_duplicate_reused',
                    message: '[CONTROL][NOTIFICATIONS][CREATE_DUPLICATE_REUSED]',
                    notificationId: id,
                    tenantId: tenant_id,
                    userId: user_id,
                    type
                });
            } else {
                logger.info({
                    event: 'control_plane_notification_created',
                    message: '[CONTROL][NOTIFICATIONS][CREATE_OK]',
                    notificationId: id,
                    tenantId: tenant_id,
                    userId: user_id,
                    type
                });
            }

            const rows = await db.query(
                `SELECT * FROM control_plane_notifications WHERE id = ? LIMIT 1`,
                [id]
            );

            let row = Array.isArray(rows) ? rows[0] : rows;
            
            if (row && row.metadata_json && typeof row.metadata_json === 'string') {
                try {
                    row.metadata_json = JSON.parse(row.metadata_json);
                } catch (e) {
                    // Ignore parse error
                }
            }

            return row;
        } catch (err) {
            logger.error({
                event: 'control_plane_notification_creation_failed',
                error: err.message,
                notificationId: id
            });
            throw err;
        }
    }

    async getMyNotifications(tenantId, userId, limit = 20) {
        try {
            const rows = await db.query(`
                SELECT * FROM control_plane_notifications
                WHERE tenant_id = ? AND (scope = 'TENANT' OR (scope = 'USER' AND user_id = ?))
                ORDER BY created_at DESC
                LIMIT ?
            `, [tenantId, userId, parseInt(limit)]);
            return Array.isArray(rows) ? rows : [rows];
        } catch (err) {
            logger.error({ event: 'get_my_notifications_failed', error: err.message });
            return [];
        }
    }

    async getUnreadCount(tenantId, userId) {
        try {
            const rows = await db.query(`
                SELECT COUNT(*) as unreadCount FROM control_plane_notifications
                WHERE tenant_id = ? AND (scope = 'TENANT' OR (scope = 'USER' AND user_id = ?))
                AND read_at IS NULL
            `, [tenantId, userId]);
            
            const row = Array.isArray(rows) ? rows[0] : rows;
            return row ? (row.unreadCount || 0) : 0;
        } catch (err) {
            logger.error({ event: 'get_unread_count_failed', error: err.message });
            return 0;
        }
    }

    async markAsRead(id, tenantId) {
        try {
            await db.query(`
                UPDATE control_plane_notifications
                SET read_at = CURRENT_TIMESTAMP
                WHERE id = ? AND tenant_id = ? AND read_at IS NULL
            `, [id, tenantId]);
            return true;
        } catch (err) {
            logger.error({ event: 'mark_as_read_failed', error: err.message });
            return false;
        }
    }

    async markAllAsRead(tenantId, userId) {
        try {
            await db.query(`
                UPDATE control_plane_notifications
                SET read_at = CURRENT_TIMESTAMP
                WHERE tenant_id = ? AND (scope = 'TENANT' OR (scope = 'USER' AND user_id = ?))
                AND read_at IS NULL
            `, [tenantId, userId]);
            return true;
        } catch (err) {
            logger.error({ event: 'mark_all_as_read_failed', error: err.message });
            return false;
        }
    }
}

module.exports = new ControlPlaneNotificationService();
