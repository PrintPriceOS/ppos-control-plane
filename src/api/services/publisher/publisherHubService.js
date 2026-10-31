'use strict';

/**
 * src/api/services/publisher/publisherHubService.js
 *
 * PrintPrice OS — Phase 11C: Publisher B2B Hub & 3D Soft-Proofing Engine
 *
 * Responsibilities:
 * 1. Strict Multi-Tenant & Role Isolation ('PUBLISHER' vs 'PRINTHOUSE'):
 *    - Enforces that a publisher user can only list, inspect, or approve editions
 *      belonging to their own `publisherTenantId`.
 *    - Strips all internal printhouse cost & workshop metrics (`ctpPlateCostEur`,
 *      `ctpPlatesCount`, `makeReadyWasteSheets`, `makeReadyWasteCostEur`,
 *      `printhouseMarginPct`, `internalManufacturingCostEur`) when accessed by `PUBLISHER`.
 * 2. Parametric 3D Soft-Proofing & Spine Integration:
 *    - Connects directly to PHASE-11A (`calculateTheoreticalSpine`) for real-world
 *      3D dimensions (width × height × spine thickness, hardcover overhang ~3 mm,
 *      TrimBox vs BleedBox coordinates).
 *    - Captures formal telematic approval ("APPROVE FOR PRESS") or rejection with
 *      incidents ("REQUEST CORRECTION"), recording digital signature, timestamp, and actorId.
 * 3. Real-Time 6-Stage Manufacturing Timeline:
 *    1. PREFLIGHT_VALIDATED
 *    2. SOFT_PROOF_APPROVED
 *    3. PLATES_AND_IMPOSITION
 *    4. ON_PRESS_PRINTING
 *    5. BINDING_AND_FINISHING
 *    6. DISPATCHED_AND_DELIVERED
 * 4. Self-Service Document Center:
 *    - Links to Signed DIN A4 Delivery Note PDF (`/api/logistics/shipments/:id/delivery-note/pdf`),
 *      Preflight Technical Inspection (`/api/preflight/inspections/:id`), and
 *      FSC/PEFC Chain-of-Custody Certificate.
 */

const crypto = require('crypto');
const { calculateTheoreticalSpine } = require('../preflight/preflightEngineService');

const MANUFACTURING_TIMELINE_MILESTONES = Object.freeze([
    {
        step: 1,
        code: 'PREFLIGHT_VALIDATED',
        phase: 'PHASE-11A',
        label: 'Preflight & Spine Geometry Validated',
        description: 'Spine thickness, 3.0 mm bleed box, and ISO Coated v2 TAC verified.'
    },
    {
        step: 2,
        code: 'SOFT_PROOF_APPROVED',
        phase: 'PHASE-11C',
        label: '3D Soft-Proof Approved by Publisher',
        description: 'Formal telematic sign-off of cover wrap, spine orientation, and trim corners.'
    },
    {
        step: 3,
        code: 'PLATES_AND_IMPOSITION',
        phase: 'PHASE-11B',
        label: 'Signatures & Dynamic Imposition Ready',
        description: 'Editorial signatures imposed with progressive creep compensation.'
    },
    {
        step: 4,
        code: 'ON_PRESS_PRINTING',
        phase: 'MANUFACTURING',
        label: 'On Press Printing',
        description: 'Active sheetfed/rotary press run under inline spectrophotometric control.'
    },
    {
        step: 5,
        code: 'BINDING_AND_FINISHING',
        phase: 'FINISHING',
        label: 'Binding & Finishing',
        description: 'Cross-folding, gathering, PUR/Hardcover casing-in, and 3-knife trimming.'
    },
    {
        step: 6,
        code: 'DISPATCHED_AND_DELIVERED',
        phase: 'LOGISTICS-05/06/07',
        label: 'Dispatched & POD Delivered',
        description: 'GS1-128 SSCC-18 pallet tracking and signed DIN A4 Proof of Delivery.'
    }
]);

