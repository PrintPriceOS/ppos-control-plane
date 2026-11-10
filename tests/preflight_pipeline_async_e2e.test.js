/**
 * tests/preflight_pipeline_async_e2e.test.js
 *
 * End-to-End Verification Suite for PrintPrice OS Preflight Pipeline:
 * 1. Asynchronous Ingestion & 2GB Payload Guard (`PAYLOAD_TOO_LARGE_MAX_2GB`, HTTP 413 vs HTTP 202 Accepted)
 *    with permanent `diagnosticJobId` & `evidenceId` and canonical terminal states (`COMPLETED`, `DEGRADED`, `PARTIAL`, `FAILED`).
 * 2. Zero-Heuristic Geometric Bounds (`TrimBox` & `BleedBox`, 3.0 mm perimeter, `BleedBox == TrimBox` on bleeding content)
 *    and Embedded Font / Bitmap-Substituted (Type3) Font Audit.
 * 3. Total Area Coverage (TAC) across `Fogra39` (300-320%), `Fogra51` (300%), and `Uncoated` (260%),
 *    plus CIP4 / ISO Color Space separation (`RGB`, untagged `DeviceCMYK`, and `Spot / Pantone` isolation).
 * 4. Cryptographic HMAC-SHA256 Signed Webhook Dispatch (`PREFLIGHT_PASSED` / `PREFLIGHT_FAILED`)
 *    attaching `X-PPOS-Signature` (`t=...,v1=...`) and replay protection.
 */

import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const preflightEngine = require('../src/api/services/preflight/preflightEngineService');
const preflightRoutes = require('../src/api/routes/preflightRoutes');

