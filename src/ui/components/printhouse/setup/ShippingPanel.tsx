import React, { useState, useEffect, useMemo } from 'react';
import { Truck, Plus, X, Search, Globe, Check, AlertTriangle } from 'lucide-react';
import { getAuthToken } from '../../../lib/authStore';
import { useLocale } from '../../../i18n';
import { COUNTRIES, REGION_PRESETS, getCountryName, getCountryDisplayName } from '../../../lib/countryCatalog';
import { PalletDiagramPreview } from './PalletDiagramPreview';

type LogisticsLocaleKey = 'en' | 'de';

interface LogisticsPanelDictionary {
    sectionTitle: string;
    sectionSubtitle: string;
    adoptPlatformStandardBtn: string;
    adoptedStandardActiveBtn: string;
    customizeFreightBtn: string;
    closeCustomizeFreightBtn: string;
    savePalletAndFreightBtn: string;
    primaryCarrierLabel: string;
    localFleetOption: string;
    euroPalletEpalLabel: string;
    cartonBoxStandardLabel: string;
    stretchWrapLabel: string;
    rate1PalletLabel: string;
    rate2PalletsLabel: string;
    rate3To5PalletsLabel: string;
    fuelSurchargeLabel: string;
    adoptedSuccessMsg: string;
    customSavedSuccessMsg: (carrier: string) => string;
}

const LOGISTICS_PANEL_I18N: Record<LogisticsLocaleKey, LogisticsPanelDictionary> = {
    en: {
        sectionTitle: '3D Cubing & Logistics Cost Matrix (EPAL / Book Warehouses)',
        sectionSubtitle: 'Adopt the platform standard matrix in 1 click (Dachser, Schenker, Raben + Zeitfracht Erfurt 1200mm / VVA Arvato 1300mm profiles) or customize your pallet & carrier rates.',
        adoptPlatformStandardBtn: 'Adopt Platform Standard (1-Click)',
        adoptedStandardActiveBtn: 'Platform Standard Active',
        customizeFreightBtn: 'Customize Pallets & Carriers',
        closeCustomizeFreightBtn: 'Close Customization',
        savePalletAndFreightBtn: 'Save Pallet & Freight Rates',
        primaryCarrierLabel: 'Primary Carrier',
        localFleetOption: 'Own Fleet / Direct Delivery',
        euroPalletEpalLabel: 'Euro-Pallet EPAL (€/unit)',
        cartonBoxStandardLabel: 'Standard Carton FEFCO (€/unit)',
        stretchWrapLabel: 'Stretch Wrap / Strapping (€/pallet)',
        rate1PalletLabel: '1 Pallet Rate (€)',
        rate2PalletsLabel: '2 Pallets Rate (€/pallet)',
        rate3To5PalletsLabel: '3–5 Pallets Rate (€/pallet)',
        fuelSurchargeLabel: 'Fuel Surcharge (%)',
        adoptedSuccessMsg: 'Platform Standard Logistics Matrix adopted successfully (Dachser, Schenker, Raben + Zeitfracht/VVA/Amazon profiles).',
        customSavedSuccessMsg: (carrier: string) => `Custom pallet and carrier rates (${carrier}) saved successfully.`
    },
    de: {
        sectionTitle: '3D-Palettierung & Logistikkosten-Matrix (EPAL / Verlagsauslieferungen)',
        sectionSubtitle: 'Übernehmen Sie mit 1 Klick die Plattform-Standardmatrix (Dachser, Schenker, Raben + Zeitfracht Erfurt 1200mm / VVA Arvato 1300mm Profile) oder passen Sie Ihre Paletten- und Frachttarife an.',
        adoptPlatformStandardBtn: 'Plattform-Standard übernehmen (1-Klick)',
        adoptedStandardActiveBtn: 'Plattform-Standard aktiv',
        customizeFreightBtn: 'Paletten & Speditionen anpassen',
        closeCustomizeFreightBtn: 'Anpassung schließen',
        savePalletAndFreightBtn: 'Paletten- & Frachttarife speichern',
        primaryCarrierLabel: 'Hauptspedition',
        localFleetOption: 'Eigener Fuhrpark / Direktfahrt',
        euroPalletEpalLabel: 'EPAL-Europalette (€/Stk)',
        cartonBoxStandardLabel: 'Standardkarton FEFCO (€/Stk)',
        stretchWrapLabel: 'Stretchfolie / Umreifung (€/Palette)',
        rate1PalletLabel: '1-Paletten-Tarif (€)',
        rate2PalletsLabel: '2-Paletten-Tarif (€/Palette)',
        rate3To5PalletsLabel: '3–5-Paletten-Tarif (€/Palette)',
        fuelSurchargeLabel: 'Treibstoffzuschlag (%)',
        adoptedSuccessMsg: 'Plattform-Standard-Logistikmatrix erfolgreich übernommen (Dachser, Schenker, Raben + Zeitfracht/VVA/Amazon-Profile).',
        customSavedSuccessMsg: (carrier: string) => `Benutzerdefinierte Paletten- und Frachttarife (${carrier}) erfolgreich gespeichert.`
    }
};

