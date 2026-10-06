/**
 * src/ui/components/printhouse/setup/PricingPanel.tsx
 * 
 * Phase 192 RC20B — Printhouse Pricing Setup Panel
 * 
 * Primary Experience: Canonical Industrial Manufacturing Pricing (rates_json)
 * Downstream Experience: Commercial Price Books, Rules, and Simulations.
 */
import React, { useState, useEffect, useMemo } from 'react';
import { getAuthToken } from '../../../lib/authStore';
import { CanonicalIndustrialPricingEditor } from '../pricing/CanonicalIndustrialPricingEditor';
import { PriceBookForm } from './PriceBookForm';
import { PricingRuleBuilder } from './PricingRuleBuilder';
import { PricingPreview } from './PricingPreview';
import { QuickCalibrationPanel } from '../pricing/quick-calibration/QuickCalibrationPanel';
import { PricingWorkflowSelector, PricingWorkflow } from '../pricing/PricingWorkflowSelector';
import { SimplifiedOnboardingJourney } from '../onboarding/SimplifiedOnboardingJourney';
import { SetupDrawer } from './SetupDrawer';
import { Tag, Plus, Edit, Copy, Trash2, ShieldAlert, BadgeAlert, CheckCircle, Calculator, Info, ShieldCheck, HelpCircle, Layers, ChevronDown, ChevronUp, Sparkles, Sliders, ArrowLeft } from 'lucide-react';
import { useLocale } from '../../../i18n';
import { ProductFamilyId, FamilyState, FamilyStatus } from '../../../types/printhouseOnboardingTypes';
import { BindingIcon } from '../onboarding/BindingFamilyIcons';

interface PricingPanelProps {
    sites: { siteId: string; siteName: string }[];
    onSaved?: () => void;
}

type PricingSubTab = 'RULES' | 'SIMULATOR';

