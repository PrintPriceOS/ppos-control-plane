import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';
import express from 'express';

const require = createRequire(import.meta.url);
process.env.JWT_SECRET = process.env.JWT_SECRET || 'ppos-unit-test-jwt-secret-key-2026-normative';
process.env.PPOS_MARKETPLACE_INTAKE_TOKEN = 'mkt-test-secret-token-2026';
process.env.PPOS_CONTROL_TOKEN = 'ctrl-test-secret-token-2026';

const {
    CANONICAL_FUNNEL_STAGES,
    classifyOrderFunnelStage,
    getOperationalTelemetrySummary
} = require('../src/api/services/telemetry/operationalTelemetryService');
const adminRouter = require('../src/api/routes/admin');
const customerPortalRouter = require('../src/api/routes/customerPortalRoutes');

describe('Phase 16 (Option 1): Executive Operational Telemetry Aggregator & Dashboard API', () => {
    let tempStorageDir;

    beforeEach(() => {
        tempStorageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ppos-telemetry-test-'));
        process.env.PPOS_MARKETPLACE_INTAKE_TOKEN = 'mkt-test-secret-token-2026';
        process.env.PPOS_CONTROL_TOKEN = 'ctrl-test-secret-token-2026';
    });

    afterEach(() => {
        if (tempStorageDir && fs.existsSync(tempStorageDir)) {
            fs.rmSync(tempStorageDir, { recursive: true, force: true });
        }
    });

    it('1. classifies orders accurately across the 5 canonical industrial funnel stages', () => {
        expect(CANONICAL_FUNNEL_STAGES).toHaveLength(5);

        expect(classifyOrderFunnelStage({ status: 'FILES_REQUIRED' })).toBe('STAGE_01_PREFLIGHT');
        expect(classifyOrderFunnelStage({ status: 'IN_PRODUCTION' })).toBe('STAGE_02_ON_PRESS');
        expect(classifyOrderFunnelStage({ status: 'BINDING_AND_FINISHING' })).toBe('STAGE_03_BINDING');
        expect(classifyOrderFunnelStage({ status: 'PALLETIZATION' })).toBe('STAGE_04_PALLETIZATION');
        expect(classifyOrderFunnelStage({ status: 'DELIVERED' })).toBe('STAGE_05_DELIVERED_POD');
        expect(
            classifyOrderFunnelStage({
                status: 'IN_TRANSIT',
                metadata_json: JSON.stringify({ podSignedAt: '2026-10-31T10:00:00Z' })
            })
        ).toBe('STAGE_05_DELIVERED_POD');
    });

    it('2. aggregates funnel counts, escrow financial states, pre-press warning ratios, and physical disk I/O', async () => {
        const ord1IntDir = path.join(tempStorageDir, 'ORD_TEST_01', 'INTERIOR_PDF');
        const ord1CovDir = path.join(tempStorageDir, 'ORD_TEST_01', 'COVER_PDF');
        const ord2WireDir = path.join(tempStorageDir, 'ORD_TEST_02', 'WIRE_PROOF');
        fs.mkdirSync(ord1IntDir, { recursive: true });
        fs.mkdirSync(ord1CovDir, { recursive: true });
        fs.mkdirSync(ord2WireDir, { recursive: true });

        fs.writeFileSync(path.join(ord1IntDir, 'interior_block.pdf'), Buffer.alloc(1024 * 512, 'A')); // 512 KB
        fs.writeFileSync(path.join(ord1CovDir, 'cover_spread.pdf'), Buffer.alloc(1024 * 128, 'B')); // 128 KB
        fs.writeFileSync(path.join(ord2WireDir, 'sepa_wire_receipt.pdf'), Buffer.alloc(1024 * 64, 'C')); // 64 KB

        const injectedOrders = [
            {
                order_id: 'ORD_TEST_01',
                status: 'FILES_REQUIRED',
                total_price: 3200.0,
                book_spec_json: JSON.stringify({ copies: 500 })
            },
            {
                order_id: 'ORD_TEST_02',
                status: 'ON_PRESS',
                total_price: 12500.0,
                book_spec_json: JSON.stringify({ copies: 2000 })
            },
            {
                order_id: 'ORD_TEST_03',
                status: 'BINDING',
                total_price: 8400.0,
                book_spec_json: JSON.stringify({ copies: 1500 })
            },
            {
                order_id: 'ORD_TEST_04',
                status: 'PALLETIZATION',
                total_price: 6100.0,
                book_spec_json: JSON.stringify({ copies: 1000 })
            },
            {
                order_id: 'ORD_TEST_05',
                status: 'DELIVERED',
                total_price: 4900.0,
                book_spec_json: JSON.stringify({ copies: 800 })
            }
        ];

        const injectedEscrowEntries = [
            {
                orderId: 'ORD_TEST_02',
                status: 'FUNDS_LOCKED_ON_PROOF_APPROVAL',
                grossEscrowEur: 12500.0,
                platformFeeEur: 625.0,
                netPrinthousePayoutEur: 11000.0,
                netCarrierPayoutEur: 875.0
            },
            {
                orderId: 'ORD_TEST_03',
                status: 'IN_MANUFACTURING_HOLD',
                grossEscrowEur: 8400.0,
                platformFeeEur: 420.0,
                netPrinthousePayoutEur: 7392.0,
                netCarrierPayoutEur: 588.0
            },
            {
                orderId: 'ORD_TEST_05',
                status: 'RELEASED_ON_SIGNED_POD',
                grossEscrowEur: 4900.0,
                platformFeeEur: 245.0,
                netPrinthousePayoutEur: 4312.0,
                netCarrierPayoutEur: 343.0
            }
        ];

        const injectedFiles = [
            {
                file_id: 'fil_1',
                order_id: 'ORD_TEST_01',
                role: 'INTERIOR_PDF',
                size_bytes: 1024 * 512,
                preflight_status: 'PASSED',
                findings_count: 0,
                metadata_json: JSON.stringify({ preflightReport: { overallStatus: 'PASSED' } })
            },
            {
                file_id: 'fil_2',
                order_id: 'ORD_TEST_01',
                role: 'COVER_PDF',
                size_bytes: 1024 * 128,
                preflight_status: 'WARNING',
                findings_count: 2,
                metadata_json: JSON.stringify({
                    preflightReport: {
                        findings: ['TAC_EXCEEDED 318%', 'BLEED_DEFICIT 1.5mm']
                    }
                })
            },
            {
                file_id: 'fil_3',
                order_id: 'ORD_TEST_02',
                role: 'INTERIOR_PDF',
                size_bytes: 1024 * 256,
                preflight_status: 'PASSED',
                findings_count: 0
            },
            {
                file_id: 'fil_4',
                order_id: 'ORD_TEST_02',
                role: 'COVER_PDF',
                size_bytes: 1024 * 64,
                preflight_status: 'FAILED',
                findings_count: 1,
                metadata_json: JSON.stringify({
                    preflightReport: {
                        findings: ['LOW_DPI 180 DPI', 'UNEMBEDDED_FONTS']
                    }
                })
            }
        ];

        const summary = await getOperationalTelemetrySummary({
            tenantId: 'tenant-isolated-test',
            storageRoot: tempStorageDir,
            injectedOrders,
            injectedFiles,
            injectedEscrowEntries
        });

        expect(summary.ok).toBe(true);
        expect(summary.funnel.totalOrders).toBe(5);
        expect(summary.funnel.activeInPlant).toBe(4);
        expect(summary.funnel.completedDelivered).toBe(1);
        expect(summary.funnel.stages.map(s => s.count)).toEqual([1, 1, 1, 1, 1]);

        expect(summary.escrow.totalCustodiedEur).toBe(20900.0);
        expect(summary.escrow.totalReleasedEur).toBe(4900.0);
        expect(summary.escrow.totalPlatformFeeMorEur).toBe(1290.0);
        expect(summary.escrow.states.UNFUNDED.count).toBe(1);
        expect(summary.escrow.states.UNFUNDED.volumeEur).toBe(3200.0);
        expect(summary.escrow.states.FUNDS_LOCKED_ON_PROOF_APPROVAL.count).toBe(2);
        expect(summary.escrow.states.FUNDS_LOCKED_ON_PROOF_APPROVAL.volumeEur).toBe(20900.0);
        expect(summary.escrow.states.RELEASED_ON_SIGNED_POD.count).toBe(1);

        expect(summary.prepressHealth.totalFilesEvaluated).toBe(4);
        expect(summary.prepressHealth.directPassCount).toBe(2);
        expect(summary.prepressHealth.warningsCount).toBe(1);
        expect(summary.prepressHealth.failedCount).toBe(1);
        expect(summary.prepressHealth.firstPassSuccessRatioPct).toBe(50);

        const matrixMap = Object.fromEntries(
            summary.prepressHealth.incidentMatrix.map(m => [m.code, m.count])
        );
        expect(matrixMap.TAC_EXCEEDED).toBe(1);
        expect(matrixMap.BLEED_DEFICIT).toBe(1);
        expect(matrixMap.LOW_DPI).toBe(1);
        expect(matrixMap.UNEMBEDDED_FONTS).toBe(1);

        expect(summary.storageIo.storageDirExists).toBe(true);
        expect(summary.storageIo.physicalDiskFilesCount).toBe(3);
        expect(summary.storageIo.byRole.INTERIOR_PDF.count).toBe(2);
        expect(summary.storageIo.byRole.COVER_PDF.count).toBe(2);
        expect(summary.storageIo.byRole.WIRE_PROOF.count).toBe(1);
        expect(summary.storageIo.totalBytes).toBeGreaterThanOrEqual(704 * 1024);
    });

    it('3. exposes GET /api/admin/operations/telemetry-summary and GET /api/customer/operations/summary via HTTP 200', async () => {
        const app = express();
        app.use(express.json());
        app.use('/api/admin', adminRouter);
        app.use('/api/customer', customerPortalRouter);

        const server = http.createServer(app);
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        const port = server.address().port;
        const baseUrl = `http://127.0.0.1:${port}`;

        try {
            // 1. Test Admin endpoint with x-marketplace-token
            const adminRes = await fetch(`${baseUrl}/api/admin/operations/telemetry-summary`, {
                headers: { 'x-marketplace-token': 'mkt-test-secret-token-2026' }
            });
            expect(adminRes.status).toBe(200);
            const adminBody = await adminRes.json();
            expect(adminBody.ok).toBe(true);
            expect(adminBody.kpis).toBeDefined();
            expect(adminBody.funnel.stages).toHaveLength(5);
            expect(adminBody.escrow.states).toBeDefined();
            expect(adminBody.prepressHealth.incidentMatrix).toHaveLength(5);

            // 2. Test Customer Portal endpoint
            const custRes = await fetch(`${baseUrl}/api/customer/operations/summary`, {
                headers: { 'x-customer-email': 'publisher@printprice.pro' }
            });
            expect(custRes.status).toBe(200);
            const custBody = await custRes.json();
            expect(custBody.ok).toBe(true);
            expect(custBody.kpis.custodiedEscrowEur).toBeGreaterThan(0);
        } finally {
            await new Promise(resolve => server.close(resolve));
        }
    });
});
