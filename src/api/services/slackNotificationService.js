/**
 * src/api/services/slackNotificationService.js
 * 
 * Phase 195F — Slack Incoming Webhook Integration & Alert Engine.
 */
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const db = require('./mysqlClient');
const logger = require('./logger').child('slack-notifications');

function redactSlackUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') return '';
    if (!rawUrl.includes('hooks.slack.com')) return 'https://hooks.slack.com/services/****';
    const parts = rawUrl.split('/');
    if (parts.length < 3) return rawUrl.slice(0, 20) + '****';
    return `${parts.slice(0, parts.length - 1).join('/')}/****`;
}

class SlackNotificationService {

    async ensureTableExists() {
        try {
            await db.query(`
                CREATE TABLE IF NOT EXISTS slack_integrations (
                    id VARCHAR(64) PRIMARY KEY,
                    tenant_id VARCHAR(255) NOT NULL UNIQUE,
                    webhook_url TEXT NOT NULL,
                    channel_name VARCHAR(100) NOT NULL DEFAULT '#general',
                    enabled TINYINT(1) NOT NULL DEFAULT 1,
                    events_json JSON NOT NULL,
                    last_test_at DATETIME NULL,
                    last_test_status VARCHAR(50) NULL,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    INDEX idx_slack_tenant (tenant_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
            `);
        } catch (err) {
            logger.warn('Failed to auto-ensure slack_integrations table', { error: err.message });
        }
    }

    /**
     * Saves or updates Slack integration configuration for a tenant.
     */
    async configureSlackIntegration({ tenantId, webhookUrl, channelName = '#alerts', enabled = true, events = ['qc_alert', 'sla_alert', 'order_alert', 'calibration_alert'] }) {
        await this.ensureTableExists();

        if (!webhookUrl || typeof webhookUrl !== 'string' || !webhookUrl.startsWith('http')) {
            throw new Error('Valid Slack webhook URL is required');
        }

        const id = uuidv4();
        await db.query(
            `INSERT INTO slack_integrations (id, tenant_id, webhook_url, channel_name, enabled, events_json, created_at)
             VALUES (?, ?, ?, ?, ?, ?, NOW())
             ON DUPLICATE KEY UPDATE webhook_url = VALUES(webhook_url), channel_name = VALUES(channel_name), enabled = VALUES(enabled), events_json = VALUES(events_json), updated_at = NOW()`,
            [id, tenantId, webhookUrl, channelName, enabled ? 1 : 0, JSON.stringify(events)]
        );

        return {
            tenantId,
            channelName,
            enabled: Boolean(enabled),
            events,
            webhookUrlRedacted: redactSlackUrl(webhookUrl)
        };
    }

    /**
     * Retrieves tenant Slack configuration with redacted webhook URL.
     */
    async getSlackConfig(tenantId) {
        await this.ensureTableExists();

        const [config] = await db.query(`SELECT id, tenant_id, webhook_url, channel_name, enabled, events_json, last_test_at, last_test_status FROM slack_integrations WHERE tenant_id = ?`, [tenantId]).catch(() => []);
        if (!config) {
            return { configured: false, enabled: false };
        }

        return {
            configured: true,
            tenantId: config.tenant_id,
            channelName: config.channel_name,
            enabled: Boolean(config.enabled),
            events: typeof config.events_json === 'string' ? JSON.parse(config.events_json) : config.events_json,
            webhookUrlRedacted: redactSlackUrl(config.webhook_url),
            lastTestAt: config.last_test_at,
            lastTestStatus: config.last_test_status
        };
    }

    /**
     * Triggers a test alert to the configured Slack webhook or mock handler.
     */
    async testSlackIntegration(tenantId, options = {}) {
        await this.ensureTableExists();

        const [config] = await db.query(`SELECT webhook_url, channel_name FROM slack_integrations WHERE tenant_id = ?`, [tenantId]);
        if (!config || !config.webhook_url) {
            throw new Error('Slack integration is not configured for this tenant');
        }

        const payload = {
            text: `🧪 *PrintPrice OS Control Plane — Test Alert*`,
            blocks: [
                {
                    type: "section",
                    text: {
                        type: "mrkdwn",
                        text: `*PrintPrice OS Control Plane — Test Notification*\nTenant: \`${tenantId}\`\nChannel: \`${config.channel_name}\`\nStatus: ✅ Slack Integration Connected Successfully.`
                    }
                }
            ]
        };

        const startTime = Date.now();

        if (options.mockHandler) {
            try {
                await options.mockHandler({ webhookUrl: config.webhook_url, payload });
                await db.query(`UPDATE slack_integrations SET last_test_at = NOW(), last_test_status = 'SUCCESS' WHERE tenant_id = ?`, [tenantId]);
                return { ok: true, status: 'DELIVERED', redactedUrl: redactSlackUrl(config.webhook_url) };
            } catch (err) {
                await db.query(`UPDATE slack_integrations SET last_test_at = NOW(), last_test_status = 'FAILED' WHERE tenant_id = ?`, [tenantId]);
                return { ok: false, status: 'FAILED', error: err.message, redactedUrl: redactSlackUrl(config.webhook_url) };
            }
        }

        try {
            await axios.post(config.webhook_url, payload, {
                headers: { 'Content-Type': 'application/json' },
                timeout: 5000
            });

            await db.query(`UPDATE slack_integrations SET last_test_at = NOW(), last_test_status = 'SUCCESS' WHERE tenant_id = ?`, [tenantId]);
            return {
                ok: true,
                status: 'DELIVERED',
                latencyMs: Date.now() - startTime,
                redactedUrl: redactSlackUrl(config.webhook_url)
            };
        } catch (err) {
            await db.query(`UPDATE slack_integrations SET last_test_at = NOW(), last_test_status = 'FAILED' WHERE tenant_id = ?`, [tenantId]);
            return {
                ok: false,
                status: 'FAILED',
                error: err.message,
                redactedUrl: redactSlackUrl(config.webhook_url)
            };
        }
    }
}

module.exports = new SlackNotificationService();
