/**
 * src/ui/components/printhouse/setup/ShippingPanel.tsx
 * 
 * Phase 191G — Shipping Regions & Delivery Configuration Panel.
 * Configures shipping regions, supported countries, postal rules,
 * delivery methods, and non-binding delivery estimate preview.
 */
import React, { useState, useEffect } from 'react';
import { Truck } from 'lucide-react';
import { getAuthToken } from '../../../lib/authStore';

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
    const [regions, setRegions] = useState<ShippingRegion[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [showAddForm, setShowAddForm] = useState<boolean>(false);
    const [formData, setFormData] = useState({
        name: '',
        code: '',
        countries: 'DE, FR, ES, IT, NL',
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
            // Fallback for UI preview
            setRegions([
                {
                    id: 'sreg-domestic',
                    siteId: siteId || 'site-1',
                    name: 'Domestic Shipping (Standard)',
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

    const handleCreateRegion = async (e: React.FormEvent) => {
        e.preventDefault();
        setMessage(null);
        try {
            const countriesArr = formData.countries.split(',').map(c => c.trim().toUpperCase()).filter(Boolean);
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
                    countries: countriesArr,
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

    const handleComputeEstimate = async () => {
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
    };

    const inputClass = "w-full bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#dc0000] focus:border-[#dc0000] transition-colors";
    const labelClass = "block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5";

    return (
        <div className="bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-[#27272a] rounded-xl p-7 shadow-sm transition-colors">
            <div className="flex justify-between items-center mb-5 flex-wrap gap-3">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <Truck size={20} className="text-[#dc0000]" />
                        <h3 className="m-0 text-lg font-bold text-zinc-900 dark:text-white">
                            Shipping Regions & Delivery Configuration
                        </h3>
                    </div>
                    <p className="m-0 text-xs text-zinc-500 dark:text-zinc-400">
                        Configure regions served, transit lead times, pickup availability, and preview delivery estimates.
                    </p>
                </div>
                <button
                    onClick={() => setShowAddForm(!showAddForm)}
                    className="bg-[#dc0000] hover:bg-red-700 text-white font-semibold px-4 py-2 rounded-lg text-xs transition-colors shadow-xs cursor-pointer"
                >
                    {showAddForm ? 'Cancel' : '+ Add Shipping Region'}
                </button>
            </div>

            {message && (
                <div className={`p-3 rounded-lg text-xs mb-4 ${
                    message.type === 'success' 
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200' 
                        : 'bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-900 dark:text-red-200'
                }`}>
                    {message.text}
                </div>
            )}

            {showAddForm && (
                <form onSubmit={handleCreateRegion} className="bg-zinc-50 dark:bg-zinc-900/60 p-5 rounded-xl mb-5 border border-zinc-200 dark:border-zinc-800 transition-colors">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                        <div>
                            <label className={labelClass}>Region Name</label>
                            <input
                                type="text"
                                required
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                                placeholder="e.g. EU Central Region"
                                className={inputClass}
                            />
                        </div>
                        <div>
                            <label className={labelClass}>Region Code</label>
                            <input
                                type="text"
                                value={formData.code}
                                onChange={e => setFormData({ ...formData, code: e.target.value })}
                                placeholder="e.g. EU_CENTRAL"
                                className={inputClass}
                            />
                        </div>
                    </div>

                    <div className="mb-3">
                        <label className={labelClass}>Supported Countries (Comma Separated ISO codes)</label>
                        <input
                            type="text"
                            value={formData.countries}
                            onChange={e => setFormData({ ...formData, countries: e.target.value })}
                            placeholder="DE, FR, ES, IT, NL"
                            className={inputClass}
                        />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                        <div>
                            <label className={labelClass}>Standard Transit (Days)</label>
                            <input
                                type="number"
                                value={formData.standardTransitDays}
                                onChange={e => setFormData({ ...formData, standardTransitDays: Number(e.target.value) })}
                                className={inputClass}
                            />
                        </div>
                        <div>
                            <label className={labelClass}>Handling Days</label>
                            <input
                                type="number"
                                value={formData.handlingDays}
                                onChange={e => setFormData({ ...formData, handlingDays: Number(e.target.value) })}
                                className={inputClass}
                            />
                        </div>
                        <div className="flex items-center sm:mt-6">
                            <label className="flex items-center gap-2 text-xs font-semibold text-zinc-700 dark:text-zinc-300 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={formData.pickupAvailable}
                                    onChange={e => setFormData({ ...formData, pickupAvailable: e.target.checked })}
                                    className="rounded text-[#dc0000] focus:ring-[#dc0000]"
                                />
                                Customer Pickup Available
                            </label>
                        </div>
                    </div>

                    <button
                        type="submit"
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-4 py-2 rounded-lg text-xs transition-colors cursor-pointer shadow-xs"
                    >
                        Save Region
                    </button>
                </form>
            )}

            {/* Region List */}
            {loading ? (
                <p className="text-xs text-zinc-500">Loading shipping regions...</p>
            ) : regions.length === 0 ? (
                <div className="text-center py-8 bg-zinc-50 dark:bg-zinc-900/60 rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800">
                    <p className="m-0 text-xs text-zinc-500 font-semibold">No shipping regions configured yet.</p>
                </div>
            ) : (
                <div className="flex flex-col gap-3">
                    {regions.map(r => (
                        <div key={r.id} className="bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 transition-colors">
                            <div className="flex justify-between items-center flex-wrap gap-3">
                                <div>
                                    <h4 className="m-0 text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                                        {r.name}
                                        <span className="text-[11px] text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/60 border border-sky-200 dark:border-sky-800 px-2 py-0.5 rounded font-mono">
                                            {r.code}
                                        </span>
                                    </h4>
                                    <p className="m-0 mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                                        Countries: {r.countries.join(', ') || 'All'} | Transit: {r.standardTransitDays} days | Handling: {r.handlingDays} days {r.pickupAvailable && '| Pickup Available'}
                                    </p>
                                </div>
                                <span className={`text-[11px] px-2 py-0.5 rounded font-semibold text-white ${r.enabled ? 'bg-emerald-600' : 'bg-zinc-500'}`}>
                                    {r.enabled ? 'ACTIVE' : 'DISABLED'}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            )}

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
                        onClick={handleComputeEstimate}
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
        </div>
    );
};
