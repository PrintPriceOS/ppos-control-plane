/**
 * src/ui/components/pricing/LivePriceCalibratorModal.tsx
 *
 * PrintPrice OS — Phase 14C: Unified Product + Machine Industrial Price Calibrator
 *
 * Reusable both as a Modal/Drawer in `/ops/pricing` and as an embedded or modal
 * calibrator in Onboarding (`Industrial Pricing` / `PrinthouseSetupHub.tsx`).
 *
 * Unified Hierarchical Model:
 *   1. Product Family / Binding (`SOFTCOVER`, `HARDCOVER`, `WIRE_O`, `SADDLE_STITCH`)
 *   2. Compatible Primary Machine / Press Node (`Heidelberg XL 106`, `HP Indigo`, etc.)
 *   3. Real Substrate / Paper Stock from `materials_catalog` (grouped by category + inline quick-add)
 *   4. Geometry & Print Run Sliders -> Live Technical Cost Breakdown
 */
import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { EconomicProfileRow } from './EconomicProfilesTable';
import { getAuthToken } from '../../lib/authStore';

export type ProductFamilyId = 'SOFTCOVER' | 'HARDCOVER' | 'WIRE_O' | 'SADDLE_STITCH';

export interface PaperCatalogItem {
    id?: string;
    paperId: string;
    name: string;
    materialName?: string;
    material_name?: string;
    grammageGsm: number;
    gsm?: number;
    bulkFactor: number;
    bulkMicrons?: number;
    bulk_microns?: number;
    costPerTonEur: number;
    costPerKgEur?: number;
    cost_per_kg_eur?: number;
    costPerSheetEur?: number;
    cost_per_sheet_eur?: number;
    substrateClass?: 'UNCOATED' | 'COATED' | 'BOARD' | string;
    categoryLabel?: string;
    sheetFormat?: string;
}

export interface LivePriceCalibratorModalProps {
    isOpen: boolean;
    onClose: () => void;
    profiles: EconomicProfileRow[];
    papers: PaperCatalogItem[];
    initialProfile?: EconomicProfileRow | null;
    initialProductFamily?: ProductFamilyId;
    onApplyProfileCalibration?: (updatedProfile: Partial<EconomicProfileRow> & { productFamily?: ProductFamilyId; paperId?: string }) => Promise<void> | void;
    onPaperAdded?: (newPaper: PaperCatalogItem) => void;
    embedded?: boolean;
}

const PRODUCT_FAMILY_OPTIONS: {
    id: ProductFamilyId;
    label: string;
    bindingType: 'PUR' | 'HARDCOVER' | 'WIRE_O' | 'SADDLE';
    compatibleTechnologies: string[];
    defaultTrimSize: string;
    defaultPages: number;
}[] = [
    {
        id: 'SOFTCOVER',
        label: 'Softcover / Paperback (Rústica PUR)',
        bindingType: 'PUR',
        compatibleTechnologies: ['OFFSET_B1', 'OFFSET_B2', 'DIGITAL_TONER', 'WEB_ROTARY'],
        defaultTrimSize: '150x230',
        defaultPages: 192
    },
    {
        id: 'HARDCOVER',
        label: 'Hardcover / Case Bound (Cartoné)',
        bindingType: 'HARDCOVER',
        compatibleTechnologies: ['OFFSET_B1', 'OFFSET_B2', 'DIGITAL_TONER'],
        defaultTrimSize: '150x230',
        defaultPages: 256
    },
    {
        id: 'WIRE_O',
        label: 'Wire-O / Twin Loop (Espiral Metálica)',
        bindingType: 'WIRE_O',
        compatibleTechnologies: ['DIGITAL_TONER', 'OFFSET_B2', 'OFFSET_B1'],
        defaultTrimSize: '210x297',
        defaultPages: 120
    },
    {
        id: 'SADDLE_STITCH',
        label: 'Saddle Stitch / Stapled (Grapado)',
        bindingType: 'SADDLE',
        compatibleTechnologies: ['DIGITAL_TONER', 'OFFSET_B2', 'OFFSET_B1', 'WEB_ROTARY'],
        defaultTrimSize: '210x297',
        defaultPages: 48
    }
];

const TRIM_SIZES = [
    { value: '148x210', label: '148×210 mm (A5 Editorial)', widthMm: 148, heightMm: 210 },
    { value: '150x230', label: '150×230 mm (Trade Paperback)', widthMm: 150, heightMm: 230 },
    { value: '210x297', label: '210×297 mm (A4 Catálogo / Manual)', widthMm: 210, heightMm: 297 }
];

