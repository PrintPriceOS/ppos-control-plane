const db = require('../src/api/services/mysqlClient');
const notificationService = require('../src/api/services/controlPlaneNotificationService');

async function run() {
    console.log("==========================================");
    console.log("PHASE 43 SMOKE TEST: NOTIFICATIONS & PROGRESS");
    console.log("==========================================\n");

    try {
        console.log("1. Simulating Terminal Job State Emission...");
        const jobId = `job_test_${Date.now()}`;
        const tenantId = 'system';
        const notifId = `notif_preflight_term_COMPLETED_${jobId}`;
        
        await notificationService.createNotification({
            id: notifId,
            tenant_id: tenantId,
            scope: 'TENANT',
            type: 'PREFLIGHT_JOB_COMPLETED',
            severity: 'info',
            title: 'Preflight Analysis Completed',
            message: `Job ${jobId} finished with status COMPLETED.`,
            entity_type: 'PREFLIGHT_JOB',
            entity_id: jobId,
            action_url: `/preflight/jobs/${jobId}`
        });
        console.log("   ✅ Initial notification emitted successfully.");

        console.log("\n2. Testing Idempotency (Duplicate emission)...");
        await notificationService.createNotification({
            id: notifId, // Same ID
            tenant_id: tenantId,
            scope: 'TENANT',
            type: 'PREFLIGHT_JOB_COMPLETED',
            severity: 'info',
            title: 'Preflight Analysis Completed (Duplicate)',
            message: `Job ${jobId} finished with status COMPLETED.`,
            entity_type: 'PREFLIGHT_JOB',
            entity_id: jobId,
            action_url: `/preflight/jobs/${jobId}`
        });
        
        const rows = await db.query('SELECT * FROM control_plane_notifications WHERE id = ?', [notifId]);
        if (rows.length === 1 && rows[0].title === 'Preflight Analysis Completed') {
            console.log("   ✅ Idempotency verified: duplicate ignored, state preserved.");
        } else {
            console.log("   ❌ Idempotency failed: Title changed to:", rows[0]?.title);
            process.exit(1);
        }

        console.log("\n3. Testing Unread Count & List...");
        let count = await notificationService.getUnreadCount(tenantId, 'user_123');
        console.log(`   - Unread count: ${count}`);
        if (count < 1) throw new Error("Expected at least 1 unread notification");

        const list = await notificationService.getMyNotifications(tenantId, 'user_123', 5);
        console.log(`   - Retrieved ${list.length} notifications.`);
        console.log("   ✅ List & Count verified.");

        console.log("\n4. Testing Mark as Read...");
        await notificationService.markAsRead(notifId, tenantId);
        const newCount = await notificationService.getUnreadCount(tenantId, 'user_123');
        console.log(`   - Unread count after mark as read: ${newCount}`);
        if (newCount >= count) throw new Error("Count did not decrease");
        console.log("   ✅ Mark as Read verified.");

        console.log("\n==========================================");
        console.log("ALL TESTS PASSED SUCCESSFULLY");
        console.log("==========================================");
    } catch (err) {
        console.error("\n❌ TEST FAILED:", err.message);
        console.error(err.stack);
        process.exit(1);
    } finally {
        process.exit(0);
    }
}

run();
