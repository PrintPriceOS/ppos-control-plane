/**
 * src/ui/components/pricing/RoutingRulesTab.tsx
 *
 * PrintPrice OS — Phase 14D: Algorithmic Multi-Variable Dispatch & Routing Decisions Engine
 *
 * Responsibilities:
 * 1. Top Algorithmic Governance Cards:
 *    - `DISPATCH POLICY`: Interactive pills (`LOWEST_COST`, `FASTEST_DELIVERY`, `BALANCED_HYBRID`, `LOCAL_LOW_CARBON`).
 *    - `MAX QUEUE CONGESTION LOCK`: Interactive slider (e.g. `85%`).
 *    - `CROSS-BORDER PENALTY`: Interactive surcharge factor (e.g. `1.18x`) + `SAVE GOVERNANCE RULES` action.
 * 2. Live Algorithmic Routing Simulator:
 *    - Book specification inputs (Copies, Trim Size, Pages, Binding Family, Destination Hub) +
 *      `SIMULATE ROUTING DISPATCH` button (`#dc2626`).
 *    - Highlighted Top-1 Optimal Node card with 5-axis telemetry (Industrial Cost, Freight Cost,
 *      Lead Time, Press Queue Load %, and Final Algorithmic Score out of 100).
 *    - Comparative Candidate & Fallback Nodes table with exact differential rejection reasons.
 * 3. Digital vs. Offset Crossover Point Telemetry Card (`data-testid="crossover-analyzer-card"`).
 * 4. Recent Automated Routing Events (`PUB-ORD-...` audit log) & Economic Conflict Inspector.
 */
import React, { useState, useEffect, useMemo } from 'react';
import { IndustrialTable } from '../common';
import { EconomicProfileRow, classifyProfileTechnology, cleanDisplayMachineName } from './EconomicProfilesTable';
import { getAuthToken } from '../../lib/authStore';

export interface CrossoverCurvePoint {
    copies: number;
    digitalTotalEur: number;
    digitalUnitEur: number;
    offsetTotalEur: number;
    offsetUnitEur: number;
    savingsEur: number;
    recommendedTechnology: string;
    recommendedPrinterName: string;
}

export interface CrossoverAnalysis {
    crossoverCopies: number;
    explanation: string;
    digitalMachine: { id: string; printerName: string; technology: string };
    offsetMachine: { id: string; printerName: string; technology: string };
    curve: CrossoverCurvePoint[];
}

export interface RoutingCandidateEvaluation {
    rank: number;
    profileId: string;
    printerId: string;
    printerName: string;
    nodeId: string;
    nodeName: string;
    technology: string;
    originCity: string;
    originCountry: string;
    destinationLabel: string;
    distanceKm: number;
    isCrossBorder: boolean;
    epalPallets: number;
    compatible: boolean;
    incompatibilityReason?: string | null;
    industrialCostEur: number;
    freightCostEur: number;
    totalLandedCostEur: number;
    unitLandedCostEur: number;
    totalLeadTimeDays: number;
    queueLoadPct: number;
    oeeHealthPct: number;
    targetMarginPct: number;
    estimatedMarginEur: number;
    finalScore: number;
    routeBadge: string;
    decisionDriver?: string;
    rejectionReason: string;
    axisScores?: {
        compatibilityScore: number;
        costScore: number;
        freightScore: number;
        leadTimeScore: number;
        oeeScore: number;
    };
}

export interface RoutingRulesTabProps {
    loading?: boolean;
    profiles?: EconomicProfileRow[];
    crossover: CrossoverAnalysis | null;
    routingHistory: any[];
    conflicts: any[];
    onRefresh?: () => void;
}

type DispatchPolicyId = 'LOWEST_COST' | 'FASTEST_DELIVERY' | 'BALANCED_HYBRID' | 'LOCAL_LOW_CARBON';

const DISPATCH_POLICIES: {
    id: DispatchPolicyId;
    label: string;
    sublabel: string;
    weights: { cost: number; freight: number; leadTime: number; oee: number };
}[] = [
    {
        id: 'LOWEST_COST',
        label: 'LOWEST COST (ECO)',
        sublabel: 'Cost 60% · Freight 20% · SLA 10% · OEE 10%',
        weights: { cost: 0.6, freight: 0.2, leadTime: 0.1, oee: 0.1 }
    },
    {
        id: 'FASTEST_DELIVERY',
        label: 'FASTEST DELIVERY (SLA)',
        sublabel: 'SLA 50% · Cost 20% · Freight 20% · OEE 10%',
        weights: { cost: 0.2, freight: 0.2, leadTime: 0.5, oee: 0.1 }
    },
    {
        id: 'BALANCED_HYBRID',
        label: 'BALANCED HYBRID',
        sublabel: 'Cost 40% · Freight 30% · SLA 20% · OEE 10%',
        weights: { cost: 0.4, freight: 0.3, leadTime: 0.2, oee: 0.1 }
    },
    {
        id: 'LOCAL_LOW_CARBON',
        label: 'LOCAL / LOW CARBON',
        sublabel: 'Freight/Km 55% · Cost 20% · SLA 15% · OEE 10%',
        weights: { cost: 0.2, freight: 0.55, leadTime: 0.15, oee: 0.1 }
    }
];

const DESTINATIONS = [
    { code: 'MADRID_ES', label: 'Madrid, ES (28001 · Iberia Hub)', city: 'Madrid', country: 'ES', lat: 40.4168, lng: -3.7038 },
    { code: 'BARCELONA_ES', label: 'Barcelona, ES (08001 · Mediterranean Hub)', city: 'Barcelona', country: 'ES', lat: 41.3874, lng: 2.1686 },
    { code: 'FRANKFURT_DE', label: 'Frankfurt am Main, DE (60311 · DACH Central)', city: 'Frankfurt', country: 'DE', lat: 50.1109, lng: 8.6821 },
    { code: 'MUNICH_DE', label: 'München, DE (80331 · Bavaria Hub)', city: 'Munich', country: 'DE', lat: 48.1351, lng: 11.5820 },
    { code: 'PARIS_FR', label: 'Paris, FR (75001 · Île-de-France)', city: 'Paris', country: 'FR', lat: 48.8566, lng: 2.3522 },
    { code: 'BRUSSELS_BE', label: 'Brussels, BE (1000 · Benelux Hub)', city: 'Brussels', country: 'BE', lat: 50.8503, lng: 4.3517 },
    { code: 'WARSAW_PL', label: 'Warszawa, PL (00-001 · CEE Logistics)', city: 'Warsaw', country: 'PL', lat: 52.2297, lng: 21.0122 },
    { code: 'LISBON_PT', label: 'Lisboa, PT (1100 · Atlantic Hub)', city: 'Lisbon', country: 'PT', lat: 38.7223, lng: -9.1393 }
];

function round2(n: number): number {
    return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.max(15, Math.round(R * c));
}

