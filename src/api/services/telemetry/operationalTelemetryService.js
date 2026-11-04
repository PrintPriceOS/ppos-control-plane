'use strict';

/**
 * src/api/services/telemetry/operationalTelemetryService.js
 *
 * PrintPrice OS — Phase 16 (Option 1): Executive Operational Telemetry Aggregator
 *
 * Consolidates real-time plant, financial escrow, pre-press health, and disk I/O telemetry
 * across `marketplace_orders`, `marketplace_order_files`, `escrowSettlementService`,
 * `preflightEngineService`, and physical binary storage (`storage/marketplace_orders/`).
 *
 * Core Dimensions:
 * 1. Industrial Funnel Metrics (`funnel`):
 *    - Stage 01: Preflight & Digital Imprimatur (`STAGE_01_PREFLIGHT`)
 *    - Stage 02: On Press Printing (`STAGE_02_ON_PRESS`)
 *    - Stage 03: Binding & Finishing (`STAGE_03_BINDING`)
 *    - Stage 04: Palletization & Packaging (`STAGE_04_PALLETIZATION`)
 *    - Stage 05: Delivered & Signed POD (`STAGE_05_DELIVERED_POD`)
 *
 * 2. Escrow & Financial Ledger Metrics (`escrow`):
 *    - Consolidation by fund state (`UNFUNDED`, `FUNDS_LOCKED_ON_PROOF_APPROVAL`, `RELEASED_ON_SIGNED_POD`)
 *    - Total custodied volume (`EUR`), released payouts (`EUR`), and accumulated MoR fees (`EUR`).
 *
 * 3. Pre-Press Health Metrics (`prepressHealth`):
 *    - First-pass direct approval ratio (`%`) vs. orders/files with technical warnings:
 *      `LOW_DPI`, `TAC_EXCEEDED`, `BLEED_DEFICIT`, `UNEMBEDDED_FONTS`, `SPINE_MISMATCH`.
 *
 * 4. Storage & I/O Telemetry (`storageIo`):
 *    - Real disk space occupied in `storage/marketplace_orders/` (merged with registered DB binary assets),
 *      total managed PDF/Wire assets, and breakdown by role (`INTERIOR_PDF`, `COVER_PDF`, `WIRE_PROOF`).
 */

const fs = require('fs');
const path = require('path');
const mysqlClient = require('../mysqlClient');
const { listEscrowLedger, syncEscrowLedgerFromMySQL } = require('../financials/escrowSettlementService');
const { listTenantPreflightInspections } = require('../preflight/preflightEngineService');
const logger = require('../logger').child('operational-telemetry-service');

const CANONICAL_FUNNEL_STAGES = Object.freeze([
    {
        stageCode: 'STAGE_01_PREFLIGHT',
        stageNumber: 1,
        shortLabel: 'Stage 01: Preflight',
        label: 'Stage 01: Preflight & 3D Imprimatur',
        description: 'PDF/X-4 intake, spine & bleed verification, and SHA-256 cryptographic sign-off.'
    },
    {
        stageCode: 'STAGE_02_ON_PRESS',
        stageNumber: 2,
        shortLabel: 'Stage 02: On Press',
        label: 'Stage 02: CTP & Offset/Digital Press',
        description: 'CTP plate imaging, signature imposition, and press run with automated ΔE colorimetry.'
    },
    {
        stageCode: 'STAGE_03_BINDING',
        stageNumber: 3,
        shortLabel: 'Stage 03: Binding',
        label: 'Stage 03: Folding & Binding (PUR / Hardcover)',
        description: 'Signature gathering, PUR milling or thread sewing, casing-in, and 3-knife trimming.'
    },
    {
        stageCode: 'STAGE_04_PALLETIZATION',
        stageNumber: 4,
        shortLabel: 'Stage 04: Palletization',
        label: 'Stage 04: FEFCO Packaging & EPAL Palletization',
        description: 'Shrink wrapping, FEFCO 0201 boxing, EPAL Euro-pallet stacking, and GS1-128 (SSCC-18) labeling.'
    },
    {
        stageCode: 'STAGE_05_DELIVERED_POD',
        stageNumber: 5,
        shortLabel: 'Stage 05: Delivered & POD',
        label: 'Stage 05: Dispatch & Signed POD',
        description: 'B2B freight transit, publisher dock unloading, signed CMR/POD capture, and Escrow release.'
    }
]);

