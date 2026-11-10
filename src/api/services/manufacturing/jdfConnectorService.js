'use strict';

/**
 * src/api/services/manufacturing/jdfConnectorService.js
 *
 * PrintPrice OS — Phase 12B: CIP4 JDF 1.7 Job Ticket Generator & JMF Press Telemetry Bridge
 *
 * Responsibilities:
 * 1. Generates standards-compliant CIP4 JDF 1.7 / JMF XML job tickets (`generateJdfJobTicketXml`)
 *    ready to feed Heidelberg Prinect, Kodak Prinergy, and HP Indigo Production Pro RIPs/CTPs.
 * 2. Includes mandatory CIP4 descriptors:
 *    - `<Device>` (`DeviceID`, `DeviceClass="Press"`, `FolderDeviceID`)
 *    - `<SheetLayout>` (`SheetFormat`, `UsableWidthMm`, `UsableHeightMm`, `GripperMarginMm`, `GrainDirection`)
 *    - `<MarksList>` (`CutMarks`, `RegistrationMarks`, `ColorControlStrip`, `CollationMarks`, `FoldMarks`)
 *    - `<FoldingIntent>` (`FoldCatalog`, `MaxSignaturePages`, `GrainAlignment`, `CaliperUm`)
 * 3. Embeds PHASE-11A physical geometry (`CoverApplicationParams` spine width in mm,
 *    `InterpretingParams` & `ColorantControl` ISO Coated v2 / FOGRA39 TAC limits) and
 *    PHASE-11B imposition layout (`LayoutPreparationParams`, `StrippingParams` signature breakdown
 *    32/16/8/4 pp, B1/B2/SRA3 sheet dimensions, and progressive caliper-driven creep offset).
 * 4. Processes incoming JMF (`Job Messaging Format`) telemetry signals (`processJmfTelemetrySignal`)
 *    updating live good-sheet counters, make-ready waste, and CTP plate burn states.
 */

const crypto = require('crypto');
const { calculateTheoreticalSpine } = require('../preflight/preflightEngineService');
const {
    MACHINE_SHEET_FORMATS,
    resolveSubstrateCaliperSpec,
    calculateSignaturesLayout,
    calculateCreepOffset,
    estimateMakeReadyWaste
} = require('./impositionEngineService');

const jmfTelemetryStore = new Map();

function escapeXml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

/**
 * Generates a complete CIP4 JDF 1.7 / JMF XML Job Ticket (`GET /api/manufacturing/imposition/:jobId/jdf-ticket.xml`)
 */
