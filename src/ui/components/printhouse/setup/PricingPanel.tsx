/**
 * src/ui/components/printhouse/setup/PricingPanel.tsx
 * 
 * Phase 192 RC20B — Printhouse Pricing Setup Panel
 * 
 * Primary Experience: Canonical Industrial Manufacturing Pricing (rates_json)
 * Downstream Experience: Commercial Price Books, Rules, and Simulations.
 */
import React, { useState, useEffect } from 'react';
import { getAuthToken } from '../../../lib/authStore';
import { CanonicalIndustrialPricingEditor } from '../pricing/CanonicalIndustrialPricingEditor';
import { PriceBookForm } from './PriceBookForm';
import { PricingRuleBuilder } from './PricingRuleBuilder';
import { PricingPreview } from './PricingPreview';
import { QuickCalibrationPanel } from '../pricing/quick-calibration/QuickCalibrationPanel';
import { PricingWorkflowSelector, PricingWorkflow } from '../pricing/PricingWorkflowSelector';
import { Tag, Plus, Edit, Copy, Trash2, ShieldAlert, BadgeAlert, CheckCircle, Calculator, Info, ShieldCheck, HelpCircle, Layers, ChevronDown, ChevronUp, Sparkles, Sliders } from 'lucide-react';

interface PricingPanelProps {
    sites: { siteId: string; siteName: string }[];
    onSaved?: () => void;
}

type PricingSubTab = 'RULES' | 'SIMULATOR';