function round2(val) {
    return Math.round((Number(val || 0) + Number.EPSILON) * 100) / 100;
}

function safeParseJson(val, fallback = {}) {
    if (val && typeof val === 'object') return val;
    if (typeof val === 'string') {
        try {
            return JSON.parse(val);
        } catch (_) {
            return fallback;
        }
    }
    return fallback;
}

/**
 * Classifies an order record into one of the 5 canonical industrial funnel stages.
 */
function classifyOrderFunnelStage(order = {}) {
    const rawStatus = String(
        order.status || order.order_status || order.productionStage || ''
    ).toUpperCase().trim();
    const meta = safeParseJson(order.metadata_json || order.metadata, {});
    const readiness = safeParseJson(order.readiness_json || order.readiness, {});
    const trackingStage = String(
        meta.productionStage || meta.currentStage || order.currentStage || ''
    ).toUpperCase().trim();

    // Stage 05: Delivered & POD
    if (
        rawStatus.includes('DELIVERED') ||
        rawStatus.includes('COMPLETED') ||
        rawStatus.includes('POD_SIGNED') ||
        trackingStage.includes('STAGE_05') ||
        trackingStage.includes('DELIVERED') ||
        meta.podSignedAt ||
        meta.escrowStatus === 'RELEASED_ON_SIGNED_POD' ||
        order.escrowStatus === 'RELEASED_ON_SIGNED_POD'
    ) {
        return 'STAGE_05_DELIVERED_POD';
    }

    // Stage 04: Palletization & Dispatch Ready
    if (
        rawStatus.includes('PALLET') ||
        rawStatus.includes('PACKAG') ||
        rawStatus.includes('SHIPPED') ||
        rawStatus.includes('IN_TRANSIT') ||
        rawStatus.includes('DISPATCH') ||
        rawStatus.includes('READY_TO_SHIP') ||
        trackingStage.includes('STAGE_04') ||
        trackingStage.includes('PALLET')
    ) {
        return 'STAGE_04_PALLETIZATION';
    }

    // Stage 03: Binding & Finishing
    if (
        rawStatus.includes('BINDING') ||
        rawStatus.includes('FINISHING') ||
        rawStatus.includes('CASING') ||
        rawStatus.includes('FOLDING') ||
        trackingStage.includes('STAGE_03') ||
        trackingStage.includes('BINDING')
    ) {
        return 'STAGE_03_BINDING';
    }

    // Stage 02: On Press Printing
    if (
        rawStatus.includes('IN_PRODUCTION') ||
        rawStatus.includes('ON_PRESS') ||
        rawStatus.includes('PRINTING') ||
        rawStatus.includes('PLATES') ||
        rawStatus.includes('IMPOSITION') ||
        rawStatus === 'READY_FOR_PRODUCTION' ||
        rawStatus === 'PROOF_APPROVED' ||
        trackingStage.includes('STAGE_02') ||
        trackingStage.includes('ON_PRESS') ||
        meta.softProof?.status === 'APPROVED_FOR_PRESS' ||
        order.proofStatus === 'APPROVED_FOR_PRESS' ||
        meta.escrowStatus === 'FUNDS_LOCKED_ON_PROOF_APPROVAL' ||
        meta.escrowStatus === 'IN_MANUFACTURING_HOLD' ||
        order.escrowStatus === 'FUNDS_LOCKED_ON_PROOF_APPROVAL' ||
        Boolean(readiness.readyForProduction && meta.softProof?.proofSignatureHash)
    ) {
        return 'STAGE_02_ON_PRESS';
    }

    // Stage 01: Preflight & Imprimatur (Default intake stage)
    return 'STAGE_01_PREFLIGHT';
}

/**
 * Recursively scans a directory on disk and collects file count, total bytes, and role breakdown.
 */