function generateJdfJobTicketXml(payload = {}) {
    const jobId = payload.jobId || 'PF-2026-082';
    const isbn = payload.isbn || '978-3-8365-9102-7';
    const title = payload.title || 'Atlas de Arquitectura Industrial Europea';
    const totalPages = Number(payload.totalPages || payload.pageCount) || 240;
    const printRunCopies = Number(payload.printRunCopies || payload.copies) || 3000;
    const trimWidthMm = Number(payload.trimWidthMm) || 150;
    const trimHeightMm = Number(payload.trimHeightMm) || 230;
    const bleedMarginMm = Number(payload.bleedMarginMm) || 3.0;
    const variantId = payload.variantId || payload.variant_id || null;
    const grainDirection = payload.grainDirection || payload.grain_direction || 'LONG_GRAIN';

    const substrate = resolveSubstrateCaliperSpec({
        caliperUm: payload.caliperUm ?? payload.caliper_um,
        paperGrammage: payload.paperGrammage ?? payload.gsm ?? 90,
        paperBulk: payload.paperBulk ?? payload.bulkFactor ?? payload.bulk_volume
    });

    const paperGrammage = substrate.grammageGsm;
    const paperBulk = substrate.paperBulk;
    const caliperUm = substrate.caliperUm;
    const bindingType = payload.bindingType || 'SOFTCOVER_PUR';
    const machineFormatCode = String(payload.machineFormatCode || payload.sheetFormat || 'B1').toUpperCase();
    const machineSpec = MACHINE_SHEET_FORMATS[machineFormatCode] || MACHINE_SHEET_FORMATS.B1;
    const deviceId = payload.deviceId || machineSpec.deviceId || 'HEIDELBERG-XL106-PRINECT-01';
    const targetRipSystem = payload.targetRipSystem || 'HEIDELBERG_PRINECT_2026';

    const spine = calculateTheoreticalSpine({
        pageCount: totalPages,
        paperGrammage,
        paperBulk,
        bindingType
    });

    const layout = calculateSignaturesLayout({
        pageCount: totalPages,
        trimWidthMm,
        trimHeightMm,
        sheetFormat: machineFormatCode,
        grainDirection,
        caliperUm,
        paperGrammage,
        paperBulk
    });

    const creep = calculateCreepOffset({
        pageCount: totalPages,
        caliperUm,
        paperGrammage,
        paperBulk,
        bindingType,
        foldCompressionFactor: payload.foldCompressionFactor,
        signaturePages: layout.maxSignaturePagesSupported
    });

    const waste = estimateMakeReadyWaste({
        technology:
            machineFormatCode === 'SRA3'
                ? 'DIGITAL_SHEET'
                : machineFormatCode === 'WEB_ROTARY'
                ? 'WEB_ROTARY'
                : 'OFFSET_4_4',
        signaturesCount: layout.totalSignaturesCount,
        copies: printRunCopies,
        finishingPassesCount: 2
    });

    const maxTacPct = payload.paperCoating === 'UNCOATED' ? 260 : 300;
    const iccProfile =
        payload.paperCoating === 'UNCOATED'
            ? 'PSO_Uncoated_ISO12647_eci.icc'
            : 'ISOcoated_v2_300_eci.icc';

    let pageCursor = 1;
    const strippingNodesXml = layout.signatures
        .map(sig => {
            const pageStart = pageCursor;
            const pageEnd = pageCursor + sig.signaturePages - 1;
            pageCursor = pageEnd + 1;
            const sheetOffset =
                creep.sheetOffsets?.find(s => s.sheetNumber === sig.signatureNumber)
                    ?.progressiveOffsetMm ?? 0;
            return `      <BinderySignature ID="SIG_${sig.signatureNumber}" SignatureType="FoldGrid" NumberUp="${sig.signaturePages / 2}" FoldCatalog="${escapeXml(sig.foldCatalogCode || sig.foldPattern)}" WorkStyle="${escapeXml(sig.workMode)}">
        <SignatureCell PageRange="${pageStart}-${pageEnd}" CreepOffsetMm="${sheetOffset}" PlatesCMYK="${sig.platesRequired}" GrainDirection="${escapeXml(sig.grainDirection)}" />
      </BinderySignature>`;
        })
        .join('\n');

    const primaryFoldCatalog = layout.signatures[0]?.foldCatalogCode || 'F32-7';
    const primaryFoldPattern = layout.signatures[0]?.foldPattern || '4-Fold Cross (French Fold 32pp)';

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<JDF xmlns="http://www.cip4.org/JDFSchema_1_1"
     ID="JDF_${escapeXml(jobId)}"
     JobID="${escapeXml(jobId)}"
     JobPartID="PART_IMPOSITION_${escapeXml(machineFormatCode)}"
     Status="Ready"
     Type="Combined"
     Types="LayoutPreparation Imposition Interpreting Rendering DigitalPrinting ConventionalPrinting Folding Stitching"
     Version="1.7"
     DescriptiveName="${escapeXml(title)} (ISBN ${escapeXml(isbn)})">
  <AuditPool>
    <Created AgentName="PrintPriceOS Control Plane Phase-12B" AgentVersion="2026.5" TimeStamp="${new Date().toISOString()}" TargetRIP="${escapeXml(targetRipSystem)}" />
  </AuditPool>
  <ResourcePool>
    <Device ID="DEV_01" Class="Implementation" Status="Available" DeviceID="${escapeXml(deviceId)}" DeviceClass="Press" FriendlyName="${escapeXml(layout.machineName)}" FolderDeviceID="${escapeXml(layout.folderDeviceId || 'STAHL-KH82-FOLDER-01')}" />
    <LayoutPreparationParams ID="LPP_01" Class="Parameter" Status="Available" NumberUp="${layout.maxSignaturePagesSupported / 2}" PresentationDirection="FoldCatalog" BindingEdge="Left">
      <ExternalImpositionTemplate FileSpec="urn:printprice:imposition:${escapeXml(jobId)}:${escapeXml(layout.breakdownSummary)}" />
      <SheetLayout SheetFormat="${escapeXml(layout.sheetFormat)}" SheetWidthMm="${layout.sheetDimensionsMm.widthMm}" SheetHeightMm="${layout.sheetDimensionsMm.heightMm}" UsableWidthMm="${layout.printableAreaMm.widthMm}" UsableHeightMm="${layout.printableAreaMm.heightMm}" GripperMarginMm="${layout.workshopMarks.gripperEdgeMm}" ColorBarMm="${layout.workshopMarks.colorBarMm}" GrainDirection="${escapeXml(layout.grainDirection)}" GrainAlignment="${escapeXml(layout.grainAlignmentStatus)}" />
      <MarksList RegistrationMarks="true" CutMarks="true" FoldMarks="true" CollationMarks="true" ColorControlStrip="true" BleedMm="${layout.workshopMarks.bleedPerPageMm}" GutterMm="${layout.workshopMarks.gutterMm}" />
      <CreepCompensation Enabled="${creep.creepActive}" BindingType="${escapeXml(bindingType)}" CaliperUm="${caliperUm}" CaliperSource="${escapeXml(substrate.caliperSource)}" LeafDisplacementMm="${creep.leafDisplacementMm}" SheetThicknessMm="${creep.sheetThicknessMm}" AccumulatedBlockThicknessMm="${creep.accumulatedBlockThicknessMm}" MaxInnerCreepMm="${creep.maxCreepOffsetMm}" ExceedsFoldingTolerance="${creep.exceedsFoldingTolerance}" />
    </LayoutPreparationParams>
    <FoldingIntent ID="FI_01" Class="Intent" Status="Available" FoldCatalog="${escapeXml(primaryFoldCatalog)}" FoldPattern="${escapeXml(primaryFoldPattern)}" MaxSignaturePages="${layout.maxSignaturePagesSupported}" GeometricMaxPages="${layout.geometricMaxSignaturePages}" GrainDirection="${escapeXml(layout.grainDirection)}" CaliperUm="${caliperUm}" VariantID="${escapeXml(variantId || 'MASTER_CATALOG')}" />
    <StrippingParams ID="STP_01" Class="Parameter" Status="Available" SheetFormat="${escapeXml(layout.sheetFormat)}" SheetWidthMm="${layout.sheetDimensionsMm.widthMm}" SheetHeightMm="${layout.sheetDimensionsMm.heightMm}" GripperMarginMm="${layout.workshopMarks.gripperEdgeMm}" ColorBarMm="${layout.workshopMarks.colorBarMm}">
${strippingNodesXml}
    </StrippingParams>
    <InterpretingParams ID="INT_01" Class="Parameter" Status="Available" PrintQuality="High" BleedMarginMm="${bleedMarginMm}" TrimBoxMm="${trimWidthMm}x${trimHeightMm}" />
    <ColorantControl ID="COL_01" Class="Parameter" Status="Available" ProcessColorModel="DeviceCMYK" ICCProfile="${escapeXml(iccProfile)}" MaxTotalAreaCoveragePct="${maxTacPct}" TotalPlatesRequired="${layout.totalPlatesRequired}" />
    <CoverApplicationParams ID="COV_01" Class="Parameter" Status="Available" BindingType="${escapeXml(bindingType)}" SpineWidthMm="${spine.calculatedSpineMm}" CalculatedSpineThicknessMm="${spine.calculatedSpineMm}" HardcoverOverhangMm="${bindingType === 'HARDCOVER_SEWN' ? '3.0' : '0.0'}" />
    <Component ID="COMP_FINAL" Class="Quantity" Status="Unavailable" ComponentType="FinalProduct" Amount="${printRunCopies}" MakeReadyWasteSheets="${waste.totalWasteSheets}" GrossPressSheets="${waste.grossSheetsRequired}" />
  </ResourcePool>
  <ResourceLinkPool>
    <DeviceLink rRef="DEV_01" Usage="Input" />
    <LayoutPreparationParamsLink rRef="LPP_01" Usage="Input" />
    <FoldingIntentLink rRef="FI_01" Usage="Input" />
    <StrippingParamsLink rRef="STP_01" Usage="Input" />
    <InterpretingParamsLink rRef="INT_01" Usage="Input" />
    <ColorantControlLink rRef="COL_01" Usage="Input" />
    <CoverApplicationParamsLink rRef="COV_01" Usage="Input" />
    <ComponentLink rRef="COMP_FINAL" Usage="Output" />
  </ResourceLinkPool>
</JDF>`;

    return {
        ok: true,
        jobId,
        isbn,
        title,
        jdfVersion: '1.7',
        deviceId,
        targetRipSystem,
        caliperUm,
        accumulatedBlockThicknessMm: creep.accumulatedBlockThicknessMm,
        signatureBreakdownLabel: layout.breakdownSummary,
        maxSignaturePagesSupported: layout.maxSignaturePagesSupported,
        totalPlatesRequired: layout.totalPlatesRequired,
        calculatedSpineMm: spine.calculatedSpineMm,
        maxCreepOffsetMm: creep.maxCreepOffsetMm,
        exceedsFoldingTolerance: creep.exceedsFoldingTolerance,
        makeReadyWasteSheets: waste.totalWasteSheets,
        xml
    };
}

/**
 * Ingests a JMF (`Job Messaging Format`) telemetry signal from a press/RIP controller (`POST /api/manufacturing/jmf/signal`)
 */
function processJmfTelemetrySignal(payload = {}, actorContext = {}) {
    const tenantId = actorContext.tenantId || payload.tenantId || 'tenant-default';
    const jobId = payload.jobId;
    if (!jobId) {
        const err = new Error('MISSING_JOB_ID: jobId is required in JMF signal payload.');
        err.statusCode = 400;
        throw err;
    }

    const signalId = `JMF-SIG-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const record = {
        signalId,
        tenantId,
        jobId,
        deviceId: payload.deviceId || 'HEIDELBERG-XL106-PRINECT-01',
        ripController: payload.ripController || 'Heidelberg Prinect Press Center XL',
        pressState: payload.pressState || 'ON_PRESS_PRINTING',
        platesBurned: Number(payload.platesBurned ?? 64),
        goodSheetsCounter: Number(payload.goodSheetsCounter ?? 24000),
        wasteSheetsCounter: Number(payload.wasteSheetsCounter ?? 1208),
        speedSheetsPerHour: Number(payload.speedSheetsPerHour ?? 16500),
        deltaEColorAccuracy: Number(payload.deltaEColorAccuracy ?? 0.85),
        receivedAt: new Date().toISOString()
    };

    jmfTelemetryStore.set(`${tenantId}:${jobId}`, record);
    return {
        ok: true,
        signal: record
    };
}

