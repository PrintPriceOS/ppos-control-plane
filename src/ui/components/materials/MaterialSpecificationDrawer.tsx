/**
 * src/ui/components/materials/MaterialSpecificationDrawer.tsx
 *
 * PrintPrice OS — Phase 15: Interactive Industrial Substrate Specification Drawer
 *
 * Supports creating and editing both Cut Sheets (`SHEETFED_PAPER`, `BOARD_CARTON`, `ENDPAPERS`)
 * and Continuous Web Reels (`REEL_PAPER`, `LAMINATION_FOIL`), with:
 * - Visual Material Type Switcher (Pliegos vs. Bobinas vs. Cartones/Guardas/Laminados)
 * - Live Instant Sheet Weight (`g`) & Cost per Sheet (`€`) Calculator
 * - Interactive Specific Bulk (`cm³/g`) Calibrator with live caliper (`µm`), spine per 100pp (`mm`),
 *   and 200-page standard book spine preview (`mm`)
 * - Environmental Certifications (`FSC_MIX`, `PEFC`, `ECOLABEL`, `CRADLE_TO_CRADLE`)
 */

import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
    XMarkIcon,
    SparklesIcon,
    CubeIcon,
    ScaleIcon,
    CheckBadgeIcon,
    BookOpenIcon,
    CurrencyEuroIcon
} from '@heroicons/react/24/outline';
import { useLocale } from '../../i18n';

export type IndustrialMaterialType =
    | 'SHEETFED_PAPER'
    | 'REEL_PAPER'
    | 'BOARD_CARTON'
    | 'ENDPAPERS'
    | 'LAMINATION_FOIL';

export type IndustrialSubstrateCategory =
    | 'OFFSET_UNCOATED'
    | 'COATED_GLOSS'
    | 'COATED_MATTE'
    | 'BULKY_CREAM'
    | 'SPECIALTY';

export type EnvironmentalCertification =
    | 'FSC_MIX'
    | 'PEFC'
    | 'ECOLABEL'
    | 'CRADLE_TO_CRADLE';

export interface IndustrialMaterialDimensions {
    width_mm?: number;
    height_mm?: number;
    grain_direction?: 'LG' | 'SG';
    web_width_mm?: number;
    max_diameter_mm?: number;
    core_diameter_mm?: 76 | 152;
    format_label?: string;
}

export interface IndustrialSubstrateRecord {
    id: string;
    paperId?: string;
    printhouse_id: string;
    name: string;
    material_name?: string;
    manufacturer: string;
    supplier_name?: string;
    material_type: IndustrialMaterialType;
    category: IndustrialSubstrateCategory;
    basis_weight_gsm: number;
    gsm?: number;
    bulk_volume: number;
    bulkFactor?: number;
    dimensions_json: IndustrialMaterialDimensions;
    cost_per_kg_eur: number;
    cost_per_sheet_eur?: number;
    cost_per_m2_eur?: number;
    sheet_weight_g?: number;
    caliper_microns?: number;
    spine_per_100pp_mm?: number;
    spine_200pp_mm?: number;
    certifications_json: EnvironmentalCertification[];
    in_stock_kg: number;
    min_order_kg: number;
    status: 'ACTIVE' | 'LOW_STOCK' | 'DISCONTINUED';
}

export interface MaterialSpecificationDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    initialMaterial?: Partial<IndustrialSubstrateRecord> | null;
    onSave: (payload: Partial<IndustrialSubstrateRecord>, isEdit: boolean) => Promise<void> | void;
}

const MATERIAL_TYPE_OPTIONS: {
    id: IndustrialMaterialType;
    label: string;
    sublabel: string;
    isReel: boolean;
}[] = [
    {
        id: 'SHEETFED_PAPER',
        label: 'Pliego (Sheetfed)',
        sublabel: 'B1 70×100 · B2 50×70 · SRA3',
        isReel: false
    },
    {
        id: 'REEL_PAPER',
        label: 'Bobina (Web Reel)',
        sublabel: 'Rotativa Offset · Inkjet Continua',
        isReel: true
    },
    {
        id: 'BOARD_CARTON',
        label: 'Cartón / Cubierta',
        sublabel: 'Folding GC1/GC2 · Cartón Gris',
        isReel: false
    },
    {
        id: 'ENDPAPERS',
        label: 'Guardas (Endpapers)',
        sublabel: 'Papel Guarda Cartoné 120-160g',
        isReel: false
    },
    {
        id: 'LAMINATION_FOIL',
        label: 'Laminado / Película',
        sublabel: 'BOPP Mate · Brillo · Soft-Touch',
        isReel: true
    }
];