const DEFAULT_FALLBACK_PROFILES: EconomicProfileRow[] = [
    {
        id: 'prof-offset-b1-xl106',
        printerId: 'mach-heidelberg-xl106',
        printerName: 'Heidelberg Speedmaster XL 106-8P',
        nodeName: 'philologica.ai Printhouse',
        technology: 'OFFSET_B1',
        supportedFamilies: ['SOFTCOVER', 'HARDCOVER', 'WIRE_O', 'SADDLE_STITCH'],
        minSheetWidthMm: 280,
        minSheetHeightMm: 400,
        maxSheetWidthMm: 1060,
        maxSheetHeightMm: 750,
        scope: 'GLOBAL',
        hourlyRateEur: 265,
        setupFeeEur: 240,
        plateCostEur: 22,
        targetMarginPct: 28,
        minimumJobFeeEur: 380,
        active: true
    },
    {
        id: 'prof-offset-b2-g29',
        printerId: 'mach-komori-g29',
        printerName: 'Komori Lithrone G29 (B2)',
        nodeName: 'philologica.ai Printhouse',
        technology: 'OFFSET_B2',
        supportedFamilies: ['SOFTCOVER', 'HARDCOVER', 'WIRE_O', 'SADDLE_STITCH'],
        minSheetWidthMm: 210,
        minSheetHeightMm: 297,
        maxSheetWidthMm: 750,
        maxSheetHeightMm: 530,
        scope: 'GLOBAL',
        hourlyRateEur: 185,
        setupFeeEur: 160,
        plateCostEur: 15,
        targetMarginPct: 30,
        minimumJobFeeEur: 260,
        active: true
    },
    {
        id: 'prof-digital-sra3-indigo',
        printerId: 'mach-hp-indigo-12000',
        printerName: 'HP Indigo 12000 HD Digital Press',
        nodeName: 'Demo Balto 3',
        technology: 'DIGITAL_TONER',
        supportedFamilies: ['SOFTCOVER', 'HARDCOVER', 'WIRE_O', 'SADDLE_STITCH'],
        minSheetWidthMm: 210,
        minSheetHeightMm: 297,
        maxSheetWidthMm: 750,
        maxSheetHeightMm: 530,
        scope: 'GLOBAL',
        hourlyRateEur: 95,
        setupFeeEur: 25,
        plateCostEur: 0,
        targetMarginPct: 35,
        minimumJobFeeEur: 75,
        active: true
    },
    {
        id: 'prof-rotativa-lithoman',
        printerId: 'mach-manroland-lithoman',
        printerName: 'Manroland Lithoman IV Web Offset',
        nodeName: 'Stuttgart Web Hub',
        technology: 'WEB_ROTARY',
        supportedFamilies: ['SOFTCOVER', 'SADDLE_STITCH'],
        minSheetWidthMm: 420,
        minSheetHeightMm: 594,
        maxSheetWidthMm: 1260,
        maxSheetHeightMm: 900,
        scope: 'GLOBAL',
        hourlyRateEur: 490,
        setupFeeEur: 680,
        plateCostEur: 28,
        targetMarginPct: 24,
        minimumJobFeeEur: 1250,
        active: true
    }
];

