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

    /**
     * Saves or updates Slack integration configuration for a tenant.
     */
    async configureSlackIntegration({ tenantId, webhookUrl, channelName = '#alerts', enabled = true, events = ['qc_alert', 'sla_alert', 'order_alert', 'calibration_alert'] }) {

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

    /**
     * Dispatches a live notification alert to tenant's configured Slack channel.
     * Silent no-op when Slack is not configured or disabled.
     */
    async notifyEvent({ tenantId, eventType, text, blocks = [] }) {
        if (!tenantId || !text) return { skipped: true, reason: 'MISSING_PARAMS' };

        try {
            const [config] = await db.query(
                `SELECT webhook_url, channel_name, enabled, events_json FROM slack_integrations WHERE tenant_id = ?`,
                [tenantId]
            ).catch(() => []);

            if (!config || !config.enabled || !config.webhook_url) {
                return { skipped: true, reason: 'NOT_CONFIGURED_OR_DISABLED' };
            }

            const events = typeof config.events_json === 'string' ? JSON.parse(config.events_json) : (config.events_json || []);
            if (!events.includes('*') && !events.includes(eventType)) {
                return { skipped: true, reason: 'EVENT_NOT_SUBSCRIBED' };
            }

            const payload = {
                text,
                blocks: blocks && blocks.length > 0 ? blocks : [
                    {
                        type: "section",
                        text: { type: "mrkdwn", text }
                    }
                ]
            };

            await axios.post(config.webhook_url, payload, {
                headers: { 'Content-Type': 'application/json' },
                timeout: 5000,
                maxRedirects: 0
            });

            logger.info('Slack alert dispatched successfully', { tenantId, eventType });
            return { ok: true, delivered: true };
        } catch (err) {
            logger.warn('Failed to dispatch Slack alert', { tenantId, eventType, error: err.message });
            return { ok: false, error: err.message };
        }
    }
}

module.exports = new SlackNotificationService();
