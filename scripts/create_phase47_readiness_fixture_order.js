const db = require('../src/api/services/mysqlClient');

async function createFixture() {
    try {
        const orderId = `ord_phase47_fixture_${Date.now()}`;
        const jobId = 'fix_1780651634180';
        const snapshotId = 'hrs_1780658461568_mdk0ef0';
        const tenantId = 'ppos-production';

        console.log(`Creating Phase 47.5 Readiness Fixture Order: ${orderId}`);

        const metadata = {
            fixture: true,
            phase: "47.5",
            purpose: "Human Report Review Decision Readiness Gate validation",
            preflight_job_id: jobId,
            snapshot_id: snapshotId
        };

        // 1. Insert Order
        await db.query(`
            INSERT INTO marketplace_orders (
                order_id, tenant_id, status, selected_offer_id, customer_id, readiness_json, metadata_json, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
        `, [
            orderId, tenantId, 'FILES_UPLOADED', 'offer_fixture', 'cust_fixture',
            JSON.stringify({ ready: false, blockers: [] }),
            JSON.stringify(metadata)
        ]);

        // 2. Insert Files
        const interiorFileId = `fil_int_${Date.now()}`;
        const coverFileId = `fil_cov_${Date.now()}`;

        await db.query(`
            INSERT INTO marketplace_order_files (
                file_id, order_id, role, status, original_name, preflight_job_id, preflight_status, preflight_outcome_category, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
        `, [
            interiorFileId, orderId, 'INTERIOR_PDF', 'UPLOADED', 'interior_fixed.pdf', jobId, 'COMPLETED_WITH_FINDINGS', 'WARNING'
        ]);

        await db.query(`
            INSERT INTO marketplace_order_files (
                file_id, order_id, role, status, original_name, preflight_job_id, preflight_status, preflight_outcome_category, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
        `, [
            coverFileId, orderId, 'COVER_PDF', 'UPLOADED', 'cover_fixed.pdf', jobId, 'COMPLETED_WITH_FINDINGS', 'WARNING'
        ]);

        // 3. Insert Bindings
        const analysisIntegrity = { certifiable: true };

        await db.query(`
            INSERT INTO marketplace_order_preflight_bindings (
                order_id, file_id, preflight_job_id, role, status, outcome_category, analysis_integrity_json, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
        `, [
            orderId, interiorFileId, jobId, 'INTERIOR_PDF', 'COMPLETED_WITH_FINDINGS', 'WARNING', JSON.stringify(analysisIntegrity)
        ]);

        await db.query(`
            INSERT INTO marketplace_order_preflight_bindings (
                order_id, file_id, preflight_job_id, role, status, outcome_category, analysis_integrity_json, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
        `, [
            orderId, coverFileId, jobId, 'COVER_PDF', 'COMPLETED_WITH_FINDINGS', 'WARNING', JSON.stringify(analysisIntegrity)
        ]);

        console.log(`[SUCCESS] Fixture created successfully.`);
        console.log(`ORDER_ID=${orderId}`);

        process.exit(0);
    } catch (err) {
        console.error('Failed to create fixture:', err);
        process.exit(1);
    }
}

createFixture();
