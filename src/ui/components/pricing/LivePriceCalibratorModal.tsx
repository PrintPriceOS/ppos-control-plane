/**
 * src/ui/components/pricing/LivePriceCalibratorModal.tsx
 *
 * PrintPrice OS — Phase 14: Interactive Industrial Price Calibrator
 *
 * Reusable both as a Modal/Drawer in `/ops/pricing` and as an embedded or modal
 * calibrator in Onboarding (`Industrial Pricing` / `PrinthouseSetupHub.tsx`).
 *
 * Technical Cost Breakdown Formula:
 *   Paper Cost + CTP Plates Cost + Make-Ready Setup Cost + Press Run Time Cost + Finishing Cost = Base Industrial Cost
 *   Selling Price = max(Base Industrial Cost * (1 + Target Margin %), Base Industrial Cost + Min Order Fee)
 */
import React, { useState, useEffect, useMemo } from 'react';
import { EconomicProfileRow } from './EconomicProfilesTable';

export interface PaperCatalogItem {
    paperId: string;
    name: string;
    grammageGsm: number;
    bulkFactor: number;
    costPerTonEur: number;
}

export interface LivePriceCalibratorModalProps {
    isOpen: boolean;
    onClose: () => void;
    profiles: EconomicProfileRow[];
    papers: PaperCatalogItem[];
    initialProfile?: EconomicProfileRow | null;
    onApplyProfileCalibration?: (updatedProfile: Partial<EconomicProfileRow>) => Promise<void> | void;
    embedded?: boolean;
}

const TRIM_SIZES = [
    { value: '148x210', label: '148×210 mm (A5 Editorial)' },
    { value: '150x230', label: '150×230 mm (Trade Paperback)' },
    { value: '210x297', label: '210×297 mm (A4 Catálogo / Manual)' }
];

const PRINT_RUN_PRESETS = [100, 500, 1000, 5000];