export function evaluateRoutingCandidatesClientSide(
    profiles: EconomicProfileRow[],
    spec: {
        copies: number;
        pages: number;
        trimSize: string;
        productFamily: string;
        destinationCode: string;
    },
    governance: {
        dispatchPolicy: DispatchPolicyId;
        maxQueueCongestionPct: number;
        crossBorderPenaltyFactor: number;
    }
): RoutingCandidateEvaluation[] {
    const activeProfiles = profiles && profiles.length > 0 ? profiles : DEFAULT_FALLBACK_PROFILES;
    const dest = DESTINATIONS.find((d) => d.code === spec.destinationCode) || DESTINATIONS[0];
    const policyObj = DISPATCH_POLICIES.find((p) => p.id === governance.dispatchPolicy) || DISPATCH_POLICIES[2];
    const weights = policyObj.weights;

    const match = String(spec.trimSize).match(/(\d+)\s*[x×]\s*(\d+)/i);
    const widthMm = match ? Number(match[1]) : 148;
    const heightMm = match ? Number(match[2]) : 210;
    const pageAreaM2 = (widthMm / 1000) * (heightMm / 1000);

    const rawList = activeProfiles.map((prof, idx) => {
        const tech = classifyProfileTechnology(prof);
        const cleanName = cleanDisplayMachineName(prof);
        const nodeName = prof.nodeName || (tech === 'DIGITAL_TONER' ? 'Demo Balto 3' : 'philologica.ai Printhouse');

        const isGermanNode =
            nodeName.toLowerCase().includes('balto') ||
            nodeName.toLowerCase().includes('stuttgart') ||
            cleanName.toLowerCase().includes('lithoman');
        const originCity = isGermanNode ? 'Frankfurt / Erfurt' : idx % 2 === 1 ? 'Barcelona' : 'Madrid';
        const originCountry = isGermanNode ? 'DE' : 'ES';
        const originLat = isGermanNode ? 50.1109 : idx % 2 === 1 ? 41.3874 : 40.4168;
        const originLng = isGermanNode ? 8.6821 : idx % 2 === 1 ? 2.1686 : -3.7038;

        const queueLoadPct = tech === 'WEB_ROTARY' ? 88 : tech === 'DIGITAL_TONER' ? 42 : tech === 'OFFSET_B2' ? 51 : 58;
        const oeeHealthPct = tech === 'DIGITAL_TONER' ? 96.8 : tech === 'OFFSET_B1' ? 95.2 : 93.8;

        const supportedFamilies =
            Array.isArray(prof.supportedFamilies) && prof.supportedFamilies.length > 0
                ? prof.supportedFamilies
                : tech === 'WEB_ROTARY'
                  ? ['SOFTCOVER', 'SADDLE_STITCH']
                  : ['SOFTCOVER', 'HARDCOVER', 'WIRE_O', 'SADDLE_STITCH'];

        const supportsFamily = supportedFamilies.includes(spec.productFamily);
        const maxW = Number(prof.maxSheetWidthMm ?? (tech === 'OFFSET_B1' ? 1060 : tech === 'WEB_ROTARY' ? 1260 : 750));
        const maxH = Number(prof.maxSheetHeightMm ?? (tech === 'OFFSET_B1' ? 750 : tech === 'WEB_ROTARY' ? 900 : 530));
        const reqSpreadW = widthMm * 2 + 10;
        const reqSpreadH = heightMm + 10;
        const fitsSheet =
            (reqSpreadW <= maxW && reqSpreadH <= maxH) || (reqSpreadH <= maxW && reqSpreadW <= maxH);
        const isQueueSaturated = queueLoadPct > governance.maxQueueCongestionPct;

        let compatible = true;
        let incompatibilityReason: string | null = null;
        if (!supportsFamily) {
            compatible = false;
            incompatibilityReason = `Incompatible Binding Family (${spec.productFamily} not supported on ${tech})`;
        } else if (!fitsSheet) {
            compatible = false;
            incompatibilityReason = `Non-optimal Sheet Size (${reqSpreadW}×${reqSpreadH} mm exceeds ${maxW}×${maxH} mm)`;
        } else if (isQueueSaturated) {
            compatible = false;
            incompatibilityReason = `Queue Saturated (${queueLoadPct}% > ${governance.maxQueueCongestionPct}% Lock)`;
        }

        // Industrial cost calculation
        const isDigital = tech === 'DIGITAL_TONER';
        const pagesPerSig = tech === 'OFFSET_B1' ? 16 : tech === 'OFFSET_B2' ? 8 : tech === 'WEB_ROTARY' ? 32 : 4;
        const sigs = Math.ceil(Math.max(8, spec.pages) / pagesPerSig);
        const leaves = Math.max(8, spec.pages) / 2;
        const wasteMult = isDigital ? 1.008 : 1.022;
        const makeReadySheets = isDigital ? 15 : 220;
        const grossAreaM2 =
            leaves * pageAreaM2 * spec.copies * wasteMult +
            makeReadySheets * sigs * (pageAreaM2 * (pagesPerSig / 2));
        const paperWeightKg = round2((grossAreaM2 * 90) / 1000);
        const paperCostEur = round2(paperWeightKg * 1.32);

        const platesCostEur = isDigital ? 0 : round2(sigs * 8 * Number(prof.plateCostEur ?? 20));
        const makeReadyHours = isDigital ? 0.15 : sigs * 0.22;
        const setupCostEur = round2(Number(prof.setupFeeEur ?? 180) + makeReadyHours * Number(prof.hourlyRateEur ?? 200) * 0.5);
        const speedSph = isDigital ? 3600 : tech === 'WEB_ROTARY' ? 35000 : 13000;
        const totalSheets = sigs * spec.copies * wasteMult;
        const runHours = round2(totalSheets / speedSph);
        const clickEur = isDigital ? totalSheets * 0.038 : 0;
        const runCostEur = round2(runHours * Number(prof.hourlyRateEur ?? 200) + clickEur);
        const finishSetup = spec.productFamily === 'HARDCOVER' ? 180 : spec.productFamily === 'WIRE_O' ? 65 : 85;
        const finishUnit = spec.productFamily === 'HARDCOVER' ? 1.55 : spec.productFamily === 'WIRE_O' ? 0.52 : 0.38;
        const finishingCostEur = round2(finishSetup + spec.copies * finishUnit);

        const baseCost = paperCostEur + platesCostEur + setupCostEur + runCostEur + finishingCostEur;
        const marginPct = Number(prof.targetMarginPct ?? 28);
        const rawSell = round2(baseCost * (1 + marginPct / 100));
        const minFloor = round2(baseCost + Number(prof.minimumJobFeeEur ?? 150));
        const industrialCostEur = Math.max(rawSell, minFloor);
        const estimatedMarginEur = round2(industrialCostEur - baseCost);

        // Freight & Distance
        const distanceKm = haversineKm(originLat, originLng, dest.lat, dest.lng);
        const epalPallets = Math.max(1, Math.ceil(paperWeightKg / 450));
        const isCrossBorder = originCountry !== dest.country;
        const baseFreight = 45 + epalPallets * 28 + distanceKm * 0.085 * Math.sqrt(epalPallets);
        const freightCostEur = round2(
            baseFreight * (isCrossBorder ? governance.crossBorderPenaltyFactor : 1.0)
        );
        const totalLandedCostEur = round2(industrialCostEur + freightCostEur);

        const baseLead = isDigital ? 2 : 3;
        const transitDays = distanceKm > 1200 ? 3 : distanceKm > 450 ? 2 : 1;
        const queueDelay = queueLoadPct >= 75 ? 2 : queueLoadPct >= 60 ? 1 : 0;
        const totalLeadTimeDays = baseLead + transitDays + queueDelay;

        return {
            profileId: prof.id,
            printerId: prof.printerId || prof.id,
            printerName: cleanName,
            nodeId: prof.nodeId || 'node-primary',
            nodeName,
            technology: tech,
            originCity,
            originCountry,
            destinationLabel: dest.label,
            distanceKm,
            isCrossBorder,
            epalPallets,
            compatible,
            incompatibilityReason,
            industrialCostEur,
            freightCostEur,
            totalLandedCostEur,
            unitLandedCostEur: round2(totalLandedCostEur / Math.max(1, spec.copies)),
            totalLeadTimeDays,
            queueLoadPct,
            oeeHealthPct,
            targetMarginPct: marginPct,
            estimatedMarginEur,
            finalScore: 0,
            routeBadge: 'FALLBACK NODE',
            rejectionReason: ''
        };
    });

    const compatList = rawList.filter((c) => c.compatible);
    const minIndCost =
        compatList.length > 0 ? Math.min(...compatList.map((c) => c.industrialCostEur)) : 100;
    const minFreight =
        compatList.length > 0 ? Math.min(...compatList.map((c) => c.freightCostEur)) : 50;

    const scored = rawList.map((cand) => {
        if (!cand.compatible) {
            return {
                ...cand,
                finalScore: 0,
                routeBadge: 'EXCLUDED (HARD GATE)',
                rejectionReason: cand.incompatibilityReason || 'Incompatible Specification',
                axisScores: {
                    compatibilityScore: 0,
                    costScore: 0,
                    freightScore: 0,
                    leadTimeScore: 0,
                    oeeScore: cand.oeeHealthPct
                }
            };
        }

        const costScore = round2(
            Math.min(100, Math.max(25, Math.pow(minIndCost / Math.max(1, cand.industrialCostEur), 0.85) * 100))
        );
        const freightRatio = minFreight / Math.max(1, cand.freightCostEur);
        const distPen = Math.min(35, cand.distanceKm / 65);
        const cbPen = cand.isCrossBorder ? (governance.crossBorderPenaltyFactor - 1) * 40 : 0;
        const freightScore = round2(Math.min(100, Math.max(20, freightRatio * 65 + (40 - distPen) - cbPen)));

        const qScore = cand.queueLoadPct <= 70 ? 100 : Math.max(30, 100 - (cand.queueLoadPct - 70) * 3.2);
        const lScore = Math.max(35, 100 - Math.max(0, cand.totalLeadTimeDays - 2) * 11);
        const leadTimeScore = round2(qScore * 0.55 + lScore * 0.45);
        const oeeScore = round2(cand.oeeHealthPct);

        const finalScore = round2(
            costScore * weights.cost +
                freightScore * weights.freight +
                leadTimeScore * weights.leadTime +
                oeeScore * weights.oee
        );

        return {
            ...cand,
            finalScore,
            axisScores: {
                compatibilityScore: 100,
                costScore,
                freightScore,
                leadTimeScore,
                oeeScore
            }
        };
    });

    scored.sort((a, b) => {
        if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;
        return a.totalLandedCostEur - b.totalLandedCostEur;
    });

    const winner = scored.find((c) => c.compatible) || null;

    return scored.map((cand, index) => {
        if (winner && cand.profileId === winner.profileId) {
            return {
                ...cand,
                rank: 1,
                routeBadge: 'OPTIMAL ROUTE',
                decisionDriver:
                    governance.dispatchPolicy === 'FASTEST_DELIVERY'
                        ? 'SLA Protected'
                        : governance.dispatchPolicy === 'LOCAL_LOW_CARBON'
                          ? 'Low Carbon / Local'
                          : 'Cost Optimal',
                rejectionReason: 'Primary Optimal Node Selected'
            };
        }

        let reason = cand.rejectionReason;
        if (!reason && winner) {
            const costDiff = round2(cand.industrialCostEur - winner.industrialCostEur);
            const freightDiff = round2(cand.freightCostEur - winner.freightCostEur);
            if (cand.queueLoadPct >= 75) {
                reason = `Queue Saturated (${cand.queueLoadPct}% load)`;
            } else if (freightDiff > 45 && freightDiff > costDiff) {
                reason = `Higher Freight Cost (+€${freightDiff.toFixed(2)} · ${cand.distanceKm} km)`;
            } else if (costDiff > 0) {
                reason =
                    spec.copies >= 450 && cand.technology === 'DIGITAL_TONER'
                        ? `Higher Digital Click Cost (+€${costDiff.toFixed(2)})`
                        : spec.copies < 400 && cand.technology.startsWith('OFFSET')
                          ? `Unamortized CTP Plates (+€${costDiff.toFixed(2)})`
                          : `Higher Manufacturing Cost (+€${costDiff.toFixed(2)})`;
            } else {
                reason = 'Non-optimal Composite Score';
            }
        }

        return {
            ...cand,
            rank: index + 1,
            routeBadge: cand.compatible ? 'FALLBACK NODE' : 'EXCLUDED (HARD GATE)',
            rejectionReason: reason || 'Secondary Fallback'
        };
    });
}