export const PricingPanel: React.FC<PricingPanelProps> = ({ sites, onSaved }) => {
    // ── Workflow Selection State (Phase 193H Choice-First UX) ──
    const [selectedWorkflow, setSelectedWorkflow] = useState<PricingWorkflow>('assistant');
    const [isSecondaryExpanded, setIsSecondaryExpanded] = useState<boolean>(false);

    // ── Industrial Pricing State ──
    const [industrialData, setIndustrialData] = useState<any | null>(null);
    const [loadingIndustrial, setLoadingIndustrial] = useState(true);
    const [savingIndustrial, setSavingIndustrial] = useState(false);

    // ── Downstream Commercial Policies State ──
    const [showCommercialPolicy, setShowCommercialPolicy] = useState(false);
    const [priceBooks, setPriceBooks] = useState<any[]>([]);
    const [selectedBook, setSelectedBook] = useState<any | null>(null);
    const [rules, setRules] = useState<any[]>([]);
    
    // Dropdowns data (flattened across all sites)
    const [machines, setMachines] = useState<any[]>([]);
    const [materials, setMaterials] = useState<any[]>([]);

    // Loading & message states
    const [loadingBooks, setLoadingBooks] = useState(false);
    const [loadingRules, setLoadingRules] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);

    // Validation audit states
    const [validationAudits, setValidationAudits] = useState<Record<string, any>>({});
    const [validatingBookId, setValidatingBookId] = useState<string | null>(null);

    // Modals visibility & data
    const [showBookModal, setShowBookModal] = useState(false);
    const [editingBook, setEditingBook] = useState<any | null>(null);
    const [cloningBook, setCloningBook] = useState<any | null>(null);
    
    const [showRuleModal, setShowRuleModal] = useState(false);
    const [editingRule, setEditingRule] = useState<any | null>(null);

    // Sub-tab for the selected price book view
    const [subTab, setSubTab] = useState<PricingSubTab>('RULES');

    const token = getAuthToken();

    const fetchIndustrialPricing = async () => {
        setLoadingIndustrial(true);
        try {
            const res = await fetch('/api/printhouse/onboarding/pricing/industrial', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const json = await res.json();
            if (json.ok && json.data) {
                setIndustrialData(json.data);
            }
        } catch (e) {
            console.error('Error loading industrial pricing:', e);
        } finally {
            setLoadingIndustrial(false);
        }
    };

    const handleSaveIndustrialPricing = async (payload: any) => {
        setSavingIndustrial(true);
        try {
            const res = await fetch('/api/printhouse/onboarding/pricing/industrial', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });
            const json = await res.json();
            if (!res.ok || !json.ok) {
                throw new Error(json.error || 'Failed to save industrial pricing');
            }
            await fetchIndustrialPricing();
            onSaved?.();
        } finally {
            setSavingIndustrial(false);
        }
    };

    useEffect(() => {
        fetchIndustrialPricing();
    }, []);

    // Fetch lists
    const fetchPriceBooks = async () => {
        setLoadingBooks(true);
        setError(null);
        try {
            const res = await fetch('/api/printhouse/onboarding/pricing/price-books', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (res.ok && data.ok) {
                setPriceBooks(data.data || []);
                // Update selectedBook reference if it's currently selected
                if (selectedBook) {
                    const updated = (data.data || []).find((b: any) => b.id === selectedBook.id);
                    if (updated) setSelectedBook(updated);
                }
            } else {
                setError(data.error || 'Failed to fetch price books');
            }
        } catch (err: any) {
            setError(err.message || 'Error fetching price books');
        } finally {
            setLoadingBooks(false);
        }
    };

    const fetchRulesForBook = async (bookId: string) => {
        setLoadingRules(true);
        try {
            const res = await fetch(`/api/printhouse/onboarding/pricing/price-books/${bookId}/rules`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (res.ok && data.ok) {
                setRules(data.data || []);
            }
        } catch (err) {
            console.error('Error fetching rules:', err);
        } finally {
            setLoadingRules(false);
        }
    };

    // Load machines and materials globally across all sites for selectors
    const loadGlobalData = async () => {
        try {
            const tempMachines: any[] = [];
            const tempMaterials: any[] = [];

            for (const site of sites) {
                // Fetch site machines
                const machRes = await fetch(`/api/printhouse/onboarding/sites/${site.siteId}/machines`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const machData = await machRes.json();
                if (machRes.ok && machData.ok) {
                    const activeMachines = (machData.machines || [])
                        .filter((m: any) => m.status !== 'ARCHIVED')
                        .map((m: any) => ({ id: m.id, name: m.name, siteId: site.siteId }));
                    tempMachines.push(...activeMachines);
                }

                // Fetch site materials
                const matRes = await fetch(`/api/printhouse/onboarding/sites/${site.siteId}/materials`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const matData = await matRes.json();
                if (matRes.ok && matData.ok) {
                    const activeMats = (matData.materials || [])
                        .map((m: any) => ({ id: m.id, name: m.material_name || m.name, siteId: site.siteId }));
                    tempMaterials.push(...activeMats);
                }
            }

            setMachines(tempMachines);
            setMaterials(tempMaterials);
        } catch (err) {
            console.error('Failed to pre-fetch selectors metadata:', err);
        }
    };

    useEffect(() => {
        fetchPriceBooks();
        loadGlobalData();
    }, [sites]);

    useEffect(() => {
        if (selectedBook) {
            fetchRulesForBook(selectedBook.id);
            // Run quick validation check
            handleValidateBook(selectedBook.id, true);
        } else {
            setRules([]);
        }
    }, [selectedBook]);

    // Price Book actions
    const handleSavePriceBook = async (bookData: any) => {
        setError(null);
        setSuccessMsg(null);
        try {
            let res;
            if (cloningBook) {
                res = await fetch(`/api/printhouse/onboarding/pricing/price-books/${cloningBook.id}/clone`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(bookData)
                });
            } else if (editingBook) {
                res = await fetch(`/api/printhouse/onboarding/pricing/price-books/${editingBook.id}`, {
                    method: 'PUT',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(bookData)
                });
            } else {
                res = await fetch('/api/printhouse/onboarding/pricing/price-books', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(bookData)
                });
            }

            const data = await res.json();
            if (res.ok && data.ok) {
                setSuccessMsg(`Price Book ${editingBook ? 'updated' : cloningBook ? 'cloned' : 'created'} successfully.`);
                setShowBookModal(false);
                setEditingBook(null);
                setCloningBook(null);
                fetchPriceBooks();
                if (onSaved) onSaved();
            } else {
                setError(data.error || 'Failed to save price book');
            }
        } catch (err: any) {
            setError(err.message || 'Network error');
        }
    };

    const handleDeleteBook = async (bookId: string) => {
        if (!confirm('Are you sure you want to archive this Price Book? This will cascade delete its pricing rules.')) return;
        setError(null);
        setSuccessMsg(null);
        try {
            const res = await fetch(`/api/printhouse/onboarding/pricing/price-books/${bookId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                setSuccessMsg('Price Book archived successfully.');
                if (selectedBook?.id === bookId) setSelectedBook(null);
                fetchPriceBooks();
                if (onSaved) onSaved();
            } else {
                const data = await res.json();
                setError(data.error || 'Failed to delete price book');
            }
        } catch (err: any) {
            setError(err.message || 'Error deleting price book');
        }
    };

    const handleValidateBook = async (bookId: string, silent = false) => {
        if (!silent) setValidatingBookId(bookId);
        try {
            const res = await fetch(`/api/printhouse/onboarding/pricing/price-books/${bookId}/validate`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (res.ok && data.ok) {
                setValidationAudits(prev => ({
                    ...prev,
                    [bookId]: data.data
                }));
                if (!silent && data.data.isValid) {
                    setSuccessMsg('Price Book validation passed successfully. No tier gaps or currency mismatches found.');
                } else if (!silent) {
                    setError('Price Book contains validation issues. Please check rule logs.');
                }
            }
        } catch (err) {
            console.error('Validation error:', err);
        } finally {
            if (!silent) setValidatingBookId(null);
        }
    };

    const handleTransitionStatus = async (bookId: string, nextStatus: string) => {
        setError(null);
        setSuccessMsg(null);
        try {
            const res = await fetch(`/api/printhouse/onboarding/pricing/price-books/${bookId}/status`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ status: nextStatus })
            });
            const data = await res.json();
            if (res.ok && data.ok) {
                setSuccessMsg(`Price Book transitioned to ${nextStatus}.`);
                fetchPriceBooks();
                if (onSaved) onSaved();
            } else {
                setError(data.error || 'Failed to transition price book status');
            }
        } catch (err: any) {
            setError(err.message || 'Error updating status');
        }
    };

    // Rules actions
    const handleSaveRule = async (ruleData: any) => {
        if (!selectedBook) return;
        try {
            let res;
            if (editingRule) {
                res = await fetch(`/api/printhouse/onboarding/pricing/price-books/${selectedBook.id}/rules/${editingRule.id}`, {
                    method: 'PUT',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(ruleData)
                });
            } else {
                res = await fetch(`/api/printhouse/onboarding/pricing/price-books/${selectedBook.id}/rules`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(ruleData)
                });
            }

            const data = await res.json();
            if (res.ok && data.ok) {
                setShowRuleModal(false);
                setEditingRule(null);
                fetchRulesForBook(selectedBook.id);
                handleValidateBook(selectedBook.id, true);
                if (onSaved) onSaved();
            } else {
                throw new Error(data.error || 'Failed to save rule');
            }
        } catch (err: any) {
            throw err; // surfaces back to PricingRuleBuilder modal
        }
    };

    const handleDeleteRule = async (ruleId: string) => {
        if (!selectedBook || !confirm('Are you sure you want to delete this pricing rule?')) return;
        setError(null);
        try {
            const res = await fetch(`/api/printhouse/onboarding/pricing/price-books/${selectedBook.id}/rules/${ruleId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                fetchRulesForBook(selectedBook.id);
                handleValidateBook(selectedBook.id, true);
                if (onSaved) onSaved();
            } else {
                const data = await res.json();
                setError(data.error || 'Failed to delete rule');
            }
        } catch (err: any) {
            setError(err.message || 'Error deleting rule');
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
            {/* Notifications */}
            {error && (
                <div style={{
                    display: 'flex', gap: '8px', padding: '12px 16px', backgroundColor: '#fef2f2',
                    border: '1px solid #fecaca', borderRadius: '8px', color: '#991b1b', fontSize: '13px', alignItems: 'center'
                }}>
                    <ShieldAlert size={16} />
                    <span>{error}</span>
                </div>
            )}
            {successMsg && (
                <div style={{
                    display: 'flex', gap: '8px', padding: '12px 16px', backgroundColor: '#ecfdf5',
                    border: '1px solid #a7f3d0', borderRadius: '8px', color: '#065f46', fontSize: '13px', alignItems: 'center'
                }}>
                    <CheckCircle size={16} />
                    <span>{successMsg}</span>
                </div>
            )}

            {/* CHOICE-FIRST WORKFLOW SELECTOR (Phase 193H) */}
            <PricingWorkflowSelector
                selectedWorkflow={selectedWorkflow}
                onSelectWorkflow={(wf) => {
                    setSelectedWorkflow(wf);
                    setIsSecondaryExpanded(false);
                }}
            />

            {/* PRIMARY & SECONDARY WORKFLOWS BASED ON SELECTION */}
            {selectedWorkflow === 'assistant' ? (
                <>
                    {/* 1. PRIMARY: Pricing Calibration Assistant */}
                    <div className="space-y-3">
                        <QuickCalibrationPanel
                            printerNodeId={industrialData?.nodeId}
                            printerNodeName={industrialData?.nodeName || 'Primary Production Node'}
                            onAccepted={() => {
                                fetchIndustrialPricing();
                                onSaved?.();
                            }}
                        />
                    </div>

                    {/* 2. SECONDARY / COLLAPSED: Manual Rate Card Configuration */}
                    <div className="bg-white dark:bg-[#18181b] rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden transition-all shadow-2xs">
                        <div
                            onClick={() => setIsSecondaryExpanded(!isSecondaryExpanded)}
                            className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4 cursor-pointer bg-zinc-50/70 dark:bg-zinc-900/60 hover:bg-zinc-100/70 dark:hover:bg-zinc-800/60 transition-colors border-b border-zinc-200/60 dark:border-zinc-800/60"
                        >
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-xl bg-zinc-200/80 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 shrink-0">
                                    <Calculator size={18} />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
                                            Manual Rate Card Configuration
                                        </h3>
                                        <span className="text-[10px] font-semibold text-zinc-500 bg-zinc-200/80 dark:bg-zinc-800 px-2 py-0.5 rounded-full">
                                            {isSecondaryExpanded ? 'Expanded' : 'Collapsed'}
                                        </span>
                                    </div>
                                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                                        Open if you prefer manual configuration instead of the assistant.
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-center gap-3 self-end sm:self-auto">
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setIsSecondaryExpanded(!isSecondaryExpanded);
                                    }}
                                    className="px-3 py-1.5 bg-white dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                                >
                                    <span>{isSecondaryExpanded ? 'Close Manual Setup' : 'Open Manual Setup'}</span>
                                    {isSecondaryExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                </button>
                            </div>
                        </div>

                        {isSecondaryExpanded && (
                            <div className="p-5 border-t border-zinc-200/60 dark:border-zinc-800/60 animate-in fade-in duration-200">
                                <CanonicalIndustrialPricingEditor
                                    mode="ONBOARDING"
                                    initialNodeData={industrialData ? {
                                        id: industrialData.nodeId,
                                        name: '',
                                        signatures: industrialData.signatures,
                                        delivery_time: industrialData.deliveryTime,
                                        production_lead_days: industrialData.productionLeadDays,
                                        limits: industrialData.limits,
                                        rates: industrialData.rates
                                    } : undefined}
                                    onSave={handleSaveIndustrialPricing}
                                    saving={savingIndustrial}
                                />
                            </div>
                        )}
                    </div>
                </>
            ) : (
                <>
                    {/* 1. PRIMARY: Manual Rate Card Configuration */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between px-1">
                            <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                                Industrial Manufacturing Cost & Rate Cards
                            </span>
                        </div>
                        <CanonicalIndustrialPricingEditor
                            mode="ONBOARDING"
                            initialNodeData={industrialData ? {
                                id: industrialData.nodeId,
                                name: '',
                                signatures: industrialData.signatures,
                                delivery_time: industrialData.deliveryTime,
                                production_lead_days: industrialData.productionLeadDays,
                                limits: industrialData.limits,
                                rates: industrialData.rates
                            } : undefined}
                            onSave={handleSaveIndustrialPricing}
                            saving={savingIndustrial}
                        />
                    </div>

                    {/* 2. SECONDARY / COLLAPSED: Assistant-Guided Pricing */}
                    <div className="bg-white dark:bg-[#18181b] rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden transition-all shadow-2xs">
                        <div
                            onClick={() => setIsSecondaryExpanded(!isSecondaryExpanded)}
                            className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4 cursor-pointer bg-zinc-50/70 dark:bg-zinc-900/60 hover:bg-zinc-100/70 dark:hover:bg-zinc-800/60 transition-colors border-b border-zinc-200/60 dark:border-zinc-800/60"
                        >
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-xl bg-red-100 dark:bg-red-950/60 text-[#dc0000] dark:text-red-400 shrink-0">
                                    <Sparkles size={18} />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
                                            Assistant-Guided Pricing
                                        </h3>
                                        <span className="text-[10px] font-semibold text-zinc-500 bg-zinc-200/80 dark:bg-zinc-800 px-2 py-0.5 rounded-full">
                                            {isSecondaryExpanded ? 'Expanded' : 'Collapsed'}
                                        </span>
                                    </div>
                                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                                        Use a real completed job to calibrate your pricing with the assistant.
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-center gap-3 self-end sm:self-auto">
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setIsSecondaryExpanded(!isSecondaryExpanded);
                                    }}
                                    className="px-3 py-1.5 bg-white dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                                >
                                    <span>{isSecondaryExpanded ? 'Close Assistant' : 'Open Assistant'}</span>
                                    {isSecondaryExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                </button>
                            </div>
                        </div>

                        {isSecondaryExpanded && (
                            <div className="p-5 border-t border-zinc-200/60 dark:border-zinc-800/60 animate-in fade-in duration-200">
                                <QuickCalibrationPanel
                                    printerNodeId={industrialData?.nodeId}
                                    printerNodeName={industrialData?.nodeName || 'Primary Production Node'}
                                    onAccepted={() => {
                                        fetchIndustrialPricing();
                                        onSaved?.();
                                    }}
                                />
                            </div>
                        )}
                    </div>
                </>
            )}

            {/* DOWNSTREAM / OPTIONAL: COMMERCIAL PRICING POLICIES & CATALOGS */}
            <div className="bg-white dark:bg-[#18181b] rounded-xl border border-zinc-200 dark:border-[#27272a] overflow-hidden transition-colors">
                <div 
                    onClick={() => setShowCommercialPolicy(!showCommercialPolicy)}
                    className="flex justify-between items-center px-6 py-4 cursor-pointer bg-zinc-50 dark:bg-zinc-900/60 border-b border-zinc-200 dark:border-[#27272a] transition-colors"
                >
                    <div className="flex items-center gap-2.5">
                        <Tag size={18} className="text-zinc-500 dark:text-zinc-400" />
                        <div>
                            <h3 className="m-0 text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                                Commercial Pricing Policies & Markups
                                <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400 bg-zinc-200 dark:bg-zinc-800 px-2 py-0.5 rounded">
                                    Downstream / Optional
                                </span>
                            </h3>
                            <p className="m-0 mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                                Configure commercial quantity tiers, surcharge markups, and customer-specific price books applied on top of industrial costs.
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3 text-zinc-500 dark:text-zinc-400">
                        {showCommercialPolicy ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </div>
                </div>

                {showCommercialPolicy && (
                    <div>
                        <div className="flex justify-end px-6 py-3 border-b border-zinc-200 dark:border-zinc-800">
                            <button
                                onClick={() => {
                                    setCloningBook(null);
                                    setEditingBook(null);
                                    setShowBookModal(true);
                                }}
                                className="bg-[#dc0000] hover:bg-red-700 text-white font-semibold px-3.5 py-1.5 rounded-lg text-xs transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
                            >
                                <Plus size={14} /> Create Catalog
                            </button>
                        </div>
                        {/* Price Books Table */}
                        {loadingBooks ? (
                    <div className="p-10 text-center text-xs text-zinc-500">Loading price catalogs...</div>
                ) : priceBooks.length === 0 ? (
                    <div className="p-10 text-center text-zinc-500 dark:text-zinc-400 text-xs">
                        No price books configured. Create your first catalog draft to get started.
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse text-xs text-left">
                            <thead>
                                <tr className="border-b border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-900/40 font-semibold">
                                    <th className="px-6 py-3.5">Name</th>
                                    <th className="px-5 py-3.5">Currency</th>
                                    <th className="px-5 py-3.5">Status</th>
                                    <th className="px-5 py-3.5">Validation Status</th>
                                    <th className="px-5 py-3.5">Validity Boundaries</th>
                                    <th className="px-6 py-3.5 w-72 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {priceBooks.map((pb) => {
                                    const isSelected = selectedBook?.id === pb.id;
                                    const audit = validationAudits[pb.id];
                                    const hasDraftStatus = pb.status === 'DRAFT' || pb.status === 'VALIDATING' || pb.status === 'READY_FOR_REVIEW';
                                    
                                    return (
                                        <tr
                                            key={pb.id}
                                            className={`border-b border-zinc-200 dark:border-zinc-800 cursor-pointer transition-colors ${
                                                isSelected ? 'bg-red-50/40 dark:bg-red-950/20' : 'hover:bg-zinc-50 dark:hover:bg-zinc-900/40'
                                            }`}
                                            onClick={() => setSelectedBook(pb)}
                                        >
                                            <td className="px-6 py-3.5 font-bold text-zinc-900 dark:text-white">
                                                {pb.name} <span className="text-[11px] text-zinc-500 font-normal">(v{pb.version})</span>
                                            </td>
                                            <td className="px-5 py-3.5 text-zinc-800 dark:text-zinc-200">{pb.currency}</td>
                                            <td className="px-5 py-3.5">
                                                <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                                                    pb.status === 'PUBLISHED' 
                                                        ? 'bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300' 
                                                        : pb.status === 'APPROVED' 
                                                        ? 'bg-sky-50 dark:bg-sky-950/60 border border-sky-200 dark:border-sky-800 text-sky-700 dark:text-sky-300' 
                                                        : 'bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300'
                                                }`}>
                                                    {pb.status}
                                                </span>
                                            </td>
                                            <td className="px-5 py-3.5" onClick={(e) => e.stopPropagation()}>
                                                {validatingBookId === pb.id ? (
                                                    <span className="text-zinc-500 text-xs">Auditing...</span>
                                                ) : audit ? (
                                                    <span className={`flex items-center gap-1 text-xs font-semibold ${audit.isValid ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                                                        {audit.isValid ? <ShieldCheck size={14} /> : <BadgeAlert size={14} />}
                                                        {audit.isValid ? 'Clean Audit' : `${audit.errors.length} Issues`}
                                                    </span>
                                                ) : (
                                                    <button
                                                        onClick={() => handleValidateBook(pb.id)}
                                                        className="bg-transparent border-0 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 underline cursor-pointer p-0 text-xs"
                                                    >
                                                        Run Audit Check
                                                    </button>
                                                )}
                                            </td>
                                            <td className="px-5 py-3.5 text-zinc-500 dark:text-zinc-400 text-xs">
                                                {pb.effective_from ? new Date(pb.effective_from).toLocaleDateString() : 'Immediate'} 
                                                {' → '} 
                                                {pb.effective_to ? new Date(pb.effective_to).toLocaleDateString() : 'Forever'}
                                            </td>
                                            <td className="px-6 py-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                                                <div className="flex gap-2 justify-end">
                                                    {hasDraftStatus && (
                                                        <button
                                                            title="Edit metadata"
                                                            onClick={() => {
                                                                setCloningBook(null);
                                                                setEditingBook(pb);
                                                                setShowBookModal(true);
                                                            }}
                                                            className="text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 p-1 cursor-pointer"
                                                        >
                                                            <Edit size={16} />
                                                        </button>
                                                    )}
                                                    <button
                                                        title="Clone Version"
                                                        onClick={() => {
                                                            setEditingBook(null);
                                                            setCloningBook(pb);
                                                            setShowBookModal(true);
                                                        }}
                                                        className="text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 p-1 cursor-pointer"
                                                    >
                                                        <Copy size={16} />
                                                    </button>
                                                    {hasDraftStatus && (
                                                        <>
                                                            <button
                                                                onClick={() => handleTransitionStatus(pb.id, 'APPROVED')}
                                                                className="bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 border border-zinc-300 dark:border-zinc-700 px-2.5 py-1 rounded text-[11px] font-semibold cursor-pointer transition-colors"
                                                            >
                                                                Approve
                                                            </button>
                                                            <button
                                                                title="Delete draft"
                                                                onClick={() => handleDeleteBook(pb.id)}
                                                                className="text-red-500 hover:text-red-700 p-1 cursor-pointer"
                                                            >
                                                                <Trash2 size={16} />
                                                            </button>
                                                        </>
                                                    )}
                                                    {pb.status === 'APPROVED' && (
                                                        <button
                                                            onClick={() => handleTransitionStatus(pb.id, 'PUBLISHED')}
                                                            className="bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1 rounded text-[11px] font-semibold cursor-pointer transition-colors"
                                                        >
                                                            Publish
                                                        </button>
                                                    )}
                                                    {pb.status === 'PUBLISHED' && (
                                                        <button
                                                            onClick={() => handleTransitionStatus(pb.id, 'RETIRED')}
                                                            className="bg-red-600 hover:bg-red-700 text-white px-2.5 py-1 rounded text-[11px] font-semibold cursor-pointer transition-colors"
                                                        >
                                                            Retire
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* SECTION 2: BOOK RULES & SIMULATOR (VISIBLE ONLY IF SELECTED & EXPANDED) */}
                {selectedBook && (
                    <div className="p-6 pt-4 flex flex-col gap-5 border-t border-zinc-200 dark:border-zinc-800">
                        {/* Sub Tab selection bar */}
                        <div className="flex gap-4 border-b border-zinc-200 dark:border-zinc-800 pb-3 pt-2">
                            <button
                                onClick={() => setSubTab('RULES')}
                                className={`bg-transparent border-0 pb-2 text-xs font-bold cursor-pointer transition-colors ${
                                    subTab === 'RULES' ? 'text-[#dc0000] border-b-2 border-[#dc0000]' : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'
                                }`}
                            >
                                Pricing Rules Grid
                            </button>
                            <button
                                onClick={() => setSubTab('SIMULATOR')}
                                className={`bg-transparent border-0 pb-2 text-xs font-bold cursor-pointer flex items-center gap-1.5 transition-colors ${
                                    subTab === 'SIMULATOR' ? 'text-[#dc0000] border-b-2 border-[#dc0000]' : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'
                                }`}
                            >
                                <Calculator size={14} /> Pricing Sandbox
                            </button>
                        </div>

                        {/* Validation issues warning block */}
                        {validationAudits[selectedBook.id] && !validationAudits[selectedBook.id].isValid && (
                            <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-xl p-4 text-xs">
                                <h5 className="m-0 mb-2 text-red-700 dark:text-red-300 font-bold flex items-center gap-1.5">
                                    <ShieldAlert size={16} /> Validation Flags for {selectedBook.name}
                                </h5>
                                <ul className="m-0 pl-5 text-zinc-600 dark:text-zinc-400 space-y-1">
                                    {validationAudits[selectedBook.id].errors.map((err: any, idx: number) => (
                                        <li key={idx} className="text-red-600 dark:text-red-400 font-medium">{err.message}</li>
                                    ))}
                                    {validationAudits[selectedBook.id].advisories.map((adv: any, idx: number) => (
                                        <li key={idx}>{adv.message} (Advisory)</li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {subTab === 'RULES' && (
                            <div className="bg-zinc-50 dark:bg-zinc-900/60 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden transition-colors">
                                <div className="flex justify-between items-center p-4 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/40">
                                    <div>
                                        <h4 className="m-0 text-xs font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                                            <Layers size={16} className="text-[#dc0000]" />
                                            Pricing Rules for: {selectedBook.name}
                                        </h4>
                                        <span className="text-[11px] text-zinc-500">ID: {selectedBook.id}</span>
                                    </div>
                                    {selectedBook.status === 'DRAFT' && (
                                        <button
                                            onClick={() => {
                                                setEditingRule(null);
                                                setShowRuleModal(true);
                                            }}
                                            className="bg-[#dc0000] hover:bg-red-700 text-white font-semibold px-3 py-1.5 rounded-lg text-xs transition-colors flex items-center gap-1 cursor-pointer"
                                        >
                                            <Plus size={14} /> Add Rule
                                        </button>
                                    )}
                                </div>

                                {loadingRules ? (
                                    <div className="p-8 text-center text-xs text-zinc-500">Loading pricing rules...</div>
                                ) : rules.length === 0 ? (
                                    <div className="p-8 text-center text-xs text-zinc-500 font-semibold">
                                        No rules defined in this book.
                                    </div>
                                ) : (
                                    <div className="overflow-x-auto">
                                        <table className="w-full border-collapse text-xs text-left">
                                            <thead>
                                                <tr className="border-b border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800/50 font-semibold">
                                                    <th className="px-5 py-3">Scope</th>
                                                    <th className="px-4 py-3">Site / Machine / Material</th>
                                                    <th className="px-4 py-3">Pricing Unit</th>
                                                    <th className="px-4 py-3">Base Price</th>
                                                    <th className="px-4 py-3">Setup Charge</th>
                                                    <th className="px-4 py-3">Min Job Floor</th>
                                                    <th className="px-4 py-3">Quantity Tiers</th>
                                                    {selectedBook.status === 'DRAFT' && <th className="px-5 py-3 w-28 text-right">Actions</th>}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {rules.map((rule) => {
                                                    const siteName = sites.find(s => s.siteId === rule.site_id)?.siteName || rule.site_id;
                                                    const machineName = machines.find(m => m.id === rule.machine_id)?.name || rule.machine_id;
                                                    const materialName = materials.find(m => m.id === rule.material_catalog_id)?.name || rule.material_catalog_id;

                                                    let targetDetails = 'Global Default';
                                                    if (rule.scope === 'SITE_OVERRIDE') targetDetails = `Site: ${siteName}`;
                                                    if (rule.scope === 'MACHINE_OVERRIDE') targetDetails = `Site: ${siteName} → Machine: ${machineName}`;
                                                    if (rule.scope === 'MATERIAL_RULE') targetDetails = `Site: ${siteName} → Material: ${materialName}`;
                                                    if (rule.scope === 'FINISHING_RULE') targetDetails = `Capability: ${rule.capability_name}`;
                                                    if (rule.scope === 'SURCHARGE') targetDetails = 'General Surcharge';

                                                    return (
                                                        <tr key={rule.id} className="border-b border-zinc-200 dark:border-zinc-800 transition-colors hover:bg-white/50 dark:hover:bg-zinc-800/30">
                                                            <td className="px-5 py-3 font-bold text-zinc-900 dark:text-white">
                                                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                                                    rule.scope === 'TENANT_DEFAULT' 
                                                                        ? 'bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 text-[#dc0000]' 
                                                                        : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300'
                                                                }`}>
                                                                    {rule.scope}
                                                                </span>
                                                            </td>
                                                            <td className="px-4 py-3 text-zinc-800 dark:text-zinc-200">{targetDetails}</td>
                                                            <td className="px-4 py-3 text-zinc-500 dark:text-zinc-400">{rule.pricing_unit}</td>
                                                            <td className="px-4 py-3 text-zinc-900 dark:text-white font-bold">{Number(rule.base_price).toFixed(4)} {selectedBook.currency}</td>
                                                            <td className="px-4 py-3 text-zinc-800 dark:text-zinc-200">{Number(rule.setup_charge).toFixed(2)} {selectedBook.currency}</td>
                                                            <td className="px-4 py-3 text-zinc-800 dark:text-zinc-200">{Number(rule.minimum_order_value).toFixed(2)} {selectedBook.currency}</td>
                                                            <td className="px-4 py-3">
                                                                {rule.tiers && rule.tiers.length > 0 ? (
                                                                    <span className="bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded text-[11px] font-bold">
                                                                        {rule.tiers.length} Tiers Defined
                                                                    </span>
                                                                ) : (
                                                                    <span className="text-zinc-500">No tiers</span>
                                                                )}
                                                            </td>
                                                            {selectedBook.status === 'DRAFT' && (
                                                                <td className="px-5 py-3 text-right">
                                                                    <div className="flex gap-2 justify-end">
                                                                        <button
                                                                            onClick={() => {
                                                                                setEditingRule(rule);
                                                                                setShowRuleModal(true);
                                                                            }}
                                                                            className="text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 p-1 cursor-pointer"
                                                                        >
                                                                            <Edit size={14} />
                                                                        </button>
                                                                        <button
                                                                            onClick={() => handleDeleteRule(rule.id)}
                                                                            className="text-red-500 hover:text-red-700 p-1 cursor-pointer"
                                                                        >
                                                                            <Trash2 size={14} />
                                                                        </button>
                                                                    </div>
                                                                </td>
                                                            )}
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        )}

                        {subTab === 'SIMULATOR' && (
                            <PricingPreview
                                priceBookId={selectedBook.id}
                                sites={sites}
                                machines={machines}
                                materials={materials}
                                currency={selectedBook.currency}
                            />
                        )}
                    </div>
                )}
                    </div>
                )}
            </div>

            {/* MODAL 1: PRICE BOOK METADATA */}
            {showBookModal && (
                <PriceBookForm
                    onClose={() => {
                        setShowBookModal(false);
                        setEditingBook(null);
                        setCloningBook(null);
                    }}
                    onSave={handleSavePriceBook}
                    initialData={editingBook || cloningBook}
                    isClone={!!cloningBook}
                />
            )}

            {/* MODAL 2: PRICING RULE BUILDER */}
            {showRuleModal && selectedBook && (
                <PricingRuleBuilder
                    onClose={() => {
                        setShowRuleModal(false);
                        setEditingRule(null);
                    }}
                    onSave={handleSaveRule}
                    initialData={editingRule}
                    sites={sites}
                    machines={machines}
                    materials={materials}
                    currency={selectedBook.currency}
                />
            )}
        </div>
    );
};