export const PricingPanel: React.FC<PricingPanelProps> = ({ sites = [], onSaved }) => {
    const { t } = useLocale();
    // ── Workflow Selection State (Choice-First Intuitive Onboarding UX) ──
    const [selectedWorkflow, setSelectedWorkflow] = useState<PricingWorkflow>('onboarding');
    const [isSecondaryExpanded, setIsSecondaryExpanded] = useState<boolean>(false);

    // ── Industrial Pricing State ──
    const [industrialData, setIndustrialData] = useState<any | null>(null);
    const [loadingIndustrial, setLoadingIndustrial] = useState(true);
    const [savingIndustrial, setSavingIndustrial] = useState(false);

    const initialNodeDataMemo = useMemo(() => {
        if (!industrialData) return undefined;
        return {
            id: industrialData.nodeId,
            name: industrialData.nodeName || '',
            signatures: industrialData.signatures,
            delivery_time: industrialData.deliveryTime,
            production_lead_days: industrialData.productionLeadDays,
            limits: industrialData.limits,
            rates: industrialData.rates,
            baselineChecksum: industrialData.baselineChecksum
        };
    }, [industrialData]);

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

    const parseResponseJson = async (res: Response): Promise<{ ok: boolean; status: number; data?: any; error?: string }> => {
        try {
            const contentType = res.headers?.get?.('content-type') || '';
            if (contentType && !contentType.includes('application/json') && !contentType.includes('text/json')) {
                const text = await res.text().catch(() => '');
                return {
                    ok: false,
                    status: res.status,
                    error: res.status === 401 
                        ? 'Sesión no autorizada o expirada (HTTP 401)'
                        : res.status === 404
                            ? 'Servicio no disponible o ruta no encontrada (HTTP 404)'
                            : text.slice(0, 150) || `Error de servidor HTTP ${res.status}`
                };
            }
            const json = await res.json();
            return {
                ok: res.ok && json.ok !== false,
                status: res.status,
                data: json.data !== undefined ? json.data : json,
                error: typeof json.error === 'object' ? (json.error?.message || json.error?.code) : (json.error || json.message || (!res.ok ? `Error HTTP ${res.status}` : undefined))
            };
        } catch {
            return {
                ok: false,
                status: res.status,
                error: `Respuesta de servidor no válida o vacía (HTTP ${res.status})`
            };
        }
    };

    const fetchIndustrialPricing = async () => {
        setLoadingIndustrial(true);
        try {
            const res = await fetch('/api/printhouse/onboarding/pricing/industrial', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const parsed = await parseResponseJson(res);
            if (parsed.ok && parsed.data) {
                setIndustrialData(parsed.data);
            }
        } catch (e) {
            console.debug('Industrial pricing endpoint unavailable in dev offline:', e);
        } finally {
            setLoadingIndustrial(false);
        }
    };

    const handleSaveIndustrialPricing = async (payload: any) => {
        if (!industrialData?.nodeId) {
            const err: any = new Error('No node loaded to save pricing for');
            err.code = 'INVALID_NODE_ID';
            err.status = 400;
            throw err;
        }
        setSavingIndustrial(true);
        try {
            const fullPayload = {
                ...payload,
                nodeId: industrialData.nodeId
            };
            const res = await fetch('/api/printhouse/onboarding/pricing/industrial', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(fullPayload)
            });
            const parsed = await parseResponseJson(res);
            if (!parsed.ok) {
                const errMsg = parsed.error || 'Failed to save industrial pricing';
                const err: any = new Error(errMsg);
                err.code = res.status === 409 ? 'STALE_BASELINE_CONFLICT' : 'SAVE_ERROR';
                err.status = res.status;
                err.data = parsed.data;
                throw err;
            }
            if (parsed.data?.baselineChecksum) {
                setIndustrialData((prev: any) => prev ? {
                    ...prev,
                    nodeId: parsed.data.nodeId || prev.nodeId,
                    baselineChecksum: parsed.data.baselineChecksum,
                    signatures: payload.signatures !== undefined ? payload.signatures : prev.signatures,
                    deliveryTime: payload.delivery_time !== undefined ? payload.delivery_time : prev.deliveryTime,
                    productionLeadDays: payload.production_lead_days !== undefined ? payload.production_lead_days : prev.productionLeadDays,
                    limits: payload.limits !== undefined ? payload.limits : prev.limits,
                    rates: payload.rates !== undefined ? payload.rates : prev.rates
                } : prev);
            } else {
                await fetchIndustrialPricing();
            }
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
            const parsed = await parseResponseJson(res);
            if (parsed.ok && parsed.data) {
                setPriceBooks(Array.isArray(parsed.data) ? parsed.data : []);
                if (selectedBook && Array.isArray(parsed.data)) {
                    const updated = parsed.data.find((b: any) => b.id === selectedBook.id);
                    if (updated) setSelectedBook(updated);
                }
            } else {
                const isDevLocal = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
                if (!isDevLocal) {
                    setError(parsed.error || 'Failed to fetch price books');
                }
            }
        } catch (err: any) {
            const isDevLocal = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
            if (!isDevLocal) {
                setError(err.message || 'Error fetching price books');
            } else {
                console.debug('Price books endpoint unavailable in dev offline:', err.message);
            }
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
            const parsed = await parseResponseJson(res);
            if (parsed.ok && parsed.data) {
                setRules(Array.isArray(parsed.data) ? parsed.data : []);
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
                const parsedMach = await parseResponseJson(machRes);
                if (parsedMach.ok && parsedMach.data) {
                    const rawList = Array.isArray(parsedMach.data) ? parsedMach.data : (parsedMach.data.machines || []);
                    const activeMachines = rawList
                        .filter((m: any) => m.status !== 'ARCHIVED')
                        .map((m: any) => ({ id: m.id, name: m.name, siteId: site.siteId }));
                    tempMachines.push(...activeMachines);
                }

                // Fetch site materials
                const matRes = await fetch(`/api/printhouse/onboarding/sites/${site.siteId}/materials`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const parsedMat = await parseResponseJson(matRes);
                if (parsedMat.ok && parsedMat.data) {
                    const rawList = Array.isArray(parsedMat.data) ? parsedMat.data : (parsedMat.data.materials || []);
                    const activeMats = rawList
                        .map((m: any) => ({ id: m.id, name: m.material_name || m.name, siteId: site.siteId }));
                    tempMaterials.push(...activeMats);
                }
            }

            setMachines(tempMachines);
            setMaterials(tempMaterials);
        } catch (err) {
            console.error('Failed to load global fleet or material data:', err);
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

    const [familiesSummary, setFamiliesSummary] = useState<Record<ProductFamilyId, FamilyState>>({
        HARDCOVER: { id: 'HARDCOVER', status: 'PENDING', quoteCount: 0 },
        SOFTCOVER: { id: 'SOFTCOVER', status: 'PENDING', quoteCount: 0 },
        WIRE_O: { id: 'WIRE_O', status: 'PENDING', quoteCount: 0 },
        SADDLE_STITCH: { id: 'SADDLE_STITCH', status: 'PENDING', quoteCount: 0 }
    });
    const [activeFamilyId, setActiveFamilyId] = useState<ProductFamilyId>('HARDCOVER');

    const handleFamiliesChange = React.useCallback((fams: Record<ProductFamilyId, FamilyState>, selectedId: ProductFamilyId) => {
        setFamiliesSummary(fams);
        setActiveFamilyId(selectedId);
    }, []);

    const getFamilyLabel = (fid: ProductFamilyId) => {
        switch (fid) {
            case 'HARDCOVER': return t('family.hardcover.title') || 'Tapa dura';
            case 'SOFTCOVER': return t('family.softcover.title') || 'Rústica';
            case 'WIRE_O': return t('family.wireO.title') || 'Wire-O';
            case 'SADDLE_STITCH': return t('family.saddleStitch.title') || 'Grapado';
        }
    };

    const renderFamilyStatusBadge = (status: FamilyStatus) => {
        switch (status) {
            case 'DATA_VALIDATED':
                return (
                    <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                        {t('pricing.families.status.validated') || 'Calibración aceptada'}
                    </span>
                );
            case 'QUOTE_ADDED':
                return (
                    <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800">
                        {t('pricing.families.status.quoteAdded') || 'Presupuesto añadido'}
                    </span>
                );
            case 'REQUIRES_REVIEW':
                return (
                    <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                        {t('pricing.families.status.requiresReview') || 'En revisión'}
                    </span>
                );
            case 'NOT_OFFERED':
                return (
                    <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700">
                        {t('pricing.families.status.notOffered') || 'No ofrecido'}
                    </span>
                );
            default:
                return (
                    <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700">
                        {t('pricing.families.status.pending') || 'Pendiente'}
                    </span>
                );
        }
    };

    return (
        <div className="space-y-2.5">
            {/* Notifications */}
            {error && (
                <div style={{
                    display: 'flex', gap: '8px', padding: '10px 14px', backgroundColor: '#fef2f2',
                    border: '1px solid #fecaca', borderRadius: '8px', color: '#991b1b', fontSize: '12px', alignItems: 'center'
                }}>
                    <ShieldAlert size={16} />
                    <span>{error}</span>
                </div>
            )}
            {successMsg && (
                <div style={{
                    display: 'flex', gap: '8px', padding: '10px 14px', backgroundColor: '#ecfdf5',
                    border: '1px solid #a7f3d0', borderRadius: '8px', color: '#065f46', fontSize: '12px', alignItems: 'center'
                }}>
                    <CheckCircle size={16} />
                    <span>{successMsg}</span>
                </div>
            )}

            {/* COMPACT SETUP & WORKFLOW TOOLBAR */}
            <div className="bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-1.5 shadow-2xs flex flex-wrap items-center justify-between gap-2.5">
                <div className="flex items-center gap-2.5 min-w-0 flex-wrap">
                    <div className="flex items-center gap-2 shrink-0">
                        <Tag className="text-[#dc0000] w-3.5 h-3.5" />
                        <h2 className="text-xs sm:text-sm font-bold text-zinc-900 dark:text-white m-0">
                            {t('pricing.workflow.chooseWorkflow') || 'Choose Your Pricing Workflow'}
                        </h2>
                    </div>
                    {industrialData?.nodeId && (
                        <span className="inline-flex items-center gap-1.5 text-[11px] text-zinc-500 font-medium px-2 py-0.5 bg-zinc-50 dark:bg-zinc-800/60 rounded-md border border-zinc-200/60 dark:border-zinc-700/60 shrink-0">
                            <span>{t('pricing.mode.node')}</span>
                            <strong className="text-zinc-700 dark:text-zinc-300 font-semibold">{industrialData.nodeName || industrialData.nodeId}</strong>
                        </span>
                    )}

                    {/* Mode Segment Switcher: 3 explicit tabs */}
                    <div
                        id="pricing-mode-toggle"
                        className="flex items-center p-0.5 bg-zinc-100 dark:bg-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-700 shrink-0"
                        role="group"
                        aria-label={t('pricing.workflow.group') || 'Pricing mode selector'}
                    >
                        <button
                            id="pricing-mode-onboarding-btn"
                            type="button"
                            aria-label={t('pricing.nav.productsAndQuotes') || 'Productos y presupuestos'}
                            title={t('pricing.nav.productsAndQuotes') || 'Productos y presupuestos'}
                            aria-pressed={selectedWorkflow === 'onboarding'}
                            onClick={() => {
                                setSelectedWorkflow('onboarding');
                                setIsSecondaryExpanded(false);
                            }}
                            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                                selectedWorkflow === 'onboarding'
                                    ? 'bg-white dark:bg-zinc-900 text-[#dc0000] dark:text-red-400 shadow-2xs border border-zinc-200/80 dark:border-zinc-700'
                                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                            }`}
                        >
                            <Layers size={13} className={selectedWorkflow === 'onboarding' ? 'text-[#dc0000]' : 'text-zinc-400'} />
                            <span>{t('pricing.nav.productsAndQuotes') || 'Productos y presupuestos'}</span>
                        </button>

                        <button
                            id="pricing-mode-assistant-btn"
                            type="button"
                            aria-label={t('pricing.mode.assistant')}
                            title={t('pricing.mode.assistant')}
                            aria-pressed={selectedWorkflow === 'assistant'}
                            onClick={() => {
                                setSelectedWorkflow('assistant');
                                setIsSecondaryExpanded(false);
                            }}
                            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                                selectedWorkflow === 'assistant'
                                    ? 'bg-white dark:bg-zinc-900 text-[#dc0000] dark:text-red-400 shadow-2xs border border-zinc-200/80 dark:border-zinc-700'
                                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                            }`}
                        >
                            <Sparkles size={13} className={selectedWorkflow === 'assistant' ? 'text-[#dc0000]' : 'text-zinc-400'} />
                            <span>{t('pricing.mode.assistant')}</span>
                        </button>

                        <button
                            id="pricing-mode-manual-btn"
                            type="button"
                            aria-label={t('pricing.mode.manual')}
                            title={t('pricing.mode.manual')}
                            aria-pressed={selectedWorkflow === 'manual'}
                            onClick={() => {
                                setSelectedWorkflow('manual');
                                setIsSecondaryExpanded(false);
                            }}
                            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                                selectedWorkflow === 'manual'
                                    ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-2xs border border-zinc-200/80 dark:border-zinc-700'
                                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                            }`}
                        >
                            <Calculator size={13} className={selectedWorkflow === 'manual' ? 'text-zinc-900 dark:text-white' : 'text-zinc-400'} />
                            <span>{t('pricing.mode.manual')}</span>
                        </button>
                    </div>
                </div>

                {/* Right: Commercial Price Books */}
                <div className="flex items-center gap-2 shrink-0">
                    <button
                        type="button"
                        onClick={() => setShowCommercialPolicy(!showCommercialPolicy)}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors flex items-center gap-1.5 cursor-pointer ${
                            showCommercialPolicy
                                ? 'bg-zinc-100 dark:bg-zinc-800 border-zinc-300 dark:border-zinc-600 text-zinc-900 dark:text-white'
                                : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300'
                        }`}
                        title={t('pricing.workflow.priceBooksBtn') || 'Commercial quantity tiers and client price books'}
                        aria-label={t('pricing.workflow.priceBooksBtn') || 'Commercial quantity tiers and client price books'}
                    >
                        <Tag size={13} className="text-zinc-500" />
                        <span>{t('pricing.mode.priceBooks')}</span>
                    </button>
                </div>
            </div>

            {/* Contextual 4-Family Ribbon (Shown inside Assistant and Manual views) */}
            {selectedWorkflow !== 'onboarding' && (
                <div data-testid="pricing-family-ribbon" className="bg-zinc-50 dark:bg-[#18181b] border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shadow-2xs">
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                        <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider shrink-0">
                            {t('pricing.families.coverage') || 'Familias de producto:'}
                        </span>
                        {(['HARDCOVER', 'SOFTCOVER', 'WIRE_O', 'SADDLE_STITCH'] as ProductFamilyId[]).map(fid => {
                            const fam = familiesSummary[fid] || { status: 'PENDING' };
                            return (
                                <button
                                    key={fid}
                                    type="button"
                                    onClick={() => {
                                        setActiveFamilyId(fid);
                                        setSelectedWorkflow('onboarding');
                                    }}
                                    className="px-2 py-1 rounded-md text-[11px] font-semibold border flex items-center gap-1.5 transition-colors cursor-pointer bg-white dark:bg-zinc-800/80 hover:border-zinc-400 dark:hover:border-zinc-600 text-zinc-800 dark:text-zinc-200 border-zinc-200 dark:border-zinc-700"
                                    title={t('pricing.families.clickToConfigure') || 'Configurar familia'}
                                >
                                    <BindingIcon family={fid} className="w-3.5 h-3.5 text-[#dc0000]" />
                                    <span>{getFamilyLabel(fid)}</span>
                                    {renderFamilyStatusBadge(fam.status)}
                                </button>
                            );
                        })}
                    </div>

                    <div className="flex items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400 shrink-0">
                        <span>
                            {selectedWorkflow === 'assistant' 
                                ? (t('pricing.assistant.scopeNotice') || 'El Asistente calibra tarifas del nodo a partir de presupuestos')
                                : (t('pricing.manual.scopeNotice') || 'Tarifas de fabricación globales para todo el nodo')}
                        </span>
                        <button
                            type="button"
                            onClick={() => setSelectedWorkflow('onboarding')}
                            className="text-[#dc0000] hover:underline font-bold whitespace-nowrap ml-1 cursor-pointer"
                        >
                            {t('pricing.families.returnToProducts') || '← Volver a productos y presupuestos'}
                        </button>
                    </div>
                </div>
            )}

            {/* PRIMARY & SECONDARY WORKFLOWS BASED ON SELECTION */}
            {/* 0. Simplified 4-Family Onboarding Journey Container */}
            <div
                id="pricing-workflow-onboarding"
                className={`space-y-2.5 ${selectedWorkflow === 'onboarding' ? 'block' : 'hidden'}`}
            >
                <SimplifiedOnboardingJourney
                    printerNodeId={industrialData?.nodeId}
                    printerNodeName={industrialData?.nodeName || 'Primary Production Node'}
                    onCompleted={() => {
                        fetchIndustrialPricing();
                        onSaved?.();
                    }}
                    onOpenAdvanced={() => setSelectedWorkflow('assistant')}
                    onFamiliesStateChange={handleFamiliesChange}
                    targetFamilyId={activeFamilyId}
                />
            </div>

            {/* 1. Assistant Calibration Container (Preserved in DOM to retain draft and conversation state) */}
            <div
                id="pricing-workflow-assistant"
                className={`space-y-2.5 ${selectedWorkflow === 'assistant' ? 'block' : 'hidden'}`}
            >
                <QuickCalibrationPanel
                    printerNodeId={industrialData?.nodeId}
                    printerNodeName={industrialData?.nodeName || 'Primary Production Node'}
                    onAccepted={() => {
                        fetchIndustrialPricing();
                        onSaved?.();
                    }}
                />
            </div>

            {/* 2. Manual Rate Card Configuration Container */}
            <div
                id="pricing-workflow-manual"
                className={`space-y-3 ${selectedWorkflow === 'manual' ? 'block' : 'hidden'}`}
            >
                <div className="flex items-center justify-between px-1">
                    <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                        {t('pricing.mode.manualHeading')}
                    </span>
                </div>
                <CanonicalIndustrialPricingEditor
                    mode="ONBOARDING"
                    initialNodeData={initialNodeDataMemo}
                    onSave={handleSaveIndustrialPricing}
                    onReloadRequest={fetchIndustrialPricing}
                    saving={savingIndustrial}
                />
            </div>

            {/* SECONDARY MENU / DRAWER: COMMERCIAL PRICING POLICIES & CATALOGS */}
            <SetupDrawer
                isOpen={showCommercialPolicy}
                onClose={() => setShowCommercialPolicy(false)}
                title="Commercial Price Books & Markup Policies"
                subtitle="Configure quantity tiers, surcharge markups, and customer-specific catalogs applied on top of industrial manufacturing costs."
                widthClass="max-w-3xl"
            >
                <div>
                    <div className="flex justify-end pb-3 border-b border-zinc-200 dark:border-zinc-800">
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
            </SetupDrawer>

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