const CATEGORY_OPTIONS: { id: IndustrialSubstrateCategory; label: string }[] = [
    { id: 'OFFSET_UNCOATED', label: 'Offset Blanco Sin Estucar (Uncoated)' },
    { id: 'BULKY_CREAM', label: 'Edición / Novela Ahuesado Alta Mano (Bulky Cream)' },
    { id: 'COATED_MATTE', label: 'Estucado Mate / Semimate Seda (Coated Matte)' },
    { id: 'COATED_GLOSS', label: 'Estucado Arte Brillante (Coated Gloss)' },
    { id: 'SPECIALTY', label: 'Especialidad / Verjurado / Película Técnica' }
];

const CERTIFICATION_OPTIONS: { id: EnvironmentalCertification; label: string; desc: string }[] = [
    { id: 'FSC_MIX', label: 'FSC® Mix Credit', desc: 'Cadena de Custodia Forestal' },
    { id: 'PEFC', label: 'PEFC™ Certified', desc: 'Bosques Sostenibles Europeos' },
    { id: 'ECOLABEL', label: 'EU Ecolabel', desc: 'Baja Huella de Carbono UE' },
    { id: 'CRADLE_TO_CRADLE', label: 'Cradle to Cradle', desc: 'Economía Circular Certificada' }
];

const SHEET_FORMAT_PRESETS = [
    { label: 'B1 Estándar (700×1000 mm · LG)', width: 700, height: 1000, grain: 'LG' as const },
    { label: 'B2 Medio Pliego (500×700 mm · SG)', width: 500, height: 700, grain: 'SG' as const },
    { label: 'Editorial (650×920 mm · LG)', width: 650, height: 920, grain: 'LG' as const },
    { label: 'Digital SRA3 (320×450 mm · LG)', width: 320, height: 450, grain: 'LG' as const }
];

const REEL_FORMAT_PRESETS = [
    { label: 'Rotativa Editorial 840 mm · Ø1200', webWidth: 840, maxDia: 1200, core: 76 as const },
    { label: 'Inkjet Alta Velocidad 630 mm · Ø1250', webWidth: 630, maxDia: 1250, core: 76 as const },
    { label: 'Rotativa B1 Ancha 960 mm · Ø1250', webWidth: 960, maxDia: 1250, core: 152 as const }
];

function round2(n: number): number {
    return Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;
}

function round4(n: number): number {
    return Math.round((Number(n || 0) + Number.EPSILON) * 10000) / 10000;
}

