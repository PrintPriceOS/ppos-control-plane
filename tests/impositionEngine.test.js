/**
 * tests/impositionEngine.test.js
 *
 * Verification suite for PHASE-11B: Motor de Imposición y Planchas Dinámicas
 * (Dynamic Imposition & Gang-Run Dispatcher Engine)
 *
 * Covers:
 * 1. Exact decomposition of total pages into editorial signatures (32, 16, 8, 4 pp) across B1, B2, SRA3 formats
 *    with workshop marks (min 6 mm gutter, 10-12 mm gripper edge, 6 mm color bar).
 * 2. Progressive creep compensation calculation for Saddle Stitch (Grapa / Caballete) bindings:
 *    Desplazamiento_progresivo = (Número_pliego - 1) * [4 * (Gramaje / 1000) * Bulk].
 * 3. Technical make-ready & run waste calculation for Offset 4/4 (150 sh/sig + 1.5%), Web Rotary (450 m/reel),
 *    Digital Sheetfed (10 sh + 0.5%), and post-press finishing passes (+50 sh/pass).
 * 4. Multi-tenant security, RBAC enforcement, and queue dispatch via `POST /api/manufacturing/imposition/plan`
 *    and `POST /api/manufacturing/imposition/dispatch-queue`.
 */

import { describe, it, expect } from 'vitest';

const impositionEngine = require('../src/api/services/manufacturing/impositionEngineService');
const wrapperEngine = require('../services/manufacturing/impositionEngineService');
const impositionRoutes = require('../src/api/routes/impositionRoutes');

function createMockReqRes({ method = 'POST', path = '/plan', user = null, headers = {}, body = {}, query = {} }) {
    const req = {
        method,
        url: path,
        path,
        user,
        headers,
        body,
        query
    };

    const res = {
        statusCode: 200,
        body: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.body = payload;
            return this;
        }
    };

    return { req, res };
}

async function invokeRouter(router, { method, path, user, headers, body, query }) {
    const { req, res } = createMockReqRes({ method, path, user, headers, body, query });

    let middlewareAllowed = false;
    impositionRoutes.requireLogisticsControlPlaneAuth(req, res, () => {
        middlewareAllowed = true;
    });
    if (!middlewareAllowed) {
        return res;
    }

    const stack = router.stack || [];
    for (const layer of stack) {
        if (
            layer.route &&
            layer.route.path === path &&
            layer.route.methods[method.toLowerCase()]
        ) {
            const handler = layer.route.stack[layer.route.stack.length - 1].handle;
            await handler(req, res);
            return res;
        }
    }

    res.status(404).json({ ok: false, error: 'Route not found' });
    return res;
}

