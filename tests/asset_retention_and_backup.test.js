import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';
import crypto from 'crypto';
import express from 'express';

const require = createRequire(import.meta.url);
process.env.JWT_SECRET = process.env.JWT_SECRET || 'ppos-unit-test-jwt-secret-key-2026-normative';
process.env.PPOS_MARKETPLACE_INTAKE_TOKEN = 'mkt-test-secret-token-2026';
process.env.PPOS_CONTROL_TOKEN = 'ctrl-test-secret-token-2026';

const {
    evaluateOrderRetentionEligibility,
    archiveOrderToColdStorage,
    unpackArchivedOrder,
    verifyTarGzIntegrity,
    runRetentionCycle,
    runDatabaseBackup,
    getStorageBackupAndRetentionStatus
} = require('../src/api/services/storage/assetRetentionAndBackupService');
const adminRouter = require('../src/api/routes/admin');
const customerPortalRouter = require('../src/api/routes/customerPortalRoutes');

describe('Phase 16 (Option 2): Storage Lifecycle, Cold Archiving & Database Snapshots', () => {
    let baseTempDir;
    let hotStorageDir;
    let archiveDir;
    let backupDir;

    beforeEach(() => {
        baseTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ppos-retention-backup-test-'));
        hotStorageDir = path.join(baseTempDir, 'hot_orders');
        archiveDir = path.join(baseTempDir, 'cold_archives');
        backupDir = path.join(baseTempDir, 'db_backups');

        fs.mkdirSync(hotStorageDir, { recursive: true });
        fs.mkdirSync(archiveDir, { recursive: true });
        fs.mkdirSync(backupDir, { recursive: true });

        process.env.PPOS_MARKETPLACE_FILES_DIR = hotStorageDir;
        process.env.PPOS_ARCHIVE_STORAGE_DIR = archiveDir;
        process.env.PPOS_DB_BACKUP_DIR = backupDir;
        process.env.PPOS_RETENTION_COLD_DAYS = '30';
        process.env.PPOS_DB_BACKUP_RETENTION_COUNT = '3';
    });

    afterEach(() => {
        if (baseTempDir && fs.existsSync(baseTempDir)) {
            fs.rmSync(baseTempDir, { recursive: true, force: true });
        }
    });

    it('1. accurately classifies orders eligible vs non-eligible for cold archiving (>30 days terminal)', () => {
        const nowMs = new Date('2026-11-01T12:00:00Z').getTime();

        // Eligible: DELIVERED 45 days ago
        const eligibleOrder = {
            order_id: 'ORD_ELIGIBLE_01',
            status: 'DELIVERED',
            updated_at: '2026-09-15T10:00:00Z'
        };
        const res1 = evaluateOrderRetentionEligibility(eligibleOrder, 30, nowMs);
        expect(res1.eligible).toBe(true);
        expect(res1.reason).toBe('TERMINAL_ORDER_EXCEEDED_COLD_DAYS');
        expect(res1.ageDays).toBeGreaterThan(40);

        // Ineligible 1: DELIVERED only 10 days ago
        const recentDelivered = {
            order_id: 'ORD_RECENT_02',
            status: 'DELIVERED',
            updated_at: '2026-10-22T10:00:00Z'
        };
        const res2 = evaluateOrderRetentionEligibility(recentDelivered, 30, nowMs);
        expect(res2.eligible).toBe(false);
        expect(res2.reason).toBe('WITHIN_HOT_RETENTION_WINDOW');

        // Ineligible 2: Active IN_PRODUCTION even if 60 days old
        const activeOrder = {
            order_id: 'ORD_ACTIVE_03',
            status: 'IN_PRODUCTION',
            updated_at: '2026-08-20T10:00:00Z'
        };
        const res3 = evaluateOrderRetentionEligibility(activeOrder, 30, nowMs);
        expect(res3.eligible).toBe(false);
        expect(res3.reason).toBe('ACTIVE_NON_TERMINAL_ORDER');
    });

    it('2. packages eligible order binaries into deterministic .tar.gz, freezes SHA-256 & parametric metadata, purges hot storage, and unpacks on demand with 100% hash parity', async () => {
        const orderId = 'ORD_COLD_TEST_101';
        const intDir = path.join(hotStorageDir, orderId, 'INTERIOR_PDF');
        const covDir = path.join(hotStorageDir, orderId, 'COVER_PDF');
        const wireDir = path.join(hotStorageDir, orderId, 'WIRE_PROOF');
        fs.mkdirSync(intDir, { recursive: true });
        fs.mkdirSync(covDir, { recursive: true });
        fs.mkdirSync(wireDir, { recursive: true });

        const intBuf = Buffer.from('%PDF-1.6\n% Interior Book Block 320pp Deterministic Payload\n%%EOF', 'utf8');
        const covBuf = Buffer.from('%PDF-1.6\n% Cover Spread Spine 27.66mm Deterministic Payload\n%%EOF', 'utf8');
        const wireBuf = Buffer.from('%PDF-1.4\n% SEPA B2B Wire Transfer Receipt\n%%EOF', 'utf8');

        const expectedIntSha256 = crypto.createHash('sha256').update(intBuf).digest('hex');
        const expectedCovSha256 = crypto.createHash('sha256').update(covBuf).digest('hex');
        const expectedWireSha256 = crypto.createHash('sha256').update(wireBuf).digest('hex');

        fs.writeFileSync(path.join(intDir, 'interior.pdf'), intBuf);
        fs.writeFileSync(path.join(covDir, 'cover.pdf'), covBuf);
        fs.writeFileSync(path.join(wireDir, 'wire_receipt.pdf'), wireBuf);

        const orderRecord = {
            order_id: orderId,
            status: 'DELIVERED',
            updated_at: '2026-08-01T10:00:00Z',
            book_spec_json: JSON.stringify({
                trimWidthMm: 210,
                trimHeightMm: 280,
                calculatedSpineMm: 27.66,
                bleedMarginMm: 3.0,
                interior_pages: 320,
                binding_method: 'hardcover_sewn'
            }),
            metadata_json: JSON.stringify({
                softProof: {
                    proofSignatureHash: 'SHA256:eidas-imprimatur-99887766'
                }
            })
        };

        // Run retention cycle with injected order
        const cycleRes = await runRetentionCycle({
            hotStorageDir,
            archiveDir,
            retentionColdDays: 30,
            nowMs: new Date('2026-11-01T12:00:00Z').getTime(),
            injectedOrders: [orderRecord]
        });

        expect(cycleRes.ok).toBe(true);
        expect(cycleRes.metrics.archivedOrdersCount).toBe(1);
        expect(cycleRes.metrics.reclaimedBytes).toBe(intBuf.length + covBuf.length + wireBuf.length);

        const archivedEntry = cycleRes.archivedOrders[0];
        expect(archivedEntry.orderId).toBe(orderId);
        expect(fs.existsSync(archivedEntry.archivePath)).toBe(true);

        // Verify hot directory was cleanly removed after integrity check
        expect(fs.existsSync(path.join(hotStorageDir, orderId))).toBe(false);

        // Verify .tar.gz header & stream integrity
        const integrity = verifyTarGzIntegrity(archivedEntry.archivePath);
        expect(integrity.valid).toBe(true);

        // Verify frozen SHA-256 hashes & parametric dimensions
        expect(archivedEntry.parametricDimensions.trimWidthMm).toBe(210);
        expect(archivedEntry.parametricDimensions.calculatedSpineMm).toBe(27.66);
        expect(archivedEntry.coldStorage.proofSignatureHash).toBe('SHA256:eidas-imprimatur-99887766');

        const hashByRole = Object.fromEntries(
            archivedEntry.frozenAssets.map(a => [a.role, a.sha256])
        );
        expect(hashByRole.INTERIOR_PDF).toBe(expectedIntSha256);
        expect(hashByRole.COVER_PDF).toBe(expectedCovSha256);
        expect(hashByRole.WIRE_PROOF).toBe(expectedWireSha256);

        // Now unpack on demand (1-Click Reorder restoration)
        const unpackRes = await unpackArchivedOrder(orderId, { hotStorageDir, archiveDir });
        expect(unpackRes.ok).toBe(true);
        expect(unpackRes.restored).toBe(true);
        expect(unpackRes.restoredFilesCount).toBe(3);

        // Verify files are back in hot storage with identical bytes and SHA-256
        const restoredInt = fs.readFileSync(path.join(hotStorageDir, orderId, 'INTERIOR_PDF', 'interior.pdf'));
        const restoredCov = fs.readFileSync(path.join(hotStorageDir, orderId, 'COVER_PDF', 'cover.pdf'));
        expect(crypto.createHash('sha256').update(restoredInt).digest('hex')).toBe(expectedIntSha256);
        expect(crypto.createHash('sha256').update(restoredCov).digest('hex')).toBe(expectedCovSha256);
    });

    it('3. generates compressed .sql.gz database snapshots and enforces retention rotation pruning', async () => {
        const stamps = ['20261101_010000', '20261101_020000', '20261101_030000', '20261101_040000', '20261101_050000'];

        let lastSnapRes = null;
        for (const stamp of stamps) {
            lastSnapRes = await runDatabaseBackup({
                backupDir,
                backupRetentionCount: 3,
                customStamp: stamp,
                forceLogicalSqlDump: true
            });
            expect(lastSnapRes.ok).toBe(true);
            expect(fs.existsSync(lastSnapRes.snapshot.path)).toBe(true);
        }

        // Only the 3 newest snapshots should be retained
        const remainingFiles = fs
            .readdirSync(backupDir)
            .filter(f => f.endsWith('.sql.gz'))
            .sort();

        expect(remainingFiles).toEqual([
            'ppos_control_snapshot_20261101_030000.sql.gz',
            'ppos_control_snapshot_20261101_040000.sql.gz',
            'ppos_control_snapshot_20261101_050000.sql.gz'
        ]);
        expect(lastSnapRes.rotation.retainedCount).toBe(3);
    });

    it('4. exposes administrative REST endpoints POST /storage/retention/run, POST /storage/backup/run, and GET /storage/backup/status', async () => {
        const app = express();
        app.use(express.json());
        app.use('/api/admin', adminRouter);
        app.use('/api/customer', customerPortalRouter);

        const server = http.createServer(app);
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        const port = server.address().port;
        const baseUrl = `http://127.0.0.1:${port}`;
        const headers = {
            'x-marketplace-token': 'mkt-test-secret-token-2026',
            'Content-Type': 'application/json'
        };

        try {
            // 1. Trigger manual DB backup
            const backupRunRes = await fetch(`${baseUrl}/api/admin/storage/backup/run`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ backupDir, forceLogicalSqlDump: true })
            });
            expect(backupRunRes.status).toBe(200);
            const backupRunData = await backupRunRes.json();
            expect(backupRunData.ok).toBe(true);
            expect(backupRunData.snapshot.filename).toMatch(/^ppos_control_snapshot_.*\.sql\.gz$/);

            // 2. Trigger manual retention cycle
            const retRunRes = await fetch(`${baseUrl}/api/admin/storage/retention/run`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ hotStorageDir, archiveDir, injectedOrders: [] })
            });
            expect(retRunRes.status).toBe(200);
            const retRunData = await retRunRes.json();
            expect(retRunData.ok).toBe(true);

            // 3. Query backup & retention status
            const statusRes = await fetch(`${baseUrl}/api/admin/storage/backup/status`, {
                headers
            });
            expect(statusRes.status).toBe(200);
            const statusData = await statusRes.json();
            expect(statusData.ok).toBe(true);
            expect(statusData.backupMetrics.availableSnapshotsCount).toBeGreaterThanOrEqual(1);
            expect(statusData.policy.criticalTables).toContain('marketplace_orders');
            expect(statusData.policy.criticalTables).toContain('customer_b2b_profiles');
        } finally {
            await new Promise(resolve => server.close(resolve));
        }
    });
});