function createMockReqRes({ method = 'POST', path = '/ingest', user = null, headers = {}, body = {}, query = {}, params = {} }) {
    const req = {
        method,
        url: path,
        path,
        user,
        headers,
        body,
        query,
        params
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

async function invokePreflightRoute(router, { method, path, user, headers, body, query, params }) {
    const { req, res } = createMockReqRes({ method, path, user, headers, body, query, params });

    let allowed = false;
    preflightRoutes.requireLogisticsControlPlaneAuth(req, res, () => {
        allowed = true;
    });
    if (!allowed) return res;

    const stack = router.stack || [];
    for (const layer of stack) {
        if (layer.route && layer.route.path === path && layer.route.methods[method.toLowerCase()]) {
            const handler = layer.route.stack[layer.route.stack.length - 1].handle;
            await handler(req, res);
            return res;
        }
    }

    res.status(404).json({ ok: false, error: 'Route not found' });
    return res;
}

describe('Preflight Pipeline Audit — Async 2GB Ingestion, Box Geometry, TAC & HMAC Dispatch', () => {
    it('1. Enforces strict 2 GB payload guard (PAYLOAD_TOO_LARGE_MAX_2GB / HTTP 413) and returns HTTP 202 Accepted with permanent diagnosticJobId & evidenceId', async () => {
        const router = preflightRoutes.createPreflightRouter();
        const TWO_GB_BYTES = 2 * 1024 * 1024 * 1024; // 2,147,483,648 bytes

        // 1.1 Exceeding 2 GB ceiling by 1 byte -> HTTP 413 PAYLOAD_TOO_LARGE_MAX_2GB
        const oversizedRes = await invokePreflightRoute(router, {
            method: 'POST',
            path: '/ingest',
            user: { id: 'op-1', role: 'PRINTHOUSE_ADMIN', tenantId: 'tenant-riga-01' },
            body: {
                jobId: 'PF-OVERSIZE-2GB',
                fileSizeBytes: TWO_GB_BYTES + 1,
                pageCount: 320
            }
        });

        expect(oversizedRes.statusCode).toBe(413);
        expect(oversizedRes.body.ok).toBe(false);
        expect(oversizedRes.body.error).toBe('PAYLOAD_TOO_LARGE_MAX_2GB');

        // 1.2 Valid 1.45 GB payload -> immediate HTTP 202 Accepted + background completion to canonical terminal state
        const validSizeBytes = 1450 * 1024 * 1024;
        const acceptedRes = await invokePreflightRoute(router, {
            method: 'POST',
            path: '/ingest',
            user: { id: 'op-1', role: 'PRINTHOUSE_ADMIN', tenantId: 'tenant-riga-01' },
            body: {
                jobId: 'PF-ASYNC-202-OK',
                fileSizeBytes: validSizeBytes,
                pageCount: 240,
                paperGrammage: 90,
                paperBulk: 1.3,
                bindingType: 'SOFTCOVER_PUR',
                declaredSpineMm: 14.54,
                innerBleedMm: 3.0,
                detectedMaxTacPct: 245
            }
        });

        expect(acceptedRes.statusCode).toBe(202);
        expect(acceptedRes.body.ok).toBe(true);
        expect(acceptedRes.body.status).toBe('ACCEPTED');
        expect(acceptedRes.body.diagnosticJobId).toBe('PF-ASYNC-202-OK');
        expect(acceptedRes.body.evidenceId).toMatch(/^ev_pf_/);
        expect(acceptedRes.body.canonicalTerminalStates).toEqual(['COMPLETED', 'DEGRADED', 'PARTIAL', 'FAILED']);

        // Wait for non-blocking background worker tick (`setImmediate`)
        await new Promise((resolve) => setTimeout(resolve, 25));

        const statusRes = await invokePreflightRoute(router, {
            method: 'GET',
            path: '/ingest/:id',
            user: { id: 'op-1', role: 'PRINTHOUSE_ADMIN', tenantId: 'tenant-riga-01' },
            params: { id: acceptedRes.body.evidenceId }
        });

        expect(statusRes.statusCode).toBe(200);
        expect(statusRes.body.terminalState).toBe('COMPLETED');
        expect(statusRes.body.syntheticFindingsUsed).toBe(false);
        expect(statusRes.body.report.evidenceId).toBe(acceptedRes.body.evidenceId);
    });

    it('2. Evaluates explicit TrimBox & BleedBox (3.0 mm perimeter), flags BleedBox == TrimBox on bleeding pages, and detects unembedded/bitmap fonts', () => {
        // PDF stream where BleedBox equals TrimBox ([0 0 425.20 651.97]) and contains a Type3 bitmap font
        const zeroBleedPdf = Buffer.from(
            `%PDF-1.6
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 425.20 651.97] /TrimBox [0 0 425.20 651.97] /BleedBox [0 0 425.20 651.97] /Resources << /Font << /F1 4 0 R >> >> >> endobj
4 0 obj << /Type /Font /Subtype /Type3 /BaseFont /BitmapCustomFont >> endobj
%%EOF`,
            'latin1'
        );

        const report = preflightEngine.inspectPreflightJob(
            {
                jobId: 'PF-BOX-FONT-01',
                pdfBuffer: zeroBleedPdf,
                pageCount: 192,
                paperGrammage: 115,
                paperBulk: 1.1,
                paperCoating: 'COATED',
                hasBleedingContent: true,
                missingFonts: ['GaramondPremrPro-It'],
                pageBoundingBoxes: [
                    {
                        pageNumber: 1,
                        trimWidthMm: 150,
                        trimHeightMm: 230,
                        bleedWidthMm: 150,
                        bleedHeightMm: 230,
                        bleedMarginMm: 0,
                        hasBleedingContent: true
                    }
                ]
            },
            { tenantId: 'tenant-riga-01' }
        );

        expect(report.overallStatus).toBe('FAIL');
        expect(report.terminalState).toBe('FAILED');
        expect(report.boundingBoxes.bleedBoxEqualsTrimBoxOnBleedingPages).toBe(true);
        expect(report.boundingBoxes.bleedCompliant).toBe(false);
        expect(report.bleedGeometry.affectedZeroBleedPages).toContain(1);

        const findingCodes = report.findings.map((f) => f.code);
        expect(findingCodes).toContain('BLEEDBOX_EQUALS_TRIMBOX_ON_BLEEDING_CONTENT');
        expect(findingCodes).toContain('INSUFFICIENT_PERIMETRAL_BLEED');
        expect(findingCodes).toContain('UNEMBEDDED_FONTS_DETECTED');
        expect(findingCodes).toContain('BITMAP_SUBSTITUTED_FONTS_DETECTED');
    });

    it('3. Enforces TAC limits for Fogra39 (300-320%), Fogra51 (300%), and Uncoated (260%) and isolates RGB, untagged DeviceCMYK, and Spot/Pantone channels', () => {
        // 3.1 Fogra39 at 328% TAC -> exceeds both 300% target and 320% critical ceiling
        const fogra39Eval = preflightEngine.evaluateTacAndColor({
            colorProfile: 'FOGRA39',
            detectedMaxTacPct: 328
        });
        expect(fogra39Eval.targetProfileCode).toBe('FOGRA39');
        expect(fogra39Eval.maxAllowedTacPct).toBe(300);
        expect(fogra39Eval.criticalCeilingTacPct).toBe(320);
        expect(fogra39Eval.tacExceeded).toBe(true);
        expect(fogra39Eval.criticalTacExceeded).toBe(true);
        expect(fogra39Eval.status).toBe('FAIL');

        // 3.2 Fogra51 at 305% TAC -> exceeds 300% PSO Coated v3 limit
        const fogra51Eval = preflightEngine.evaluateTacAndColor({
            colorProfile: 'FOGRA51',
            detectedMaxTacPct: 305
        });
        expect(fogra51Eval.targetProfileCode).toBe('FOGRA51');
        expect(fogra51Eval.maxAllowedTacPct).toBe(300);
        expect(fogra51Eval.tacExceeded).toBe(true);

        // 3.3 Uncoated (Fogra47/52) at 272% TAC -> exceeds 260% limit
        const uncoatedEval = preflightEngine.evaluateTacAndColor({
            colorProfile: 'FOGRA52',
            detectedMaxTacPct: 272
        });
        expect(uncoatedEval.targetProfileCode).toBe('FOGRA52');
        expect(uncoatedEval.maxAllowedTacPct).toBe(260);
        expect(uncoatedEval.tacExceeded).toBe(true);

        // 3.4 Color space separation: RGB + Untagged DeviceCMYK + Spot Pantone in CMYK_4_4 process
        const colorPdf = Buffer.from(
            `%PDF-1.6
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /Resources << /ColorSpace << /CS1 /DeviceRGB /CS2 /DeviceCMYK /CS3 [/Separation /PANTONE_185_C /DeviceCMYK << >>] >> >> >> endobj
%%EOF`,
            'latin1'
        );

        const colorReport = preflightEngine.inspectPreflightJob(
            {
                jobId: 'PF-COLOR-CIP4-01',
                pdfBuffer: colorPdf,
                colorProfile: 'FOGRA51',
                detectedMaxTacPct: 290,
                innerBleedMm: 3.0,
                strictOutputIntentCheck: true,
                allowSpotColors: false,
                strictSpotColorGate: true
            },
            { tenantId: 'tenant-riga-01' }
        );

        expect(colorReport.colorSpaces).toContain('RGB');
        expect(colorReport.colorSpaces).toContain('SPOT_PANTONE');
        expect(colorReport.untaggedDeviceCmyk).toBe(true);
        expect(colorReport.spotColorsDetected).toContain('PANTONE_185_C');
        expect(colorReport.overallStatus).toBe('FAIL');

        const codes = colorReport.findings.map((f) => f.code);
        expect(codes).toContain('RGB_COLOR_SPACE_DETECTED');
        expect(codes).toContain('UNTAGGED_DEVICECMYK_DETECTED');
        expect(codes).toContain('SPOT_COLOR_IN_CMYK_PROCESS');
    });

    it('4. Dispatches PREFLIGHT_PASSED and PREFLIGHT_FAILED webhooks signed with HMAC-SHA256 (X-PPOS-Signature) and verifies cryptographic authenticity', async () => {
        const tenantSecret = 'whsec_live_riga_printhouse_998877665544332211';
        const capturedDeliveries = [];

        const passReport = preflightEngine.inspectPreflightJob(
            {
                jobId: 'PF-WH-PASS-101',
                evidenceId: 'ev_pf_pass_101',
                pageCount: 256,
                paperGrammage: 90,
                paperBulk: 1.3,
                paperCoating: 'COATED',
                colorProfile: 'FOGRA39',
                trimWidthMm: 150,
                trimHeightMm: 230,
                innerBleedMm: 3.0,
                declaredSpineMm: 15.48,
                detectedMaxTacPct: 288
            },
            { tenantId: 'tenant-riga-01' }
        );

        const passDispatch = await preflightEngine.dispatchPreflightWebhookEvent(passReport, {
            secret: tenantSecret,
            targetUrl: 'https://erp.baltic-print.lv/webhooks/ppos',
            mockHandler: async (req) => {
                capturedDeliveries.push(req);
                return { status: 200 };
            }
        });

        expect(passDispatch.ok).toBe(true);
        expect(passDispatch.event).toBe('PREFLIGHT_PASSED');
        expect(passDispatch.status).toBe('COMPLETED');
        expect(passDispatch.headers['X-PPOS-Signature']).toMatch(/^t=\d+,v1=[a-f0-9]{64}$/);
        expect(passDispatch.payload).toMatchObject({
            event: 'PREFLIGHT_PASSED',
            jobId: 'PF-WH-PASS-101',
            evidenceId: 'ev_pf_pass_101',
            status: 'COMPLETED',
            pageCount: 256,
            colorProfile: 'ISO Coated v2 300% (ECI)',
            tacMaxObserved: 288,
            boundingBoxes: {
                trimBoxMm: { widthMm: 150, heightMm: 230 },
                bleedBoxMm: { widthMm: 156, heightMm: 236 },
                bleedMarginMm: 3,
                bleedCompliant: true
            }
        });

        // Verify cryptographic HMAC-SHA256 signature & tamper/replay resistance
        const isAuthentic = preflightEngine.verifyPreflightWebhookSignature(
            passDispatch.payloadString,
            passDispatch.headers['X-PPOS-Signature'],
            tenantSecret
        );
        expect(isAuthentic).toBe(true);

        const isWrongSecretValid = preflightEngine.verifyPreflightWebhookSignature(
            passDispatch.payloadString,
            passDispatch.headers['X-PPOS-Signature'],
            'whsec_wrong_secret'
        );
        expect(isWrongSecretValid).toBe(false);

        const isTamperedPayloadValid = preflightEngine.verifyPreflightWebhookSignature(
            passDispatch.payloadString.replace('288', '350'),
            passDispatch.headers['X-PPOS-Signature'],
            tenantSecret
        );
        expect(isTamperedPayloadValid).toBe(false);

        // Now verify PREFLIGHT_FAILED webhook emission when TAC & bleed fail
        const failReport = preflightEngine.inspectPreflightJob(
            {
                jobId: 'PF-WH-FAIL-102',
                evidenceId: 'ev_pf_fail_102',
                pageCount: 256,
                paperGrammage: 90,
                paperBulk: 1.3,
                paperCoating: 'COATED',
                colorProfile: 'FOGRA39',
                innerBleedMm: 0.0,
                detectedMaxTacPct: 335
            },
            { tenantId: 'tenant-riga-01' }
        );

        const failDispatch = await preflightEngine.dispatchPreflightWebhookEvent(failReport, {
            secret: tenantSecret,
            mockHandler: async (req) => {
                capturedDeliveries.push(req);
                return { status: 200 };
            }
        });

        expect(failDispatch.ok).toBe(true);
        expect(failDispatch.event).toBe('PREFLIGHT_FAILED');
        expect(failDispatch.status).toBe('FAILED');
        expect(failDispatch.payload.tacMaxObserved).toBe(335);
        expect(failDispatch.payload.boundingBoxes.bleedCompliant).toBe(false);
        expect(capturedDeliveries.length).toBe(2);
    });
});