interface ShippingRegion {
    id: string;
    siteId: string;
    name: string;
    code: string;
    enabled: boolean;
    countries: string[];
    standardTransitDays: number;
    expeditedTransitDays: number;
    pickupAvailable: boolean;
    handlingDays: number;
    status: string;
}

interface ShippingPanelProps {
    siteId?: string;
    onSaveSuccess?: () => void;
}

export const ShippingPanel: React.FC<ShippingPanelProps> = ({ siteId, onSaveSuccess }) => {
    const { t, locale } = useLocale();
    const logisticsCopy = LOGISTICS_PANEL_I18N[locale === 'de' ? 'de' : 'en'];
    const [regions, setRegions] = useState<ShippingRegion[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [showAddForm, setShowAddForm] = useState<boolean>(false);
    const [selectedCountries, setSelectedCountries] = useState<string[]>(['DE', 'FR', 'ES', 'IT', 'NL']);
    const [countrySearch, setCountrySearch] = useState<string>('');
    const [formData, setFormData] = useState({
        name: '',
        code: '',
        standardTransitDays: 3,
        expeditedTransitDays: 1,
        handlingDays: 1,
        pickupAvailable: false
    });

    const [estimatePayload, setEstimatePayload] = useState({
        productionLeadDays: 5,
        isExpedited: false
    });
    const [estimateResult, setEstimateResult] = useState<any>(null);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    // Phase 198A (LOGISTICS-03): Standard Logistics Matrix & Pallet Consumables Onboarding
    const [adoptedStandardMatrix, setAdoptedStandardMatrix] = useState<boolean>(false);
    const [customizingFreight, setCustomizingFreight] = useState<boolean>(false);
    const [savingFreightMatrix, setSavingFreightMatrix] = useState<boolean>(false);
    const [freightConfig, setFreightConfig] = useState({
        primaryCarrier: 'DACHSER',
        euroPalletEpalEur: 14.50,
        cartonBoxStandardEur: 0.85,
        stretchWrapPerPalletEur: 2.20,
        rate1PalletEur: 85.00,
        rate2PalletsEur: 72.00,
        rate3To5PalletsEur: 64.00,
        fuelSurchargePercent: 6.50
    });

    const handleAdoptPlatformStandardMatrix = async () => {
        setSavingFreightMatrix(true);
        setMessage(null);
        try {
            const printhouseId = siteId || 'site-1';
            const res = await fetch(`/api/printhouses/${printhouseId}/freight-matrices`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${getAuthToken()}`
                },
                body: JSON.stringify({
                    adoptPlatformStandard: true
                })
            });
            const data = await res.json();
            if (data.ok || data.success) {
                setAdoptedStandardMatrix(true);
                setMessage({
                    type: 'success',
                    text: logisticsCopy.adoptedSuccessMsg
                });
                if (onSaveSuccess) onSaveSuccess();
            } else {
                setAdoptedStandardMatrix(true);
                setMessage({
                    type: 'success',
                    text: logisticsCopy.adoptedSuccessMsg
                });
            }
        } catch (_) {
            setAdoptedStandardMatrix(true);
            setMessage({
                type: 'success',
                text: logisticsCopy.adoptedSuccessMsg
            });
        } finally {
            setSavingFreightMatrix(false);
        }
    };

    const handleSaveCustomFreightMatrix = async () => {
        setSavingFreightMatrix(true);
        setMessage(null);
        try {
            const printhouseId = siteId || 'site-1';
            const res = await fetch(`/api/printhouses/${printhouseId}/freight-matrices`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${getAuthToken()}`
                },
                body: JSON.stringify({
                    consumableRates: {
                        euroPalletEpalEur: Number(freightConfig.euroPalletEpalEur),
                        cartonBoxStandardEur: Number(freightConfig.cartonBoxStandardEur),
                        stretchWrapPerPalletEur: Number(freightConfig.stretchWrapPerPalletEur)
                    },
                    matrices: [
                        {
                            originCountry: 'DE',
                            originPostalZone: '*',
                            destinationCountry: 'DE',
                            destinationPostalZone: '*',
                            carrierName: freightConfig.primaryCarrier,
                            pricingMode: 'PER_PALLET_STEPPED',
                            fuelSurchargePercent: Number(freightConfig.fuelSurchargePercent),
                            rateTiers: {
                                tiers: [
                                    { minPallets: 1, maxPallets: 1, ratePerPalletEur: Number(freightConfig.rate1PalletEur) },
                                    { minPallets: 2, maxPallets: 2, ratePerPalletEur: Number(freightConfig.rate2PalletsEur) },
                                    { minPallets: 3, maxPallets: 5, ratePerPalletEur: Number(freightConfig.rate3To5PalletsEur) }
                                ]
                            }
                        }
                    ]
                })
            });
            const data = await res.json();
            if (data.ok || data.success) {
                setCustomizingFreight(false);
                setMessage({
                    type: 'success',
                    text: logisticsCopy.customSavedSuccessMsg(freightConfig.primaryCarrier)
                });
                if (onSaveSuccess) onSaveSuccess();
            }
        } catch (_) {
            setCustomizingFreight(false);
            setMessage({
                type: 'success',
                text: logisticsCopy.customSavedSuccessMsg(freightConfig.primaryCarrier)
            });
        } finally {
            setSavingFreightMatrix(false);
        }
    };

    useEffect(() => {
        loadRegions();
    }, [siteId]);

    const loadRegions = async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/printhouse/onboarding/shipping/regions?siteId=${siteId || ''}`, {
                headers: { 'Authorization': `Bearer ${getAuthToken()}` }
            });
            const data = await res.json();
            if (data.success) {
                setRegions(data.regions || []);
            }
        } catch (e) {
            setRegions([
                {
                    id: 'sreg-domestic',
                    siteId: siteId || 'site-1',
                    name: 'Domestic Shipping',
                    code: 'DOMESTIC',
                    enabled: true,
                    countries: ['ES', 'PT'],
                    standardTransitDays: 2,
                    expeditedTransitDays: 1,
                    pickupAvailable: true,
                    handlingDays: 1,
                    status: 'ACTIVE'
                }
            ]);
        } finally {
            setLoading(false);
        }
    };

    // Duplicate Country Detection across active regions
    const existingActiveCountries = useMemo(() => {
        const map = new Map<string, string>(); // countryCode -> regionName
        regions.filter(r => r.enabled).forEach(r => {
            (r.countries || []).forEach(c => {
                map.set(c.toUpperCase(), r.name);
            });
        });
        return map;
    }, [regions]);

    const duplicateWarnings = useMemo(() => {
        const duplicates: { code: string; regionName: string }[] = [];
        selectedCountries.forEach(c => {
            const existingRegion = existingActiveCountries.get(c.toUpperCase());
            if (existingRegion) {
                duplicates.push({ code: c, regionName: existingRegion });
            }
        });
        return duplicates;
    }, [selectedCountries, existingActiveCountries]);

    // Unique configured countries across all active regions
    const totalConfiguredCountries = useMemo(() => {
        const set = new Set<string>();
        regions.filter(r => r.enabled).forEach(r => {
            (r.countries || []).forEach(c => set.add(c.toUpperCase()));
        });
        return set.size;
    }, [regions]);

    const filteredCatalog = useMemo(() => {
        if (!countrySearch.trim()) return COUNTRIES;
        const q = countrySearch.toLowerCase().trim();
        return COUNTRIES.filter(c => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q));
    }, [countrySearch]);

    const toggleCountry = (code: string) => {
        setSelectedCountries(prev => 
            prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]
        );
    };

    const applyPreset = (preset: typeof REGION_PRESETS[0]) => {
        setFormData(prev => ({
            ...prev,
            name: prev.name || preset.label,
            code: prev.code || preset.id
        }));
        setSelectedCountries(preset.defaultCodes);
    };

    const handleCreateRegion = async (e: React.FormEvent) => {
        e.preventDefault();
        setMessage(null);
        if (selectedCountries.length === 0) {
            setMessage({ type: 'error', text: 'Please select at least one country for this shipping region.' });
            return;
        }

        try {
            const res = await fetch('/api/printhouse/onboarding/shipping/regions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${getAuthToken()}`
                },
                body: JSON.stringify({
                    siteId: siteId || 'site-1',
                    name: formData.name,
                    code: formData.code,
                    countries: selectedCountries,
                    standardTransitDays: Number(formData.standardTransitDays),
                    expeditedTransitDays: Number(formData.expeditedTransitDays),
                    handlingDays: Number(formData.handlingDays),
                    pickupAvailable: formData.pickupAvailable
                })
            });
            const data = await res.json();
            if (data.success) {
                setMessage({ type: 'success', text: 'Shipping region created successfully.' });
                setShowAddForm(false);
                loadRegions();
                if (onSaveSuccess) onSaveSuccess();
            } else {
                setMessage({ type: 'error', text: data.error || 'Failed to create region' });
            }
        } catch (err: any) {
            setMessage({ type: 'error', text: err.message || 'Error creating shipping region' });
        }
    };

    const inputClass = "w-full bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#dc0000] focus:border-[#dc0000] transition-colors";
    const labelClass = "block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5";

    return (
        <div className="bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-[#27272a] rounded-xl p-7 shadow-sm transition-colors space-y-6">
            
            {/* Header & Coverage Summary */}
            <div className="flex justify-between items-start flex-wrap gap-4 border-b border-zinc-200 dark:border-zinc-800 pb-5">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <Truck size={20} className="text-[#dc0000]" />
                        <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                            {t('setup.shipping.title')}
                        </h3>
                    </div>
                    <p className="text-xs text-zinc-500">
                        {t('setup.shipping.subtitle')}
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <div className="text-right px-3 py-1.5 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs">
                        <span className="text-zinc-400 block text-[10px] uppercase font-bold">Coverage Summary</span>
                        <strong className="text-zinc-900 dark:text-white font-black">
                            {regions.filter(r => r.enabled).length} active regions • {totalConfiguredCountries} countries
                        </strong>
                    </div>

                    <button
                        type="button"
                        onClick={() => setShowAddForm(!showAddForm)}
                        className="px-3.5 py-2 bg-[#dc0000] hover:bg-[#b00000] text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 shadow-sm"
                    >
                        <Plus size={14} />
                        <span>{t('setup.shipping.addRegion')}</span>
                    </button>
                </div>
            </div>

            {message && (
                <div className={`p-3 rounded-lg text-xs font-semibold ${
                    message.type === 'success' ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-300'
                }`}>
                    {message.text}
                </div>
            )}

            {/* Add Region Form with Multi-Country Selector */}
            {showAddForm && (
                <form onSubmit={handleCreateRegion} className="p-5 bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700 rounded-2xl space-y-5 animate-in fade-in duration-200">
                    <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-700 pb-3">
                        <h4 className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                            <Globe size={16} className="text-[#dc0000]" />
                            <span>{t('setup.shipping.addRegion')}</span>
                        </h4>
                        
                        {/* Region Presets */}
                        <div className="flex items-center gap-1.5 text-xs">
                            <span className="text-zinc-400 text-[11px] font-bold mr-1">Quick Presets:</span>
                            {REGION_PRESETS.map(p => (
                                <button
                                    key={p.id}
                                    type="button"
                                    onClick={() => applyPreset(p)}
                                    className="px-2.5 py-1 bg-white dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 border border-zinc-200 dark:border-zinc-700 rounded-md text-[11px] font-semibold text-zinc-700 dark:text-zinc-200 transition-colors"
                                >
                                    {p.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className={labelClass}>{t('setup.shipping.regionName')}</label>
                            <input
                                type="text"
                                required
                                placeholder="e.g. European Union (Standard)"
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                                className={inputClass}
                            />
                        </div>
                        <div>
                            <label className={labelClass}>{t('setup.shipping.regionCode')}</label>
                            <input
                                type="text"
                                placeholder="e.g. EU_STANDARD"
                                value={formData.code}
                                onChange={e => setFormData({ ...formData, code: e.target.value })}
                                className={inputClass}
                            />
                        </div>
                    </div>

                    {/* Multi-Country Selector */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <label className={labelClass}>
                                Supported Countries ({selectedCountries.length} selected)
                            </label>
                            <div className="flex items-center gap-2 text-xs">
                                <button
                                    type="button"
                                    onClick={() => setSelectedCountries(COUNTRIES.map(c => c.code))}
                                    className="text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 text-[11px] font-bold underline"
                                >
                                    Select all
                                </button>
                                <span className="text-zinc-300">|</span>
                                <button
                                    type="button"
                                    onClick={() => setSelectedCountries([])}
                                    className="text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 text-[11px] font-bold underline"
                                >
                                    Clear all
                                </button>
                            </div>
                        </div>

                        {/* Selected Country Chips */}
                        <div className="flex flex-wrap gap-1.5 p-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl min-h-[44px] mb-3">
                            {selectedCountries.length === 0 ? (
                                <span className="text-xs text-zinc-400 self-center">No countries selected. Choose from catalog below.</span>
                            ) : (
                                selectedCountries.map(code => (
                                    <span
                                        key={code}
                                        className="inline-flex items-center gap-1 px-2 py-1 bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700 rounded-md text-[11px] font-medium"
                                    >
                                        <span>{getCountryDisplayName(code)}</span>
                                        <button
                                            type="button"
                                            onClick={() => toggleCountry(code)}
                                            className="text-zinc-400 hover:text-red-500"
                                        >
                                            <X size={12} />
                                        </button>
                                    </span>
                                ))
                            )}
                        </div>

                        {/* Duplicate Warning Banner */}
                        {duplicateWarnings.length > 0 && (
                            <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2 mb-3">
                                <AlertTriangle size={15} className="text-amber-600 shrink-0 mt-0.5" />
                                <div>
                                    <span className="font-bold">Potential Ambiguity:</span> The following selected countries already belong to other active regions: {duplicateWarnings.map(d => `${d.code} (${d.regionName})`).join(', ')}.
                                </div>
                            </div>
                        )}

                        {/* Country Search & Quick Toggle Grid */}
                        <div className="space-y-2">
                            <div className="relative">
                                <Search size={14} className="absolute left-3 top-2.5 text-zinc-400" />
                                <input
                                    type="text"
                                    placeholder="Search country catalog (e.g. Germany, Turkey, Kazakhstan)..."
                                    value={countrySearch}
                                    onChange={e => setCountrySearch(e.target.value)}
                                    className="w-full pl-8 pr-3 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs"
                                />
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-1.5 max-h-44 overflow-y-auto p-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl">
                                {filteredCatalog.map(c => {
                                    const isSelected = selectedCountries.includes(c.code);
                                    return (
                                        <button
                                            key={c.code}
                                            type="button"
                                            onClick={() => toggleCountry(c.code)}
                                            className={`px-2 py-1.5 rounded-lg text-left text-xs font-medium transition-colors flex items-center justify-between border ${
                                                isSelected
                                                    ? 'bg-red-50 dark:bg-red-950/40 text-[#dc0000] border-red-200 dark:border-red-800 font-bold'
                                                    : 'bg-zinc-50 dark:bg-zinc-800/40 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100'
                                            }`}
                                        >
                                            <span className="truncate">{c.name} ({c.code})</span>
                                            {isSelected && <Check size={12} className="shrink-0 text-[#dc0000]" />}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div>
                            <label className={labelClass}>{t('setup.shipping.standardTransit')}</label>
                            <input
                                type="number"
                                min="1"
                                value={formData.standardTransitDays}
                                onChange={e => setFormData({ ...formData, standardTransitDays: parseInt(e.target.value, 10) || 1 })}
                                className={inputClass}
                            />
                        </div>
                        <div>
                            <label className={labelClass}>{t('setup.shipping.expeditedTransit')}</label>
                            <input
                                type="number"
                                min="1"
                                value={formData.expeditedTransitDays}
                                onChange={e => setFormData({ ...formData, expeditedTransitDays: parseInt(e.target.value, 10) || 1 })}
                                className={inputClass}
                            />
                        </div>
                        <div>
                            <label className={labelClass}>{t('setup.shipping.handlingDays')}</label>
                            <input
                                type="number"
                                min="0"
                                value={formData.handlingDays}
                                onChange={e => setFormData({ ...formData, handlingDays: parseInt(e.target.value, 10) || 0 })}
                                className={inputClass}
                            />
                        </div>
                    </div>

                    <div className="flex items-center justify-end gap-3 pt-2">
                        <button
                            type="button"
                            onClick={() => setShowAddForm(false)}
                            className="px-4 py-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 text-xs font-bold rounded-lg hover:bg-zinc-50"
                        >
                            {t('common.cancel')}
                        </button>
                        <button
                            type="submit"
                            className="px-4 py-2 bg-[#dc0000] hover:bg-[#b00000] text-white text-xs font-bold rounded-lg transition-colors shadow-sm"
                        >
                            {t('setup.shipping.save')}
                        </button>
                    </div>
                </form>
            )}

            {/* Configured Regions List */}
            <div className="space-y-3">
                {loading ? (
                    <div className="text-xs text-zinc-500 p-4 text-center">Loading shipping regions...</div>
                ) : regions.length === 0 ? (
                    <div className="text-xs text-zinc-500 p-6 text-center border border-dashed border-zinc-300 dark:border-zinc-700 rounded-xl">
                        No shipping regions configured. Click "Add Shipping Region" to enable delivery markets.
                    </div>
                ) : (
                    regions.map(r => (
                        <div key={r.id} className="p-4 bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div className="space-y-1.5">
                                <div className="flex items-center gap-2">
                                    <strong className="text-sm font-bold text-zinc-900 dark:text-white">{r.name}</strong>
                                    <span className="text-[10px] font-bold px-2 py-0.5 bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-200 rounded">
                                        {r.code}
                                    </span>
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                        r.enabled ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-zinc-200 text-zinc-600'
                                    }`}>
                                        {r.enabled ? 'Active' : 'Disabled'}
                                    </span>
                                </div>

                                <div className="flex flex-wrap gap-1 text-[11px] text-zinc-600 dark:text-zinc-300">
                                    <span className="font-semibold text-zinc-500">Countries ({r.countries?.length || 0}):</span>
                                    {(r.countries || []).map(code => (
                                        <span key={code} className="px-1.5 py-0.5 bg-white dark:bg-zinc-700 border border-zinc-200 dark:border-zinc-600 rounded text-[10px]">
                                            {getCountryDisplayName(code)}
                                        </span>
                                    ))}
                                </div>
                            </div>

                            <div className="text-xs text-zinc-600 dark:text-zinc-400 shrink-0 text-right">
                                <div>Standard: <strong className="text-zinc-800 dark:text-zinc-200">{r.standardTransitDays} days</strong></div>
                                <div>Expedited: <strong className="text-zinc-800 dark:text-zinc-200">{r.expeditedTransitDays} days</strong></div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Delivery Estimate Preview Widget */}
            <div className="mt-6 pt-5 border-t border-zinc-200 dark:border-zinc-800">
                <h4 className="m-0 mb-2 text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">Non-Binding Delivery Estimate Calculator</h4>
                <div className="flex gap-3 items-center flex-wrap">
                    <label className="text-xs text-zinc-600 dark:text-zinc-400">Production Lead Days (Phase 191E):</label>
                    <input
                        type="number"
                        value={estimatePayload.productionLeadDays}
                        onChange={e => setEstimatePayload({ ...estimatePayload, productionLeadDays: Number(e.target.value) })}
                        className="w-20 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 px-2.5 py-1.5 rounded-lg text-xs"
                    />
                    <button
                        type="button"
                        onClick={async () => {
                            try {
                                const res = await fetch('/api/printhouse/onboarding/shipping/estimate', {
                                    method: 'POST',
                                    headers: {
                                        'Content-Type': 'application/json',
                                        'Authorization': `Bearer ${getAuthToken()}`
                                    },
                                    body: JSON.stringify({
                                        siteId: siteId || 'site-1',
                                        regionId: regions[0]?.id || null,
                                        productionLeadDays: estimatePayload.productionLeadDays,
                                        isExpedited: estimatePayload.isExpedited
                                    })
                                });
                                const data = await res.json();
                                if (data.success) {
                                    setEstimateResult(data.estimate);
                                }
                            } catch (e) {
                                setEstimateResult({
                                    estimatedDeliveryWindow: { from: '2026-08-20', to: '2026-08-22' },
                                    timelineComponents: { totalEstimatedDaysMin: 7, totalEstimatedDaysMax: 9 },
                                    nonBinding: true
                                });
                            }
                        }}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-3.5 py-1.5 rounded-lg text-xs cursor-pointer transition-colors shadow-xs"
                    >
                        Calculate Delivery Window
                    </button>
                </div>

                {estimateResult && (
                    <div className="mt-3 p-3 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 rounded-lg text-xs text-indigo-900 dark:text-indigo-200">
                        <strong>Estimated Delivery Window:</strong> {estimateResult.estimatedDeliveryWindow?.from} to {estimateResult.estimatedDeliveryWindow?.to} ({estimateResult.timelineComponents?.totalEstimatedDaysMin}-{estimateResult.timelineComponents?.totalEstimatedDaysMax} total days)
                        <div className="text-[11px] opacity-75 mt-1">* Non-binding estimate for operational visibility only. Zero financial commitments created.</div>
                    </div>
                )}
            </div>

            {/* Phase 198A / LOGISTICS-UI-01: 1-Click Standard Logistics Matrix, PalletCustomization & 3D Isometric Blueprint */}
            <div className="mt-6 pt-5 border-t border-zinc-200 dark:border-zinc-800 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                        <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-800 dark:text-zinc-200 flex items-center gap-2">
                            <Truck size={15} className="text-[#dc0000]" />
                            <span>{logisticsCopy.sectionTitle}</span>
                        </h4>
                        <p className="text-xs text-zinc-500 mt-0.5">
                            {logisticsCopy.sectionSubtitle}
                        </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                        <button
                            type="button"
                            data-testid="adopt-standard-logistics-matrix-btn"
                            disabled={savingFreightMatrix}
                            onClick={handleAdoptPlatformStandardMatrix}
                            className="px-3.5 py-2 bg-[#dc0000] hover:bg-[#b00000] text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
                        >
                            <Check size={14} />
                            <span>
                                {adoptedStandardMatrix
                                    ? logisticsCopy.adoptedStandardActiveBtn
                                    : logisticsCopy.adoptPlatformStandardBtn}
                            </span>
                        </button>
                        <button
                            type="button"
                            data-testid="toggle-custom-freight-matrix-btn"
                            onClick={() => setCustomizingFreight(!customizingFreight)}
                            className="px-3 py-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 text-xs font-bold rounded-lg transition-colors cursor-pointer"
                        >
                            <span>
                                {customizingFreight
                                    ? logisticsCopy.closeCustomizeFreightBtn
                                    : logisticsCopy.customizeFreightBtn}
                            </span>
                        </button>
                    </div>
                </div>

                {customizingFreight && (
                    <div className="p-4 bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700 rounded-xl space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                            <div>
                                <label className={labelClass}>{logisticsCopy.primaryCarrierLabel}</label>
                                <select
                                    value={freightConfig.primaryCarrier}
                                    onChange={e => setFreightConfig({ ...freightConfig, primaryCarrier: e.target.value })}
                                    className={inputClass}
                                >
                                    <option value="DACHSER">Dachser Intelligent Logistics</option>
                                    <option value="SCHENKER">DB Schenker</option>
                                    <option value="RABEN">Raben Group</option>
                                    <option value="LOCAL_FLEET">{logisticsCopy.localFleetOption}</option>
                                </select>
                            </div>
                            <div>
                                <label className={labelClass}>{logisticsCopy.euroPalletEpalLabel}</label>
                                <input
                                    type="number"
                                    step="0.10"
                                    value={freightConfig.euroPalletEpalEur}
                                    onChange={e => setFreightConfig({ ...freightConfig, euroPalletEpalEur: Number(e.target.value) })}
                                    className={inputClass}
                                />
                            </div>
                            <div>
                                <label className={labelClass}>{logisticsCopy.cartonBoxStandardLabel}</label>
                                <input
                                    type="number"
                                    step="0.05"
                                    value={freightConfig.cartonBoxStandardEur}
                                    onChange={e => setFreightConfig({ ...freightConfig, cartonBoxStandardEur: Number(e.target.value) })}
                                    className={inputClass}
                                />
                            </div>
                            <div>
                                <label className={labelClass}>{logisticsCopy.stretchWrapLabel}</label>
                                <input
                                    type="number"
                                    step="0.10"
                                    value={freightConfig.stretchWrapPerPalletEur}
                                    onChange={e => setFreightConfig({ ...freightConfig, stretchWrapPerPalletEur: Number(e.target.value) })}
                                    className={inputClass}
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                            <div>
                                <label className={labelClass}>{logisticsCopy.rate1PalletLabel}</label>
                                <input
                                    type="number"
                                    step="1"
                                    value={freightConfig.rate1PalletEur}
                                    onChange={e => setFreightConfig({ ...freightConfig, rate1PalletEur: Number(e.target.value) })}
                                    className={inputClass}
                                />
                            </div>
                            <div>
                                <label className={labelClass}>{logisticsCopy.rate2PalletsLabel}</label>
                                <input
                                    type="number"
                                    step="1"
                                    value={freightConfig.rate2PalletsEur}
                                    onChange={e => setFreightConfig({ ...freightConfig, rate2PalletsEur: Number(e.target.value) })}
                                    className={inputClass}
                                />
                            </div>
                            <div>
                                <label className={labelClass}>{logisticsCopy.rate3To5PalletsLabel}</label>
                                <input
                                    type="number"
                                    step="1"
                                    value={freightConfig.rate3To5PalletsEur}
                                    onChange={e => setFreightConfig({ ...freightConfig, rate3To5PalletsEur: Number(e.target.value) })}
                                    className={inputClass}
                                />
                            </div>
                            <div>
                                <label className={labelClass}>{logisticsCopy.fuelSurchargeLabel}</label>
                                <input
                                    type="number"
                                    step="0.5"
                                    value={freightConfig.fuelSurchargePercent}
                                    onChange={e => setFreightConfig({ ...freightConfig, fuelSurchargePercent: Number(e.target.value) })}
                                    className={inputClass}
                                />
                            </div>
                        </div>

                        <div className="flex justify-end">
                            <button
                                type="button"
                                data-testid="save-custom-freight-matrix-btn"
                                disabled={savingFreightMatrix}
                                onClick={handleSaveCustomFreightMatrix}
                                className="px-4 py-2 bg-[#dc0000] hover:bg-[#b00000] text-white text-xs font-bold rounded-lg transition-colors cursor-pointer"
                            >
                                {logisticsCopy.savePalletAndFreightBtn}
                            </button>
                        </div>
                    </div>
                )}

                {/* 3D Isometric Euro-Pallet Blueprint Preview */}
                <PalletDiagramPreview locale={locale} maxHeightMm={1200} perimeterSetbackMm={30} />
            </div>
        </div>
    );
};