function getLatestJmfTelemetry(jobId, tenantId = 'tenant-default') {
    return jmfTelemetryStore.get(`${tenantId}:${jobId}`) || null;
}

/**
 * Simulates a full 3-stage JMF press telemetry burst (`POST /api/manufacturing/imposition/jmf/simulate-burst`)
 */
function simulateJmfTelemetryBurst(payload = {}, actorContext = {}) {
    const tenantId = actorContext.tenantId || payload.tenantId || 'tenant-default';
    const jobId = payload.jobId || 'PF-2026-082';
    const targetGoodSheets = Math.max(100, Number(payload.targetGoodSheets) || 24000);
    const plannedMakeReadyWasteSheets = Math.max(10, Number(payload.plannedMakeReadyWasteSheets) || 1208);
    const actualMakeReadyWasteSheets =
        payload.actualMakeReadyWasteSheets !== undefined
            ? Number(payload.actualMakeReadyWasteSheets)
            : Math.round(plannedMakeReadyWasteSheets * 0.96);
    const platesBurned = Math.max(0, Number(payload.platesBurned ?? 64));
    const speedSheetsPerHour = Math.max(1000, Number(payload.speedSheetsPerHour ?? 16800));
    const deltaEColorAccuracy = Number(payload.deltaEColorAccuracy ?? 0.68);
    const deviceId = payload.deviceId || 'HEIDELBERG-XL106-PRINECT-01';

    const events = [
        {
            stageIndex: 1,
            pressState: 'PLATES_BURNED',
            platesBurned,
            goodSheetsCounter: 0,
            wasteSheetsCounter: 0,
            speedSheetsPerHour: 0,
            deltaEColorAccuracy: 0.0
        },
        {
            stageIndex: 2,
            pressState: 'ON_PRESS',
            platesBurned,
            goodSheetsCounter: Math.round(targetGoodSheets * 0.5),
            wasteSheetsCounter: Math.round(actualMakeReadyWasteSheets * 0.85),
            speedSheetsPerHour,
            deltaEColorAccuracy: Number((deltaEColorAccuracy + 0.14).toFixed(2))
        },
        {
            stageIndex: 3,
            pressState: 'COMPLETED',
            platesBurned,
            goodSheetsCounter: targetGoodSheets,
            wasteSheetsCounter: actualMakeReadyWasteSheets,
            speedSheetsPerHour,
            deltaEColorAccuracy
        }
    ];

    let finalSignal = null;
    for (const ev of events) {
        const res = processJmfTelemetrySignal(
            {
                jobId,
                deviceId,
                pressState: ev.pressState,
                platesBurned: ev.platesBurned,
                goodSheetsCounter: ev.goodSheetsCounter,
                wasteSheetsCounter: ev.wasteSheetsCounter,
                speedSheetsPerHour: ev.speedSheetsPerHour,
                deltaEColorAccuracy: ev.deltaEColorAccuracy
            },
            { tenantId }
        );
        finalSignal = res.signal;
    }

    const wasteVarianceSheets = actualMakeReadyWasteSheets - plannedMakeReadyWasteSheets;

    return {
        ok: true,
        jobId,
        tenantId,
        finalStatus: 'COMPLETED',
        targetGoodSheets,
        plannedMakeReadyWasteSheets,
        actualMakeReadyWasteSheets,
        wasteVarianceSheets,
        deltaEColorAccuracy,
        speedSheetsPerHour,
        eventsCount: events.length,
        events,
        latestSignal: finalSignal
    };
}

module.exports = {
    generateJdfJobTicketXml,
    processJmfTelemetrySignal,
    getLatestJmfTelemetry,
    simulateJmfTelemetryBurst
};