describe('PHASE-11B — Dynamic Imposition & Gang-Run Dispatcher Engine', () => {
    it('1. Decomposes 240 pages on B1 (720x1020 mm) into 7x32pp + 1x16pp signatures with workshop marks', () => {
        expect(wrapperEngine).toBe(impositionEngine);

        const layoutB1 = impositionEngine.calculateSignaturesLayout({
            pageCount: 240,
            trimWidthMm: 150,
            trimHeightMm: 230,
            sheetFormat: 'B1'
        });

        expect(layoutB1.sheetFormat).toBe('B1');
        expect(layoutB1.maxSignaturePagesSupported).toBe(32);
        expect(layoutB1.totalSignaturesCount).toBe(8);
        expect(layoutB1.breakdownSummary).toBe('7×32pp + 1×16pp');
        expect(layoutB1.totalPlatesRequired).toBe(64); // 8 signatures * 8 CTP plates
        expect(layoutB1.workshopMarks.gutterMm).toBeGreaterThanOrEqual(6.0);
        expect(layoutB1.workshopMarks.gripperEdgeMm).toBe(12.0);
        expect(layoutB1.workshopMarks.colorBarMm).toBe(6.0);

        const layoutB2 = impositionEngine.calculateSignaturesLayout({
            pageCount: 136,
            trimWidthMm: 150,
            trimHeightMm: 230,
            sheetFormat: 'B2'
        });
        expect(layoutB2.maxSignaturePagesSupported).toBe(16);
        expect(layoutB2.breakdownSummary).toBe('8×16pp + 1×8pp');
        expect(layoutB2.totalSignaturesCount).toBe(9);
    });

    it('2. Calculates progressive Creep Compensation for Saddle Stitch according to bulk and grammage', () => {
        // 64 pages = 16 folded sheets.
        // Sheet thickness = 4 * (90 / 1000) * 1.3 = 0.468 mm
        // Sheet #1 (outermost) = 0 mm
        // Sheet #16 (innermost) = (16 - 1) * 0.468 = 15 * 0.468 = 7.02 mm
        const creep = impositionEngine.calculateCreepOffset({
            pageCount: 64,
            paperGrammage: 90,
            paperBulk: 1.3,
            bindingType: 'SADDLE_STITCH'
        });

        expect(creep.creepActive).toBe(true);
        expect(creep.totalFoldedSheets).toBe(16);
        expect(creep.sheetThicknessMm).toBe(0.468);
        expect(creep.sheetOffsets[0].progressiveOffsetMm).toBe(0);
        expect(creep.sheetOffsets[1].progressiveOffsetMm).toBe(0.468);
        expect(creep.maxCreepOffsetMm).toBe(7.02);

        // PUR binding has 0 progressive saddle-stitch creep
        const purCreep = impositionEngine.calculateCreepOffset({
            pageCount: 64,
            paperGrammage: 90,
            paperBulk: 1.3,
            bindingType: 'SOFTCOVER_PUR'
        });
        expect(purCreep.creepActive).toBe(false);
        expect(purCreep.maxCreepOffsetMm).toBe(0);
    });

    it('3. Models technical Make-Ready & Run Waste for Offset 4/4, Web Rotary, Digital, and Post-Press passes', () => {
        // Offset 4/4: 8 signatures, 2000 copies, 1 finishing pass (lamination)
        // Net = 8 * 2000 = 16000 sh
        // Setup = 8 * 150 = 1200 sh
        // Run waste = 16000 * 1.5% = 240 sh
        // Finishing = 1 * 50 = 50 sh
        // Total waste = 1200 + 240 + 50 = 1490 sh
        const offsetWaste = impositionEngine.estimateMakeReadyWaste({
            technology: 'OFFSET_4_4',
            signaturesCount: 8,
            copies: 2000,
            finishingPassesCount: 1
        });
        expect(offsetWaste.netSheetsRequired).toBe(16000);
        expect(offsetWaste.setupWasteSheets).toBe(1200);
        expect(offsetWaste.runWasteSheets).toBe(240);
        expect(offsetWaste.finishingWasteSheets).toBe(50);
        expect(offsetWaste.totalWasteSheets).toBe(1490);
        expect(offsetWaste.grossSheetsRequired).toBe(17490);

        // Digital Sheetfed: 10 setup sheets per job + 0.5% run waste
        const digitalWaste = impositionEngine.estimateMakeReadyWaste({
            technology: 'DIGITAL_SHEET',
            signaturesCount: 10,
            copies: 200,
            finishingPassesCount: 0
        });
        expect(digitalWaste.netSheetsRequired).toBe(2000);
        expect(digitalWaste.setupWasteSheets).toBe(10);
        expect(digitalWaste.runWasteSheets).toBe(10); // 2000 * 0.005 = 10
        expect(digitalWaste.totalWasteSheets).toBe(20);

        // Web Rotary: 450 linear meters per reel
        const webWaste = impositionEngine.estimateMakeReadyWaste({
            technology: 'WEB_ROTARY',
            signaturesCount: 4,
            copies: 10000,
            reelsCount: 2
        });
        expect(webWaste.setupLinearMeters).toBe(900);
    });

    it('4. Enforces multi-tenant isolation & RBAC on /api/manufacturing/imposition/plan and /dispatch-queue', async () => {
        const router = impositionRoutes.createImpositionRouter();

        // 4.1 Reject unauthorized role
        const unauthRes = await invokeRouter(router, {
            method: 'POST',
            path: '/plan',
            user: { role: 'PUBLIC_VIEWER', tenantId: 'tenant-1' },
            body: { pageCount: 240 }
        });
        expect(unauthRes.statusCode).toBe(403);

        // 4.2 Reject cross-tenant spoofing
        const spoofRes = await invokeRouter(router, {
            method: 'POST',
            path: '/plan',
            user: { role: 'PRINTHOUSE_OPERATOR', tenantId: 'tenant-1' },
            body: { tenantId: 'tenant-2', pageCount: 240 }
        });
        expect(spoofRes.statusCode).toBe(403);
        expect(spoofRes.body.error).toContain('FORBIDDEN_TENANT_MISMATCH');

        // 4.3 Valid Imposition Plan & Dispatch to Manufacturing Queue
        const planRes = await invokeRouter(router, {
            method: 'POST',
            path: '/plan',
            user: { role: 'PRINTHOUSE_ADMIN', tenantId: 'tenant-1' },
            body: {
                jobId: 'IMP-2026-240',
                isbn: '978-84-9900-112-3',
                pageCount: 240,
                copies: 1500,
                sheetFormat: 'B1',
                bindingType: 'SOFTCOVER_PUR',
                finishingPassesCount: 1
            }
        });

        expect(planRes.statusCode).toBe(200);
        expect(planRes.body.ok).toBe(true);
        expect(planRes.body.impositionLayout.breakdownSummary).toBe('7×32pp + 1×16pp');

        const dispatchRes = await invokeRouter(router, {
            method: 'POST',
            path: '/dispatch-queue',
            user: { role: 'PRINTHOUSE_ADMIN', tenantId: 'tenant-1' },
            body: {
                jobId: 'IMP-2026-240'
            }
        });

        expect(dispatchRes.statusCode).toBe(200);
        expect(dispatchRes.body.ok).toBe(true);
        expect(dispatchRes.body.status).toBe('DISPATCHED_TO_MANUFACTURING_QUEUE');
        expect(dispatchRes.body.totalSignaturesDispatched).toBe(8);
        expect(dispatchRes.body.totalPlatesDispatched).toBe(64);
    });
});

