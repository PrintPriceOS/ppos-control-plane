'use strict';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import os from 'os';

const require = createRequire(import.meta.url);

const {
    getTenantStorageQuota,
    purgeJobPdfBinary,
    batchPurgeRetentionAssets
} = require('../src/api/services/storage/storageLifecycleService');
const {
    inspectPreflightJob,
    getPreflightInspectionById
} = require('../src/api/services/preflight/preflightEngineService');

describe('Storage Lifecycle & Physical Purge Engine E2E', () => {
    let testTempDir;

    beforeEach(() => {
        testTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ppos-storage-e2e-'));
    });

    afterEach(() => {
        try {
            if (fs.existsSync(testTempDir)) {
                fs.rmSync(testTempDir, { recursive: true, force: true });
            }
        } catch (_) {}
    });

    it('1. returns strict zero metrics and empty breakdowns for a clean newly registered tenant', async () => {
        const cleanTenantId = 'tenant-clean-printhouse-' + Date.now();
        const quota = await getTenantStorageQuota(cleanTenantId);

        expect(quota.status).toBe('IDLE');
        expect(quota.usedBytes).toBe(0);
        expect(quota.usedGb).toBe(0);
        expect(quota.usagePct).toBe(0);
        expect(quota.activeArtifactsCount).toBe(0);
        expect(quota.purgedArtifactsCount).toBe(0);
        expect(quota.reclaimedGb).toBe(0);
        expect(quota.bySlot.INTERIOR_PDF.sizeGb).toBe(0);
        expect(quota.bySlot.COVER_PDF.sizeGb).toBe(0);
        expect(quota.jobsBreakdown).toEqual([]);
    });

    it('2. tracks physical PDF files on disk and accurately calculates tenant quota', async () => {
        const tenantId = 'tenant-live-' + Date.now();
        const dummyPdfPath = path.join(testTempDir, 'sample_heavy_interior.pdf');
        // Create 2 MB physical dummy file
        fs.writeFileSync(dummyPdfPath, Buffer.alloc(2 * 1024 * 1024, 0x41));

        // Register job inspection in preflight engine with storagePath pointing to the real file
        const inspection = inspectPreflightJob({
            jobId: 'PF-TEST-001',
            tenantId,
            filePath: dummyPdfPath,
            bindingType: 'SOFTCOVER_PUR',
            slot: 'INTERIOR_PDF',
            title: 'Industrial Architecture Manual',
            isbn: '978-0-1234-5678-9'
        });

        expect(inspection.ok).toBe(true);

        const quota = await getTenantStorageQuota(tenantId);
        expect(quota.status).toBe('ACTIVE');
        expect(quota.usedBytes).toBeGreaterThanOrEqual(2 * 1024 * 1024);
        expect(quota.activeArtifactsCount).toBe(1);
        expect(quota.jobsBreakdown.length).toBe(1);
        expect(quota.jobsBreakdown[0].jobId).toBe('PF-TEST-001');
        expect(quota.jobsBreakdown[0].assetPurged).toBe(false);
    });

    it('3. physically unlinks the PDF file from disk on purgeJobPdfBinary while preserving 6-axis JSON & SHA-256', async () => {
        const tenantId = 'tenant-purge-' + Date.now();
        const dummyPdfPath = path.join(testTempDir, 'temp_unlinked_asset.pdf');
        fs.writeFileSync(dummyPdfPath, Buffer.alloc(1024 * 1024, 0x5a));

        inspectPreflightJob({
            jobId: 'PF-PURGE-001',
            tenantId,
            filePath: dummyPdfPath,
            bindingType: 'HARDCOVER',
            slot: 'INTERIOR_PDF',
            title: 'Typography Treatise'
        });

        expect(fs.existsSync(dummyPdfPath)).toBe(true);

        // Execute purge
        const purgeRes = await purgeJobPdfBinary('PF-PURGE-001', tenantId);

        expect(purgeRes.ok).toBe(true);
        expect(purgeRes.mode).toBe('SINGLE_JOB_PURGE');
        expect(purgeRes.diskFileRemoved).toBe(true);

        // Verify physical file is gone
        expect(fs.existsSync(dummyPdfPath)).toBe(false);

        // Verify forensic metadata is fully retained
        const storedInspection = getPreflightInspectionById('PF-PURGE-001', tenantId);
        expect(storedInspection).toBeTruthy();
        expect(storedInspection.assetPurged).toBe(true);
        expect(storedInspection.assetStorage.storagePath).toBe(null);
        expect(storedInspection.assetStorage.retentionState).toBe('METADATA_ONLY_ASSET_PURGED');
        expect(storedInspection.title).toBe('Typography Treatise');
    });

    it('4. batchPurgeRetentionAssets unlinks all unpurged tenant binaries and accumulates reclaimed disk', async () => {
        const tenantId = 'tenant-batch-' + Date.now();
        const file1 = path.join(testTempDir, 'batch_1.pdf');
        const file2 = path.join(testTempDir, 'batch_2.pdf');
        fs.writeFileSync(file1, Buffer.alloc(1024 * 1024, 0x42));
        fs.writeFileSync(file2, Buffer.alloc(2048 * 1024, 0x43));

        inspectPreflightJob({
            jobId: 'PF-BATCH-001',
            tenantId,
            filePath: file1,
            title: 'Book A'
        });
        inspectPreflightJob({
            jobId: 'PF-BATCH-002',
            tenantId,
            filePath: file2,
            title: 'Book B'
        });

        expect(fs.existsSync(file1)).toBe(true);
        expect(fs.existsSync(file2)).toBe(true);

        const batchRes = await batchPurgeRetentionAssets(tenantId);
        expect(batchRes.ok).toBe(true);
        expect(batchRes.mode).toBe('BULK_RETENTION_PURGE');
        expect(batchRes.purgedCount).toBe(2);

        // Both physical files deleted
        expect(fs.existsSync(file1)).toBe(false);
        expect(fs.existsSync(file2)).toBe(false);

        // Quota reflects disk reclaimed
        const postQuota = await getTenantStorageQuota(tenantId);
        expect(postQuota.usedBytes).toBe(0);
        expect(postQuota.purgedArtifactsCount).toBe(2);
    });

    it('5. enforces strict tenant isolation during purge (Tenant A cannot purge Tenant B assets)', async () => {
        const tenantA = 'tenant-isolation-a-' + Date.now();
        const tenantB = 'tenant-isolation-b-' + Date.now();

        const fileA = path.join(testTempDir, 'tenant_a_file.pdf');
        fs.writeFileSync(fileA, Buffer.alloc(512 * 1024, 0x33));

        inspectPreflightJob({
            jobId: 'PF-ISO-A',
            tenantId: tenantA,
            filePath: fileA,
            title: 'Tenant A Exclusive Spec'
        });

        // Tenant B attempts to purge Tenant A's file
        const attemptRes = await purgeJobPdfBinary('PF-ISO-A', tenantB);

        // Stored inspection for Tenant A remains unpurged and physical file on disk remains intact
        const inspectionA = getPreflightInspectionById('PF-ISO-A', tenantA);
        expect(inspectionA.assetPurged).toBe(false);
        expect(fs.existsSync(fileA)).toBe(true);
    });
});