const SENSITIVE_WORKSHOP_COST_FIELDS = Object.freeze([
    'ctpPlateCostEur',
    'ctpPlatesCount',
    'makeReadyWasteSheets',
    'makeReadyWasteCostEur',
    'printhouseMarginPct',
    'printhouseNetProfitEur',
    'internalManufacturingCostEur',
    'machineHourlyRateInternalEur'
]);

// In-memory store seeded with canonical multi-tenant editorial editions
const publisherOrdersStore = new Map();
const publisherNotificationsOutbox = [];

const PUBLISHER_NOTIFICATION_EVENTS = Object.freeze({
    SOFT_PROOF_READY_FOR_REVIEW: 'SOFT_PROOF_READY_FOR_REVIEW',
    PROOF_SIGNED_AND_QUEUED: 'PROOF_SIGNED_AND_QUEUED',
    PROOF_CORRECTION_REQUESTED: 'PROOF_CORRECTION_REQUESTED',
    EDITION_ON_PRESS: 'EDITION_ON_PRESS'
});

/**
 * Emits a structured transactional notification (Email + Webhook outbox) scoped strictly to `publisherTenantId`.
 */
function dispatchPublisherLifecycleNotification({
    publisherTenantId = 'tenant-publisher-penguin',
    orderId,
    isbn,
    title,
    eventType = PUBLISHER_NOTIFICATION_EVENTS.SOFT_PROOF_READY_FOR_REVIEW,
    recipientEmail = 'production@publisher-partner.com',
    metadata = {}
} = {}) {
    const notificationId = `PUB-NOTIF-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const subjectMap = {
        [PUBLISHER_NOTIFICATION_EVENTS.SOFT_PROOF_READY_FOR_REVIEW]: `[PrintPrice OS] 3D Soft-Proof Ready for Sign-Off — ${title} (${isbn})`,
        [PUBLISHER_NOTIFICATION_EVENTS.PROOF_SIGNED_AND_QUEUED]: `[PrintPrice OS] Digital Sign-Off Confirmed (APPROVE FOR PRESS) — ${title} (${isbn})`,
        [PUBLISHER_NOTIFICATION_EVENTS.PROOF_CORRECTION_REQUESTED]: `[PrintPrice OS] Pre-Press Correction Requested — ${title} (${isbn})`,
        [PUBLISHER_NOTIFICATION_EVENTS.EDITION_ON_PRESS]: `[PrintPrice OS] Edition Entered Press Run — ${title} (${isbn})`
    };

    const record = {
        notificationId,
        publisherTenantId,
        orderId,
        isbn,
        title,
        eventType,
        channel: 'TRANSACTIONAL_EMAIL_AND_WEBHOOK',
        recipientEmail,
        subject: subjectMap[eventType] || `[PrintPrice OS] Editorial Update — ${orderId}`,
        actionUrl: `https://control.printprice.pro/publisher/hub?orderId=${encodeURIComponent(
            orderId || ''
        )}`,
        metadata,
        deliveryStatus: 'DISPATCHED',
        dispatchedAt: new Date().toISOString()
    };

    publisherNotificationsOutbox.unshift(record);
    return record;
}

/**
 * Lists transactional notifications strictly isolated by `publisherTenantId`.
 */
function listPublisherLifecycleNotifications({
    publisherTenantId = 'tenant-publisher-penguin'
} = {}) {
    ensureTenantSeeded(publisherTenantId);
    const existing = publisherNotificationsOutbox.filter(
        n => n.publisherTenantId === publisherTenantId
    );
    if (existing.length === 0) {
        dispatchPublisherLifecycleNotification({
            publisherTenantId,
            orderId: 'PUB-ORD-2026-101',
            isbn: '978-3-8365-9102-7',
            title: 'Atlas de Arquitectura Industrial Europea',
            eventType: PUBLISHER_NOTIFICATION_EVENTS.SOFT_PROOF_READY_FOR_REVIEW,
            metadata: { calculatedSpineMm: 27.66, bindingType: 'HARDCOVER_SEWN' }
        });
        dispatchPublisherLifecycleNotification({
            publisherTenantId,
            orderId: 'PUB-ORD-2026-102',
            isbn: '978-84-9066-801-6',
            title: 'Crónicas del Diseño Tipográfico Suizo',
            eventType: PUBLISHER_NOTIFICATION_EVENTS.EDITION_ON_PRESS,
            metadata: { currentStage: 'ON_PRESS_PRINTING', printRunCopies: 5000 }
        });
    }
    return publisherNotificationsOutbox.filter(n => n.publisherTenantId === publisherTenantId);
}

function buildDefaultOrdersForTenant(publisherTenantId = 'tenant-publisher-penguin') {
    const spine240Pur = calculateTheoreticalSpine({
        pageCount: 240,
        paperGrammage: 90,
        paperBulk: 1.3,
        bindingType: 'SOFTCOVER_PUR'
    });

    const spine320Hardcover = calculateTheoreticalSpine({
        pageCount: 320,
        paperGrammage: 115,
        paperBulk: 1.15,
        bindingType: 'HARDCOVER_SEWN',
        boardThicknessMm: 2.5
    });

    const spine64Saddle = calculateTheoreticalSpine({
        pageCount: 64,
        paperGrammage: 135,
        paperBulk: 1.0,
        bindingType: 'SADDLE_STITCH'
    });

    return [
        {
            orderId: 'PUB-ORD-2026-101',
            publisherTenantId,
            isbn: '978-3-8365-9102-7',
            title: 'Atlas de Arquitectura Industrial Europea',
            edition: '3ª Edición Revisada (2026)',
            printRunCopies: 3500,
            bindingType: 'HARDCOVER_SEWN',
            surfaceFinish: 'MATTE_LAMINATION_SPOT_UV',
            trimWidthMm: 210,
            trimHeightMm: 280,
            bleedMarginMm: 3.0,
            hardcoverOverhangMm: 3.0,
            pageCount: 320,
            paperGrammageGsm: 115,
            paperBulkCm3G: 1.15,
            paperSpecification: '115 g/m² GardaPat 13 Kiara (FSC Mix Credit)',
            calculatedSpineMm: spine320Hardcover.calculatedSpineMm,
            spineFormulaUsed: spine320Hardcover.formula,
            agreedPurchasePriceEur: 24850.0,
            unitPurchasePriceEur: 7.1,
            currency: 'EUR',
            currentStage: 'SOFT_PROOF_APPROVED',
            currentStageIndex: 2,
            proofStatus: 'AWAITING_APPROVAL',
            proofApprovalRecord: null,
            preflightInspectionId: 'PF-2026-082',
            shipmentId: 'SHP-2026-9901',
            sscc18: '003401234500000018',
            fscCertificateCode: 'FSC-C128904-2026',
            estimatedDeliveryDate: '2026-11-12',
            onTimeGuaranteed: true,
            // Internal workshop cost telemetry (MUST BE STRIPPED for PUBLISHER role)
            ctpPlatesCount: 80,
            ctpPlateCostEur: 1120.0,
            makeReadyWasteSheets: 1650,
            makeReadyWasteCostEur: 495.0,
            internalManufacturingCostEur: 18140.0,
            printhouseMarginPct: 27.0,
            printhouseNetProfitEur: 6710.0,
            machineHourlyRateInternalEur: 265.0
        },
        {
            orderId: 'PUB-ORD-2026-102',
            publisherTenantId,
            isbn: '978-84-9066-801-6',
            title: 'Crónicas del Diseño Tipográfico Suizo',
            edition: '1ª Edición Internacional',
            printRunCopies: 5000,
            bindingType: 'SOFTCOVER_PUR',
            surfaceFinish: 'GLOSS_VARNISH',
            trimWidthMm: 150,
            trimHeightMm: 230,
            bleedMarginMm: 3.0,
            hardcoverOverhangMm: 0,
            pageCount: 240,
            paperGrammageGsm: 90,
            paperBulkCm3G: 1.3,
            paperSpecification: '90 g/m² Munken Print White 1.3 (PEFC Certified)',
            calculatedSpineMm: spine240Pur.calculatedSpineMm,
            spineFormulaUsed: spine240Pur.formula,
            agreedPurchasePriceEur: 16200.0,
            unitPurchasePriceEur: 3.24,
            currency: 'EUR',
            currentStage: 'ON_PRESS_PRINTING',
            currentStageIndex: 4,
            proofStatus: 'APPROVED_FOR_PRESS',
            proofApprovalRecord: {
                decision: 'APPROVED',
                status: 'APPROVED_FOR_PRESS',
                approvedByUserId: 'editor-chief-01',
                digitalSignatureHash: 'SHA256:9f84b2c1e77d08a4c5e3109f8a71b2d4',
                comments: 'Lomo de 14.54 mm y sangrados de cubierta validados en visor 3D.',
                timestamp: '2026-10-29T14:22:10.000Z'
            },
            preflightInspectionId: 'PF-2026-081',
            shipmentId: 'SHP-2026-9902',
            sscc18: '003401234500000025',
            fscCertificateCode: 'PEFC/14-35-00412',
            estimatedDeliveryDate: '2026-11-06',
            onTimeGuaranteed: true,
            // Internal workshop cost telemetry (MUST BE STRIPPED for PUBLISHER role)
            ctpPlatesCount: 64,
            ctpPlateCostEur: 896.0,
            makeReadyWasteSheets: 1381,
            makeReadyWasteCostEur: 386.68,
            internalManufacturingCostEur: 11820.0,
            printhouseMarginPct: 27.04,
            printhouseNetProfitEur: 4380.0,
            machineHourlyRateInternalEur: 240.0
        },
        {
            orderId: 'PUB-ORD-2026-103',
            publisherTenantId,
            isbn: '978-3-9573-0412-9',
            title: 'Catálogo Técnico Feria del Libro de Frankfurt 2026',
            edition: 'Edición Especial DACH',
            printRunCopies: 2000,
            bindingType: 'SADDLE_STITCH',
            surfaceFinish: 'MATTE_COATED',
            trimWidthMm: 210,
            trimHeightMm: 297,
            bleedMarginMm: 3.0,
            hardcoverOverhangMm: 0,
            pageCount: 64,
            paperGrammageGsm: 135,
            paperBulkCm3G: 1.0,
            paperSpecification: '135 g/m² Magno Volume Satin (FSC Certified)',
            calculatedSpineMm: spine64Saddle.calculatedSpineMm,
            spineFormulaUsed: spine64Saddle.formula,
            agreedPurchasePriceEur: 4900.0,
            unitPurchasePriceEur: 2.45,
            currency: 'EUR',
            currentStage: 'DISPATCHED_AND_DELIVERED',
            currentStageIndex: 6,
            proofStatus: 'APPROVED_FOR_PRESS',
            proofApprovalRecord: {
                decision: 'APPROVED',
                status: 'APPROVED_FOR_PRESS',
                approvedByUserId: 'editor-chief-01',
                digitalSignatureHash: 'SHA256:3c91a0f8e1124b77d2019c4b551a890e',
                comments: 'Compensación de arrastre (creep) verificada en esquinas de corte.',
                timestamp: '2026-10-24T09:15:00.000Z'
            },
            preflightInspectionId: 'PF-2026-084',
            shipmentId: 'SHP-2026-9880',
            sscc18: '003401234500000032',
            fscCertificateCode: 'FSC-C128904-2026',
            estimatedDeliveryDate: '2026-10-30',
            onTimeGuaranteed: true,
            // Internal workshop cost telemetry (MUST BE STRIPPED for PUBLISHER role)
            ctpPlatesCount: 32,
            ctpPlateCostEur: 448.0,
            makeReadyWasteSheets: 740,
            makeReadyWasteCostEur: 192.4,
            internalManufacturingCostEur: 3520.0,
            printhouseMarginPct: 28.16,
            printhouseNetProfitEur: 1380.0,
            machineHourlyRateInternalEur: 220.0
        }
    ];
}

function ensureTenantSeeded(publisherTenantId = 'tenant-publisher-penguin') {
    const existingForTenant = [];
    for (const order of publisherOrdersStore.values()) {
        if (order.publisherTenantId === publisherTenantId) {
            existingForTenant.push(order);
        }
    }
    if (existingForTenant.length === 0) {
        const defaults = buildDefaultOrdersForTenant(publisherTenantId);
        for (const ord of defaults) {
            publisherOrdersStore.set(`${publisherTenantId}:${ord.orderId}`, ord);
        }
    }
}

/**
 * Strips all internal printhouse cost, plate count, make-ready waste, and margin fields
 * when the viewer role is `PUBLISHER` (or any non-internal printhouse role).
 */
function sanitizeOrderForRole(order, viewerRole = 'PUBLISHER') {
    const clone = JSON.parse(JSON.stringify(order));
    const roleUpper = String(viewerRole || 'PUBLISHER').toUpperCase();

    const isInternalAdminImpersonating =
        roleUpper === 'SUPER_ADMIN' && Boolean(order._includeInternalCosts);

    if (!isInternalAdminImpersonating) {
        for (const field of SENSITIVE_WORKSHOP_COST_FIELDS) {
            delete clone[field];
        }
    }

    clone.documents = {
        deliveryNotePdfUrl: `/api/logistics/shipments/${clone.shipmentId}/delivery-note/pdf`,
        preflightReportUrl: `/api/preflight/inspections/${clone.preflightInspectionId}`,
        fscChainOfCustodyUrl: `/api/publisher/orders/${clone.orderId}/certificates/fsc-pefc`
    };

    clone.softProof3DGeometry = {
        trimWidthMm: clone.trimWidthMm,
        trimHeightMm: clone.trimHeightMm,
        spineThicknessMm: clone.calculatedSpineMm,
        bleedMarginMm: clone.bleedMarginMm,
        hardcoverOverhangMm: clone.hardcoverOverhangMm,
        bindingType: clone.bindingType,
        surfaceFinish: clone.surfaceFinish,
        trimBoxMm: {
            width: clone.trimWidthMm,
            height: clone.trimHeightMm
        },
        bleedBoxMm: {
            width: clone.trimWidthMm + clone.bleedMarginMm * 2,
            height: clone.trimHeightMm + clone.bleedMarginMm * 2
        },
        fullSpreadWidthMm:
            clone.trimWidthMm * 2 +
            clone.calculatedSpineMm +
            clone.bleedMarginMm * 2
    };

    return clone;
}

/**
 * Resolves an order while strictly enforcing `publisherTenantId` isolation.
 * Throws an error with `statusCode = 403` if a publisher attempts to access another tenant's order.
 */
function resolveOrderWithTenantGuard(orderId, publisherTenantId) {
    ensureTenantSeeded(publisherTenantId);

    const directKey = `${publisherTenantId}:${orderId}`;
    if (publisherOrdersStore.has(directKey)) {
        return publisherOrdersStore.get(directKey);
    }

    // Check if the order exists under a DIFFERENT tenant -> Cross-tenant violation!
    for (const order of publisherOrdersStore.values()) {
        if (order.orderId === orderId && order.publisherTenantId !== publisherTenantId) {
            const err = new Error(
                `FORBIDDEN_CROSS_TENANT_ACCESS: Publisher tenant '${publisherTenantId}' cannot access order '${orderId}' owned by another publisher tenant.`
            );
            err.statusCode = 403;
            err.code = 'FORBIDDEN_CROSS_TENANT_ACCESS';
            throw err;
        }
    }

    const notFoundErr = new Error(`ORDER_NOT_FOUND: Editorial order '${orderId}' was not found.`);
    notFoundErr.statusCode = 404;
    notFoundErr.code = 'ORDER_NOT_FOUND';
    throw notFoundErr;
}

/**
 * Lists all active and archived orders for the authenticated `publisherTenantId`.
 */
function getPublisherOrders({ publisherTenantId = 'tenant-publisher-penguin', role = 'PUBLISHER' } = {}) {
    ensureTenantSeeded(publisherTenantId);

    const orders = [];
    for (const order of publisherOrdersStore.values()) {
        if (order.publisherTenantId === publisherTenantId) {
            orders.push(sanitizeOrderForRole(order, role));
        }
    }

    const activeTitles = orders.filter(o => o.currentStage !== 'DISPATCHED_AND_DELIVERED').length;
    const awaitingApproval = orders.filter(o => o.proofStatus === 'AWAITING_APPROVAL').length;
    const copiesInPress = orders
        .filter(o => o.currentStage !== 'DISPATCHED_AND_DELIVERED')
        .reduce((acc, o) => acc + (Number(o.printRunCopies) || 0), 0);
    const onTimeDeliveryPct =
        orders.length > 0
            ? Math.round((orders.filter(o => o.onTimeGuaranteed).length / orders.length) * 1000) / 10
            : 100.0;

    return {
        ok: true,
        publisherTenantId,
        summaryKpis: {
            activeTitles,
            awaitingApproval,
            copiesInPress,
            onTimeDeliveryPct
        },
        orders
    };
}

/**
 * Retrieves detailed order specification and 3D soft-proofing geometry.
 */
function getPublisherOrderDetail({
    orderId,
    publisherTenantId = 'tenant-publisher-penguin',
    role = 'PUBLISHER'
} = {}) {
    const order = resolveOrderWithTenantGuard(orderId, publisherTenantId);
    return {
        ok: true,
        publisherTenantId,
        order: sanitizeOrderForRole(order, role)
    };
}

/**
 * Builds the 6-stage real-time manufacturing timeline & logistics telemetry (`GET /api/publisher/orders/:id/telemetry`)
 */
function getPublisherTimeline({
    orderId,
    publisherTenantId = 'tenant-publisher-penguin',
    role = 'PUBLISHER'
} = {}) {
    const order = resolveOrderWithTenantGuard(orderId, publisherTenantId);
    const sanitized = sanitizeOrderForRole(order, role);

    const currentIdx = Number(order.currentStageIndex) || 1;
    const milestones = MANUFACTURING_TIMELINE_MILESTONES.map(m => {
        let status = 'PENDING';
        if (m.step < currentIdx) {
            status = 'COMPLETED';
        } else if (m.step === currentIdx) {
            status =
                m.code === 'SOFT_PROOF_APPROVED' && order.proofStatus === 'AWAITING_APPROVAL'
                    ? 'ACTION_REQUIRED'
                    : m.code === 'DISPATCHED_AND_DELIVERED'
                    ? 'COMPLETED'
                    : 'IN_PROGRESS';
        }

        return {
            ...m,
            status,
            completedAt:
                status === 'COMPLETED'
                    ? new Date(Date.now() - (6 - m.step) * 86400000).toISOString()
                    : null
        };
    });

    return {
        ok: true,
        orderId: sanitized.orderId,
        publisherTenantId,
        isbn: sanitized.isbn,
        title: sanitized.title,
        currentStage: sanitized.currentStage,
        proofStatus: sanitized.proofStatus,
        milestones,
        logisticsTracking: {
            shipmentId: sanitized.shipmentId,
            sscc18: sanitized.sscc18,
            estimatedDeliveryDate: sanitized.estimatedDeliveryDate,
            podSigned: sanitized.currentStage === 'DISPATCHED_AND_DELIVERED',
            documents: sanitized.documents
        },
        softProof3DGeometry: sanitized.softProof3DGeometry
    };
}

/**
 * Registers a formal telematic 3D soft-proof decision (`POST /api/publisher/orders/:id/proof-decision`)
 * Supports:
 * - `decision: 'APPROVED'` ("APPROVE FOR PRESS") -> Advances stage to `PLATES_AND_IMPOSITION` if at stage 2.
 * - `decision: 'REJECTED'` ("REQUEST CORRECTION") -> Marks `CORRECTION_REQUESTED` with bleed/spine notes.
 */
function submitProofApproval({
    orderId,
    publisherTenantId = 'tenant-publisher-penguin',
    userId = 'publisher-editor',
    role = 'PUBLISHER',
    decision = 'APPROVED',
    comments = '',
    inspectionNotes = {}
} = {}) {
    const order = resolveOrderWithTenantGuard(orderId, publisherTenantId);
    const normalizedDecision = String(decision || '').toUpperCase();

    if (normalizedDecision !== 'APPROVED' && normalizedDecision !== 'REJECTED') {
        const err = new Error(
            `INVALID_PROOF_DECISION: Decision must be 'APPROVED' or 'REJECTED'. Received '${decision}'.`
        );
        err.statusCode = 400;
        throw err;
    }

    const timestamp = new Date().toISOString();
    const signaturePayload = `${publisherTenantId}:${orderId}:${userId}:${normalizedDecision}:${timestamp}`;
    const digitalSignatureHash = `SHA256:${crypto
        .createHash('sha256')
        .update(signaturePayload)
        .digest('hex')
        .slice(0, 32)}`;

    if (normalizedDecision === 'APPROVED') {
        order.proofStatus = 'APPROVED_FOR_PRESS';
        if (order.currentStageIndex <= 2) {
            order.currentStage = 'PLATES_AND_IMPOSITION';
            order.currentStageIndex = 3;
        }
    } else {
        order.proofStatus = 'CORRECTION_REQUESTED';
        order.currentStage = 'PREFLIGHT_VALIDATED';
        order.currentStageIndex = 1;
    }

    order.proofApprovalRecord = {
        decision: normalizedDecision,
        status: order.proofStatus,
        approvedByUserId: userId,
        digitalSignatureHash,
        comments:
            comments ||
            (normalizedDecision === 'APPROVED'
                ? 'Approved for press via 3D Soft-Proofing Viewer.'
                : 'Correction requested on spine or bleed geometry.'),
        inspectionNotes: {
            spineVerifiedMm: order.calculatedSpineMm,
            bleedVerifiedMm: order.bleedMarginMm,
            ...inspectionNotes
        },
        timestamp
    };

    publisherOrdersStore.set(`${publisherTenantId}:${order.orderId}`, order);

    const notification = dispatchPublisherLifecycleNotification({
        publisherTenantId,
        orderId: order.orderId,
        isbn: order.isbn,
        title: order.title,
        eventType:
            normalizedDecision === 'APPROVED'
                ? PUBLISHER_NOTIFICATION_EVENTS.PROOF_SIGNED_AND_QUEUED
                : PUBLISHER_NOTIFICATION_EVENTS.PROOF_CORRECTION_REQUESTED,
        metadata: {
            decision: normalizedDecision,
            digitalSignatureHash,
            approvedByUserId: userId,
            calculatedSpineMm: order.calculatedSpineMm
        }
    });

    return {
        ok: true,
        orderId: order.orderId,
        publisherTenantId,
        proofStatus: order.proofStatus,
        currentStage: order.currentStage,
        proofApprovalRecord: order.proofApprovalRecord,
        notification,
        order: sanitizeOrderForRole(order, role)
    };
}

/**
 * Seeds or registers a custom editorial order for a specific `publisherTenantId` (used by UI "+ SUBMIT NEW TITLE" and tests).
 */
function createPublisherOrder(payload = {}, actorContext = {}) {
    const publisherTenantId =
        actorContext.publisherTenantId ||
        payload.publisherTenantId ||
        'tenant-publisher-penguin';
    ensureTenantSeeded(publisherTenantId);

    const orderId =
        payload.orderId || `PUB-ORD-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const pageCount = Number(payload.pageCount) || 240;
    const paperGrammageGsm = Number(payload.paperGrammageGsm) || 90;
    const paperBulkCm3G = Number(payload.paperBulkCm3G) || 1.3;
    const bindingType = payload.bindingType || 'SOFTCOVER_PUR';

    const spine = calculateTheoreticalSpine({
        pageCount,
        paperGrammage: paperGrammageGsm,
        paperBulk: paperBulkCm3G,
        bindingType
    });

    const newOrder = {
        orderId,
        publisherTenantId,
        isbn: payload.isbn || '978-84-9066-999-0',
        title: payload.title || `New Editorial Title ${orderId}`,
        edition: payload.edition || '1st Edition (2026)',
        printRunCopies: Number(payload.printRunCopies) || 2500,
        bindingType,
        surfaceFinish:
            payload.surfaceFinish ||
            (bindingType === 'HARDCOVER_SEWN' ? 'MATTE_LAMINATION_SPOT_UV' : 'MATTE_COATED'),
        trimWidthMm: Number(payload.trimWidthMm) || 150,
        trimHeightMm: Number(payload.trimHeightMm) || 230,
        bleedMarginMm: 3.0,
        hardcoverOverhangMm: bindingType === 'HARDCOVER_SEWN' ? 3.0 : 0,
        pageCount,
        paperGrammageGsm,
        paperBulkCm3G,
        paperSpecification:
            payload.paperSpecification ||
            `${paperGrammageGsm} g/m² Editorial Offset Bulk ${paperBulkCm3G} (FSC Certified)`,
        calculatedSpineMm: spine.calculatedSpineMm,
        spineFormulaUsed: spine.formula,
        agreedPurchasePriceEur: Number(payload.agreedPurchasePriceEur) || 9850.0,
        unitPurchasePriceEur:
            Math.round(
                ((Number(payload.agreedPurchasePriceEur) || 9850.0) /
                    (Number(payload.printRunCopies) || 2500)) *
                    100
            ) / 100,
        currency: 'EUR',
        currentStage: 'SOFT_PROOF_APPROVED',
        currentStageIndex: 2,
        proofStatus: 'AWAITING_APPROVAL',
        proofApprovalRecord: null,
        preflightInspectionId: payload.preflightInspectionId || `PF-${orderId}`,
        shipmentId: payload.shipmentId || `SHP-${orderId}`,
        sscc18: '003401234500000094',
        fscCertificateCode: 'FSC-C128904-2026',
        estimatedDeliveryDate: '2026-11-18',
        onTimeGuaranteed: true,
        // Internal workshop fields (hidden from PUBLISHER role)
        ctpPlatesCount: payload.ctpPlatesCount ?? 64,
        ctpPlateCostEur: payload.ctpPlateCostEur ?? 896.0,
        makeReadyWasteSheets: payload.makeReadyWasteSheets ?? 1350,
        makeReadyWasteCostEur: payload.makeReadyWasteCostEur ?? 390.0,
        internalManufacturingCostEur: payload.internalManufacturingCostEur ?? 7100.0,
        printhouseMarginPct: payload.printhouseMarginPct ?? 27.9,
        printhouseNetProfitEur: payload.printhouseNetProfitEur ?? 2750.0,
        machineHourlyRateInternalEur: 245.0
    };

    publisherOrdersStore.set(`${publisherTenantId}:${orderId}`, newOrder);
    dispatchPublisherLifecycleNotification({
        publisherTenantId,
        orderId: newOrder.orderId,
        isbn: newOrder.isbn,
        title: newOrder.title,
        eventType: PUBLISHER_NOTIFICATION_EVENTS.SOFT_PROOF_READY_FOR_REVIEW,
        metadata: {
            calculatedSpineMm: newOrder.calculatedSpineMm,
            bindingType: newOrder.bindingType
        }
    });
    return sanitizeOrderForRole(newOrder, actorContext.role || 'PUBLISHER');
}

module.exports = {
    MANUFACTURING_TIMELINE_MILESTONES,
    SENSITIVE_WORKSHOP_COST_FIELDS,
    PUBLISHER_NOTIFICATION_EVENTS,
    getPublisherOrders,
    getPublisherOrderDetail,
    getPublisherTimeline,
    submitProofApproval,
    createPublisherOrder,
    dispatchPublisherLifecycleNotification,
    listPublisherLifecycleNotifications,
    sanitizeOrderForRole
};

