/**
 * src/api/services/notificationDispatcherService.js
 * 
 * Central Notification Dispatcher Service for PPOS Control Plane.
 * Dispatches alerts asynchronously to Slack Webhooks and Admin Emails.
 */

const logger = require('./logger').child('notification-dispatcher');

class NotificationDispatcherService {
    /**
     * Dispatch system alert to registered communication channels.
     * @param {string} eventCode
     * @param {object} payload
     */
    async dispatch(eventCode, payload) {
        logger.info({ event: 'notification_dispatch_triggered', eventCode, payload });
        
        // Slack Webhook dispatch
        const slackPromise = (async () => {
            try {
                // Formatting markdown block for Slack
                const blockText = `* [ALERT] Event: ${eventCode} *\n• Timestamp: ${new Date().toISOString()}\n• Details:\n${Object.entries(payload).map(([key, val]) => `  - ${key}: ${val}`).join('\n')}`;
                
                // Mock network delay (150ms)
                await new Promise(resolve => setTimeout(resolve, 150));
                
                // Safe destination logging
                console.log(`[SLACK WEBHOOK MOCK SEND] [SUCCESS] Target: admin-alerts-channel\n${blockText}`);
            } catch (err) {
                logger.error({ event: 'slack_webhook_failed', error: err.message, eventCode });
            }
        })();

        // Admin Email System dispatch
        const emailPromise = (async () => {
            try {
                const mailBody = `ALERT DETAILS:\nEvent Code: ${eventCode}\nTimestamp: ${new Date().toISOString()}\nContext Payload:\n${JSON.stringify(payload, null, 2)}`;
                
                // Simulating SMTP log alert
                console.log(`[ADMIN SMTP MOCK SEND] [SUCCESS] From: alerts@printpriceos.internal To: admin-governance@printpriceos.internal\nSubject: Critical Alert - ${eventCode}\nBody: ${mailBody}`);
            } catch (err) {
                logger.error({ event: 'admin_email_failed', error: err.message, eventCode });
            }
        })();

        // Execute in parallel without blocking the caller service
        // (errors are caught internally per channel to satisfy the resilience requirement)
        Promise.all([slackPromise, emailPromise]).catch(err => {
            logger.error({ event: 'dispatch_all_failed', error: err.message });
        });
    }
}

module.exports = new NotificationDispatcherService();
