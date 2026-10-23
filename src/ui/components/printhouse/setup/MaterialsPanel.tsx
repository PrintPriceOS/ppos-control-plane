/**
 * src/ui/components/printhouse/setup/MaterialsPanel.tsx
 * 
 * Materials and substrate catalog management.
 * Connects materials to printer node sites and associates them with compatible machines.
 */
import React, { useState, useEffect } from 'react';
import { getAuthToken } from '../../../lib/authStore';
import { useLocale } from '../../../i18n';
import { Layers, Plus, Trash2, Link2, Unlink, AlertCircle, CheckCircle, Search, Database, ShoppingBag, X, Loader2 } from 'lucide-react';
import { normalizeUiError } from '../../../utils/errorUtils';
import * as adminApi from '../../../lib/adminApi';
import { PaperSourcingModal } from '../PaperSourcingModal';

interface MaterialsPanelProps {
    sites: { siteId: string; siteName: string }[];
    onSaved?: () => void;
}

export const MaterialsPanel: React.FC<MaterialsPanelProps> = ({ sites, onSaved }) => {
    const { t } = useLocale();
    const [selectedSiteId, setSelectedSiteId] = useState(sites[0]?.siteId || '');
    const [materials, setMaterials] = useState<any[]>([]);
    const [machines, setMachines] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);

    // Form state
    const [materialName, setMaterialName] = useState('');
    const [materialType, setMaterialType] = useState('PAPER');
    const [substrateClass, setSubstrateClass] = useState('STANDARD');
    const [gsm, setGsm] = useState(150);
    const [sheetFormat, setSheetFormat] = useState('SRA3');
    const [finishType, setFinishType] = useState('UNCOATED');
    const [supplierName, setSupplierName] = useState('Generic Supplier');
    const [supplierCountry, setSupplierCountry] = useState('ES');

    // Master Paper Database Search state
    const [paperDbSearch, setPaperDbSearch] = useState('');
    const [paperDbLoading, setPaperDbLoading] = useState(false);
    const [paperDbResults, setPaperDbResults] = useState<adminApi.MasterPaperDatabaseItem[]>([]);
    const [selectedDbPaper, setSelectedDbPaper] = useState<adminApi.MasterPaperDatabaseItem | null>(null);

    // Paper Sourcing Modal state
    const [isSourcingModalOpen, setIsSourcingModalOpen] = useState(false);
    const [sourcingParams, setSourcingParams] = useState<{
        initialSearchQuery?: string;
        initialVariantId?: string;
        initialOfferId?: string;
    }>({});

    // Compatibility pairing states
    const [pairingMaterialId, setPairingMaterialId] = useState<string | null>(null);
    const [provenanceMap, setProvenanceMap] = useState<Record<string, string>>({}); // machineId -> provenance
    const [activeCompatibilities, setActiveCompatibilities] = useState<Record<string, string[]>>({}); // materialId -> machineIds

    const token = getAuthToken();

    const fetchMaterialsAndMachines = async () => {
        if (!selectedSiteId) return;
        setLoading(true);
        setError(null);
        try {
            // Fetch materials
            const matRes = await fetch(`/api/printhouse/onboarding/sites/${selectedSiteId}/materials`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const matData = await matRes.json();
            if (matRes.ok && matData.ok) {
                setMaterials(matData.materials);
            }

            // Fetch machines
            const machRes = await fetch(`/api/printhouse/onboarding/sites/${selectedSiteId}/machines`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const machData = await machRes.json();
            if (machRes.ok && machData.ok) {
                const activeMachines = (machData.machines || []).filter((m: any) => m.status !== 'ARCHIVED');
                setMachines(activeMachines);

                // Fetch compatibilities for each machine
                const compMap: Record<string, string[]> = {};
                for (const m of activeMachines) {
                    const compRes = await fetch(`/api/printhouse/onboarding/sites/${selectedSiteId}/machines/${m.id}/materials`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    const compData = await compRes.json();
                    if (compRes.ok && compData.ok) {
                        for (const comp of compData.compatibilities) {
                            if (!compMap[comp.material_catalog_id]) {
                                compMap[comp.material_catalog_id] = [];
                            }
                            compMap[comp.material_catalog_id].push(`${m.id}:${comp.compatibility_provenance}`);
                        }
                    }
                }
                setActiveCompatibilities(compMap);
            }
        } catch (err: any) {
            setError(normalizeUiError(err, t('setup.materials.error.load') || 'Error fetching data'));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchMaterialsAndMachines();
    }, [selectedSiteId]);

    // Master Paper Database Debounced Search
    useEffect(() => {
        if (!paperDbSearch.trim()) {
            setPaperDbResults([]);
            setPaperDbLoading(false);
            return;
        }

        setPaperDbLoading(true);
        const timer = setTimeout(async () => {
            try {
                const res = await adminApi.searchMasterPaperDatabase({ query: paperDbSearch.trim(), limit: 25 });
                if (res?.ok && Array.isArray(res?.data?.items)) {
                    setPaperDbResults(res.data.items);
                } else {
                    setPaperDbResults([]);
                }
            } catch (err) {
                console.error("Failed to search master paper database:", err);
                setPaperDbResults([]);
            } finally {
                setPaperDbLoading(false);
            }
        }, 250);

        return () => clearTimeout(timer);
    }, [paperDbSearch]);

    const handleSelectDbPaper = (item: adminApi.MasterPaperDatabaseItem) => {
        setSelectedDbPaper(item);
        setMaterialName(`${item.productName} ${item.gsm}g ${item.sheetFormat}`);
        setMaterialType('PAPER');
        setSubstrateClass(item.category || 'STANDARD');
        setGsm(item.gsm);
        setSheetFormat(item.sheetFormat);
        setFinishType(['UNCOATED', 'SILK', 'GLOSSY', 'MATTE'].includes((item.finish || '').toUpperCase())
            ? item.finish.toUpperCase()
            : 'UNCOATED');
        setSupplierName(item.supplierName || 'Papelera del Mediterraneo (Demo)');
        setSupplierCountry('ES');
    };

    const handleCreateMaterial = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSuccessMsg(null);
        try {
            const metadataPayload: any = selectedDbPaper ? {
                paper_variant_id: selectedDbPaper.variantId,
                paper_product_id: selectedDbPaper.productId,
                supplier_id: selectedDbPaper.supplierId,
                offer_id: selectedDbPaper.offerId,
                brand: selectedDbPaper.brand || selectedDbPaper.manufacturer,
                price_per_sheet: selectedDbPaper.calculatedCostPerSheet,
                linked_at: new Date().toISOString()
            } : undefined;

            const res = await fetch(`/api/printhouse/onboarding/sites/${selectedSiteId}/materials`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    material_name: materialName,
                    material_type: materialType,
                    substrate_class: substrateClass,
                    gsm: Number(gsm),
                    sheet_format: sheetFormat,
                    finish_type: finishType,
                    supplier_name: supplierName,
                    supplier_country: supplierCountry,
                    metadata_json: metadataPayload
                })
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data.ok) {
                setSuccessMsg('Material catalog entry created successfully.');
                setMaterialName('');
                setSelectedDbPaper(null);
                setPaperDbSearch('');
                setPaperDbResults([]);
                fetchMaterialsAndMachines();
                if (onSaved) onSaved();
            } else {
                setError(normalizeUiError(data, t('setup.materials.error.create') || 'Failed to create material'));
            }
        } catch (err: any) {
            setError(normalizeUiError(err, t('common.error.network') || 'Network error'));
        }
    };

    const handleArchiveMaterial = async (id: string) => {
        if (!confirm('Are you sure you want to archive this substrate?')) return;
        setError(null);
        try {
            const res = await fetch(`/api/printhouse/onboarding/sites/${selectedSiteId}/materials/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                setSuccessMsg('Material entry archived.');
                fetchMaterialsAndMachines();
                if (onSaved) onSaved();
            } else {
                const data = await res.json().catch(() => ({}));
                setError(normalizeUiError(data, t('setup.materials.error.archive') || 'Failed to archive'));
            }
        } catch (err: any) {
            setError(normalizeUiError(err, t('setup.materials.error.archive') || 'Error deleting material'));
        }
    };

    const handlePairMachine = async (materialId: string, machineId: string) => {
        const provenance = provenanceMap[machineId] || 'manual_pairing';
        setError(null);
        try {
            const res = await fetch(`/api/printhouse/onboarding/sites/${selectedSiteId}/machines/${machineId}/materials/${materialId}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ compatibility_provenance: provenance })
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data.ok) {
                setSuccessMsg('Compatibility established with provenance record.');
                fetchMaterialsAndMachines();
            } else {
                setError(normalizeUiError(data, t('setup.materials.error.link') || 'Failed to link'));
            }
        } catch (err: any) {
            setError(normalizeUiError(err, t('setup.materials.error.link') || 'Error linking compatibility'));
        }
    };

    const handleUnpairMachine = async (materialId: string, machineId: string) => {
        setError(null);
        try {
            const res = await fetch(`/api/printhouse/onboarding/sites/${selectedSiteId}/machines/${machineId}/materials/${materialId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                setSuccessMsg('Compatibility removed.');
                fetchMaterialsAndMachines();
            } else {
                const data = await res.json().catch(() => ({}));
                setError(normalizeUiError(data, t('setup.materials.error.unlink') || 'Failed to remove link'));
            }
        } catch (err: any) {
            setError(normalizeUiError(err, t('setup.materials.error.unlink') || 'Error removing link'));
        }
    };

    const inputClass = "w-full bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#dc0000] focus:border-[#dc0000] transition-colors";
    const labelClass = "block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5";

    return (
        <div className="bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-[#27272a] rounded-xl p-7 shadow-sm transition-colors">
            <div className="flex justify-between items-center mb-5 flex-wrap gap-3">
                <div>
                    <div className="flex items-center gap-2">
                        <Layers size={20} className="text-[#dc0000]" />
                        <h2 className="text-lg font-bold text-zinc-900 dark:text-white m-0">{t('setup.materials.title')}</h2>
                    </div>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 mb-0">{t('setup.materials.subtitle')}</p>
                </div>

                {sites.length > 1 && (
                    <select
                        value={selectedSiteId}
                        onChange={(e) => setSelectedSiteId(e.target.value)}
                        className={`${inputClass} cursor-pointer max-w-xs`}
                    >
                        {sites.map(site => (
                            <option key={site.siteId} value={site.siteId}>{site.siteName}</option>
                        ))}
                    </select>
                )}
            </div>

            {error && (
                <div className="flex items-center gap-2 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-900 dark:text-red-200 p-3 rounded-lg text-xs mb-4">
                    <AlertCircle size={16} />
                    <span>{error}</span>
                </div>
            )}

            {successMsg && (
                <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 p-3 rounded-lg text-xs mb-4">
                    <CheckCircle size={16} />
                    <span>{successMsg}</span>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Catalog Addition Form */}
                <form onSubmit={handleCreateMaterial} className="lg:col-span-5 bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 p-5 rounded-xl flex flex-col gap-3 transition-colors">
                    <h3 className="text-sm font-bold text-zinc-900 dark:text-white m-0 mb-1">{t('setup.materials.addMaterial')}</h3>

                    {/* Master Paper Database Quick Search & Autocomplete Card */}
                    <div className="bg-white dark:bg-zinc-900 border border-red-200 dark:border-red-950/70 p-3.5 rounded-xl shadow-xs transition-colors">
                        <div className="flex items-center justify-between mb-1.5 flex-wrap gap-1">
                            <div className="flex items-center gap-1.5">
                                <Database size={15} className="text-[#dc0000]" />
                                <span className="text-xs font-bold text-zinc-900 dark:text-white uppercase tracking-wider">
                                    {t('materials.dbSearch.title')}
                                </span>
                            </div>
                            <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-red-50 dark:bg-red-950/50 text-[#dc0000] border border-red-200 dark:border-red-900">
                                {t('materials.dbSearch.badge')}
                            </span>
                        </div>
                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mb-2 leading-tight">
                            {t('materials.dbSearch.subtitle')}
                        </p>

                        <div className="relative">
                            <input
                                id="setup-paper-db-search-input"
                                type="text"
                                value={paperDbSearch}
                                onChange={(e) => setPaperDbSearch(e.target.value)}
                                placeholder={t('materials.dbSearch.placeholder')}
                                className={`${inputClass} pl-8 pr-7 text-xs`}
                            />
                            <Search size={14} className="text-zinc-400 absolute left-2.5 top-2.5 pointer-events-none" />
                            {paperDbSearch && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setPaperDbSearch('');
                                        setPaperDbResults([]);
                                    }}
                                    className="absolute right-2 top-2.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 cursor-pointer"
                                >
                                    <X size={14} />
                                </button>
                            )}
                        </div>

                        {/* Quick filter chips */}
                        <div className="flex items-center gap-1 flex-wrap mt-2">
                            <span className="text-[10px] text-zinc-500 font-semibold">{t('materials.dbSearch.suggestions')}</span>
                            {['70x100', '64x92', '72x102', '500x700', 'SRA3', 'Alaska', 'Silk', 'Algro'].map((chip) => (
                                <button
                                    key={chip}
                                    type="button"
                                    onClick={() => setPaperDbSearch(chip)}
                                    className="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-zinc-100 hover:bg-red-50 hover:text-red-600 dark:bg-zinc-800 dark:hover:bg-red-950/40 dark:hover:text-red-300 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700 transition-colors cursor-pointer"
                                >
                                    {chip}
                                </button>
                            ))}
                        </div>

                        {/* Dropdown search results */}
                        {paperDbSearch.trim().length >= 2 && (
                            <div className="mt-2 border rounded-xl max-h-48 overflow-y-auto divide-y divide-zinc-200 dark:divide-zinc-800 bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 shadow-md">
                                {paperDbLoading && (
                                    <div className="p-3 text-center text-[11px] text-zinc-400 flex items-center justify-center gap-2">
                                        <Loader2 size={14} className="animate-spin text-red-500" />
                                        <span>{t('materials.dbSearch.searching')}</span>
                                    </div>
                                )}
                                {!paperDbLoading && paperDbResults.length === 0 && (
                                    <div className="p-3 text-center text-[11px] text-zinc-500">
                                        {t('materials.dbSearch.noResults')}
                                    </div>
                                )}
                                {!paperDbLoading && paperDbResults.map((item) => (
                                    <div
                                        key={item.variantId}
                                        className={`p-2 flex items-center justify-between gap-2 hover:bg-red-50/50 dark:hover:bg-red-950/30 transition-colors cursor-pointer ${
                                            selectedDbPaper?.variantId === item.variantId ? 'bg-red-50 dark:bg-red-950/40' : ''
                                        }`}
                                        onClick={() => handleSelectDbPaper(item)}
                                    >
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
                                                <span className="font-bold text-xs truncate text-zinc-900 dark:text-zinc-100">
                                                    {item.productName}
                                                </span>
                                                <span className="text-[9px] px-1.5 py-0.2 rounded font-bold uppercase bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-300 dark:border-zinc-700">
                                                    {item.gsm} GSM
                                                </span>
                                                <span className="text-[9px] px-1.5 py-0.2 rounded font-bold uppercase bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                                                    {item.sheetFormat}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2 text-[10px] text-zinc-500 mt-0.5">
                                                <span>{item.brand || item.manufacturer || 'Standard'}</span>
                                                <span>•</span>
                                                <span>{item.finish}</span>
                                                <span>•</span>
                                                <span className="text-zinc-400 truncate max-w-[120px]">{item.supplierName}</span>
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                                            <span className="text-[10px] font-mono font-bold text-emerald-700 dark:text-emerald-400">
                                                {item.calculatedCostPerSheet ? `${Number(item.calculatedCostPerSheet).toFixed(4)} € / hoja` : `${item.priceAmount || 0} €`}
                                            </span>
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleSelectDbPaper(item);
                                                }}
                                                className="px-2 py-0.5 bg-[#dc0000] hover:bg-red-700 text-white rounded text-[9px] font-bold uppercase tracking-wider transition-colors cursor-pointer"
                                            >
                                                {t('materials.dbSearch.load')}
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Selected linkage confirmation banner */}
                        {selectedDbPaper && (
                            <div className="mt-2.5 p-2 border rounded-lg flex items-center justify-between gap-2 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200">
                                <div className="flex items-center space-x-2 min-w-0">
                                    <CheckCircle size={15} className="text-emerald-600 flex-shrink-0" />
                                    <div className="text-[10px] truncate">
                                        <span className="font-bold">{t('materials.dbSearch.linkedTo')} </span>
                                        <span>{selectedDbPaper.productName} ({selectedDbPaper.gsm}g {selectedDbPaper.sheetFormat})</span>
                                        <span className="block text-[9px] opacity-80">
                                            {t('materials.dbSearch.supplier')} {selectedDbPaper.supplierName} ({selectedDbPaper.supplierEmail || 'proveedor@demo-papel.pro'})
                                        </span>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setSelectedDbPaper(null)}
                                    className="text-[9px] uppercase font-bold text-red-600 hover:underline cursor-pointer flex-shrink-0"
                                >
                                    {t('materials.dbSearch.unlink')}
                                </button>
                            </div>
                        )}
                    </div>

                    <div>
                        <label className={labelClass}>{t('setup.materials.name')}</label>
                        <input
                            type="text"
                            required
                            placeholder="e.g. Silk Matt Coated Paper"
                            value={materialName}
                            onChange={(e) => setMaterialName(e.target.value)}
                            className={inputClass}
                        />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div>
                            <label className={labelClass}>{t('setup.materials.type')}</label>
                            <select
                                value={materialType}
                                onChange={(e) => setMaterialType(e.target.value)}
                                className={`${inputClass} cursor-pointer`}
                            >
                                <option value="PAPER">{t('setup.materials.type.paper')}</option>
                                <option value="BOARD">{t('setup.materials.type.board')}</option>
                                <option value="VINYL">{t('setup.materials.type.vinyl')}</option>
                                <option value="INK">{t('setup.materials.type.ink')}</option>
                                <option value="CONSUMABLE">{t('setup.materials.type.consumable')}</option>
                            </select>
                        </div>
                        <div>
                            <label className={labelClass}>{t('setup.materials.class')}</label>
                            <input
                                type="text"
                                placeholder="e.g. COATED, UNCOATED"
                                value={substrateClass}
                                onChange={(e) => setSubstrateClass(e.target.value)}
                                className={inputClass}
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div>
                            <label className={labelClass}>{t('setup.materials.gsm')}</label>
                            <input
                                type="number"
                                value={gsm}
                                onChange={(e) => setGsm(Number(e.target.value))}
                                className={inputClass}
                            />
                        </div>
                        <div>
                            <label className={labelClass}>{t('setup.materials.format')}</label>
                            <input
                                type="text"
                                placeholder="e.g. SRA3, B2, 700x1000"
                                value={sheetFormat}
                                onChange={(e) => setSheetFormat(e.target.value)}
                                className={inputClass}
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div>
                            <label className={labelClass}>{t('setup.materials.finish')}</label>
                            <input
                                type="text"
                                placeholder="e.g. MATT, GLOSS, SILK"
                                value={finishType}
                                onChange={(e) => setFinishType(e.target.value)}
                                className={inputClass}
                            />
                        </div>
                        <div>
                            <label className={labelClass}>{t('setup.materials.supplierCountry')}</label>
                            <input
                                type="text"
                                placeholder="e.g. ES, DE, FR"
                                value={supplierCountry}
                                onChange={(e) => setSupplierCountry(e.target.value)}
                                className={inputClass}
                            />
                        </div>
                    </div>

                    <div>
                        <label className={labelClass}>{t('setup.materials.supplier')}</label>
                        <input
                            type="text"
                            placeholder="e.g. Antalis Co."
                            value={supplierName}
                            onChange={(e) => setSupplierName(e.target.value)}
                            className={inputClass}
                        />
                    </div>

                    <button
                        type="submit"
                        className="bg-[#dc0000] hover:bg-red-700 text-white font-semibold py-2.5 px-4 rounded-lg text-xs transition-colors flex items-center justify-center gap-1.5 mt-2 shadow-xs cursor-pointer"
                    >
                        <Plus size={16} /> {t('setup.materials.save')}
                    </button>
                </form>

                {/* Substrate Catalog Listing */}
                <div className="lg:col-span-7 flex flex-col gap-3">
                    {materials.length === 0 ? (
                        <div className="bg-zinc-50 dark:bg-zinc-900/60 p-8 rounded-xl border border-zinc-200 dark:border-zinc-800 text-center text-zinc-500">
                            <Layers size={32} className="mx-auto mb-3 opacity-40" />
                            <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 m-0">{t('setup.materials.noMaterials')}</p>
                            <p className="text-xs text-zinc-500 mt-1 mb-0">{t('setup.materials.noMaterialsDesc')}</p>
                        </div>
                    ) : (
                        materials.map(mat => {
                            const pairedMachineDetails = activeCompatibilities[mat.id] || [];
                            const isPairingMode = pairingMaterialId === mat.id;
                            const meta = typeof mat.metadata_json === 'string'
                                ? (() => { try { return JSON.parse(mat.metadata_json); } catch (e) { return {}; } })()
                                : (mat.metadata_json || {});
                            const isLinkedToDb = Boolean(meta.paper_variant_id || meta.paper_product_id);

                            return (
                                <div key={mat.id} className="bg-zinc-50 dark:bg-zinc-900/60 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 flex flex-col gap-3 transition-colors">
                                    <div className="flex justify-between items-start gap-2">
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                <span className="text-[11px] bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 px-2 py-0.5 rounded font-semibold">
                                                    {mat.material_type}
                                                </span>
                                                {isLinkedToDb && (
                                                    <span className="text-[10px] bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded font-bold uppercase tracking-wider flex items-center gap-1">
                                                        <Database size={10} className="text-emerald-600" />
                                                        {t('materials.linkedToDb')}
                                                    </span>
                                                )}
                                            </div>
                                            <h4 className="text-sm font-bold text-zinc-900 dark:text-white mt-1.5 mb-0.5 truncate">{mat.material_name}</h4>
                                            <p className="text-xs text-zinc-500 dark:text-zinc-400 m-0">
                                                {mat.gsm} GSM • {mat.sheet_format} • {mat.finish_type}
                                            </p>
                                        </div>

                                        <div className="flex items-center gap-2 flex-shrink-0">
                                            {mat.material_type === 'PAPER' && (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setSourcingParams({
                                                            initialSearchQuery: meta.paper_variant_id ? undefined : mat.material_name,
                                                            initialVariantId: meta.paper_variant_id || undefined,
                                                            initialOfferId: meta.offer_id || undefined
                                                        });
                                                        setIsSourcingModalOpen(true);
                                                    }}
                                                    className="px-2 py-1 bg-[#dc0000] hover:bg-red-700 text-white rounded text-[11px] font-bold uppercase tracking-wider transition-colors flex items-center gap-1 cursor-pointer shadow-xs"
                                                    title={t('materials.orderFromSupplier')}
                                                >
                                                    <ShoppingBag size={12} />
                                                    <span>{t('materials.orderPaper')}</span>
                                                </button>
                                            )}
                                            <button
                                                onClick={() => handleArchiveMaterial(mat.id)}
                                                className="text-red-500 hover:text-red-700 p-1 cursor-pointer transition-colors"
                                                title={t('setup.materials.archive')}
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Machine Pairings */}
                                    <div className="bg-white dark:bg-zinc-900/90 p-3 rounded-lg border border-zinc-200 dark:border-zinc-800">
                                        <div className="flex justify-between items-center mb-2">
                                            <span className="text-[11px] font-bold text-zinc-700 dark:text-zinc-300">{t('setup.materials.pairedMachines')}</span>
                                            <button
                                                onClick={() => setPairingMaterialId(isPairingMode ? null : mat.id)}
                                                className="text-sky-600 dark:text-sky-400 text-xs font-semibold hover:underline flex items-center gap-1 cursor-pointer"
                                            >
                                                <Link2 size={12} /> {isPairingMode ? t('setup.materials.closePairing') : t('setup.materials.managePairings')}
                                            </button>
                                        </div>

                                        {pairedMachineDetails.length === 0 && !isPairingMode && (
                                            <p className="text-xs text-zinc-500 m-0">{t('setup.materials.noMachinesPaired')}</p>
                                        )}

                                        {/* Paired list */}
                                        {!isPairingMode && pairedMachineDetails.length > 0 && (
                                            <div className="flex flex-wrap gap-1.5">
                                                {pairedMachineDetails.map(pairedStr => {
                                                    const [mId, provenance] = pairedStr.split(':');
                                                    const machineObj = machines.find(m => m.id === mId);
                                                    if (!machineObj) return null;
                                                    return (
                                                        <div key={mId} className="bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-2 py-1 rounded flex items-center gap-1.5 text-xs">
                                                            <span className="text-zinc-900 dark:text-white font-semibold">{machineObj.machine_name}</span>
                                                            <span className="text-[10px] bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300 px-1.5 py-0.5 rounded" title="Compatibility Provenance">
                                                                {provenance}
                                                            </span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}

                                        {/* Interactive pairing mode */}
                                        {isPairingMode && (
                                            <div className="flex flex-col gap-2 mt-2">
                                                {machines.length === 0 ? (
                                                    <p className="text-xs text-zinc-500 m-0">{t('setup.materials.noMachinesConfigured')}</p>
                                                ) : (
                                                    machines.map(m => {
                                                        const isPaired = pairedMachineDetails.some(p => p.startsWith(m.id + ':'));
                                                        const currentProvenance = pairedMachineDetails.find(p => p.startsWith(m.id + ':'))?.split(':')[1] || '';

                                                        return (
                                                            <div key={m.id} className="flex items-center justify-between bg-zinc-50 dark:bg-zinc-800/60 p-2 rounded border border-zinc-200 dark:border-zinc-700">
                                                                <div>
                                                                    <span className="text-xs font-semibold text-zinc-900 dark:text-white">{m.machine_name}</span>
                                                                    {isPaired && (
                                                                        <span className="block text-[10px] text-zinc-500">
                                                                            {t('setup.materials.provenance')}: {currentProvenance}
                                                                        </span>
                                                                    )}
                                                                </div>

                                                                <div className="flex items-center gap-2">
                                                                    {!isPaired && (
                                                                        <>
                                                                            <input
                                                                                type="text"
                                                                                placeholder={t('setup.materials.provenanceCode')}
                                                                                value={provenanceMap[m.id] || ''}
                                                                                onChange={(e) => setProvenanceMap({ ...provenanceMap, [m.id]: e.target.value })}
                                                                                className="bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 px-2 py-1 rounded text-xs w-28"
                                                                            />
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => handlePairMachine(mat.id, m.id)}
                                                                                className="bg-[#dc0000] hover:bg-red-700 text-white px-2.5 py-1 rounded text-xs font-semibold cursor-pointer transition-colors"
                                                                            >
                                                                                {t('setup.materials.link')}
                                                                            </button>
                                                                        </>
                                                                    )}
                                                                    {isPaired && (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => handleUnpairMachine(mat.id, m.id)}
                                                                            className="bg-zinc-200 dark:bg-zinc-700 hover:bg-red-100 dark:hover:bg-red-950/40 text-red-600 dark:text-red-400 px-2.5 py-1 rounded text-xs font-semibold cursor-pointer transition-colors flex items-center gap-1"
                                                                        >
                                                                            <Unlink size={12} /> {t('setup.materials.unlink')}
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        );
                                                    })
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>

            <PaperSourcingModal
                isOpen={isSourcingModalOpen}
                onClose={() => {
                    setIsSourcingModalOpen(false);
                    setSourcingParams({});
                }}
                onStockUpdated={() => {
                    fetchMaterialsAndMachines();
                    if (onSaved) onSaved();
                }}
                initialSearchQuery={sourcingParams.initialSearchQuery}
                initialVariantId={sourcingParams.initialVariantId}
                initialOfferId={sourcingParams.initialOfferId}
            />
        </div>
    );
};