export const MaterialSpecificationDrawer: React.FC<MaterialSpecificationDrawerProps> = ({
    isOpen,
    onClose,
    initialMaterial = null,
    onSave
}) => {
    const { locale, t } = useLocale();
    const isEdit = Boolean(initialMaterial && initialMaterial.id);

    const [idCode, setIdCode] = useState<string>('');
    const [name, setName] = useState<string>('');
    const [manufacturer, setManufacturer] = useState<string>('Lecta / Torraspapel');
    const [materialType, setMaterialType] = useState<IndustrialMaterialType>('SHEETFED_PAPER');
    const [category, setCategory] = useState<IndustrialSubstrateCategory>('OFFSET_UNCOATED');
    const [gsm, setGsm] = useState<number>(90);
    const [bulkVolume, setBulkVolume] = useState<number>(1.25);
    const [costPerKgEur, setCostPerKgEur] = useState<number>(1.36);

    // Sheetfed dimensions
    const [widthMm, setWidthMm] = useState<number>(700);
    const [heightMm, setHeightMm] = useState<number>(1000);
    const [grainDirection, setGrainDirection] = useState<'LG' | 'SG'>('LG');

    // Reel dimensions
    const [webWidthMm, setWebWidthMm] = useState<number>(840);
    const [maxDiameterMm, setMaxDiameterMm] = useState<number>(1200);
    const [coreDiameterMm, setCoreDiameterMm] = useState<76 | 152>(76);

    // Stock & Certifications
    const [certifications, setCertifications] = useState<EnvironmentalCertification[]>(['FSC_MIX', 'PEFC']);
    const [inStockKg, setInStockKg] = useState<number>(4500);
    const [minOrderKg, setMinOrderKg] = useState<number>(500);
    const [status, setStatus] = useState<'ACTIVE' | 'LOW_STOCK' | 'DISCONTINUED'>('ACTIVE');
    const [saving, setSaving] = useState<boolean>(false);
    const [validationError, setValidationError] = useState<string | null>(null);

    useEffect(() => {
        if (!isOpen) return;
        setValidationError(null);

        if (initialMaterial) {
            setIdCode(initialMaterial.id || '');
            setName(initialMaterial.name || initialMaterial.material_name || '');
            setManufacturer(initialMaterial.manufacturer || initialMaterial.supplier_name || 'Arctic Paper');
            setMaterialType(initialMaterial.material_type || 'SHEETFED_PAPER');
            setCategory(initialMaterial.category || 'OFFSET_UNCOATED');
            setGsm(Number(initialMaterial.basis_weight_gsm || initialMaterial.gsm || 90));
            setBulkVolume(Number(initialMaterial.bulk_volume || initialMaterial.bulkFactor || 1.25));
            setCostPerKgEur(Number(initialMaterial.cost_per_kg_eur || 1.36));

            const dims = initialMaterial.dimensions_json || {};
            setWidthMm(Number(dims.width_mm || 700));
            setHeightMm(Number(dims.height_mm || 1000));
            setGrainDirection(dims.grain_direction === 'SG' ? 'SG' : 'LG');
            setWebWidthMm(Number(dims.web_width_mm || 840));
            setMaxDiameterMm(Number(dims.max_diameter_mm || 1200));
            setCoreDiameterMm(dims.core_diameter_mm === 152 ? 152 : 76);

            setCertifications(
                Array.isArray(initialMaterial.certifications_json) && initialMaterial.certifications_json.length > 0
                    ? initialMaterial.certifications_json
                    : ['FSC_MIX']
            );
            setInStockKg(Number(initialMaterial.in_stock_kg ?? 4500));
            setMinOrderKg(Number(initialMaterial.min_order_kg ?? 500));
            setStatus(initialMaterial.status || 'ACTIVE');
        } else {
            setIdCode('');
            setName('');
            setManufacturer('Arctic Paper / Munken');
            setMaterialType('SHEETFED_PAPER');
            setCategory('BULKY_CREAM');
            setGsm(90);
            setBulkVolume(1.50);
            setCostPerKgEur(1.42);
            setWidthMm(700);
            setHeightMm(1000);
            setGrainDirection('LG');
            setWebWidthMm(840);
            setMaxDiameterMm(1200);
            setCoreDiameterMm(76);
            setCertifications(['FSC_MIX', 'PEFC']);
            setInStockKg(5000);
            setMinOrderKg(500);
            setStatus('ACTIVE');
        }
    }, [isOpen, initialMaterial]);

    useEffect(() => {
        if (!isOpen) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [isOpen, onClose]);

    const isReelMode = materialType === 'REEL_PAPER' || materialType === 'LAMINATION_FOIL';

    // Instant Mechanical & Economic Calculator
    const liveMetrics = useMemo(() => {
        const safeGsm = Math.max(15, Number(gsm || 90));
        const safeBulk = Math.max(0.5, Number(bulkVolume || 1.25));
        const safeCostKg = Math.max(0.1, Number(costPerKgEur || 1.35));

        const effW = isReelMode ? Math.max(100, Number(webWidthMm || 840)) : Math.max(100, Number(widthMm || 700));
        const effH = isReelMode ? 1000 : Math.max(100, Number(heightMm || 1000));

        const sheetAreaM2 = round4((effW / 1000) * (effH / 1000));
        const sheetWeightGrams = round2(sheetAreaM2 * safeGsm);
        const sheetWeightKg = round4(sheetWeightGrams / 1000);
        const costPerSheetEur = round4(sheetWeightKg * safeCostKg);
        const costPer1000SheetsEur = round2(costPerSheetEur * 1000);
        const costPerM2Eur = round4((safeGsm / 1000) * safeCostKg);

        const caliperMicrons = Math.round(safeGsm * safeBulk);
        const spinePer100PagesMm = round2((100 / 2) * (safeGsm / 1000) * safeBulk);
        const spine200PagesMm = round2((200 / 2) * (safeGsm / 1000) * safeBulk);
        const spine320PagesMm = round2((320 / 2) * (safeGsm / 1000) * safeBulk);

        return {
            sheetAreaM2,
            sheetWeightGrams,
            sheetWeightKg,
            costPerSheetEur,
            costPer1000SheetsEur,
            costPerM2Eur,
            caliperMicrons,
            spinePer100PagesMm,
            spine200PagesMm,
            spine320PagesMm
        };
    }, [isReelMode, widthMm, heightMm, webWidthMm, gsm, bulkVolume, costPerKgEur]);

    if (!isOpen) return null;

    const toggleCertification = (cert: EnvironmentalCertification) => {
        setCertifications((prev) =>
            prev.includes(cert) ? prev.filter((c) => c !== cert) : [...prev, cert]
        );
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setValidationError(null);

        if (!name.trim()) {
            setValidationError('El nombre comercial del papel o sustrato es obligatorio.');
            return;
        }
        if (gsm < 15 || gsm > 2500) {
            setValidationError('El gramaje (GSM) debe estar comprendido entre 15 y 2500 g/m².');
            return;
        }

        const dimensionsPayload: IndustrialMaterialDimensions = isReelMode
            ? {
                  web_width_mm: Number(webWidthMm),
                  max_diameter_mm: Number(maxDiameterMm),
                  core_diameter_mm: coreDiameterMm,
                  format_label: `Bobina ${webWidthMm} mm · Ø${maxDiameterMm} mm · Cono ${coreDiameterMm} mm`
              }
            : {
                  width_mm: Number(widthMm),
                  height_mm: Number(heightMm),
                  grain_direction: grainDirection,
                  format_label: `${widthMm === 700 && heightMm === 1000 ? 'B1' : widthMm === 500 && heightMm === 700 ? 'B2' : 'Pliego'} (${widthMm}×${heightMm} mm · ${grainDirection})`
              };

        const autoId =
            idCode.trim() ||
            `${isReelMode ? 'REEL' : 'MAT'}-${name
                .trim()
                .toUpperCase()
                .replace(/[^A-Z0-9]+/g, '-')
                .replace(/^-|-$/g, '')
                .slice(0, 22)}-${gsm}`;

        setSaving(true);
        try {
            await onSave(
                {
                    id: autoId,
                    name: name.trim(),
                    material_name: name.trim(),
                    manufacturer: manufacturer.trim() || 'European Mill',
                    supplier_name: manufacturer.trim() || 'European Mill',
                    material_type: materialType,
                    category,
                    basis_weight_gsm: Number(gsm),
                    gsm: Number(gsm),
                    bulk_volume: Number(bulkVolume),
                    dimensions_json: dimensionsPayload,
                    cost_per_kg_eur: Number(costPerKgEur),
                    cost_per_sheet_eur: liveMetrics.costPerSheetEur,
                    certifications_json: certifications,
                    in_stock_kg: Number(inStockKg),
                    min_order_kg: Number(minOrderKg),
                    status
                },
                isEdit
            );
            onClose();
        } catch (err: any) {
            setValidationError(err?.message || 'Error al guardar la especificación del sustrato.');
        } finally {
            setSaving(false);
        }
    };

    const drawerContent = (
        <div
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
            data-testid="material-specification-drawer-backdrop"
            className="fixed inset-0 z-[9999] flex justify-end bg-black/75 backdrop-blur-sm"
        >
            <form
                onSubmit={handleSubmit}
                data-testid="material-specification-drawer"
                className="w-full max-w-2xl h-full bg-white dark:bg-[#111317] border-l border-zinc-200 dark:border-zinc-800 shadow-2xl flex flex-col overflow-hidden text-zinc-900 dark:text-white"
            >
                {/* Header */}
                <div className="shrink-0 px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#0B0C0E] flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-[#dc0000]/15 border border-[#dc0000]/40 flex items-center justify-center text-[#dc0000]">
                            <CubeIcon className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="text-sm font-black uppercase tracking-wider text-zinc-900 dark:text-white m-0">
                                {isEdit ? t('materials.drawer.titleEdit') : t('materials.drawer.titleNew')}
                            </h3>
                            <p className="text-[10px] font-mono text-zinc-500 dark:text-zinc-400 uppercase tracking-widest m-0 mt-0.5">
                                {t('materials.drawer.badgeSync')}
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        data-testid="close-material-drawer-btn"
                        className="p-2 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-400 hover:text-zinc-900 dark:hover:text-white cursor-pointer"
                    >
                        <XMarkIcon className="w-4 h-4" />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {validationError && (
                        <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs font-bold text-rose-500">
                            {validationError}
                        </div>
                    )}

                    {/* 1. Selector Visual de Tipo de Material (Pliego vs Bobina vs Cartón/Guarda/Laminado) */}
                    <div>
                        <label className="block text-[10px] font-mono font-black uppercase tracking-widest text-zinc-500 dark:text-zinc-400 mb-2">
                            {t('materials.drawer.sec01Title')}
                        </label>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                            {MATERIAL_TYPE_OPTIONS.map((opt) => {
                                const active = materialType === opt.id;
                                return (
                                    <button
                                        key={opt.id}
                                        type="button"
                                        data-testid={`material-type-btn-${opt.id}`}
                                        onClick={() => setMaterialType(opt.id)}
                                        className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                                            active
                                                ? 'bg-[#dc0000]/10 border-[#dc0000] text-zinc-900 dark:text-white shadow-sm'
                                                : 'bg-zinc-50 dark:bg-[#0B0C0E] border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 hover:border-zinc-400 dark:hover:border-zinc-700'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs font-black uppercase tracking-tight">
                                                {opt.label}
                                            </span>
                                            <span
                                                className={`w-2 h-2 rounded-full ${
                                                    active ? 'bg-[#dc0000]' : 'bg-zinc-300 dark:bg-zinc-700'
                                                }`}
                                            />
                                        </div>
                                        <span className="block text-[10px] font-mono text-zinc-400 mt-1">
                                            {opt.sublabel}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* 2. Identidad Comercial y Fabricante */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="sm:col-span-2">
                            <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1">
                                {t('materials.drawer.nameLabel')}
                            </label>
                            <input
                                type="text"
                                required
                                data-testid="material-drawer-name-input"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder={t('materials.drawer.namePlaceholder')}
                                className="w-full px-3.5 py-2 rounded-xl bg-zinc-50 dark:bg-[#0B0C0E] border border-zinc-200 dark:border-zinc-800 text-sm font-bold text-zinc-900 dark:text-white"
                            />
                        </div>

                        <div>
                            <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1">
                                {t('materials.drawer.millLabel')}
                            </label>
                            <input
                                type="text"
                                data-testid="material-drawer-manufacturer-input"
                                value={manufacturer}
                                onChange={(e) => setManufacturer(e.target.value)}
                                placeholder={t('materials.drawer.millPlaceholder')}
                                className="w-full px-3.5 py-2 rounded-xl bg-zinc-50 dark:bg-[#0B0C0E] border border-zinc-200 dark:border-zinc-800 text-xs font-bold text-zinc-900 dark:text-white"
                            />
                        </div>

                        <div>
                            <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1">
                                {t('materials.drawer.categoryLabel')}
                            </label>
                            <select
                                data-testid="material-drawer-category-select"
                                value={category}
                                onChange={(e) => setCategory(e.target.value as IndustrialSubstrateCategory)}
                                className="w-full px-3.5 py-2 rounded-xl bg-zinc-50 dark:bg-[#0B0C0E] border border-zinc-200 dark:border-zinc-800 text-xs font-bold text-zinc-900 dark:text-white"
                            >
                                {CATEGORY_OPTIONS.map((c) => (
                                    <option key={c.id} value={c.id}>
                                        {c.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* 3. Geometría Industrial: Pliegos Cortados vs Bobinas */}
                    <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-[#0B0C0E] border border-zinc-200 dark:border-zinc-800 space-y-4">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                            <span className="text-[10px] font-mono font-black uppercase tracking-widest text-[#dc0000]">
                                {isReelMode ? t('materials.drawer.sec02Reel') : t('materials.drawer.sec02Sheet')}
                            </span>
                            <div className="flex flex-wrap gap-1.5">
                                {!isReelMode
                                    ? SHEET_FORMAT_PRESETS.map((preset) => (
                                          <button
                                              key={preset.label}
                                              type="button"
                                              onClick={() => {
                                                  setWidthMm(preset.width);
                                                  setHeightMm(preset.height);
                                                  setGrainDirection(preset.grain);
                                              }}
                                              className="px-2 py-0.5 rounded bg-zinc-200/70 dark:bg-zinc-800 text-[10px] font-mono font-bold text-zinc-700 dark:text-zinc-300 hover:bg-[#dc0000] hover:text-white transition-colors cursor-pointer"
                                          >
                                              {preset.width}×{preset.height} {preset.grain}
                                          </button>
                                      ))
                                    : REEL_FORMAT_PRESETS.map((preset) => (
                                          <button
                                              key={preset.label}
                                              type="button"
                                              onClick={() => {
                                                  setWebWidthMm(preset.webWidth);
                                                  setMaxDiameterMm(preset.maxDia);
                                                  setCoreDiameterMm(preset.core);
                                              }}
                                              className="px-2 py-0.5 rounded bg-zinc-200/70 dark:bg-zinc-800 text-[10px] font-mono font-bold text-zinc-700 dark:text-zinc-300 hover:bg-[#dc0000] hover:text-white transition-colors cursor-pointer"
                                          >
                                              Ancho {preset.webWidth}mm · Ø{preset.maxDia}
                                          </button>
                                      ))}
                            </div>
                        </div>

                        {!isReelMode ? (
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div>
                                    <label className="block text-[10px] font-bold uppercase text-zinc-400 mb-1">
                                        {t('materials.drawer.widthSheetLabel')}
                                    </label>
                                    <input
                                        type="number"
                                        min={100}
                                        max={2000}
                                        data-testid="material-drawer-width-input"
                                        value={widthMm}
                                        onChange={(e) => setWidthMm(Number(e.target.value))}
                                        className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#14161a] border border-zinc-200 dark:border-zinc-800 text-xs font-mono font-bold"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold uppercase text-zinc-400 mb-1">
                                        {t('materials.drawer.heightSheetLabel')}
                                    </label>
                                    <input
                                        type="number"
                                        min={100}
                                        max={2000}
                                        data-testid="material-drawer-height-input"
                                        value={heightMm}
                                        onChange={(e) => setHeightMm(Number(e.target.value))}
                                        className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#14161a] border border-zinc-200 dark:border-zinc-800 text-xs font-mono font-bold"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold uppercase text-zinc-400 mb-1">
                                        {t('materials.drawer.grainLabel')}
                                    </label>
                                    <select
                                        data-testid="material-drawer-grain-select"
                                        value={grainDirection}
                                        onChange={(e) => setGrainDirection(e.target.value as 'LG' | 'SG')}
                                        className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#14161a] border border-zinc-200 dark:border-zinc-800 text-xs font-mono font-bold"
                                    >
                                        <option value="LG">LG — {t('materials.catalog.grainLong')}</option>
                                        <option value="SG">SG — {t('materials.catalog.grainShort')}</option>
                                    </select>
                                </div>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div>
                                    <label className="block text-[10px] font-bold uppercase text-zinc-400 mb-1">
                                        {t('materials.drawer.webWidthLabel')}
                                    </label>
                                    <input
                                        type="number"
                                        min={100}
                                        max={2500}
                                        data-testid="material-drawer-web-width-input"
                                        value={webWidthMm}
                                        onChange={(e) => setWebWidthMm(Number(e.target.value))}
                                        className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#14161a] border border-zinc-200 dark:border-zinc-800 text-xs font-mono font-bold"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold uppercase text-zinc-400 mb-1">
                                        {t('materials.drawer.maxDiameterLabel')}
                                    </label>
                                    <input
                                        type="number"
                                        min={200}
                                        max={2000}
                                        data-testid="material-drawer-max-diameter-input"
                                        value={maxDiameterMm}
                                        onChange={(e) => setMaxDiameterMm(Number(e.target.value))}
                                        className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#14161a] border border-zinc-200 dark:border-zinc-800 text-xs font-mono font-bold"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold uppercase text-zinc-400 mb-1">
                                        {t('materials.drawer.coreDiameterLabel')}
                                    </label>
                                    <select
                                        data-testid="material-drawer-core-select"
                                        value={coreDiameterMm}
                                        onChange={(e) => setCoreDiameterMm(Number(e.target.value) === 152 ? 152 : 76)}
                                        className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#14161a] border border-zinc-200 dark:border-zinc-800 text-xs font-mono font-bold"
                                    >
                                        <option value={76}>{t('materials.drawer.core76')}</option>
                                        <option value={152}>{t('materials.drawer.core152')}</option>
                                    </select>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* 4. Gramaje, Mano (Bulk cm³/g) y Calibrador de Lomo en Vivo */}
                    <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-[#0B0C0E] border border-zinc-200 dark:border-zinc-800 space-y-4">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-mono font-black uppercase tracking-widest text-emerald-500 flex items-center gap-1.5">
                                <BookOpenIcon className="w-4 h-4" />
                                {t('materials.drawer.sec03Title')}
                            </span>
                            <span className="text-[10px] font-mono font-bold text-zinc-400">
                                {t('materials.drawer.caliperPrefix')}: {liveMetrics.caliperMicrons} µm
                            </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div>
                                <label className="block text-[10px] font-bold uppercase text-zinc-400 mb-1">
                                    {t('materials.drawer.gsmLabel')}
                                </label>
                                <input
                                    type="number"
                                    min={15}
                                    max={2500}
                                    data-testid="material-drawer-gsm-input"
                                    value={gsm}
                                    onChange={(e) => setGsm(Number(e.target.value))}
                                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#14161a] border border-zinc-200 dark:border-zinc-800 text-sm font-mono font-black"
                                />
                            </div>

                            <div className="sm:col-span-2">
                                <div className="flex items-center justify-between mb-1">
                                    <label className="text-[10px] font-bold uppercase text-zinc-400">
                                        {t('materials.drawer.bulkLabel')}
                                    </label>
                                    <span className="text-xs font-mono font-black text-emerald-500">
                                        {bulkVolume.toFixed(2)} cm³/g ({liveMetrics.caliperMicrons} {t('materials.drawer.perLeaf')})
                                    </span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <input
                                        type="range"
                                        min={0.8}
                                        max={2.2}
                                        step={0.05}
                                        data-testid="material-drawer-bulk-slider"
                                        value={bulkVolume}
                                        onChange={(e) => setBulkVolume(Number(e.target.value))}
                                        className="flex-1 accent-[#dc0000] cursor-pointer"
                                    />
                                    <input
                                        type="number"
                                        step={0.05}
                                        min={0.5}
                                        max={3.5}
                                        data-testid="material-drawer-bulk-input"
                                        value={bulkVolume}
                                        onChange={(e) => setBulkVolume(Number(e.target.value))}
                                        className="w-20 px-2.5 py-1.5 rounded-xl bg-white dark:bg-[#14161a] border border-zinc-200 dark:border-zinc-800 text-xs font-mono font-bold text-center"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Live Book Spine Preview Box (200 pages standard + 100 pages base) */}
                        <div
                            data-testid="drawer-live-spine-preview"
                            className="p-3.5 rounded-xl bg-white dark:bg-[#14161a] border border-zinc-200 dark:border-zinc-800 grid grid-cols-3 gap-3 text-center"
                        >
                            <div>
                                <div className="text-[9px] font-mono uppercase text-zinc-400">
                                    {t('materials.drawer.spineBase100pp')}
                                </div>
                                <div className="text-sm font-mono font-black text-zinc-900 dark:text-white mt-0.5">
                                    {liveMetrics.spinePer100PagesMm.toFixed(2)} mm
                                </div>
                            </div>
                            <div className="border-x border-zinc-200 dark:border-zinc-800 px-2">
                                <div className="text-[9px] font-mono font-bold uppercase text-emerald-500">
                                    {t('materials.drawer.spineStandard200pp')}
                                </div>
                                <div
                                    data-testid="drawer-spine-200pp-value"
                                    className="text-base font-mono font-black text-emerald-500 mt-0.5"
                                >
                                    {liveMetrics.spine200PagesMm.toFixed(2)} mm
                                </div>
                            </div>
                            <div>
                                <div className="text-[9px] font-mono uppercase text-zinc-400">
                                    {t('materials.drawer.spineNovel320pp')}
                                </div>
                                <div className="text-sm font-mono font-black text-zinc-900 dark:text-white mt-0.5">
                                    {liveMetrics.spine320PagesMm.toFixed(2)} mm
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* 5. Calculadora Económica Instantánea (€/kg -> Peso Pliego g & Coste €/Pliego) */}
                    <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-[#0B0C0E] border border-zinc-200 dark:border-zinc-800 space-y-4">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-mono font-black uppercase tracking-widest text-amber-500 flex items-center gap-1.5">
                                <CurrencyEuroIcon className="w-4 h-4" />
                                {t('materials.drawer.sec04Title')}
                            </span>
                            <span className="text-[10px] font-mono text-zinc-400">
                                {t('materials.drawer.perTonne', { val: (costPerKgEur * 1000).toFixed(0) })}
                            </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                                <label className="block text-[10px] font-bold uppercase text-zinc-400 mb-1">
                                    {t('materials.drawer.costKgLabel')}
                                </label>
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0.10"
                                    max="50.00"
                                    data-testid="material-drawer-cost-kg-input"
                                    value={costPerKgEur}
                                    onChange={(e) => setCostPerKgEur(Number(e.target.value))}
                                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#14161a] border border-zinc-200 dark:border-zinc-800 text-sm font-mono font-black text-amber-500"
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold uppercase text-zinc-400 mb-1">
                                    {t('materials.drawer.stockKgLabel')}
                                </label>
                                <input
                                    type="number"
                                    step="10"
                                    min="0"
                                    data-testid="material-drawer-stock-kg-input"
                                    value={inStockKg}
                                    onChange={(e) => setInStockKg(Number(e.target.value))}
                                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#14161a] border border-zinc-200 dark:border-zinc-800 text-xs font-mono font-bold"
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold uppercase text-zinc-400 mb-1">
                                    {t('materials.drawer.minOrderKgLabel')}
                                </label>
                                <input
                                    type="number"
                                    step="10"
                                    min="0"
                                    data-testid="material-drawer-min-order-input"
                                    value={minOrderKg}
                                    onChange={(e) => setMinOrderKg(Number(e.target.value))}
                                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#14161a] border border-zinc-200 dark:border-zinc-800 text-xs font-mono font-bold"
                                />
                            </div>
                        </div>

                        <div
                            data-testid="drawer-instant-sheet-calculator"
                            className="p-3.5 rounded-xl bg-white dark:bg-[#14161a] border border-zinc-200 dark:border-zinc-800 grid grid-cols-3 gap-3 text-center"
                        >
                            <div>
                                <div className="text-[9px] font-mono uppercase text-zinc-400 flex items-center justify-center gap-1">
                                    <ScaleIcon className="w-3 h-3" />
                                    {isReelMode ? t('materials.drawer.weightLinearM2') : t('materials.drawer.weightSheet')}
                                </div>
                                <div
                                    data-testid="drawer-sheet-weight-g"
                                    className="text-sm font-mono font-black text-zinc-900 dark:text-white mt-0.5"
                                >
                                    {liveMetrics.sheetWeightGrams.toFixed(1)} g ({liveMetrics.sheetAreaM2.toFixed(2)} m²)
                                </div>
                            </div>
                            <div className="border-x border-zinc-200 dark:border-zinc-800 px-2">
                                <div className="text-[9px] font-mono font-bold uppercase text-amber-500">
                                    {isReelMode ? t('materials.drawer.costLinearMeter') : t('materials.drawer.costExactSheet')}
                                </div>
                                <div
                                    data-testid="drawer-cost-per-sheet-eur"
                                    className="text-base font-mono font-black text-amber-500 mt-0.5"
                                >
                                    €{liveMetrics.costPerSheetEur.toFixed(4)}
                                </div>
                            </div>
                            <div>
                                <div className="text-[9px] font-mono uppercase text-zinc-400">
                                    {t('materials.drawer.cost1000Sheets')}
                                </div>
                                <div className="text-sm font-mono font-black text-zinc-900 dark:text-white mt-0.5">
                                    €{liveMetrics.costPer1000SheetsEur.toFixed(2)}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* 6. Certificaciones Medioambientales y Estado */}
                    <div className="space-y-3">
                        <label className="block text-[10px] font-mono font-black uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
                            {t('materials.drawer.sec05Title')}
                        </label>
                        <div className="grid grid-cols-2 gap-2.5">
                            {CERTIFICATION_OPTIONS.map((cert) => {
                                const checked = certifications.includes(cert.id);
                                return (
                                    <button
                                        key={cert.id}
                                        type="button"
                                        data-testid={`cert-toggle-${cert.id}`}
                                        onClick={() => toggleCertification(cert.id)}
                                        className={`p-2.5 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                                            checked
                                                ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-600 dark:text-emerald-400'
                                                : 'bg-zinc-50 dark:bg-[#0B0C0E] border-zinc-200 dark:border-zinc-800 text-zinc-400'
                                        }`}
                                    >
                                        <div>
                                            <div className="text-xs font-black">{cert.label}</div>
                                            <div className="text-[10px] opacity-80">{cert.desc}</div>
                                        </div>
                                        <CheckBadgeIcon
                                            className={`w-5 h-5 ${
                                                checked ? 'text-emerald-500' : 'text-zinc-300 dark:text-zinc-700'
                                            }`}
                                        />
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="shrink-0 px-6 py-4 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#0B0C0E] flex items-center justify-between">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 text-xs font-bold text-zinc-500 hover:text-zinc-900 dark:hover:text-white cursor-pointer"
                    >
                        {t('materials.drawer.btnCancel')}
                    </button>
                    <button
                        type="submit"
                        disabled={saving}
                        data-testid="save-material-spec-btn"
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#dc0000] hover:bg-red-700 text-white text-xs font-black uppercase tracking-wider shadow-lg transition-all cursor-pointer disabled:opacity-50"
                    >
                        <SparklesIcon className="w-4 h-4" />
                        {saving
                            ? t('materials.drawer.btnSaving')
                            : isEdit
                              ? t('materials.drawer.btnSaveEdit')
                              : t('materials.drawer.btnSaveNew')}
                    </button>
                </div>
            </form>
        </div>
    );

    if (typeof document !== 'undefined' && document.body) {
        return createPortal(drawerContent, document.body);
    }
    return drawerContent;
};

export default MaterialSpecificationDrawer;