function round2(n: number): number {
    return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function round4(n: number): number {
    return Math.round((Number(n) + Number.EPSILON) * 10000) / 10000;
}

export const LivePriceCalibratorModal: React.FC<LivePriceCalibratorModalProps> = ({
    isOpen,
    onClose,
    profiles = [],
    papers = [],
    initialProfile = null,
    onApplyProfileCalibration,
    embedded = false
}) => {
    const activeProfileDefault = initialProfile || profiles[0] || {
        id: 'prof-offset-b1-xl106',
        printerId: 'mach-heidelberg-xl106',
        printerName: 'Heidelberg Speedmaster XL 106-8P',
        technology: 'OFFSET_B1',
        scope: 'GLOBAL',
        hourlyRateEur: 265,
        setupFeeEur: 240,
        plateCostEur: 22,
        targetMarginPct: 28,
        minimumJobFeeEur: 380,
        active: true
    };

    const [selectedProfileId, setSelectedProfileId] = useState<string>(activeProfileDefault.id);
    const [trimSize, setTrimSize] = useState<string>('150x230');
    const [copies, setCopies] = useState<number>(1000);
    const [pages, setPages] = useState<number>(192);
    const [paperId, setPaperId] = useState<string>(papers[1]?.paperId || papers[0]?.paperId || 'paper-ahuesado-90');
    const [bindingType, setBindingType] = useState<'PUR' | 'HARDCOVER' | 'SADDLE'>('PUR');

    // Interactive Sliders State
    const [hourlyRateEur, setHourlyRateEur] = useState<number>(Number(activeProfileDefault.hourlyRateEur ?? 265));
    const [setupFeeEur, setSetupFeeEur] = useState<number>(Number(activeProfileDefault.setupFeeEur ?? 240));
    const [targetMarginPct, setTargetMarginPct] = useState<number>(Number(activeProfileDefault.targetMarginPct ?? 28));
    const [minimumJobFeeEur, setMinimumJobFeeEur] = useState<number>(Number(activeProfileDefault.minimumJobFeeEur ?? 380));
    const [saving, setSaving] = useState<boolean>(false);

    useEffect(() => {
        if (initialProfile) {
            setSelectedProfileId(initialProfile.id);
            setHourlyRateEur(Number(initialProfile.hourlyRateEur ?? 265));
            setSetupFeeEur(Number(initialProfile.setupFeeEur ?? 240));
            setTargetMarginPct(Number(initialProfile.targetMarginPct ?? 28));
            setMinimumJobFeeEur(Number(initialProfile.minimumJobFeeEur ?? 380));
        }
    }, [initialProfile]);

    const currentProfile = useMemo(() => {
        return profiles.find((p) => p.id === selectedProfileId) || activeProfileDefault;
    }, [profiles, selectedProfileId, activeProfileDefault]);

    const handleSelectProfile = (profId: string) => {
        setSelectedProfileId(profId);
        const found = profiles.find((p) => p.id === profId);
        if (found) {
            setHourlyRateEur(Number(found.hourlyRateEur ?? 265));
            setSetupFeeEur(Number(found.setupFeeEur ?? 240));
            setTargetMarginPct(Number(found.targetMarginPct ?? 28));
            setMinimumJobFeeEur(Number(found.minimumJobFeeEur ?? 380));
        }
    };

    const currentPaper = useMemo(() => {
        return (
            papers.find((p) => p.paperId === paperId) || {
                paperId: 'paper-ahuesado-90',
                name: 'Ahuesado Editorial Novela 90 g/m² (Vol 1.5)',
                grammageGsm: 90,
                bulkFactor: 1.5,
                costPerTonEur: 1320
            }
        );
    }, [papers, paperId]);

    // Deterministic synchronous calculation matching `pricingIntelligenceService.calibrateQuote`
    const calculation = useMemo(() => {
        const match = String(trimSize).match(/(\d+)\s*[x×]\s*(\d+)/i);
        const pageAreaM2 = match ? (Number(match[1]) / 1000) * (Number(match[2]) / 1000) : 0.15 * 0.23;

        const isDigital = currentProfile.technology === 'DIGITAL_TONER';
        const pagesPerSignature =
            currentProfile.technology === 'OFFSET_B1'
                ? 16
                : currentProfile.technology === 'OFFSET_B2'
                  ? 8
                  : currentProfile.technology === 'WEB_ROTARY'
                    ? 32
                    : 4;
        const signaturesCount = Math.ceil(Math.max(4, pages) / pagesPerSignature);

        // 1. Paper Cost
        const leavesPerCopy = Math.max(4, pages) / 2;
        const netPaperAreaM2 = leavesPerCopy * pageAreaM2 * copies;
        const wasteMultiplier = isDigital ? 1.008 : 1.022;
        const makeReadySheets = isDigital ? 15 : 220;
        const makeReadyAreaM2 = makeReadySheets * signaturesCount * (pageAreaM2 * (pagesPerSignature / 2));
        const grossPaperAreaM2 = netPaperAreaM2 * wasteMultiplier + makeReadyAreaM2;
        const paperWeightKg = round2((grossPaperAreaM2 * currentPaper.grammageGsm) / 1000);
        const paperCostEur = round2(paperWeightKg * (currentPaper.costPerTonEur / 1000));

        // 2. CTP Plates Cost
        const plateUnitEur = isDigital ? 0 : Number(currentProfile.plateCostEur ?? 20);
        const totalPlates = isDigital ? 0 : signaturesCount * 8;
        const platesCostEur = round2(totalPlates * plateUnitEur);

        // 3. Make-Ready Setup Cost
        const makeReadyHours = isDigital ? 0.15 : signaturesCount * 0.22;
        const setupCostEur = round2(setupFeeEur + makeReadyHours * hourlyRateEur * 0.5);

        // 4. Press Run Time Cost
        const speedSph = isDigital ? 3600 : currentProfile.technology === 'WEB_ROTARY' ? 35000 : 13000;
        const totalPressSheets = signaturesCount * copies * wasteMultiplier;
        const pressRunHours = round2(totalPressSheets / speedSph);
        const clickChargeEur = isDigital ? totalPressSheets * 0.038 : 0;
        const runTimeCostEur = round2(pressRunHours * hourlyRateEur + clickChargeEur);

        // 5. Finishing Cost
        const bindingSetupEur = bindingType === 'HARDCOVER' ? 180 : bindingType === 'PUR' ? 85 : 45;
        const bindingUnitEur =
            bindingType === 'HARDCOVER'
                ? 1.45 + signaturesCount * 0.04
                : bindingType === 'PUR'
                  ? 0.34 + signaturesCount * 0.025
                  : 0.14;
        const finishingCostEur = round2(bindingSetupEur + copies * bindingUnitEur);

        // 6. Base Cost & Selling Price
        const baseIndustrialCostEur = round2(
            paperCostEur + platesCostEur + setupCostEur + runTimeCostEur + finishingCostEur
        );
        const rawMarginEur = round2(baseIndustrialCostEur * (targetMarginPct / 100));
        const rawSellingEur = round2(baseIndustrialCostEur + rawMarginEur);
        const minFloorSellingEur = round2(baseIndustrialCostEur + minimumJobFeeEur);

        const totalSellingPriceEur = round2(Math.max(rawSellingEur, minFloorSellingEur));
        const effectiveMarginEur = round2(totalSellingPriceEur - baseIndustrialCostEur);
        const unitSellingPriceEur = round4(totalSellingPriceEur / Math.max(1, copies));
        const unitBaseCostEur = round4(baseIndustrialCostEur / Math.max(1, copies));
        const spineWidthMm = round2(
            ((pages / 2) * currentPaper.grammageGsm * currentPaper.bulkFactor) / 1000 +
                (bindingType === 'HARDCOVER' ? 3.5 : 0.6)
        );

        return {
            paperWeightKg,
            totalPlates,
            signaturesCount,
            pressRunHours,
            paperCostEur,
            platesCostEur,
            setupCostEur,
            runTimeCostEur,
            finishingCostEur,
            baseIndustrialCostEur,
            effectiveMarginEur,
            totalSellingPriceEur,
            unitBaseCostEur,
            unitSellingPriceEur,
            spineWidthMm,
            minOrderFloorApplied: minFloorSellingEur > rawSellingEur
        };
    }, [
        trimSize,
        copies,
        pages,
        currentProfile,
        currentPaper,
        bindingType,
        hourlyRateEur,
        setupFeeEur,
        targetMarginPct,
        minimumJobFeeEur
    ]);

    if (!isOpen && !embedded) return null;

    const handleCommitCalibration = async () => {
        if (!onApplyProfileCalibration) {
            onClose();
            return;
        }
        setSaving(true);
        try {
            await onApplyProfileCalibration({
                id: currentProfile.id,
                printerId: currentProfile.printerId,
                printerName: currentProfile.printerName,
                technology: currentProfile.technology,
                hourlyRateEur,
                setupFeeEur,
                targetMarginPct,
                minimumJobFeeEur,
                active: true
            });
            if (!embedded) onClose();
        } finally {
            setSaving(false);
        }
    };

    const content = (
        <div
            data-testid="live-price-calibrator"
            className="bg-white dark:bg-[#14161a] border border-slate-200 dark:border-[#1f2228] rounded-xl overflow-hidden shadow-2xl"
        >
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-200 dark:border-[#1f2228] flex items-center justify-between bg-slate-50 dark:bg-[#0a0b0d]/80">
                <div>
                    <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-[#dc2626] animate-pulse" />
                        <h3 className="text-sm font-black uppercase tracking-wider text-slate-900 dark:text-white m-0">
                            Live Industrial Price Calibrator
                        </h3>
                    </div>
                    <p className="text-[11px] text-slate-400 m-0 mt-0.5">
                        Real-time technical cost breakdown (Paper + CTP Plates + Make-Ready + Press Run + Finishing)
                    </p>
                </div>
                {!embedded && (
                    <button
                        type="button"
                        data-testid="close-calibrator-btn"
                        onClick={onClose}
                        className="px-3 py-1 rounded-lg border border-slate-200 dark:border-[#1f2228] text-xs font-bold text-slate-400 hover:text-white cursor-pointer"
                    >
                        ESC / CLOSE
                    </button>
                )}
            </div>

            <div className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Left Column: Specification & Interactive Sliders (7 cols) */}
                <div className="lg:col-span-7 space-y-5">
                    {/* Machine & Paper Selector */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">
                                MACHINE / PRESS NODE
                            </label>
                            <select
                                data-testid="calibrator-machine-select"
                                value={selectedProfileId}
                                onChange={(e) => handleSelectProfile(e.target.value)}
                                className="w-full px-3 py-2 rounded-lg text-xs font-bold bg-slate-50 dark:bg-[#0a0b0d] border border-slate-200 dark:border-[#1f2228] text-slate-900 dark:text-white"
                            >
                                {profiles.map((p) => (
                                    <option key={p.id} value={p.id}>
                                        {p.printerName} ({p.technology})
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">
                                SUBSTRATE / PAPER STOCK
                            </label>
                            <select
                                data-testid="calibrator-paper-select"
                                value={paperId}
                                onChange={(e) => setPaperId(e.target.value)}
                                className="w-full px-3 py-2 rounded-lg text-xs font-bold bg-slate-50 dark:bg-[#0a0b0d] border border-slate-200 dark:border-[#1f2228] text-slate-900 dark:text-white"
                            >
                                {papers.map((paper) => (
                                    <option key={paper.paperId} value={paper.paperId}>
                                        {paper.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Trim Size, Pages, Binding & Print Run Presets */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div>
                            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">
                                TRIM SIZE (MM)
                            </label>
                            <select
                                data-testid="calibrator-trim-select"
                                value={trimSize}
                                onChange={(e) => setTrimSize(e.target.value)}
                                className="w-full px-3 py-2 rounded-lg text-xs font-mono font-bold bg-slate-50 dark:bg-[#0a0b0d] border border-slate-200 dark:border-[#1f2228] text-slate-900 dark:text-white"
                            >
                                {TRIM_SIZES.map((ts) => (
                                    <option key={ts.value} value={ts.value}>
                                        {ts.label}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">
                                INTERIOR PAGES
                            </label>
                            <input
                                type="number"
                                data-testid="calibrator-pages-input"
                                min={16}
                                max={1200}
                                step={8}
                                value={pages}
                                onChange={(e) => setPages(Math.max(8, Number(e.target.value)))}
                                className="w-full px-3 py-2 rounded-lg text-xs font-mono font-bold bg-slate-50 dark:bg-[#0a0b0d] border border-slate-200 dark:border-[#1f2228] text-slate-900 dark:text-white"
                            />
                        </div>

                        <div>
                            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">
                                BINDING LINE
                            </label>
                            <select
                                data-testid="calibrator-binding-select"
                                value={bindingType}
                                onChange={(e) => setBindingType(e.target.value as any)}
                                className="w-full px-3 py-2 rounded-lg text-xs font-bold bg-slate-50 dark:bg-[#0a0b0d] border border-slate-200 dark:border-[#1f2228] text-slate-900 dark:text-white"
                            >
                                <option value="PUR">Rústica Fresada PUR</option>
                                <option value="HARDCOVER">Cartoné / Tapa Dura</option>
                                <option value="SADDLE">Grapado Alambre (2 grapas)</option>
                            </select>
                        </div>
                    </div>

                    {/* Print Run Copies Selector + Quick Pills */}
                    <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#0a0b0d] border border-slate-200 dark:border-[#1f2228]">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                                PRINT RUN QUANTITY (COPIES)
                            </span>
                            <div className="flex items-center gap-1.5">
                                {PRINT_RUN_PRESETS.map((preset) => (
                                    <button
                                        key={preset}
                                        type="button"
                                        data-testid={`calibrator-run-${preset}`}
                                        onClick={() => setCopies(preset)}
                                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-black transition-colors cursor-pointer ${
                                            copies === preset
                                                ? 'bg-[#dc2626] text-white'
                                                : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-700'
                                        }`}
                                    >
                                        {preset.toLocaleString()} ex.
                                    </button>
                                ))}
                            </div>
                        </div>
                        <input
                            type="range"
                            data-testid="calibrator-copies-slider"
                            min={50}
                            max={5000}
                            step={50}
                            value={copies}
                            onChange={(e) => setCopies(Number(e.target.value))}
                            className="w-full accent-[#dc2626] cursor-pointer"
                        />
                        <div className="flex justify-between text-[10px] font-mono text-slate-400 mt-1">
                            <span>50 copies</span>
                            <span className="text-slate-900 dark:text-white font-black">
                                Selected: {copies.toLocaleString()} copies · Spine: {calculation.spineWidthMm} mm
                            </span>
                            <span>5,000 copies</span>
                        </div>
                    </div>

                    {/* Interactive Calibration Sliders */}
                    <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-[#1f2228]">
                        <div className="text-[10px] font-black uppercase tracking-widest text-[#dc2626]">
                            INTERACTIVE RATE & MARGIN CALIBRATION SLIDERS
                        </div>

                        {/* Slider 1: Target Margin % */}
                        <div className="grid grid-cols-12 items-center gap-3">
                            <span className="col-span-4 text-xs font-bold text-slate-700 dark:text-slate-300">
                                Target Margin %
                            </span>
                            <input
                                type="range"
                                data-testid="slider-target-margin"
                                min={5}
                                max={65}
                                step={1}
                                value={targetMarginPct}
                                onChange={(e) => setTargetMarginPct(Number(e.target.value))}
                                className="col-span-6 accent-[#10b981] cursor-pointer"
                            />
                            <span
                                data-testid="slider-target-margin-value"
                                className="col-span-2 text-right font-mono font-black text-xs text-[#10b981]"
                            >
                                {targetMarginPct}%
                            </span>
                        </div>

                        {/* Slider 2: Machine Hourly Rate (€/h) */}
                        <div className="grid grid-cols-12 items-center gap-3">
                            <span className="col-span-4 text-xs font-bold text-slate-700 dark:text-slate-300">
                                Hourly Rate (€/h)
                            </span>
                            <input
                                type="range"
                                data-testid="slider-hourly-rate"
                                min={50}
                                max={650}
                                step={5}
                                value={hourlyRateEur}
                                onChange={(e) => setHourlyRateEur(Number(e.target.value))}
                                className="col-span-6 accent-[#dc2626] cursor-pointer"
                            />
                            <span
                                data-testid="slider-hourly-rate-value"
                                className="col-span-2 text-right font-mono font-black text-xs text-slate-900 dark:text-white"
                            >
                                €{hourlyRateEur}/h
                            </span>
                        </div>

                        {/* Slider 3: Make-Ready Setup Fee (€) */}
                        <div className="grid grid-cols-12 items-center gap-3">
                            <span className="col-span-4 text-xs font-bold text-slate-700 dark:text-slate-300">
                                Setup Fee (€)
                            </span>
                            <input
                                type="range"
                                data-testid="slider-setup-fee"
                                min={0}
                                max={800}
                                step={10}
                                value={setupFeeEur}
                                onChange={(e) => setSetupFeeEur(Number(e.target.value))}
                                className="col-span-6 accent-[#dc2626] cursor-pointer"
                            />
                            <span
                                data-testid="slider-setup-fee-value"
                                className="col-span-2 text-right font-mono font-black text-xs text-slate-900 dark:text-white"
                            >
                                €{setupFeeEur}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Right Column: Live Technical Cost Breakdown Telemetry (5 cols) */}
                <div className="lg:col-span-5 flex flex-col justify-between p-5 rounded-xl bg-slate-950 text-white border border-[#1f2228] space-y-4">
                    <div>
                        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                            <div>
                                <div className="text-[10px] font-mono uppercase tracking-widest text-slate-400">
                                    TECHNICAL COST BREAKDOWN
                                </div>
                                <div className="text-xs font-bold text-white mt-0.5">
                                    {currentProfile.printerName}
                                </div>
                            </div>
                            <span className="px-2 py-0.5 rounded bg-[#dc2626]/20 border border-[#dc2626]/40 text-[#dc2626] font-mono text-[10px] font-black">
                                {currentProfile.technology}
                            </span>
                        </div>

                        <div className="space-y-2.5 mt-4 text-xs font-mono">
                            <div className="flex items-center justify-between text-slate-300">
                                <span>1. Paper ({calculation.paperWeightKg} kg):</span>
                                <span data-testid="breakdown-paper-cost" className="font-bold text-white">
                                    €{calculation.paperCostEur.toFixed(2)}
                                </span>
                            </div>
                            <div className="flex items-center justify-between text-slate-300">
                                <span>2. CTP Plates ({calculation.totalPlates} pl):</span>
                                <span data-testid="breakdown-plates-cost" className="font-bold text-white">
                                    €{calculation.platesCostEur.toFixed(2)}
                                </span>
                            </div>
                            <div className="flex items-center justify-between text-slate-300">
                                <span>3. Make-Ready Setup ({calculation.signaturesCount} sig):</span>
                                <span data-testid="breakdown-setup-cost" className="font-bold text-white">
                                    €{calculation.setupCostEur.toFixed(2)}
                                </span>
                            </div>
                            <div className="flex items-center justify-between text-slate-300">
                                <span>4. Press Run ({calculation.pressRunHours} h):</span>
                                <span data-testid="breakdown-runtime-cost" className="font-bold text-white">
                                    €{calculation.runTimeCostEur.toFixed(2)}
                                </span>
                            </div>
                            <div className="flex items-center justify-between text-slate-300">
                                <span>5. Binding & Finishing ({bindingType}):</span>
                                <span data-testid="breakdown-finishing-cost" className="font-bold text-white">
                                    €{calculation.finishingCostEur.toFixed(2)}
                                </span>
                            </div>

                            <div className="pt-2.5 border-t border-slate-800 flex items-center justify-between text-slate-200 font-bold">
                                <span>BASE INDUSTRIAL COST:</span>
                                <span data-testid="breakdown-base-cost" className="text-sm text-white">
                                    €{calculation.baseIndustrialCostEur.toFixed(2)}
                                </span>
                            </div>

                            <div className="flex items-center justify-between text-[#10b981]">
                                <span>+ TARGET MARGIN ({targetMarginPct}%):</span>
                                <span data-testid="breakdown-margin-eur" className="font-bold">
                                    +€{calculation.effectiveMarginEur.toFixed(2)}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Selling Price & Unit Cost Highlight Box */}
                    <div className="p-4 rounded-xl bg-[#14161a] border border-slate-800 space-y-3">
                        <div className="flex items-baseline justify-between">
                            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                                SELLING PRICE (TOTAL)
                            </span>
                            <span
                                data-testid="calibrator-total-selling-price"
                                className="text-2xl font-mono font-black text-[#10b981]"
                            >
                                €{calculation.totalSellingPriceEur.toFixed(2)}
                            </span>
                        </div>
                        <div className="flex items-center justify-between text-xs font-mono border-t border-slate-800/80 pt-2">
                            <span className="text-slate-400">UNIT PRICE / COPY:</span>
                            <span
                                data-testid="calibrator-unit-selling-price"
                                className="font-black text-white text-sm"
                            >
                                €{calculation.unitSellingPriceEur.toFixed(4)} / copy
                            </span>
                        </div>

                        <button
                            type="button"
                            data-testid="apply-calibrated-profile-btn"
                            disabled={saving}
                            onClick={handleCommitCalibration}
                            className="w-full py-2.5 px-4 rounded-lg bg-[#dc2626] hover:bg-[#e11d48] text-white text-xs font-black uppercase tracking-wider transition-colors cursor-pointer"
                        >
                            {saving ? 'SAVING CALIBRATION...' : 'SAVE CALIBRATED RATES TO PROFILE'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );

    if (embedded) {
        return content;
    }

    return (
        <div
            data-testid="live-price-calibrator-modal-backdrop"
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs overflow-y-auto"
        >
            <div className="w-full max-w-5xl my-8">{content}</div>
        </div>
    );
};