function scanStorageDirectory(dirPath) {
    const result = {
        exists: false,
        scannedPath: dirPath,
        filesCount: 0,
        totalBytes: 0,
        byRole: {
            INTERIOR_PDF: { count: 0, bytes: 0 },
            COVER_PDF: { count: 0, bytes: 0 },
            WIRE_PROOF: { count: 0, bytes: 0 },
            OTHER: { count: 0, bytes: 0 }
        }
    };

    if (!dirPath || !fs.existsSync(dirPath)) {
        return result;
    }

    result.exists = true;

    function walk(currentPath, inheritedRole = null) {
        let entries = [];
        try {
            entries = fs.readdirSync(currentPath, { withFileTypes: true });
        } catch (_) {
            return;
        }

        for (const entry of entries) {
            const fullPath = path.join(currentPath, entry.name);
            const upperName = entry.name.toUpperCase();
            let role = inheritedRole;
            if (upperName.includes('INTERIOR')) role = 'INTERIOR_PDF';
            else if (upperName.includes('COVER')) role = 'COVER_PDF';
            else if (upperName.includes('WIRE') || upperName.includes('RECEIPT') || upperName.includes('PAYMENT')) role = 'WIRE_PROOF';

            if (entry.isDirectory()) {
                walk(fullPath, role);
            } else if (entry.isFile()) {
                try {
                    const stat = fs.statSync(fullPath);
                    const sz = Number(stat.size || 0);
                    result.filesCount += 1;
                    result.totalBytes += sz;
                    const bucket = role && result.byRole[role] ? role : 'INTERIOR_PDF';
                    result.byRole[bucket].count += 1;
                    result.byRole[bucket].bytes += sz;
                } catch (_) {}
            }
        }
    }

    walk(dirPath, null);
    return result;
}

/**
 * Inspects a file or preflight report object to extract warning categories for the incident matrix.
 */
function extractPrepressWarningsFromRecord(record = {}) {
    const warnings = new Set();
    const meta = safeParseJson(record.metadata_json || record.metadata, {});
    const preflight = meta.preflightReport || record.preflightReport || record.preflight || record;

    // 1. Check explicit warning codes / findings array
    const findings = Array.isArray(preflight.findings)
        ? preflight.findings
        : Array.isArray(preflight.warnings)
          ? preflight.warnings
          : Array.isArray(preflight.issues)
            ? preflight.issues
            : [];

    for (const item of findings) {
        const text = String(typeof item === 'string' ? item : `${item?.code || ''} ${item?.ruleId || ''} ${item?.message || ''}`).toUpperCase();
        if (text.includes('DPI') || text.includes('RESOLUTION')) warnings.add('LOW_DPI');
        if (text.includes('TAC') || text.includes('INK') || text.includes('COVERAGE') || text.includes('300%')) warnings.add('TAC_EXCEEDED');
        if (text.includes('BLEED') || text.includes('SANGRADO') || text.includes('TRIM')) warnings.add('BLEED_DEFICIT');
        if (text.includes('FONT') || text.includes('FUENTE') || text.includes('EMBED')) warnings.add('UNEMBEDDED_FONTS');
        if (text.includes('SPINE') || text.includes('LOMO')) warnings.add('SPINE_MISMATCH');
    }

    // 2. Check structured sub-objects from `preflightEngineService`
    const imgRes = preflight.imageResolution || meta.imageResolution;
    if (imgRes && (imgRes.status === 'WARNING' || imgRes.status === 'FAIL' || Number(imgRes.minDetectedDpi || 300) < 300)) {
        warnings.add('LOW_DPI');
    }

    const tac = preflight.tacAndColor || meta.tacAndColor;
    if (tac && (tac.tacExceeded === true || tac.status === 'WARNING' || tac.status === 'FAIL' || Number(tac.maxDetectedTacPct || 0) > 300)) {
        warnings.add('TAC_EXCEEDED');
    }

    const bleed = preflight.bleedGeometry || meta.bleedGeometry;
    if (bleed && (bleed.needsMirrorBleedFix === true || bleed.status === 'WARNING' || bleed.status === 'FAIL')) {
        warnings.add('BLEED_DEFICIT');
    }

    const spine = preflight.spineGeometry || meta.spineGeometry;
    if (spine && (spine.needsCoverSpineFix === true || spine.status === 'WARNING' || spine.status === 'FAIL')) {
        warnings.add('SPINE_MISMATCH');
    }

    const pdfDict = preflight.pdfBinaryTelemetry || meta.pdfBinaryTelemetry;
    if (pdfDict && pdfDict.fontsEmbedded === false) {
        warnings.add('UNEMBEDDED_FONTS');
    }

    return Array.from(warnings);
}

/**
 * Generates the consolidated real-time Operational Telemetry Summary.
 *
 * @param {Object} options
 * @param {string} [options.tenantId='tenant-default']
 * @param {string} [options.storageRoot] - Optional custom storage path for unit testing
 * @param {Array}  [options.injectedOrders] - Optional synthetic order list for unit testing
 * @param {Array}  [options.injectedFiles] - Optional synthetic file list for unit testing
 * @param {Array}  [options.injectedEscrowEntries] - Optional synthetic escrow entries for unit testing
 */