export const RoutingRulesTab: React.FC<RoutingRulesTabProps> = ({
    loading = false,
    profiles = [],
    crossover,
    routingHistory = [],
    conflicts = [],
    onRefresh
}) => {
    // 1. Governance Policy State
    const [dispatchPolicy, setDispatchPolicy] = useState<DispatchPolicyId>('BALANCED_HYBRID');
    const [maxQueueCongestionPct, setMaxQueueCongestionPct] = useState<number>(85);
    const [crossBorderPenaltyFactor, setCrossBorderPenaltyFactor] = useState<number>(1.18);
    const [savingRules, setSavingRules] = useState<boolean>(false);
    const [rulesSavedBanner, setRulesSavedBanner] = useState<string | null>(null);

    // 2. Live Routing Simulator Specification State
    const [simCopies, setSimCopies] = useState<number>(1000);
    const [simTrimSize, setSimTrimSize] = useState<string>('148x210');
    const [simPages, setSimPages] = useState<number>(240);
    const [simFamily, setSimFamily] = useState<string>('SOFTCOVER');
    const [simDestination, setSimDestination] = useState<string>('MADRID_ES');
    const [simulating, setSimulating] = useState<boolean>(false);
    const [simulatedCandidates, setSimulatedCandidates] = useState<RoutingCandidateEvaluation[] | null>(null);
    const [auditEvents, setAuditEvents] = useState<any[]>(routingHistory);
    const [inspectingEvent, setInspectingEvent] = useState<any | null>(null);

    useEffect(() => {
        if (Array.isArray(routingHistory) && routingHistory.length > 0) {
            setAuditEvents(routingHistory);
        }
    }, [routingHistory]);

    // Hydrate governance rules from `/api/pricing/routing-decisions/rules` on mount
    useEffect(() => {
        let cancelled = false;
        const fetchRules = async () => {
            try {
                const token = getAuthToken();
                const headers: Record<string, string> = { 'x-user-role': 'PRINTHOUSE_ADMIN' };
                if (token) headers['Authorization'] = `Bearer ${token}`;
                const res = await fetch('/api/pricing/routing-decisions/rules', { headers }).catch(() => null);
                if (!res || !res.ok || cancelled) return;
                const data = await res.json();
                if (!cancelled && data?.rules) {
                    if (data.rules.dispatchPolicy) setDispatchPolicy(data.rules.dispatchPolicy);
                    if (data.rules.maxQueueCongestionPct !== undefined) {
                        setMaxQueueCongestionPct(Number(data.rules.maxQueueCongestionPct));
                    }
                    if (data.rules.crossBorderPenaltyFactor !== undefined) {
                        setCrossBorderPenaltyFactor(Number(data.rules.crossBorderPenaltyFactor));
                    }
                }
            } catch (_) {
                // Keep defaults in offline tests
            }
        };
        fetchRules();
        return () => {
            cancelled = true;
        };
    }, []);

    // Live deterministic candidate evaluation
    const activeCandidates = useMemo(() => {
        if (simulatedCandidates && simulatedCandidates.length > 0) {
            return simulatedCandidates;
        }
        return evaluateRoutingCandidatesClientSide(
            profiles,
            {
                copies: simCopies,
                pages: simPages,
                trimSize: simTrimSize,
                productFamily: simFamily,
                destinationCode: simDestination
            },
            {
                dispatchPolicy,
                maxQueueCongestionPct,
                crossBorderPenaltyFactor
            }
        );
    }, [
        simulatedCandidates,
        profiles,
        simCopies,
        simPages,
        simTrimSize,
        simFamily,
        simDestination,
        dispatchPolicy,
        maxQueueCongestionPct,
        crossBorderPenaltyFactor
    ]);

    const optimalCandidate = useMemo(() => {
        return activeCandidates.find((c) => c.compatible) || activeCandidates[0] || null;
    }, [activeCandidates]);

    const handleSaveGovernanceRules = async () => {
        setSavingRules(true);
        setRulesSavedBanner(null);
        try {
            const token = getAuthToken();
            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
                'x-user-role': 'PRINTHOUSE_ADMIN'
            };
            if (token) headers['Authorization'] = `Bearer ${token}`;
            const policyObj = DISPATCH_POLICIES.find((p) => p.id === dispatchPolicy) || DISPATCH_POLICIES[2];
            const res = await fetch('/api/pricing/routing-decisions/rules', {
                method: 'PUT',
                headers,
                body: JSON.stringify({
                    dispatchPolicy,
                    maxQueueCongestionPct,
                    crossBorderPenaltyFactor,
                    weights: policyObj.weights
                })
            }).catch(() => null);

            if (res && res.ok) {
                setRulesSavedBanner(`Políticas de despacho sincronizadas en MySQL (${dispatchPolicy} · Lock ${maxQueueCongestionPct}%)`);
            } else {
                setRulesSavedBanner(`Políticas aplicadas localmente (${dispatchPolicy} · Lock ${maxQueueCongestionPct}%)`);
            }
        } finally {
            setSavingRules(false);
        }
    };

    const handleSimulateDispatch = async () => {
        setSimulating(true);
        // Always compute deterministic local ranking first so UI updates immediately
        const localRanked = evaluateRoutingCandidatesClientSide(
            profiles,
            {
                copies: simCopies,
                pages: simPages,
                trimSize: simTrimSize,
                productFamily: simFamily,
                destinationCode: simDestination
            },
            {
                dispatchPolicy,
                maxQueueCongestionPct,
                crossBorderPenaltyFactor
            }
        );
        setSimulatedCandidates(localRanked);

        try {
            const token = getAuthToken();
            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
                'x-user-role': 'PRINTHOUSE_ADMIN'
            };
            if (token) headers['Authorization'] = `Bearer ${token}`;

            const res = await fetch('/api/pricing/routing-decisions/simulate', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    copies: simCopies,
                    pages: simPages,
                    trimSize: simTrimSize,
                    productFamily: simFamily,
                    destination: simDestination,
                    dispatchPolicy,
                    maxQueueCongestionPct,
                    crossBorderPenaltyFactor
                })
            }).catch(() => null);

            if (res && res.ok) {
                const json = await res.json();
                if (Array.isArray(json?.candidates) && json.candidates.length > 0) {
                    setSimulatedCandidates(json.candidates);
                }
                if (Array.isArray(json?.recentEvents) && json.recentEvents.length > 0) {
                    setAuditEvents(json.recentEvents);
                }
            } else {
                const winner = localRanked.find((c) => c.compatible);
                if (winner) {
                    const destObj = DESTINATIONS.find((d) => d.code === simDestination) || DESTINATIONS[0];
                    const newEvt = {
                        id: `rt-sim-${Date.now().toString().slice(-4)}`,
                        orderId: `PUB-ORD-2026-${Math.floor(8900 + Math.random() * 900)}`,
                        job_id: `PUB-ORD-2026-SIM`,
                        job_name: `${simCopies.toLocaleString()} ej · ${simTrimSize} mm · ${simPages} pp (${simFamily})`,
                        productSpec: `${simCopies.toLocaleString()} copias · ${simTrimSize} mm · ${simPages} pp · ${simFamily}`,
                        destination: `${destObj.city}, ${destObj.country} (${winner.distanceKm} km)`,
                        assignedPrinthouse: `${winner.nodeName} · ${winner.printerName}`,
                        decisionDriver: winner.decisionDriver || 'Cost Optimal',
                        status: 'OPTIMAL_SIMULATED',
                        created_at: new Date().toISOString(),
                        final_decision_json: {
                            printer_name: `${winner.nodeName} · ${winner.printerName}`,
                            final_routing_score: winner.finalScore,
                            margin_pct: winner.targetMarginPct,
                            estimated_margin: winner.estimatedMarginEur,
                            selected_reason: `Score ${winner.finalScore}/100 (${dispatchPolicy}) · Landed €${winner.totalLandedCostEur.toFixed(2)}`
                        }
                    };
                    setAuditEvents((prev) => [newEvt, ...prev]);
                }
            }
        } finally {
            setSimulating(false);
        }
    };

    return (
        <div data-testid="routing-rules-tab" className="space-y-6">
            {/* 1. Top Algorithmic Governance Cards */}
            <div
                data-testid="routing-governance-bar"
                className="p-5 rounded-xl bg-white dark:bg-[#14161a] border border-slate-200 dark:border-[#1f2228] space-y-4"
            >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-[#1f2228] pb-3">
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-[#dc2626] animate-pulse" />
                            <h3 className="text-sm font-black uppercase tracking-wider text-slate-900 dark:text-white m-0">
                                Algorithmic Dispatch Policy & Multi-Variable Weights
                            </h3>
                        </div>
                        <p className="text-[11px] text-slate-400 m-0 mt-0.5">
                            Pondera en tiempo real Coste Industrial (40%), Geografía/Flete (30%), SLA/Cola (20%) y OEE (10%)
                        </p>
                    </div>
                    <button
                        type="button"
                        data-testid="save-routing-rules-btn"
                        disabled={savingRules}
                        onClick={handleSaveGovernanceRules}
                        className="px-4 py-2 rounded-lg bg-[#dc2626] hover:bg-[#e11d48] text-white text-[11px] font-black uppercase tracking-wider transition-colors cursor-pointer shrink-0"
                    >
                        {savingRules ? 'SAVING RULES...' : 'SAVE GOVERNANCE RULES'}
                    </button>
                </div>

                {rulesSavedBanner && (
                    <div
                        data-testid="routing-rules-saved-banner"
                        className="px-3.5 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-mono"
                    >
                        ✓ {rulesSavedBanner}
                    </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
                    {/* Dispatch Policy Pills (7 cols) */}
                    <div className="lg:col-span-7 space-y-1.5">
                        <div className="text-[10px] font-mono font-black uppercase tracking-wider text-slate-400">
                            1. DISPATCH POLICY (ALGORITHMIC OPTIMIZATION VECTOR)
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            {DISPATCH_POLICIES.map((pol) => {
                                const active = dispatchPolicy === pol.id;
                                return (
                                    <button
                                        key={pol.id}
                                        type="button"
                                        data-testid={`policy-pill-${pol.id}`}
                                        onClick={() => {
                                            setDispatchPolicy(pol.id);
                                            setSimulatedCandidates(null);
                                        }}
                                        className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                                            active
                                                ? 'bg-[#dc2626]/15 border-[#dc2626] text-slate-900 dark:text-white'
                                                : 'bg-slate-50 dark:bg-[#0a0b0d] border-slate-200 dark:border-[#1f2228] text-slate-500 dark:text-slate-400 hover:border-slate-600'
                                        }`}
                                    >
                                        <div className="text-[10px] font-mono font-black uppercase text-[#dc2626]">
                                            {pol.label}
                                        </div>
                                        <div className="text-[9px] font-mono text-slate-400 mt-0.5 leading-tight">
                                            {pol.sublabel}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Max Queue Congestion Lock Slider (3 cols) */}
                    <div className="lg:col-span-3 p-3 rounded-lg bg-slate-50 dark:bg-[#0a0b0d] border border-slate-200 dark:border-[#1f2228]">
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] font-mono font-black uppercase text-slate-400">
                                MAX QUEUE CONGESTION LOCK
                            </span>
                            <span
                                data-testid="queue-congestion-value"
                                className="text-xs font-mono font-black text-[#10b981]"
                            >
                                {maxQueueCongestionPct}%
                            </span>
                        </div>
                        <input
                            type="range"
                            data-testid="slider-queue-congestion"
                            min={50}
                            max={95}
                            step={5}
                            value={maxQueueCongestionPct}
                            onChange={(e) => {
                                setMaxQueueCongestionPct(Number(e.target.value));
                                setSimulatedCandidates(null);
                            }}
                            className="w-full accent-[#dc2626] cursor-pointer"
                        />
                        <div className="text-[9px] font-mono text-slate-400 mt-0.5">
                            Deriva al siguiente nodo si la cola supera {maxQueueCongestionPct}%
                        </div>
                    </div>

                    {/* Cross-Border Penalty Factor (2 cols) */}
                    <div className="lg:col-span-2 p-3 rounded-lg bg-slate-50 dark:bg-[#0a0b0d] border border-slate-200 dark:border-[#1f2228]">
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] font-mono font-black uppercase text-slate-400">
                                CROSS-BORDER PENALTY
                            </span>
                            <span
                                data-testid="cross-border-value"
                                className="text-xs font-mono font-black text-amber-400"
                            >
                                {crossBorderPenaltyFactor.toFixed(2)}x
                            </span>
                        </div>
                        <input
                            type="range"
                            data-testid="slider-cross-border"
                            min={1.0}
                            max={1.6}
                            step={0.02}
                            value={crossBorderPenaltyFactor}
                            onChange={(e) => {
                                setCrossBorderPenaltyFactor(Number(e.target.value));
                                setSimulatedCandidates(null);
                            }}
                            className="w-full accent-amber-500 cursor-pointer"
                        />
                        <div className="text-[9px] font-mono text-slate-400 mt-0.5">
                            Recargo flete internacional
                        </div>
                    </div>
                </div>
            </div>

            {/* 2. Live Algorithmic Routing Simulator */}
            <div
                data-testid="live-routing-simulator"
                className="p-6 rounded-xl bg-white dark:bg-[#14161a] border border-slate-200 dark:border-[#1f2228] space-y-5"
            >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-[#1f2228] pb-4">
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded bg-[#dc2626]/15 border border-[#dc2626]/30 text-[#dc2626] font-mono text-[10px] font-black uppercase">
                                LIVE DISPATCH SIMULATOR
                            </span>
                            <h3 className="text-sm font-black uppercase tracking-wider text-slate-900 dark:text-white m-0">
                                Multi-Node Algorithmic Routing & Freight Evaluator
                            </h3>
                        </div>
                        <p className="text-xs text-slate-400 mt-1 m-0">
                            Simula una orden entrante del BPE para evaluar compatibilidad mecánica, coste industrial, flete EPAL y saturación de cola.
                        </p>
                    </div>
                    <button
                        type="button"
                        data-testid="simulate-routing-dispatch-btn"
                        disabled={simulating}
                        onClick={handleSimulateDispatch}
                        className="px-5 py-2.5 rounded-lg bg-[#dc2626] hover:bg-[#e11d48] text-white text-xs font-black uppercase tracking-wider transition-all cursor-pointer shrink-0 shadow-lg"
                    >
                        {simulating ? 'EVALUATING NODES...' : 'SIMULATE ROUTING DISPATCH'}
                    </button>
                </div>

                {/* Order Specification Inputs */}
                <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 p-4 rounded-xl bg-slate-50 dark:bg-[#0a0b0d] border border-slate-200 dark:border-[#1f2228]">
                    <div>
                        <label className="block text-[10px] font-mono font-black uppercase text-slate-400 mb-1">
                            COPIES (TIRADA)
                        </label>
                        <input
                            type="number"
                            data-testid="sim-input-copies"
                            min={25}
                            max={20000}
                            step={50}
                            value={simCopies}
                            onChange={(e) => {
                                setSimCopies(Math.max(10, Number(e.target.value)));
                                setSimulatedCandidates(null);
                            }}
                            className="w-full px-3 py-2 rounded-lg text-xs font-mono font-bold bg-white dark:bg-[#14161a] border border-slate-200 dark:border-[#2a2e37] text-slate-900 dark:text-white"
                        />
                    </div>

                    <div>
                        <label className="block text-[10px] font-mono font-black uppercase text-slate-400 mb-1">
                            BOOK FORMAT (MM)
                        </label>
                        <select
                            data-testid="sim-select-format"
                            value={simTrimSize}
                            onChange={(e) => {
                                setSimTrimSize(e.target.value);
                                setSimulatedCandidates(null);
                            }}
                            className="w-full px-3 py-2 rounded-lg text-xs font-mono font-bold bg-white dark:bg-[#14161a] border border-slate-200 dark:border-[#2a2e37] text-slate-900 dark:text-white"
                        >
                            <option value="148x210">148×210 mm (A5 Estándar)</option>
                            <option value="150x230">150×230 mm (Trade Novela)</option>
                            <option value="170x240">170×240 mm (Técnico)</option>
                            <option value="210x297">210×297 mm (A4 Catálogo)</option>
                            <option value="600x800">600×800 mm (Gran Formato Oversize)</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-[10px] font-mono font-black uppercase text-slate-400 mb-1">
                            INTERIOR PAGES
                        </label>
                        <input
                            type="number"
                            data-testid="sim-input-pages"
                            min={16}
                            max={1200}
                            step={16}
                            value={simPages}
                            onChange={(e) => {
                                setSimPages(Math.max(8, Number(e.target.value)));
                                setSimulatedCandidates(null);
                            }}
                            className="w-full px-3 py-2 rounded-lg text-xs font-mono font-bold bg-white dark:bg-[#14161a] border border-slate-200 dark:border-[#2a2e37] text-slate-900 dark:text-white"
                        />
                    </div>

                    <div>
                        <label className="block text-[10px] font-mono font-black uppercase text-slate-400 mb-1">
                            BINDING FAMILY
                        </label>
                        <select
                            data-testid="sim-select-family"
                            value={simFamily}
                            onChange={(e) => {
                                setSimFamily(e.target.value);
                                setSimulatedCandidates(null);
                            }}
                            className="w-full px-3 py-2 rounded-lg text-xs font-bold bg-white dark:bg-[#14161a] border border-slate-200 dark:border-[#2a2e37] text-slate-900 dark:text-white"
                        >
                            <option value="SOFTCOVER">Rústica PUR (SOFTCOVER)</option>
                            <option value="HARDCOVER">Tapa Dura (HARDCOVER)</option>
                            <option value="WIRE_O">Wire-O (ESPIRAL)</option>
                            <option value="SADDLE_STITCH">Grapado (SADDLE STITCH)</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-[10px] font-mono font-black uppercase text-slate-400 mb-1">
                            DELIVERY DESTINATION
                        </label>
                        <select
                            data-testid="sim-select-destination"
                            value={simDestination}
                            onChange={(e) => {
                                setSimDestination(e.target.value);
                                setSimulatedCandidates(null);
                            }}
                            className="w-full px-3 py-2 rounded-lg text-xs font-bold bg-white dark:bg-[#14161a] border border-slate-200 dark:border-[#2a2e37] text-slate-900 dark:text-white"
                        >
                            {DESTINATIONS.map((d) => (
                                <option key={d.code} value={d.code}>
                                    {d.label}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Highlighted Optimal Node Winner Card */}
                {optimalCandidate && (
                    <div
                        data-testid="optimal-route-winner-card"
                        className="p-5 rounded-xl bg-slate-950 border-2 border-[#10b981]/70 text-white space-y-4"
                    >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
                            <div>
                                <div className="flex items-center gap-2">
                                    <span className="px-2.5 py-0.5 rounded-full bg-[#10b981]/20 border border-[#10b981] text-[#10b981] font-mono text-[10px] font-black uppercase">
                                        ★ OPTIMAL ROUTE (TOP 1)
                                    </span>
                                    <span className="px-2 py-0.5 rounded bg-[#dc2626]/20 border border-[#dc2626]/40 text-[#dc2626] font-mono text-[10px] font-black uppercase">
                                        {optimalCandidate.technology}
                                    </span>
                                    <span className="text-xs font-mono text-slate-400">
                                        {optimalCandidate.originCity}, {optimalCandidate.originCountry} ➔ {optimalCandidate.destinationLabel} ({optimalCandidate.distanceKm} km)
                                    </span>
                                </div>
                                <div
                                    data-testid="optimal-winner-name"
                                    className="text-base font-black text-white mt-1"
                                >
                                    {optimalCandidate.nodeName} · {optimalCandidate.printerName}
                                </div>
                            </div>

                            <div className="text-right">
                                <div className="text-[10px] font-mono uppercase text-slate-400">
                                    ALGORITHMIC SCORE
                                </div>
                                <div
                                    data-testid="optimal-winner-score"
                                    className="text-2xl font-mono font-black text-[#10b981]"
                                >
                                    {optimalCandidate.finalScore.toFixed(1)} / 100
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 font-mono">
                            <div className="p-3 rounded-lg bg-[#14161a] border border-slate-800">
                                <div className="text-[10px] text-slate-400 uppercase">1. Coste Industrial</div>
                                <div data-testid="optimal-industrial-cost" className="text-sm font-black text-white mt-0.5">
                                    €{optimalCandidate.industrialCostEur.toFixed(2)}
                                </div>
                                <div className="text-[10px] text-slate-500">
                                    Margen: {optimalCandidate.targetMarginPct}% (+€{optimalCandidate.estimatedMarginEur.toFixed(0)})
                                </div>
                            </div>

                            <div className="p-3 rounded-lg bg-[#14161a] border border-slate-800">
                                <div className="text-[10px] text-slate-400 uppercase">2. Portes / Flete EPAL</div>
                                <div data-testid="optimal-freight-cost" className="text-sm font-black text-sky-400 mt-0.5">
                                    €{optimalCandidate.freightCostEur.toFixed(2)}
                                </div>
                                <div className="text-[10px] text-slate-500">
                                    {optimalCandidate.distanceKm} km · {optimalCandidate.epalPallets} palé(s)
                                </div>
                            </div>

                            <div className="p-3 rounded-lg bg-[#14161a] border border-slate-800">
                                <div className="text-[10px] text-slate-400 uppercase">3. Total Landed Cost</div>
                                <div data-testid="optimal-landed-cost" className="text-sm font-black text-[#10b981] mt-0.5">
                                    €{optimalCandidate.totalLandedCostEur.toFixed(2)}
                                </div>
                                <div className="text-[10px] text-slate-500">
                                    €{optimalCandidate.unitLandedCostEur.toFixed(3)} / copia
                                </div>
                            </div>

                            <div className="p-3 rounded-lg bg-[#14161a] border border-slate-800">
                                <div className="text-[10px] text-slate-400 uppercase">4. Lead Time Total</div>
                                <div data-testid="optimal-lead-time" className="text-sm font-black text-white mt-0.5">
                                    {optimalCandidate.totalLeadTimeDays} días
                                </div>
                                <div className="text-[10px] text-slate-500">
                                    Fabricación + Tránsito
                                </div>
                            </div>

                            <div className="p-3 rounded-lg bg-[#14161a] border border-slate-800">
                                <div className="text-[10px] text-slate-400 uppercase">5. Carga de Prensa / OEE</div>
                                <div data-testid="optimal-queue-load" className="text-sm font-black text-amber-400 mt-0.5">
                                    {optimalCandidate.queueLoadPct}% Queue
                                </div>
                                <div className="text-[10px] text-slate-500">
                                    OEE Health: {optimalCandidate.oeeHealthPct}%
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Candidate Ranking & Differential Rejection Table */}
                <div className="overflow-x-auto">
                    <table
                        data-testid="routing-candidates-ranking-table"
                        className="w-full text-left border-collapse text-xs"
                    >
                        <thead>
                            <tr className="border-b border-slate-200 dark:border-[#1f2228] text-[10px] font-mono font-black uppercase text-slate-400">
                                <th className="py-2.5 px-3">RANK / BADGE</th>
                                <th className="py-2.5 px-3">PRINTHOUSE NODE & MACHINE</th>
                                <th className="py-2.5 px-3">INDUSTRIAL (€)</th>
                                <th className="py-2.5 px-3">FREIGHT (€ / KM)</th>
                                <th className="py-2.5 px-3">LANDED TOTAL (€)</th>
                                <th className="py-2.5 px-3">SLA / QUEUE</th>
                                <th className="py-2.5 px-3">SCORE</th>
                                <th className="py-2.5 px-3 text-right">DECISION / DIFFERENTIAL REASON</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200/60 dark:divide-[#1f2228]">
                            {activeCandidates.map((cand) => {
                                const isWinner = cand.routeBadge === 'OPTIMAL ROUTE';
                                return (
                                    <tr
                                        key={cand.profileId}
                                        data-testid={`routing-candidate-row-${cand.profileId}`}
                                        className={
                                            isWinner
                                                ? 'bg-emerald-500/5'
                                                : !cand.compatible
                                                  ? 'opacity-60 bg-rose-950/10'
                                                  : 'hover:bg-slate-50/50 dark:hover:bg-slate-900/40'
                                        }
                                    >
                                        <td className="py-2.5 px-3 font-mono">
                                            <span
                                                className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                                                    isWinner
                                                        ? 'bg-[#10b981]/20 text-[#10b981] border border-[#10b981]/40'
                                                        : cand.compatible
                                                          ? 'bg-slate-800 text-slate-300 border border-slate-700'
                                                          : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                                                }`}
                                            >
                                                #{cand.rank} · {cand.routeBadge}
                                            </span>
                                        </td>
                                        <td className="py-2.5 px-3">
                                            <div className="font-bold text-slate-900 dark:text-white">
                                                {cand.printerName}
                                            </div>
                                            <div className="text-[10px] font-mono text-slate-400">
                                                {cand.nodeName} · {cand.technology} ({cand.originCity}, {cand.originCountry})
                                            </div>
                                        </td>
                                        <td className="py-2.5 px-3 font-mono font-bold text-slate-900 dark:text-white">
                                            €{cand.industrialCostEur.toFixed(2)}
                                        </td>
                                        <td className="py-2.5 px-3 font-mono text-slate-500 dark:text-slate-300">
                                            €{cand.freightCostEur.toFixed(2)}{' '}
                                            <span className="text-[10px] text-slate-400">({cand.distanceKm} km)</span>
                                        </td>
                                        <td className="py-2.5 px-3 font-mono font-black text-slate-900 dark:text-white">
                                            €{cand.totalLandedCostEur.toFixed(2)}
                                        </td>
                                        <td className="py-2.5 px-3 font-mono text-[11px]">
                                            <span className="text-slate-900 dark:text-white font-bold">
                                                {cand.totalLeadTimeDays}d
                                            </span>{' '}
                                            <span className="text-slate-400">· Cola {cand.queueLoadPct}%</span>
                                        </td>
                                        <td className="py-2.5 px-3 font-mono font-black">
                                            <span className={isWinner ? 'text-[#10b981]' : 'text-slate-400'}>
                                                {cand.finalScore.toFixed(1)}
                                            </span>
                                        </td>
                                        <td className="py-2.5 px-3 text-right font-mono text-[11px]">
                                            <span
                                                className={
                                                    isWinner
                                                        ? 'text-[#10b981] font-bold'
                                                        : !cand.compatible
                                                          ? 'text-rose-400 font-bold'
                                                          : 'text-amber-400'
                                                }
                                            >
                                                {cand.rejectionReason}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* 3. Digital vs. Offset Crossover Point Telemetry Card */}
            {crossover && (
                <div
                    data-testid="crossover-analyzer-card"
                    className="p-6 rounded-xl bg-white dark:bg-[#14161a] border border-slate-200 dark:border-[#1f2228] space-y-5"
                >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-[#1f2228] pb-4">
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="px-2 py-0.5 rounded bg-[#dc2626]/15 border border-[#dc2626]/30 text-[#dc2626] font-mono text-[10px] font-black uppercase">
                                    CROSSOVER ENGINE
                                </span>
                                <h3 className="text-sm font-black uppercase tracking-wider text-slate-900 dark:text-white m-0">
                                    Digital vs. Offset Economic Crossover Point
                                </h3>
                            </div>
                            <p className="text-xs text-slate-400 mt-1 m-0">
                                {crossover.explanation}
                            </p>
                        </div>

                        <div className="px-4 py-3 rounded-xl bg-slate-950 border border-[#1f2228] text-right shrink-0">
                            <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                                CROSSOVER THRESHOLD
                            </div>
                            <div
                                data-testid="crossover-copies-badge"
                                className="text-2xl font-mono font-black text-[#10b981]"
                            >
                                {crossover.crossoverCopies} copies
                            </div>
                            <div className="text-[10px] font-mono text-slate-400">
                                &lt; {crossover.crossoverCopies}: Digital · ≥ {crossover.crossoverCopies}: Offset
                            </div>
                        </div>
                    </div>

                    {/* Crossover Curve Grid */}
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-xs">
                            <thead>
                                <tr className="border-b border-slate-200 dark:border-[#1f2228] text-[10px] font-mono font-black uppercase text-slate-400">
                                    <th className="py-2.5 px-3">PRINT RUN (COPIES)</th>
                                    <th className="py-2.5 px-3">DIGITAL TOTAL (€)</th>
                                    <th className="py-2.5 px-3">DIGITAL UNIT (€/ex)</th>
                                    <th className="py-2.5 px-3">OFFSET TOTAL (€)</th>
                                    <th className="py-2.5 px-3">OFFSET UNIT (€/ex)</th>
                                    <th className="py-2.5 px-3">NET SAVINGS</th>
                                    <th className="py-2.5 px-3 text-right">ROUTING RECOMMENDATION</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200/60 dark:divide-[#1f2228]">
                                {crossover.curve.map((pt) => {
                                    const isOffsetWinner = pt.recommendedTechnology.startsWith('OFFSET');
                                    return (
                                        <tr key={pt.copies} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/40">
                                            <td className="py-2.5 px-3 font-mono font-black text-slate-900 dark:text-white">
                                                {pt.copies.toLocaleString()} ex.
                                            </td>
                                            <td className="py-2.5 px-3 font-mono text-slate-600 dark:text-slate-300">
                                                €{pt.digitalTotalEur.toFixed(2)}
                                            </td>
                                            <td className="py-2.5 px-3 font-mono text-slate-500">
                                                €{pt.digitalUnitEur.toFixed(3)}
                                            </td>
                                            <td className="py-2.5 px-3 font-mono text-slate-600 dark:text-slate-300">
                                                €{pt.offsetTotalEur.toFixed(2)}
                                            </td>
                                            <td className="py-2.5 px-3 font-mono text-slate-500">
                                                €{pt.offsetUnitEur.toFixed(3)}
                                            </td>
                                            <td className="py-2.5 px-3 font-mono font-bold text-[#10b981]">
                                                +€{pt.savingsEur.toFixed(2)}
                                            </td>
                                            <td className="py-2.5 px-3 text-right">
                                                <span
                                                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-black uppercase ${
                                                        isOffsetWinner
                                                            ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                                                            : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                                    }`}
                                                >
                                                    {pt.recommendedTechnology} · {pt.recommendedPrinterName}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* 4. Recent Automated Routing Events (Production Audit Table) */}
            <IndustrialTable
                title="RECENT AUTOMATED ROUTING EVENTS (ECONOMIC ROUTING DECISIONS)"
                loading={loading}
                onRefresh={onRefresh}
                data={auditEvents}
                emptyEntityName="ROUTING DECISIONS"
                columns={[
                    {
                        key: 'orderId',
                        header: 'ORDER ID / SPEC',
                        render: (h: any) => (
                            <div>
                                <div className="font-mono font-black text-xs text-[#dc2626]">
                                    {h.orderId || h.job_id || 'PUB-ORD-2026'}
                                </div>
                                <div className="font-bold text-slate-900 dark:text-white text-xs">
                                    {h.productSpec || h.job_name}
                                </div>
                            </div>
                        )
                    },
                    {
                        key: 'destination',
                        header: 'DESTINATION',
                        render: (h: any) => (
                            <span className="font-mono text-xs text-slate-600 dark:text-slate-300">
                                {h.destination || 'Madrid, ES (28001)'}
                            </span>
                        )
                    },
                    {
                        key: 'node',
                        header: 'ASSIGNED PRINTHOUSE',
                        render: (h: any) => (
                            <div>
                                <div className="font-bold text-slate-900 dark:text-white">
                                    {h.assignedPrinthouse || h.final_decision_json?.printer_name || 'N/A'}
                                </div>
                                {h.final_decision_json?.selected_reason && (
                                    <div className="text-[10px] text-slate-400 max-w-md truncate">
                                        {h.final_decision_json.selected_reason}
                                    </div>
                                )}
                            </div>
                        )
                    },
                    {
                        key: 'driver',
                        header: 'DECISION DRIVER',
                        render: (h: any) => {
                            const driver = h.decisionDriver || 'Cost Optimal';
                            const score = h.finalScore ?? h.final_decision_json?.final_routing_score ?? 94;
                            return (
                                <div className="space-y-1">
                                    <span className="px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-mono text-[10px] font-black uppercase">
                                        {driver}
                                    </span>
                                    <div className="text-[10px] font-mono text-slate-400">
                                        Score: <strong className="text-white">{score}</strong>/100
                                    </div>
                                </div>
                            );
                        }
                    },
                    {
                        key: 'status',
                        header: 'STATUS',
                        render: (h: any) => (
                            <span className="px-2 py-0.5 rounded-full bg-blue-500/15 border border-blue-500/30 text-blue-400 font-mono text-[10px] font-black uppercase">
                                {h.status || 'DISPATCHED'}
                            </span>
                        )
                    },
                    {
                        key: 'actions',
                        header: 'ACTIONS',
                        align: 'right',
                        render: (h: any) => (
                            <div className="flex items-center justify-end gap-1.5">
                                <button
                                    type="button"
                                    onClick={() => setInspectingEvent(h)}
                                    className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-mono font-bold uppercase cursor-pointer"
                                >
                                    Ver Auditoría
                                </button>
                            </div>
                        )
                    }
                ]}
            />

            {inspectingEvent && (
                <div
                    data-testid="routing-event-audit-drawer"
                    className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-slate-300 flex items-center justify-between"
                >
                    <div>
                        <span className="text-[#10b981] font-black">
                            [AUDIT TRAIL · {inspectingEvent.orderId || inspectingEvent.job_id}]
                        </span>{' '}
                        {inspectingEvent.final_decision_json?.selected_reason || 'Adjudicación algorítmica verificada.'}
                    </div>
                    <button
                        type="button"
                        onClick={() => setInspectingEvent(null)}
                        className="px-2.5 py-1 rounded border border-slate-700 text-[10px] text-slate-400 hover:text-white cursor-pointer"
                    >
                        Cerrar
                    </button>
                </div>
            )}

            {/* 5. Economic Conflict Inspector */}
            <div className="rounded-xl border overflow-hidden transition-all bg-white dark:bg-[#14161a] border-slate-200 dark:border-[#1f2228]">
                <div className="px-6 py-4 border-b flex items-center justify-between bg-rose-950/20 border-rose-900/40">
                    <h3 className="font-black text-xs uppercase tracking-widest text-rose-400 m-0">
                        Economic Conflict Inspector
                    </h3>
                </div>
                <div className="divide-y divide-rose-950/20">
                    {conflicts.map((c, i) => (
                        <div key={i} className="px-6 py-4 flex items-start gap-4">
                            <div className="mt-1 w-2 h-2 rounded-full bg-rose-500 animate-pulse shrink-0" />
                            <div className="flex-1">
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-black uppercase text-rose-400">{c.conflict_type}</span>
                                    <span className="text-[10px] font-bold text-slate-400">• {c.job_name}</span>
                                </div>
                                <p className="text-xs mt-0.5 text-slate-900 dark:text-white">{c.conflict_description}</p>
                            </div>
                        </div>
                    ))}
                    {conflicts.length === 0 && (
                        <div className="px-6 py-8 text-center uppercase font-black text-xs tracking-widest text-slate-400">
                            No economic conflicts detected
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
