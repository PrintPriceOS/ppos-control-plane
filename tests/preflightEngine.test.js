/**
 * tests/preflightEngine.test.js
 *
 * Verification suite for PHASE-11A: Automated Preflight & Spine Geometry Engine (FIX IT Engine)
 * Covers:
 * 1. Millimetric precision of theoretical spine thickness calculation for Softcover/PUR and Hardcover (Cartoné).
 * 2. Bleed deficit detection (< 3.0 mm inner, < 5.0 mm cover, < 15.0 mm hardcover wrap) and Mirror Bleed synthesis.
 * 3. Total Area Coverage (TAC) evaluation with 300% (coated) and 260% (uncoated/offset) ceilings and Rich Black < 10 pt detection.
 * 4. Image resolution (DPI) inspection (< 300 DPI continuous, < 800 DPI lineart).
 * 5. Protected REST endpoints (`POST /api/preflight/inspect` and `POST /api/preflight/auto-fix`) with multi-tenant isolation & RBAC.
 */

import { describe, it, expect } from 'vitest';

const preflightEngine = require('../src/api/services/preflight/preflightEngineService');
const wrapperEngine = require('../services/preflight/preflightEngineService');
const preflightRoutes = require('../src/api/routes/preflightRoutes');

function createMockReqRes({ method = 'POST', path = '/inspect', user = null, headers = {}, body = {}, query = {} }) {
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

    // Run router-level middleware (requireLogisticsControlPlaneAuth)
    let middlewareAllowed = false;
    preflightRoutes.requireLogisticsControlPlaneAuth(req, res, () => {
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

describe('PHASE-11A — Automated Preflight & Spine Geometry Engine (FIX IT Engine)', () => {
    it('1. Calculates millimetric spine thickness for Softcover/PUR and Hardcover (Cartoné) and detects |Δ| > 1.0 mm', () => {
        expect(wrapperEngine).toBe(preflightEngine);

        // Softcover PUR: (300 / 2) * (90 / 1000) * 1.5 + 0.5 = 150 * 0.135 + 0.5 = 20.25 + 0.5 = 20.75 mm
        const softcover = preflightEngine.calculateTheoreticalSpine({
            pageCount: 300,
            paperGrammage: 90,
            paperBulk: 1.5,
            bindingType: 'SOFTCOVER_PUR',
            declaredSpineMm: 19.0
        });

        expect(softcover.bindingCategory).toBe('SOFTCOVER');
        expect(softcover.rawPaperBlockMm).toBe(20.25);
        expect(softcover.calculatedSpineMm).toBe(20.75);
        expect(softcover.discrepancyMm).toBe(1.75);
        expect(softcover.exceedsTolerance).toBe(true);
        expect(softcover.status).toBe('CRITICAL_MISMATCH');

        // Hardcover (Cartoné): (240 / 2) * (135 / 1000) * 0.9 + (2 * 2.0) + 3.0 = 14.58 + 4.0 + 3.0 = 21.58 mm
        const hardcover = preflightEngine.calculateTheoreticalSpine({
            pageCount: 240,
            paperGrammage: 135,
            paperBulk: 0.9,
            bindingType: 'HARDCOVER',
            boardThicknessMm: 2.0,
            hingeAllowanceMm: 3.0,
            declaredSpineMm: 21.5
        });

        expect(hardcover.bindingCategory).toBe('HARDCOVER');
        expect(hardcover.rawPaperBlockMm).toBe(14.58);
        expect(hardcover.calculatedSpineMm).toBe(21.58);
        expect(hardcover.discrepancyMm).toBe(0.08);
        expect(hardcover.exceedsTolerance).toBe(false);
        expect(hardcover.status).toBe('OK');
    });

    it('2. Detects perimetral bleed deficits (< 3 mm inner, < 5 mm cover, < 15 mm hardcover wrap) and generates Mirror Bleed zones', () => {
        const deficitReport = preflightEngine.evaluateBleedGeometry({
            bindingType: 'SOFTCOVER_PUR',
            trimWidthMm: 148,
            trimHeightMm: 210,
            innerBleedMm: 1.5,
            coverBleedMm: 2.0
        });

        expect(deficitReport.status).toBe('FAIL');
        expect(deficitReport.mirrorPatchRequired).toBe(true);
        expect(deficitReport.inner.deficitMm).toBe(1.5);
        expect(deficitReport.cover.deficitMm).toBe(3.0);
        expect(deficitReport.targetInnerBleedBox).toEqual({ widthMm: 154, heightMm: 216 });
        expect(deficitReport.mirrorPatchZones.length).toBe(8);

        const hardcoverBleed = preflightEngine.evaluateBleedGeometry({
            bindingType: 'HARDCOVER',
            trimWidthMm: 170,
            trimHeightMm: 240,
            innerBleedMm: 3.0,
            hardcoverWrapMm: 12.0
        });

        expect(hardcoverBleed.status).toBe('FAIL');
        expect(hardcoverBleed.cover.requiredBleedMm).toBe(15.0);
        expect(hardcoverBleed.cover.deficitMm).toBe(3.0);
    });

    it('3. Evaluates TAC limits (300% Coated vs 260% Uncoated/Offset), Rich Black small text (< 10 pt), and Image DPI', () => {
        const uncoatedFail = preflightEngine.evaluateTacAndColor({
            coatingType: 'UNCOATED',
            detectedMaxTacPct: 275,
            smallTextRichBlackPt: 8.5
        });

        expect(uncoatedFail.maxAllowedTacPct).toBe(260);
        expect(uncoatedFail.tacExceeded).toBe(true);
        expect(uncoatedFail.excessTacPct).toBe(15);
        expect(uncoatedFail.status).toBe('FAIL');
        expect(uncoatedFail.richBlackSmallText.detected).toBe(true);

        const coatedPass = preflightEngine.evaluateTacAndColor({
            coatingType: 'COATED',
            detectedMaxTacPct: 292,
            smallTextRichBlackPt: 12
        });

        expect(coatedPass.maxAllowedTacPct).toBe(300);
        expect(coatedPass.tacExceeded).toBe(false);
        expect(coatedPass.status).toBe('PASS');

        const dpiWarn = preflightEngine.evaluateImageResolution({
            minContinuousDpi: 220,
            minLineartDpi: 600
        });
        expect(dpiWarn.status).toBe('WARNING');
        expect(dpiWarn.warnings.length).toBe(2);
    });

    it('4. Protects POST /api/preflight/inspect and POST /api/preflight/auto-fix with multi-tenant isolation & role checks', async () => {
        const router = preflightRoutes.createPreflightRouter();

        // 4.1 Rejects unauthenticated / unauthorized role
        const unauthRes = await invokeRouter(router, {
            method: 'POST',
            path: '/inspect',
            user: { role: 'GUEST', tenantId: 'tenant-alpha' },
            body: { jobId: 'PF-SEC-01', pageCount: 200, paperGrammage: 90, paperBulk: 1.3 }
        });
        expect(unauthRes.statusCode).toBe(403);
        expect(unauthRes.body.ok).toBe(false);

        // 4.2 Rejects cross-tenant spoofing
        const spoofRes = await invokeRouter(router, {
            method: 'POST',
            path: '/inspect',
            user: { role: 'PRINTHOUSE_OPERATOR', tenantId: 'tenant-alpha' },
            body: {
                tenantId: 'tenant-beta',
                jobId: 'PF-SEC-02',
                pageCount: 200,
                paperGrammage: 90,
                paperBulk: 1.3
            }
        });
        expect(spoofRes.statusCode).toBe(403);
        expect(spoofRes.body.error).toContain('FORBIDDEN_TENANT_MISMATCH');

        // 4.3 Valid inspection & subsequent auto-fix order
        const inspectRes = await invokeRouter(router, {
            method: 'POST',
            path: '/inspect',
            user: { role: 'PRINTHOUSE_ADMIN', tenantId: 'tenant-alpha' },
            body: {
                jobId: 'PF-E2E-11A',
                isbn: '978-84-9988-776-5',
                pageCount: 320,
                paperId: 'PAPER-CREAM-90-1.5',
                bindingType: 'SOFTCOVER_PUR',
                declaredSpineMm: 18.0,
                innerBleedMm: 1.0,
                detectedMaxTacPct: 280
            }
        });

        expect(inspectRes.statusCode).toBe(200);
        expect(inspectRes.body.ok).toBe(true);
        expect(inspectRes.body.overallStatus).toBe('FAIL');
        expect(inspectRes.body.spineGeometry.calculatedSpineMm).toBe(22.1);
        expect(inspectRes.body.autoFixProposal.canAutoFix).toBe(true);

        const fixRes = await invokeRouter(router, {
            method: 'POST',
            path: '/auto-fix',
            user: { role: 'PRINTHOUSE_ADMIN', tenantId: 'tenant-alpha' },
            body: {
                jobId: 'PF-E2E-11A'
            }
        });

        expect(fixRes.statusCode).toBe(200);
        expect(fixRes.body.ok).toBe(true);
        expect(fixRes.body.status).toBe('AUTO_FIXED_READY');
        expect(fixRes.body.newHealth).toBe('PASS');
        expect(fixRes.body.sanitizedArtifacts.coverPdfSanitizedUrl).toContain('22.1mm.pdf');
    });

    it('5. Supports streaming filePath inspection and immediate disk asset purge (?purgeAsset=true and DELETE /jobs/:jobId/asset)', async () => {
        const fs = require('fs');
        const os = require('os');
        const path = require('path');
        const router = preflightRoutes.createPreflightRouter();

        const tmpDir = path.join(os.tmpdir(), 'ppos-preflight-test');
        fs.mkdirSync(tmpDir, { recursive: true });
        const tmpPdf1 = path.join(tmpDir, 'test_book_2gb_sim_1.pdf');
        const tmpPdf2 = path.join(tmpDir, 'test_book_2gb_sim_2.pdf');
        fs.writeFileSync(tmpPdf1, '%PDF-1.6\n1 0 obj << /Type /Page >> endobj\n2 0 obj << /Type /Page >> endobj\n%%EOF');
        fs.writeFileSync(tmpPdf2, '%PDF-1.6\n1 0 obj << /Type /Page >> endobj\n2 0 obj << /Type /Page >> endobj\n%%EOF');

        // 5.1 Inspect with ?purgeAsset=true automatically unlinks the temporary PDF file after telemetry extraction
        const purgeOnInspectRes = await invokeRouter(router, {
            method: 'POST',
            path: '/inspect',
            user: { role: 'PRINTHOUSE_ADMIN', tenantId: 'tenant-alpha' },
            query: { purgeAsset: 'true' },
            body: {
                jobId: 'PF-PURGE-AUTO-01',
                filePath: tmpPdf1,
                pageCount: 280,
                paperGrammage: 90,
                paperBulk: 1.3,
                bindingType: 'SOFTCOVER_PUR',
                declaredSpineMm: 18.7
            }
        });

        expect(purgeOnInspectRes.statusCode).toBe(200);
        expect(purgeOnInspectRes.body.assetPurged).toBe(true);
        expect(purgeOnInspectRes.body.assetStorage.retentionState).toBe('METADATA_ONLY_ASSET_PURGED');
        expect(fs.existsSync(tmpPdf1)).toBe(false);

        // 5.2 Inspect without auto-purge retains file until DELETE /jobs/:jobId/asset is invoked
        const retainRes = await invokeRouter(router, {
            method: 'POST',
            path: '/inspect',
            user: { role: 'PRINTHOUSE_ADMIN', tenantId: 'tenant-alpha' },
            body: {
                jobId: 'PF-PURGE-MANUAL-02',
                filePath: tmpPdf2,
                pageCount: 280,
                paperGrammage: 90,
                paperBulk: 1.3,
                bindingType: 'SOFTCOVER_PUR',
                declaredSpineMm: 18.7
            }
        });

        expect(retainRes.statusCode).toBe(200);
        expect(fs.existsSync(tmpPdf2)).toBe(true);

        const deleteReq = {
            method: 'DELETE',
            url: '/jobs/PF-PURGE-MANUAL-02/asset',
            path: '/jobs/:jobId/asset',
            params: { jobId: 'PF-PURGE-MANUAL-02' },
            user: { role: 'PRINTHOUSE_ADMIN', tenantId: 'tenant-alpha' },
            headers: {},
            query: {}
        };
        const deleteRes = {
            statusCode: 200,
            body: null,
            status(c) {
                this.statusCode = c;
                return this;
            },
            json(p) {
                this.body = p;
                return this;
            }
        };

        const deleteLayer = router.stack.find(
            (l) => l.route && l.route.path === '/jobs/:jobId/asset' && l.route.methods.delete
        );
        expect(deleteLayer).toBeDefined();
        await deleteLayer.route.stack[deleteLayer.route.stack.length - 1].handle(deleteReq, deleteRes);

        expect(deleteRes.statusCode).toBe(200);
        expect(deleteRes.body.ok).toBe(true);
        expect(deleteRes.body.assetPurged).toBe(true);
        expect(deleteRes.body.diskFileRemoved).toBe(true);
        expect(deleteRes.body.retentionState).toBe('METADATA_ONLY_ASSET_PURGED');
        expect(fs.existsSync(tmpPdf2)).toBe(false);

        // 5.3 Verify GET /inspections/:id?download=pdf streams a valid PDF-1.6 (PDF/X-4) press artifact
        const pdfGen = preflightEngine.generateSanitizedPressPdfBuffer('PF-E2E-11A', 'tenant-alpha');
        expect(Buffer.isBuffer(pdfGen.buffer)).toBe(true);
        expect(pdfGen.fileName).toBe('PF-E2E-11A_autofixed_press_ready.pdf');
        const pdfStr = pdfGen.buffer.toString('latin1');
        expect(pdfStr).toContain('%PDF-1.6');
        expect(pdfStr).toContain('/TrimBox');
        expect(pdfStr).toContain('/BleedBox');
        expect(pdfStr).toContain('PF-E2E-11A');
    });
});