const PRINT_RUN_PRESETS = [100, 500, 1000, 5000];

function round2(n: number): number {
    return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function round4(n: number): number {
    return Math.round((Number(n) + Number.EPSILON) * 10000) / 10000;
}

function isProfileCompatibleWithFamily(profile: EconomicProfileRow, familyId: ProductFamilyId): boolean {
    if (Array.isArray(profile.supportedFamilies) && profile.supportedFamilies.length > 0) {
        return profile.supportedFamilies.includes(familyId);
    }
    const fam = PRODUCT_FAMILY_OPTIONS.find((f) => f.id === familyId);
    if (!fam) return true;
    return fam.compatibleTechnologies.includes(profile.technology || 'OFFSET_B1');
}

export const LivePriceCalibratorModal: React.FC<LivePriceCalibratorModalProps> = ({
    isOpen,
    onClose,
    profiles = [],
    papers = [],
    initialProfile = null,
    initialProductFamily = 'SOFTCOVER',
    onApplyProfileCalibration,
    onPaperAdded,
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

    const [productFamily, setProductFamily] = useState<ProductFamilyId>(initialProductFamily);
    const [selectedProfileId, setSelectedProfileId] = useState<string>(activeProfileDefault.id);
    const [trimSize, setTrimSize] = useState<string>('150x230');
    const [copies, setCopies] = useState<number>(1000);
    const [pages, setPages] = useState<number>(192);
    const [catalogPapers, setCatalogPapers] = useState<PaperCatalogItem[]>(papers);
    const [paperId, setPaperId] = useState<string>(papers[1]?.paperId || papers[0]?.paperId || 'paper-ahuesado-90');
    const [bindingType, setBindingType] = useState<'PUR' | 'HARDCOVER' | 'WIRE_O' | 'SADDLE'>(
        initialProductFamily === 'HARDCOVER'
            ? 'HARDCOVER'
            : initialProductFamily === 'WIRE_O'
              ? 'WIRE_O'
              : initialProductFamily === 'SADDLE_STITCH'
                ? 'SADDLE'
                : 'PUR'
    );

    // Quick Add Substrate to `materials_catalog` state
    const [showAddPaperForm, setShowAddPaperForm] = useState<boolean>(false);
    const [newPaperName, setNewPaperName] = useState<string>('');
    const [newPaperGsm, setNewPaperGsm] = useState<number>(100);
    const [newPaperBulk, setNewPaperBulk] = useState<number>(1.3);
    const [newPaperCostKg, setNewPaperCostKg] = useState<number>(1.32);
    const [newPaperClass, setNewPaperClass] = useState<'UNCOATED' | 'COATED' | 'BOARD'>('UNCOATED');
    const [addingPaper, setAddingPaper] = useState<boolean>(false);

    // Interactive Sliders State
    const [hourlyRateEur, setHourlyRateEur] = useState<number>(Number(activeProfileDefault.hourlyRateEur ?? 265));
    const [setupFeeEur, setSetupFeeEur] = useState<number>(Number(activeProfileDefault.setupFeeEur ?? 240));
    const [targetMarginPct, setTargetMarginPct] = useState<number>(Number(activeProfileDefault.targetMarginPct ?? 28));
    const [minimumJobFeeEur, setMinimumJobFeeEur] = useState<number>(Number(activeProfileDefault.minimumJobFeeEur ?? 380));
    const [saving, setSaving] = useState<boolean>(false);

    useEffect(() => {
        if (Array.isArray(papers) && papers.length > 0) {
            setCatalogPapers(papers);
            if (!papers.some((p) => p.paperId === paperId)) {
                setPaperId(papers[1]?.paperId || papers[0]?.paperId);
            }
        }
    }, [papers]);

    // Fetch real substrates from `materials_catalog` (`GET /api/pricing/materials`) when opened
    useEffect(() => {
        if (!isOpen && !embedded) return;
        let cancelled = false;
        const hydrateRealMaterials = async () => {
            try {
                const token = getAuthToken();
                const headers: Record<string, string> = { 'x-user-role': 'PRINTHOUSE_ADMIN' };
                if (token) headers['Authorization'] = `Bearer ${token}`;
                const res = await fetch('/api/pricing/materials', { headers });
                if (!res || !res.ok || cancelled) return;
                const data = await res.json();
                if (!cancelled && Array.isArray(data.materials) && data.materials.length > 0) {
                    setCatalogPapers(data.materials);
                    if (!data.materials.some((p: PaperCatalogItem) => p.paperId === paperId)) {
                        setPaperId(data.materials[0].paperId);
                    }
                }
            } catch (_) {
                // Keep prop papers fallback in isolated tests
            }
        };
        hydrateRealMaterials();
        return () => {
            cancelled = true;
        };
    }, [isOpen, embedded]);

    useEffect(() => {
        if (initialProfile) {
            setSelectedProfileId(initialProfile.id);
            setHourlyRateEur(Number(initialProfile.hourlyRateEur ?? 265));
            setSetupFeeEur(Number(initialProfile.setupFeeEur ?? 240));
            setTargetMarginPct(Number(initialProfile.targetMarginPct ?? 28));
            setMinimumJobFeeEur(Number(initialProfile.minimumJobFeeEur ?? 380));
        }
    }, [initialProfile]);

    useEffect(() => {
        if (initialProductFamily) {
            setProductFamily(initialProductFamily);
            const fam = PRODUCT_FAMILY_OPTIONS.find((f) => f.id === initialProductFamily);
            if (fam) {
                setBindingType(fam.bindingType);
            }
        }
    }, [initialProductFamily]);

    useEffect(() => {
        if (!isOpen || embedded) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, embedded, onClose]);

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
            if (!isProfileCompatibleWithFamily(found, productFamily)) {
                const fallbackFamily = (found.supportedFamilies?.[0] as ProductFamilyId) || 'SOFTCOVER';
                setProductFamily(fallbackFamily);
                const famSpec = PRODUCT_FAMILY_OPTIONS.find((f) => f.id === fallbackFamily);
                if (famSpec) setBindingType(famSpec.bindingType);
            }
        }
    };

    const handleSelectProductFamily = (nextFamily: ProductFamilyId) => {
        setProductFamily(nextFamily);
        const famSpec = PRODUCT_FAMILY_OPTIONS.find((f) => f.id === nextFamily);
        if (famSpec) {
            setBindingType(famSpec.bindingType);
        }
        // Check if current profile is compatible; if not, suggest best compatible press
        if (!isProfileCompatibleWithFamily(currentProfile, nextFamily)) {
            const compatible = profiles.filter((p) => isProfileCompatibleWithFamily(p, nextFamily));
            if (compatible.length > 0) {
                const preferred =
                    nextFamily === 'HARDCOVER'
                        ? compatible.find((p) => p.technology === 'OFFSET_B1' || p.technology === 'OFFSET_B2') || compatible[0]
                        : compatible[0];
                handleSelectProfile(preferred.id);
            }
        }
    };

    const handleCreatePaperInCatalog = async () => {
        if (!newPaperName.trim()) return;
        setAddingPaper(true);
        try {
            const token = getAuthToken();
            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
                'x-user-role': 'PRINTHOUSE_ADMIN'
            };
            if (token) headers['Authorization'] = `Bearer ${token}`;

            const payload = {
                material_name: newPaperName.trim(),
                gsm: Number(newPaperGsm || 100),
                bulkFactor: Number(newPaperBulk || 1.3),
                cost_per_kg_eur: Number(newPaperCostKg || 1.32),
                substrate_class: newPaperClass
            };

            let createdItem: PaperCatalogItem = {
                paperId: `mat_${Date.now()}`,
                name: `${payload.material_name} (${payload.gsm} g/m²)`,
                materialName: payload.material_name,
                grammageGsm: payload.gsm,
                gsm: payload.gsm,
                bulkFactor: payload.bulkFactor,
                bulkMicrons: Math.round(payload.gsm * payload.bulkFactor),
                costPerKgEur: payload.cost_per_kg_eur,
                cost_per_kg_eur: payload.cost_per_kg_eur,
                costPerTonEur: round2(payload.cost_per_kg_eur * 1000),
                substrateClass: payload.substrate_class,
                categoryLabel:
                    payload.substrate_class === 'BOARD'
                        ? 'Cartoncillo / Cubierta'
                        : payload.substrate_class === 'COATED'
                          ? 'Estucado'
                          : 'Offset / Ahuesado'
            };

            const res = await fetch('/api/pricing/materials', {
                method: 'POST',
                headers,
                body: JSON.stringify(payload)
            }).catch(() => null);

            if (res && res.ok) {
                const data = await res.json();
                if (data && data.material) {
                    createdItem = data.material;
                }
            }

            setCatalogPapers((prev) => [createdItem, ...prev.filter((p) => p.paperId !== createdItem.paperId)]);
            setPaperId(createdItem.paperId);
            setShowAddPaperForm(false);
            setNewPaperName('');
            if (onPaperAdded) onPaperAdded(createdItem);
        } finally {
            setAddingPaper(false);
        }
    };

    const groupedPapers = useMemo(() => {
        const uncoated: PaperCatalogItem[] = [];
        const coated: PaperCatalogItem[] = [];
        const board: PaperCatalogItem[] = [];

        for (const p of catalogPapers) {
            const cls = String(p.substrateClass || '').toUpperCase();
            const lowerName = String(p.name || '').toLowerCase();
            const gsm = Number(p.grammageGsm || p.gsm || 90);
            if (cls === 'BOARD' || lowerName.includes('cartulina') || lowerName.includes('folding') || gsm >= 240) {
                board.push(p);
            } else if (cls === 'COATED' || lowerName.includes('estucado') || lowerName.includes('silk') || lowerName.includes('coated')) {
                coated.push(p);
            } else {
                uncoated.push(p);
            }
        }
        return { uncoated, coated, board };
    }, [catalogPapers]);

    const currentPaper = useMemo(() => {
        return (
            catalogPapers.find((p) => p.paperId === paperId) || {
                paperId: 'paper-ahuesado-90',
                name: 'Ahuesado Editorial Novela 90 g/m² (Vol 1.5)',
                grammageGsm: 90,
                bulkFactor: 1.5,
                costPerTonEur: 1320,
                costPerKgEur: 1.32
            }
        );
    }, [catalogPapers, paperId]);

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

        // 1. Paper Cost (using real `gsm` and `cost_per_kg_eur` from `materials_catalog`)
        const leavesPerCopy = Math.max(4, pages) / 2;
        const netPaperAreaM2 = leavesPerCopy * pageAreaM2 * copies;
        const wasteMultiplier = isDigital ? 1.008 : 1.022;
        const makeReadySheets = isDigital ? 15 : 220;
        const makeReadyAreaM2 = makeReadySheets * signaturesCount * (pageAreaM2 * (pagesPerSignature / 2));
        const grossPaperAreaM2 = netPaperAreaM2 * wasteMultiplier + makeReadyAreaM2;
        const activeGsm = Number(currentPaper.grammageGsm || currentPaper.gsm || 90);
        const activeCostPerKg = Number(
            currentPaper.costPerKgEur ?? currentPaper.cost_per_kg_eur ?? Number(currentPaper.costPerTonEur || 1320) / 1000
        );
        const paperWeightKg = round2((grossPaperAreaM2 * activeGsm) / 1000);
        const paperCostEur = round2(paperWeightKg * activeCostPerKg);

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

        // 5. Finishing Cost (Product Family & Binding aware)
        const bindingSetupEur =
            bindingType === 'HARDCOVER'
                ? 180
                : bindingType === 'WIRE_O'
                  ? 65
                  : bindingType === 'PUR'
                    ? 85
                    : 45;
        const bindingUnitEur =
            bindingType === 'HARDCOVER'
                ? 1.45 + signaturesCount * 0.04
                : bindingType === 'WIRE_O'
                  ? 0.48 + signaturesCount * 0.02
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
            ((pages / 2) * activeGsm * Number(currentPaper.bulkFactor || 1.3)) / 1000 +
                (bindingType === 'HARDCOVER' ? 3.5 : bindingType === 'WIRE_O' ? 1.8 : 0.6)
        );

        return {
            paperWeightKg,
            activeCostPerKg,
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
                productFamily,
                paperId: currentPaper.paperId,
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
                        <span className="px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-[10px] font-mono font-bold text-emerald-400">
                            MATERIALS CATALOG CONNECTED ({catalogPapers.length})
                        </span>
                    </div>
                    <p className="text-[11px] text-slate-400 m-0 mt-0.5">
                        Unified Product Family + Machine Node Hierarchy · Real-time technical cost breakdown
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
                    {/* Row 1: Unified Dual Hierarchy (1. Product Family -> 2. Compatible Machine) */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3.5 rounded-xl bg-slate-50/70 dark:bg-[#0a0b0d]/70 border border-slate-200 dark:border-[#1f2228]">
                        <div>
                            <label className="block text-[10px] font-black uppercase tracking-wider text-[#dc2626] mb-1.5">
                                1. PRODUCT FAMILY / BINDING
                            </label>
                            <select
                                data-testid="calibrator-family-select"
                                value={productFamily}
                                onChange={(e) => handleSelectProductFamily(e.target.value as ProductFamilyId)}
                                className="w-full px-3 py-2 rounded-lg text-xs font-bold bg-white dark:bg-[#14161a] border border-slate-200 dark:border-[#2a2e37] text-slate-900 dark:text-white"
                            >
                                {PRODUCT_FAMILY_OPTIONS.map((fam) => (
                                    <option key={fam.id} value={fam.id}>
                                        {fam.label}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">
                                2. PRIMARY MACHINE / PRESS NODE
                            </label>
                            <select
                                data-testid="calibrator-machine-select"
                                value={selectedProfileId}
                                onChange={(e) => handleSelectProfile(e.target.value)}
                                className="w-full px-3 py-2 rounded-lg text-xs font-bold bg-white dark:bg-[#14161a] border border-slate-200 dark:border-[#2a2e37] text-slate-900 dark:text-white"
                            >
                                {profiles.map((p) => {
                                    const compatible = isProfileCompatibleWithFamily(p, productFamily);
                                    return (
                                        <option key={p.id} value={p.id}>
                                            {p.printerName} ({p.technology}){compatible ? '' : ' [Incompatible w/ Family]'}
                                        </option>
                                    );
                                })}
                            </select>
                        </div>
                    </div>

                    {/* Row 2: Real Substrate / Paper Stock from `materials_catalog` */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400">
                                3. SUBSTRATE / PAPER STOCK (MYSQL MATERIALS CATALOG)
                            </label>
                            <button
                                type="button"
                                data-testid="calibrator-add-paper-btn"
                                onClick={() => setShowAddPaperForm((prev) => !prev)}
                                className="text-[10px] font-mono font-bold text-[#dc2626] hover:underline cursor-pointer"
                            >
                                {showAddPaperForm ? '✕ Cancelar nuevo papel' : '+ Añadir nuevo papel al catálogo'}
                            </button>
                        </div>

                        <select
                            data-testid="calibrator-paper-select"
                            value={paperId}
                            onChange={(e) => {
                                if (e.target.value === '__ADD_NEW_PAPER__') {
                                    setShowAddPaperForm(true);
                                    return;
                                }
                                setPaperId(e.target.value);
                            }}
                            className="w-full px-3 py-2 rounded-lg text-xs font-bold bg-slate-50 dark:bg-[#0a0b0d] border border-slate-200 dark:border-[#1f2228] text-slate-900 dark:text-white"
                        >
                            {groupedPapers.uncoated.length > 0 && (
                                <optgroup label="Offset / Ahuesado (Uncoated)">
                                    {groupedPapers.uncoated.map((paper) => (
                                        <option key={paper.paperId} value={paper.paperId}>
                                            {paper.name} · Vol {paper.bulkFactor} · €{Number(paper.costPerKgEur ?? (paper.costPerTonEur / 1000)).toFixed(2)}/kg
                                        </option>
                                    ))}
                                </optgroup>
                            )}
                            {groupedPapers.coated.length > 0 && (
                                <optgroup label="Estucado (Coated Silk / Matte / Gloss)">
                                    {groupedPapers.coated.map((paper) => (
                                        <option key={paper.paperId} value={paper.paperId}>
                                            {paper.name} · Vol {paper.bulkFactor} · €{Number(paper.costPerKgEur ?? (paper.costPerTonEur / 1000)).toFixed(2)}/kg
                                        </option>
                                    ))}
                                </optgroup>
                            )}
                            {groupedPapers.board.length > 0 && (
                                <optgroup label="Cartoncillo / Cubierta (Board)">
                                    {groupedPapers.board.map((paper) => (
                                        <option key={paper.paperId} value={paper.paperId}>
                                            {paper.name} · Vol {paper.bulkFactor} · €{Number(paper.costPerKgEur ?? (paper.costPerTonEur / 1000)).toFixed(2)}/kg
                                        </option>
                                    ))}
                                </optgroup>
                            )}
                            <option value="__ADD_NEW_PAPER__">+ Añadir nuevo papel al catálogo...</option>
                        </select>

                        {showAddPaperForm && (
                            <div
                                data-testid="calibrator-quick-add-paper-form"
                                className="p-3 rounded-lg bg-slate-100 dark:bg-[#0a0b0d] border border-[#dc2626]/40 grid grid-cols-1 sm:grid-cols-12 gap-2 items-end"
                            >
                                <div className="sm:col-span-4">
                                    <label className="block text-[9px] font-mono uppercase text-slate-400 mb-1">
                                        Nombre Sustrato
                                    </label>
                                    <input
                                        type="text"
                                        data-testid="new-paper-name-input"
                                        placeholder="Ej. Munken Print White"
                                        value={newPaperName}
                                        onChange={(e) => setNewPaperName(e.target.value)}
                                        className="w-full px-2.5 py-1.5 rounded text-xs bg-white dark:bg-[#14161a] border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
                                    />
                                </div>
                                <div className="sm:col-span-2">
                                    <label className="block text-[9px] font-mono uppercase text-slate-400 mb-1">
                                        Categoría
                                    </label>
                                    <select
                                        data-testid="new-paper-class-select"
                                        value={newPaperClass}
                                        onChange={(e) => setNewPaperClass(e.target.value as any)}
                                        className="w-full px-2 py-1.5 rounded text-xs bg-white dark:bg-[#14161a] border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
                                    >
                                        <option value="UNCOATED">Offset/Ahues.</option>
                                        <option value="COATED">Estucado</option>
                                        <option value="BOARD">Cartoncillo</option>
                                    </select>
                                </div>
                                <div className="sm:col-span-2">
                                    <label className="block text-[9px] font-mono uppercase text-slate-400 mb-1">
                                        Gramos (g/m²)
                                    </label>
                                    <input
                                        type="number"
                                        data-testid="new-paper-gsm-input"
                                        value={newPaperGsm}
                                        onChange={(e) => setNewPaperGsm(Number(e.target.value))}
                                        className="w-full px-2 py-1.5 rounded text-xs font-mono bg-white dark:bg-[#14161a] border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
                                    />
                                </div>
                                <div className="sm:col-span-2">
                                    <label className="block text-[9px] font-mono uppercase text-slate-400 mb-1">
                                        Coste (€/kg)
                                    </label>
                                    <input
                                        type="number"
                                        step="0.05"
                                        data-testid="new-paper-costkg-input"
                                        value={newPaperCostKg}
                                        onChange={(e) => setNewPaperCostKg(Number(e.target.value))}
                                        className="w-full px-2 py-1.5 rounded text-xs font-mono bg-white dark:bg-[#14161a] border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white"
                                    />
                                </div>
                                <div className="sm:col-span-2">
                                    <button
                                        type="button"
                                        data-testid="save-new-paper-btn"
                                        disabled={addingPaper || !newPaperName.trim()}
                                        onClick={handleCreatePaperInCatalog}
                                        className="w-full py-1.5 px-2 rounded bg-[#dc2626] hover:bg-[#b91c1c] text-white text-[10px] font-black uppercase cursor-pointer disabled:opacity-50"
                                    >
                                        {addingPaper ? '...' : 'Guardar'}
                                    </button>
                                </div>
                            </div>
                        )}
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
                                onChange={(e) => {
                                    const nextBind = e.target.value as 'PUR' | 'HARDCOVER' | 'WIRE_O' | 'SADDLE';
                                    setBindingType(nextBind);
                                    const mappedFamily: ProductFamilyId =
                                        nextBind === 'HARDCOVER'
                                            ? 'HARDCOVER'
                                            : nextBind === 'WIRE_O'
                                              ? 'WIRE_O'
                                              : nextBind === 'SADDLE'
                                                ? 'SADDLE_STITCH'
                                                : 'SOFTCOVER';
                                    setProductFamily(mappedFamily);
                                }}
                                className="w-full px-3 py-2 rounded-lg text-xs font-bold bg-slate-50 dark:bg-[#0a0b0d] border border-slate-200 dark:border-[#1f2228] text-slate-900 dark:text-white"
                            >
                                <option value="PUR">Rústica Fresada PUR</option>
                                <option value="HARDCOVER">Cartoné / Tapa Dura</option>
                                <option value="WIRE_O">Wire-O / Espiral Metálica</option>
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

    const modalNode = (
        <div
            data-testid="live-price-calibrator-modal-backdrop"
            onClick={(e) => {
                if (e.target === e.currentTarget) {
                    onClose();
                }
            }}
            className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-xs overflow-y-auto"
        >
            <div
                className="w-full max-w-5xl my-auto max-h-[92vh] overflow-y-auto custom-scrollbar"
                onClick={(e) => e.stopPropagation()}
            >
                {content}
            </div>
        </div>
    );

    if (typeof document !== 'undefined' && document.body) {
        return createPortal(modalNode, document.body);
    }

    return modalNode;
};

