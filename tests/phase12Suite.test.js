import { describe, it, expect } from 'vitest';
import {
    ESCROW_STATES,
    EPAL_PENALTY_EUR_PER_PALLET,
    lockEscrowFundsOnProofApproval,
    settleEscrowOnSignedPod,
    listEscrowLedger
} from '../services/financials/escrowSettlementService.js';
import {
    generateJdfJobTicketXml,
    processJmfTelemetrySignal,
    getLatestJmfTelemetry
} from '../services/manufacturing/jdfConnectorService.js';
import {
    CONSUMABLE_THRESHOLDS,
    calculateMachineOee,
    evaluateConsumablesWear,
    listPredictiveMaintenanceFleet,
    scheduleMaintenanceReset
} from '../services/machines/predictiveMaintenanceService.js';

describe('PrintPrice OS — Phase 12 (Roadmap 2026.5) End-to-End Verification Suite', () => {
    describe('PHASE-12A: Commercial Escrow & Split-Payout Settlement Engine', () => {
        it('locks escrow funds on 3D proof approval and strictly segregates Manufacturing != Packaging != Freight != Platform Fee', () => {
            const locked = lockEscrowFundsOnProofApproval(
                {
                    orderId: 'PUB-ORD-2026-950',
                    isbn: '978-3-8365-9102-7',
                    title: 'Atlas de Arquitectura Industrial Europea',
                    grossEscrowEur: 20000.0,
                    packagingShareEur: 600.0,
                    freightShareEur: 1400.0,
                    platformFeePct: 5.0
                },
                { tenantId: 'tenant-phase12-test' }
            );

            expect(locked.ok).toBe(true);
            expect(locked.escrow.status).toBe(ESCROW_STATES.FUNDS_LOCKED_ON_PROOF_APPROVAL);
            expect(locked.escrow.grossEscrowEur).toBe(20000.0);
            expect(locked.escrow.platformFeeEur).toBe(1000.0); // 5% of 20000
            expect(locked.escrow.packagingShareEur).toBe(600.0);
            expect(locked.escrow.freightShareEur).toBe(1400.0);
            expect(locked.escrow.manufacturingShareEur).toBe(17000.0); // 20000 - 1000 - 600 - 1400
            expect(locked.escrow.netPrinthousePayoutEur).toBe(17600.0); // 17000 + 600
            expect(locked.escrow.netCarrierPayoutEur).toBe(1400.0);
        });

        it('executes automated Split-Payout on signed POD and deducts €15.00/pallet for unreturned EPAL Euro-pallets', () => {
            const settled = settleEscrowOnSignedPod(
                {
                    orderId: 'PUB-ORD-2026-950',
                    epalUnreturnedPallets: 4,
                    claimDeductionEur: 0
                },
                { tenantId: 'tenant-phase12-test' }
            );

            expect(settled.ok).toBe(true);
            expect(settled.status).toBe(ESCROW_STATES.RELEASED_ON_SIGNED_POD);
            expect(settled.splitPayoutBreakdown.epalPenaltyRateEur).toBe(EPAL_PENALTY_EUR_PER_PALLET);
            expect(settled.splitPayoutBreakdown.epalDeductionEur).toBe(60.0); // 4 * €15.00
            // Carrier freight reduced from €1400.00 to €1340.00
            expect(settled.splitPayoutBreakdown.netCarrierPayoutEur).toBe(1340.0);
            // Printhouse credited with €60.00 EPAL compensation: €17600.00 + €60.00 = €17660.00
            expect(settled.splitPayoutBreakdown.netPrinthousePayoutEur).toBe(17660.0);

            const ledger = listEscrowLedger('tenant-phase12-test');
            expect(ledger.ok).toBe(true);
            expect(ledger.entries.length).toBeGreaterThanOrEqual(4);
        });
    });

    describe('PHASE-12B: CIP4 JDF 1.7 Job Ticket Generator & JMF Press Telemetry Bridge', () => {
        it('generates valid CIP4 JDF 1.7 XML job tickets embedding PHASE-11A spine geometry and PHASE-11B imposition signatures', () => {
            const jdf = generateJdfJobTicketXml({
                jobId: 'PF-2026-082',
                isbn: '978-3-8365-9102-7',
                title: 'Atlas de Arquitectura Industrial Europea',
                totalPages: 240,
                printRunCopies: 3000,
                trimWidthMm: 150,
                trimHeightMm: 230,
                paperGrammage: 90,
                paperBulk: 1.3,
                bindingType: 'SOFTCOVER_PUR',
                machineFormatCode: 'B1',
                paperCoating: 'COATED'
            });

            expect(jdf.ok).toBe(true);
            expect(jdf.jdfVersion).toBe('1.7');
            expect(jdf.signatureBreakdownLabel).toBe('7×32pp + 1×16pp');
            expect(jdf.totalPlatesRequired).toBe(64);
            expect(jdf.calculatedSpineMm).toBe(14.54);
            expect(jdf.xml).toContain('xmlns="http://www.cip4.org/JDFSchema_1_1"');
            expect(jdf.xml).toContain('Version="1.7"');
            expect(jdf.xml).toContain('<LayoutPreparationParams');
            expect(jdf.xml).toContain('<StrippingParams');
            expect(jdf.xml).toContain('<ColorantControl');
            expect(jdf.xml).toContain('ISOcoated_v2_300_eci.icc');
            expect(jdf.xml).toContain('<CoverApplicationParams');
            expect(jdf.xml).toContain('SpineWidthMm="14.54"');
        });

        it('ingests JMF telemetry signals from Heidelberg Prinect / Kodak Prinergy RIP controllers', () => {
            const res = processJmfTelemetrySignal(
                {
                    jobId: 'PF-2026-082',
                    deviceId: 'HEIDELBERG-XL106-PRINECT-01',
                    pressState: 'ON_PRESS_PRINTING',
                    platesBurned: 64,
                    goodSheetsCounter: 18500,
                    wasteSheetsCounter: 1190,
                    speedSheetsPerHour: 17200,
                    deltaEColorAccuracy: 0.72
                },
                { tenantId: 'tenant-phase12-test' }
            );

            expect(res.ok).toBe(true);
            expect(res.signal.jobId).toBe('PF-2026-082');
            expect(res.signal.goodSheetsCounter).toBe(18500);

            const latest = getLatestJmfTelemetry('PF-2026-082', 'tenant-phase12-test');
            expect(latest).not.toBeNull();
            expect(latest.deltaEColorAccuracy).toBe(0.72);
        });
    });

    describe('PHASE-12C: Predictive Machine Maintenance & Consumables Lifespan Engine', () => {
        it('calculates OEE (%) = Availability × Performance × Quality and blocks routing when consumable wear >= 95%', () => {
            const oee = calculateMachineOee({
                availabilityPct: 95.0,
                performancePct: 92.0,
                qualityPct: 99.0
            });
            expect(oee.oeePct).toBe(86.5);

            const criticalEval = evaluateConsumablesWear({
                consumables: [
                    {
                        code: 'TRIMMER_BLADE',
                        name: '3-Knife Trimmer Blades',
                        currentCycles: 144000,
                        maxLifespanCycles: CONSUMABLE_THRESHOLDS.TRIMMER_BLADE_CUTS // 150,000
                    }
                ]
            });

            expect(criticalEval.maxWearPct).toBe(96.0);
            expect(criticalEval.routingBlocked).toBe(true);
            expect(criticalEval.routingStatus).toBe('ROUTING_BLOCKED_MAINTENANCE_REQUIRED');
        });

        it('resets consumables to 0% wear and unblocks press routing on 1-click maintenance work order', () => {
            const before = listPredictiveMaintenanceFleet('tenant-phase12-test');
            const komoriBefore = before.machines.find(m => m.machineId === 'MACH-KOMORI-G29-B2');
            expect(komoriBefore.routingBlocked).toBe(true);
            expect(komoriBefore.maxWearPct).toBeGreaterThanOrEqual(95.0);

            const resetRes = scheduleMaintenanceReset({
                machineId: 'MACH-KOMORI-G29-B2',
                tenantId: 'tenant-phase12-test'
            });

            expect(resetRes.ok).toBe(true);
            expect(resetRes.machine.maxWearPct).toBe(0.0);
            expect(resetRes.machine.routingBlocked).toBe(false);
            expect(resetRes.machine.routingStatus).toBe('ONLINE_OPTIMAL');
        });
    });
});