async function getOperationalTelemetrySummary(options = {}) {
    const tenantId = options.tenantId || 'tenant-default';
    const defaultStorageRoot = path.join(__dirname, '../../../../storage/marketplace_orders');
    const storageRoot = options.storageRoot || defaultStorageRoot;

    // ── 1. Load Orders from MySQL + Runtime Memory + Baseline ─────────────────
    let dbOrders = [];
    let dbFiles = [];

    if (Array.isArray(options.injectedOrders)) {
        dbOrders = options.injectedOrders;
    } else {
        try {
            let sql = `SELECT order_id, external_order_ref, status, currency, estimated_price, book_spec_json, selected_offer_json, readiness_json, metadata_json, created_at, updated_at
                 FROM marketplace_orders WHERE 1=1`;
            const params = [];

            if (options.customerEmail && options.organizationId) {
                sql += ` AND (customer_email = ? OR organization_id = ? OR JSON_UNQUOTE(JSON_EXTRACT(customer_json, '$.email')) = ?)`;
                params.push(options.customerEmail, options.organizationId, options.customerEmail);
            } else if (options.customerEmail) {
                sql += ` AND (customer_email = ? OR JSON_UNQUOTE(JSON_EXTRACT(customer_json, '$.email')) = ?)`;
                params.push(options.customerEmail, options.customerEmail);
            } else if (options.organizationId) {
                sql += ` AND organization_id = ?`;
                params.push(options.organizationId);
            } else if (tenantId && tenantId !== 'tenant-default' && tenantId !== 'all') {
                sql += ` AND tenant_id = ?`;
                params.push(tenantId);
            }

            // Exclude synthetic load test orders from telemetry unless requested
            if (!options.includeLoadTest) {
                sql += ` AND (JSON_UNQUOTE(JSON_EXTRACT(book_spec_json, '$.title')) NOT LIKE '%Load Test%' OR book_spec_json IS NULL)`;
            }

            sql += ` ORDER BY created_at DESC LIMIT 500`;
            const rows = await mysqlClient.query(sql, params);
            if (Array.isArray(rows)) {
                dbOrders = rows;
            }
        } catch (err) {
            logger.debug('MySQL marketplace_orders query skipped or offline in telemetry summary', { error: err.message });
        }
    }

    // Merge runtime customer portal orders if present and matching tenant/user criteria
    const unifiedOrdersMap = new Map();
    for (const row of dbOrders) {
        const id = row.order_id || row.orderId;
        if (!id) continue;
        unifiedOrdersMap.set(id, row);
    }

    if (!Array.isArray(options.injectedOrders)) {
        try {
            const customerPortalRoutes = require('../../routes/customerPortalRoutes');
            if (customerPortalRoutes.runtimeCustomerOrders instanceof Map) {
                for (const [id, rtOrd] of customerPortalRoutes.runtimeCustomerOrders.entries()) {
                    if (options.customerEmail && rtOrd.customer?.email !== options.customerEmail) {
                        continue;
                    }
                    if (!unifiedOrdersMap.has(id)) {
                        unifiedOrdersMap.set(id, rtOrd);
                    }
                }
            }
        } catch (_) {}
    }

    const orderIdSet = new Set(Array.from(unifiedOrdersMap.keys()));

    if (Array.isArray(options.injectedFiles)) {
        dbFiles = options.injectedFiles;
    } else {
        try {
            if (orderIdSet.size > 0) {
                const placeholders = Array.from(orderIdSet).map(() => '?').join(',');
                const fileRows = await mysqlClient.query(
                    `SELECT file_id, order_id, role, original_name, size_bytes, status, preflight_status, preflight_outcome_category, findings_count, metadata_json, created_at
                     FROM marketplace_order_files
                     WHERE order_id IN (${placeholders})
                     ORDER BY created_at DESC
                     LIMIT 1000`,
                    Array.from(orderIdSet)
                );
                if (Array.isArray(fileRows)) {
                    dbFiles = fileRows;
                }
            } else {
                dbFiles = [];
            }
        } catch (err) {
            logger.debug('MySQL marketplace_order_files query skipped or offline in telemetry summary', { error: err.message });
        }
    }

    // Only include canonical publisher reference orders for demo publisher sessions
    const isDemo = options.customerEmail?.includes('demo') || (options.isDemoAccount && !options.customerEmail);
    if (!Array.isArray(options.injectedOrders) && isDemo) {
        const baselineOrders = [
            {
                orderId: 'PUB-ORD-2026-101',
                title: 'Atlas de Arquitectura Industrial Europea (3ª Ed.)',
                status: 'IN_PRODUCTION',
                productionStage: 'STAGE_02_ON_PRESS',
                total_price: 24850.0,
                book_spec_json: { copies: 1500, interior_pages: 320 }
            },
            {
                orderId: 'PUB-ORD-2026-102',
                title: 'Crónicas del Diseño Tipográfico Suizo',
                status: 'BINDING_AND_FINISHING',
                productionStage: 'STAGE_03_BINDING',
                total_price: 16200.0,
                book_spec_json: { copies: 1000, interior_pages: 192 }
            },
            {
                orderId: 'PUB-ORD-2026-103',
                title: 'Catálogo Técnico Feria del Libro de Frankfurt 2026',
                status: 'DELIVERED',
                productionStage: 'STAGE_05_DELIVERED_POD',
                total_price: 4900.0,
                book_spec_json: { copies: 800, interior_pages: 128 }
            },
            {
                orderId: 'PUB-ORD-2026-104',
                title: 'Manual de Ingeniería Fotónica Aplicada',
                status: 'FILES_UPLOADED',
                productionStage: 'STAGE_01_PREFLIGHT',
                total_price: 6840.0,
                book_spec_json: { copies: 1200, interior_pages: 256 }
            },
            {
                orderId: 'PUB-ORD-2026-105',
                title: 'Monografía Bauhaus & Ulm 1919-1968',
                status: 'PALLETIZATION',
                productionStage: 'STAGE_04_PALLETIZATION',
                total_price: 11420.0,
                book_spec_json: { copies: 2000, interior_pages: 288 }
            }
        ];
        for (const b of baselineOrders) {
            if (!unifiedOrdersMap.has(b.orderId)) {
                unifiedOrdersMap.set(b.orderId, b);
            }
        }
    }

    const allOrders = Array.from(unifiedOrdersMap.values());

    // ── 2. Compute Industrial Funnel Metrics (Stage 01 -> Stage 05) ──────────
    const stageBuckets = new Map();
    for (const st of CANONICAL_FUNNEL_STAGES) {
        stageBuckets.set(st.stageCode, {
            ...st,
            count: 0,
            percentage: 0,
            copiesTotal: 0,
            valueEur: 0,
            sampleOrderIds: []
        });
    }

    for (const ord of allOrders) {
        const stageCode = classifyOrderFunnelStage(ord);
        const bucket = stageBuckets.get(stageCode) || stageBuckets.get('STAGE_01_PREFLIGHT');
        const spec = safeParseJson(ord.book_spec_json || ord.specs, {});
        const offer = safeParseJson(ord.selected_offer_json || ord.totals, {});
        const meta = safeParseJson(ord.metadata_json || ord.metadata, {});

        const copies = Number(spec.copies || spec.quantity || ord.copies || 500);
        const orderVal = Number(
            ord.total_price ||
            ord.estimated_price ||
            ord.totalEur ||
            offer.total ||
            offer.totalPrice ||
            meta.invoice?.amount ||
            0
        );

        bucket.count += 1;
        bucket.copiesTotal += copies;
        bucket.valueEur = round2(bucket.valueEur + orderVal);
        const oid = ord.order_id || ord.orderId;
        if (oid && bucket.sampleOrderIds.length < 6) {
            bucket.sampleOrderIds.push(oid);
        }
    }

    const totalOrdersCount = allOrders.length;
    const funnelStages = Array.from(stageBuckets.values()).map(stage => ({
        ...stage,
        percentage: totalOrdersCount > 0 ? round2((stage.count / totalOrdersCount) * 100) : 0
    }));

    const activePlantOrdersCount = funnelStages
        .filter(s => s.stageCode !== 'STAGE_05_DELIVERED_POD')
        .reduce((acc, s) => acc + s.count, 0);

    // ── 3. Compute Escrow & Financial Metrics ────────────────────────────────
    if (!Array.isArray(options.injectedEscrowEntries)) {
        try {
            await syncEscrowLedgerFromMySQL(tenantId);
        } catch (_) {}
    }

    const escrowReport = Array.isArray(options.injectedEscrowEntries)
        ? { entries: options.injectedEscrowEntries }
        : listEscrowLedger(tenantId);

    const escrowEntries = Array.isArray(escrowReport.entries) ? escrowReport.entries : [];
    const seenEscrowOrderIds = new Set(escrowEntries.map(e => e.orderId));

    // Also include unfunded orders from `allOrders` that aren't in the funded escrow ledger yet
    let unfundedCount = 0;
    let unfundedVolumeEur = 0;

    for (const ord of allOrders) {
        const oid = ord.order_id || ord.orderId;
        if (seenEscrowOrderIds.has(oid)) continue;
        const meta = safeParseJson(ord.metadata_json || ord.metadata, {});
        const offer = safeParseJson(ord.selected_offer_json || ord.totals, {});
        const val = Number(ord.total_price || ord.estimated_price || offer.total || offer.totalPrice || meta.invoice?.amount || 0);
        const escState = String(ord.escrowStatus || meta.escrowStatus || '').toUpperCase();

        if (escState === 'UNFUNDED' || String(ord.status || '').toUpperCase() === 'AWAITING_PAYMENT' || String(ord.status || '').toUpperCase() === 'FILES_REQUIRED') {
            unfundedCount += 1;
            unfundedVolumeEur = round2(unfundedVolumeEur + val);
        }
    }

    const byStatus = {
        UNFUNDED: { count: unfundedCount, volumeEur: unfundedVolumeEur, platformFeeEur: 0 },
        FUNDS_LOCKED_ON_PROOF_APPROVAL: { count: 0, volumeEur: 0, platformFeeEur: 0 },
        IN_MANUFACTURING_HOLD: { count: 0, volumeEur: 0, platformFeeEur: 0 },
        RELEASED_ON_SIGNED_POD: { count: 0, volumeEur: 0, platformFeeEur: 0 }
    };

    let totalCustodiedEur = 0;
    let totalReleasedEur = 0;
    let totalPlatformFeeMorEur = 0;
    let totalNetPrinthousePayoutEur = 0;
    let totalNetCarrierPayoutEur = 0;

    for (const entry of escrowEntries) {
        const st = String(entry.status || 'FUNDS_LOCKED_ON_PROOF_APPROVAL').toUpperCase();
        const gross = Number(entry.grossEscrowEur || 0);
        const fee = Number(entry.platformFeeEur || round2(gross * 0.05));
        const netPrint = Number(entry.netPrinthousePayoutEur || round2(gross * 0.88));
        const netCarrier = Number(entry.netCarrierPayoutEur || round2(gross * 0.07));

        if (!byStatus[st]) {
            byStatus[st] = { count: 0, volumeEur: 0, platformFeeEur: 0 };
        }
        byStatus[st].count += 1;
        byStatus[st].volumeEur = round2(byStatus[st].volumeEur + gross);
        byStatus[st].platformFeeEur = round2(byStatus[st].platformFeeEur + fee);

        totalPlatformFeeMorEur = round2(totalPlatformFeeMorEur + fee);
        totalNetPrinthousePayoutEur = round2(totalNetPrinthousePayoutEur + netPrint);
        totalNetCarrierPayoutEur = round2(totalNetCarrierPayoutEur + netCarrier);

        if (st === 'RELEASED_ON_SIGNED_POD') {
            totalReleasedEur = round2(totalReleasedEur + gross);
        } else if (st !== 'UNFUNDED') {
            totalCustodiedEur = round2(totalCustodiedEur + gross);
        }
    }

    // Consolidate `FUNDS_LOCKED_ON_PROOF_APPROVAL` + `IN_MANUFACTURING_HOLD` for the 3-state executive view
    const lockedCombinedCount =
        byStatus.FUNDS_LOCKED_ON_PROOF_APPROVAL.count + byStatus.IN_MANUFACTURING_HOLD.count;
    const lockedCombinedVolumeEur = round2(
        byStatus.FUNDS_LOCKED_ON_PROOF_APPROVAL.volumeEur + byStatus.IN_MANUFACTURING_HOLD.volumeEur
    );

    // ── 4. Compute Pre-Press Health & Incident Matrix ────────────────────────
    const incidentCounts = {
        LOW_DPI: 0,
        TAC_EXCEEDED: 0,
        BLEED_DEFICIT: 0,
        UNEMBEDDED_FONTS: 0,
        SPINE_MISMATCH: 0
    };

    const tenantInspections = listTenantPreflightInspections(tenantId);
    const evaluatedRecords = [...dbFiles, ...tenantInspections];

    let totalFilesEvaluated = evaluatedRecords.length;
    let directPassCount = 0;
    let warningsCount = 0;
    let failedCount = 0;

    if (totalFilesEvaluated > 0) {
        for (const rec of evaluatedRecords) {
            const status = String(
                rec.preflight_status || rec.overallStatus || rec.status || 'PASSED'
            ).toUpperCase();
            const findingsCount = Number(rec.findings_count || 0);
            const extractedWarnings = extractPrepressWarningsFromRecord(rec);

            for (const wCode of extractedWarnings) {
                if (incidentCounts[wCode] !== undefined) {
                    incidentCounts[wCode] += 1;
                }
            }

            if (status.includes('FAIL') || status.includes('REJECT') || status.includes('ERROR')) {
                failedCount += 1;
            } else if (
                status.includes('WARN') ||
                findingsCount > 0 ||
                extractedWarnings.length > 0
            ) {
                warningsCount += 1;
            } else {
                directPassCount += 1;
            }
        }
    } else if (isDemo) {
        // Deterministic baseline telemetry when demo account is active and no inspections yet
        totalFilesEvaluated = 24;
        directPassCount = 19;
        warningsCount = 4;
        failedCount = 1;
        incidentCounts.LOW_DPI = 1;
        incidentCounts.TAC_EXCEEDED = 2;
        incidentCounts.BLEED_DEFICIT = 2;
        incidentCounts.UNEMBEDDED_FONTS = 0;
        incidentCounts.SPINE_MISMATCH = 1;
    } else {
        totalFilesEvaluated = 0;
        directPassCount = 0;
        warningsCount = 0;
        failedCount = 0;
    }

    const firstPassSuccessRatioPct =
        totalFilesEvaluated > 0
            ? round2((directPassCount / totalFilesEvaluated) * 100)
            : 0.0;

    const incidentMatrix = [
        {
            code: 'BLEED_DEFICIT',
            label: 'Insufficient Perimeter Bleed (< 3.0 mm)',
            standardRef: 'ISO 12647-2 / Mirror Bleed',
            severity: 'WARNING',
            count: incidentCounts.BLEED_DEFICIT,
            autoFixable: true
        },
        {
            code: 'TAC_EXCEEDED',
            label: 'Total Area Coverage Exceeded (TAC > 300%)',
            standardRef: 'FOGRA39 / ISO Coated v2',
            severity: 'WARNING',
            count: incidentCounts.TAC_EXCEEDED,
            autoFixable: true
        },
        {
            code: 'SPINE_MISMATCH',
            label: 'Spine Geometry Discrepancy (|Δ| > 1.0 mm)',
            standardRef: 'PHASE-11A Parametric Spine',
            severity: 'CRITICAL',
            count: incidentCounts.SPINE_MISMATCH,
            autoFixable: true
        },
        {
            code: 'LOW_DPI',
            label: 'Low Raster Image Resolution (< 300 DPI)',
            standardRef: 'PDF/X-4 Effective DPI',
            severity: 'WARNING',
            count: incidentCounts.LOW_DPI,
            autoFixable: false
        },
        {
            code: 'UNEMBEDDED_FONTS',
            label: 'Unembedded Fonts in PDF Dictionary',
            standardRef: 'ISO 15930-7 (PDF/X-4)',
            severity: 'CRITICAL',
            count: incidentCounts.UNEMBEDDED_FONTS,
            autoFixable: false
        }
    ];

    // ── 5. Compute Storage & I/O Telemetry Scoped to Tenant/Orders ─────────────
    let totalStorageBytes = 0;
    const roleBreakdown = {
        INTERIOR_PDF: { count: 0, bytes: 0, megabytes: 0 },
        COVER_PDF: { count: 0, bytes: 0, megabytes: 0 },
        WIRE_PROOF: { count: 0, bytes: 0, megabytes: 0 }
    };

    if (orderIdSet.size > 0) {
        // Only scan storage directories belonging to the tenant's orders
        for (const oid of orderIdSet) {
            const orderDiskScan = scanStorageDirectory(path.join(storageRoot, oid));
            for (const roleKey of ['INTERIOR_PDF', 'COVER_PDF', 'WIRE_PROOF']) {
                roleBreakdown[roleKey].count += orderDiskScan.byRole[roleKey].count;
                roleBreakdown[roleKey].bytes += orderDiskScan.byRole[roleKey].bytes;
            }
        }

        // Merge with DB metadata for files belonging to the tenant's orders
        for (const f of dbFiles) {
            const r = String(f.role || 'INTERIOR_PDF').toUpperCase();
            const roleKey = r.includes('COVER')
                ? 'COVER_PDF'
                : r.includes('WIRE') || r.includes('PAYMENT')
                  ? 'WIRE_PROOF'
                  : 'INTERIOR_PDF';
            const sz = Number(f.size_bytes || f.sizeBytes || 0);
            // If disk had 0 bytes, use DB tracked size
            if (roleBreakdown[roleKey].count === 0) {
                roleBreakdown[roleKey].count += 1;
                roleBreakdown[roleKey].bytes += sz;
            }
        }
    } else if (isDemo) {
        // Demo fallback disk scan
        const diskScan = scanStorageDirectory(storageRoot);
        for (const roleKey of ['INTERIOR_PDF', 'COVER_PDF', 'WIRE_PROOF']) {
            roleBreakdown[roleKey].count = diskScan.byRole[roleKey].count;
            roleBreakdown[roleKey].bytes = diskScan.byRole[roleKey].bytes;
        }
    }

    for (const roleKey of ['INTERIOR_PDF', 'COVER_PDF', 'WIRE_PROOF']) {
        roleBreakdown[roleKey].megabytes = round2(roleBreakdown[roleKey].bytes / (1024 * 1024));
        totalStorageBytes += roleBreakdown[roleKey].bytes;
    }

    const totalAssetsCount =
        roleBreakdown.INTERIOR_PDF.count + roleBreakdown.COVER_PDF.count + roleBreakdown.WIRE_PROOF.count;

    const totalStorageMb = round2(totalStorageBytes / (1024 * 1024));
    const totalStorageGb = round2(totalStorageBytes / (1024 * 1024 * 1024));

    return {
        ok: true,
        generatedAt: new Date().toISOString(),
        tenantId,
        kpis: {
            custodiedEscrowEur: totalCustodiedEur,
            releasedEscrowEur: totalReleasedEur,
            platformFeeMorEur: totalPlatformFeeMorEur,
            activePlantOrdersCount,
            totalOrdersCount,
            preflightSuccessRatePct: firstPassSuccessRatioPct,
            diskUsageBytes: totalStorageBytes,
            diskUsageMb: totalStorageMb,
            diskUsageGb: totalStorageGb,
            totalBinaryAssetsCount: totalAssetsCount
        },
        funnel: {
            totalOrders: totalOrdersCount,
            activeInPlant: activePlantOrdersCount,
            completedDelivered: stageBuckets.get('STAGE_05_DELIVERED_POD')?.count || 0,
            stages: funnelStages
        },
        escrow: {
            currency: 'EUR',
            totalCustodiedEur,
            totalReleasedEur,
            totalPlatformFeeMorEur,
            totalNetPrinthousePayoutEur,
            totalNetCarrierPayoutEur,
            states: {
                UNFUNDED: byStatus.UNFUNDED,
                FUNDS_LOCKED_ON_PROOF_APPROVAL: {
                    count: lockedCombinedCount,
                    volumeEur: lockedCombinedVolumeEur,
                    platformFeeEur: round2(
                        byStatus.FUNDS_LOCKED_ON_PROOF_APPROVAL.platformFeeEur +
                        byStatus.IN_MANUFACTURING_HOLD.platformFeeEur
                    )
                },
                RELEASED_ON_SIGNED_POD: byStatus.RELEASED_ON_SIGNED_POD
            },
            rawStates: byStatus
        },
        prepressHealth: {
            totalFilesEvaluated,
            directPassCount,
            warningsCount,
            failedCount,
            firstPassSuccessRatioPct,
            incidentMatrix
        },
        storageIo: {
            storageRoot,
            storageDirExists: fs.existsSync(storageRoot),
            physicalDiskFilesCount: totalAssetsCount,
            physicalDiskBytes: totalStorageBytes,
            totalBytes: totalStorageBytes,
            totalMb: totalStorageMb,
            totalGb: totalStorageGb,
            totalAssetsCount,
            byRole: roleBreakdown
        }
    };
}

module.exports = {
    CANONICAL_FUNNEL_STAGES,
    classifyOrderFunnelStage,
    scanStorageDirectory,
    extractPrepressWarningsFromRecord,
    getOperationalTelemetrySummary
};
