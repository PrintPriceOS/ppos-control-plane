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
import { Tag, Plus, Edit, Copy, Trash2, ShieldAlert, BadgeAlert, CheckCircle, Calculator, Info, ShieldCheck, HelpCircle, Layers, ChevronDown, ChevronUp } from 'lucide-react';

interface PricingPanelProps {
    sites: { siteId: string; siteName: string }[];
    onSaved?: () => void;
}

type PricingSubTab = 'RULES' | 'SIMULATOR';

export const PricingPanel: React.FC<PricingPanelProps> = ({ sites, onSaved }) => {
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

            {/* PRIMARY: CANONICAL INDUSTRIAL PRICING (rates_json) */}
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

            {/* DOWNSTREAM / OPTIONAL: COMMERCIAL PRICING POLICIES & CATALOGS */}
            <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e4e4e7', overflow: 'hidden' }}>
                <div 
                    onClick={() => setShowCommercialPolicy(!showCommercialPolicy)}
                    style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center', 
                        padding: '16px 24px', 
                        cursor: 'pointer',
                        backgroundColor: '#fafafa',
                        borderBottom: showCommercialPolicy ? '1px solid #e4e4e7' : 'none'
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Tag size={18} style={{ color: '#71717a' }} />
                        <div>
                            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#09090b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                Commercial Pricing Policies & Markups
                                <span style={{ fontSize: '11px', fontWeight: 500, color: '#71717a', backgroundColor: '#f4f4f5', padding: '2px 8px', borderRadius: '4px' }}>
                                    Downstream / Optional
                                </span>
                            </h3>
                            <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#71717a' }}>
                                Configure commercial quantity tiers, surcharge markups, and customer-specific price books applied on top of industrial costs.
                            </p>
                        </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        {showCommercialPolicy ? <ChevronUp size={18} color="#71717a" /> : <ChevronDown size={18} color="#71717a" />}
                    </div>
                </div>

                {showCommercialPolicy && (
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '12px 24px', borderBottom: '1px solid #e4e4e7' }}>
                            <button
                                onClick={() => {
                                    setCloningBook(null);
                                    setEditingBook(null);
                                    setShowBookModal(true);
                                }}
                                style={{
                                    backgroundColor: '#dc0000', color: '#ffffff', border: 'none', borderRadius: '6px',
                                    padding: '6px 14px', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', gap: '6px'
                                }}
                            >
                                <Plus size={14} /> Create Catalog
                            </button>
                        </div>
                        {/* Price Books Table */}
                        {loadingBooks ? (
                    <div style={{ padding: '40px', textAlign: 'center', color: '#a1a1aa' }}>Loading price catalogs...</div>
                ) : priceBooks.length === 0 ? (
                    <div style={{ padding: '40px', textAlign: 'center', color: '#71717a', fontSize: '13px' }}>
                        No price books configured. Create your first catalog draft to get started.
                    </div>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid #27272a', color: '#a1a1aa' }}>
                                    <th style={{ padding: '14px 24px' }}>Name</th>
                                    <th style={{ padding: '14px 20px' }}>Currency</th>
                                    <th style={{ padding: '14px 20px' }}>Status</th>
                                    <th style={{ padding: '14px 20px' }}>Validation Status</th>
                                    <th style={{ padding: '14px 20px' }}>Validity Boundaries</th>
                                    <th style={{ padding: '14px 24px', width: '280px', textAlign: 'right' }}>Actions</th>
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
                                            style={{
                                                borderBottom: '1px solid #27272a',
                                                backgroundColor: isSelected ? 'rgba(220,0,0,0.03)' : 'transparent',
                                                cursor: 'pointer'
                                            }}
                                            onClick={() => setSelectedBook(pb)}
                                        >
                                            <td style={{ padding: '14px 24px', fontWeight: 600, color: '#ffffff' }}>
                                                {pb.name} <span style={{ fontSize: '11px', color: '#71717a', fontWeight: 400 }}>(v{pb.version})</span>
                                            </td>
                                            <td style={{ padding: '14px 20px', color: '#e4e4e7' }}>{pb.currency}</td>
                                            <td style={{ padding: '14px 20px' }}>
                                                <span style={{
                                                    backgroundColor: pb.status === 'PUBLISHED' ? 'rgba(16, 185, 129, 0.1)' : pb.status === 'APPROVED' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(234, 179, 8, 0.1)',
                                                    color: pb.status === 'PUBLISHED' ? '#34d399' : pb.status === 'APPROVED' ? '#60a5fa' : '#facc15',
                                                    padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700
                                                }}>
                                                    {pb.status}
                                                </span>
                                            </td>
                                            <td style={{ padding: '14px 20px' }} onClick={(e) => e.stopPropagation()}>
                                                {validatingBookId === pb.id ? (
                                                    <span style={{ color: '#a1a1aa', fontSize: '11px' }}>Auditing...</span>
                                                ) : audit ? (
                                                    <span style={{
                                                        color: audit.isValid ? '#10b981' : '#f87171',
                                                        display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px'
                                                    }}>
                                                        {audit.isValid ? <ShieldCheck size={14} /> : <BadgeAlert size={14} />}
                                                        {audit.isValid ? 'Clean Audit' : `${audit.errors.length} Issues`}
                                                    </span>
                                                ) : (
                                                    <button
                                                        onClick={() => handleValidateBook(pb.id)}
                                                        style={{
                                                            background: 'none', border: 'none', color: '#a1a1aa',
                                                            textDecoration: 'underline', cursor: 'pointer', padding: 0
                                                        }}
                                                    >
                                                        Run Audit Check
                                                    </button>
                                                )}
                                            </td>
                                            <td style={{ padding: '14px 20px', color: '#a1a1aa', fontSize: '12px' }}>
                                                {pb.effective_from ? new Date(pb.effective_from).toLocaleDateString() : 'Immediate'} 
                                                {' → '} 
                                                {pb.effective_to ? new Date(pb.effective_to).toLocaleDateString() : 'Forever'}
                                            </td>
                                            <td style={{ padding: '14px 24px', textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                                                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                                    {hasDraftStatus && (
                                                        <button
                                                            title="Edit metadata"
                                                            onClick={() => {
                                                                setCloningBook(null);
                                                                setEditingBook(pb);
                                                                setShowBookModal(true);
                                                            }}
                                                            style={{ background: 'none', border: 'none', color: '#a1a1aa', cursor: 'pointer', padding: '4px' }}
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
                                                        style={{ background: 'none', border: 'none', color: '#a1a1aa', cursor: 'pointer', padding: '4px' }}
                                                    >
                                                        <Copy size={16} />
                                                    </button>
                                                    {hasDraftStatus && (
                                                        <>
                                                            <button
                                                                onClick={() => handleTransitionStatus(pb.id, 'APPROVED')}
                                                                style={{
                                                                    backgroundColor: '#27272a', color: '#ffffff', border: 'none',
                                                                    borderRadius: '4px', padding: '4px 8px', fontSize: '11px', cursor: 'pointer'
                                                                }}
                                                            >
                                                                Approve
                                                            </button>
                                                            <button
                                                                title="Delete draft"
                                                                onClick={() => handleDeleteBook(pb.id)}
                                                                style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px' }}
                                                            >
                                                                <Trash2 size={16} />
                                                            </button>
                                                        </>
                                                    )}
                                                    {pb.status === 'APPROVED' && (
                                                        <button
                                                            onClick={() => handleTransitionStatus(pb.id, 'PUBLISHED')}
                                                            style={{
                                                                backgroundColor: '#10b981', color: '#ffffff', border: 'none',
                                                                borderRadius: '4px', padding: '4px 8px', fontSize: '11px', cursor: 'pointer'
                                                            }}
                                                        >
                                                            Publish
                                                        </button>
                                                    )}
                                                    {pb.status === 'PUBLISHED' && (
                                                        <button
                                                            onClick={() => handleTransitionStatus(pb.id, 'RETIRED')}
                                                            style={{
                                                                backgroundColor: '#ef4444', color: '#ffffff', border: 'none',
                                                                borderRadius: '4px', padding: '4px 8px', fontSize: '11px', cursor: 'pointer'
                                                            }}
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
                    </div>
                )}
            </div>

            {/* SECTION 2: BOOK RULES & SIMULATOR (VISIBLE ONLY IF SELECTED) */}
            {selectedBook ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {/* Sub Tab selection bar */}
                    <div style={{ display: 'flex', gap: '16px', borderBottom: '1px solid #27272a', paddingBottom: '12px' }}>
                        <button
                            onClick={() => setSubTab('RULES')}
                            style={{
                                background: 'none', border: 'none', padding: '0 0 8px 0', fontSize: '14px', fontWeight: 700,
                                color: subTab === 'RULES' ? '#dc0000' : '#71717a', cursor: 'pointer',
                                borderBottom: subTab === 'RULES' ? '2px solid #dc0000' : 'none'
                            }}
                        >
                            Pricing Rules Grid
                        </button>
                        <button
                            onClick={() => setSubTab('SIMULATOR')}
                            style={{
                                background: 'none', border: 'none', padding: '0 0 8px 0', fontSize: '14px', fontWeight: 700,
                                color: subTab === 'SIMULATOR' ? '#dc0000' : '#71717a', cursor: 'pointer',
                                borderBottom: subTab === 'SIMULATOR' ? '2px solid #dc0000' : 'none',
                                display: 'flex', alignItems: 'center', gap: '6px'
                            }}
                        >
                            <Calculator size={14} /> Pricing Sandbox
                        </button>
                    </div>

                    {/* Validation issues warning block */}
                    {validationAudits[selectedBook.id] && !validationAudits[selectedBook.id].isValid && (
                        <div style={{
                            backgroundColor: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.1)',
                            borderRadius: '8px', padding: '16px', fontSize: '13px'
                        }}>
                            <h5 style={{ margin: '0 0 8px 0', color: '#f87171', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <ShieldAlert size={16} /> Validation Flags for {selectedBook.name}
                            </h5>
                            <ul style={{ margin: 0, paddingLeft: '20px', color: '#a1a1aa', lineHeight: '1.6' }}>
                                {validationAudits[selectedBook.id].errors.map((err: any, idx: number) => (
                                    <li key={idx} style={{ color: '#f87171' }}>{err.message}</li>
                                ))}
                                {validationAudits[selectedBook.id].advisories.map((adv: any, idx: number) => (
                                    <li key={idx}>{adv.message} (Advisory)</li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {subTab === 'RULES' && (
                        <div style={{ backgroundColor: '#18181b', borderRadius: '12px', border: '1px solid #27272a', overflow: 'hidden' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px', borderBottom: '1px solid #27272a' }}>
                                <div>
                                    <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: '#ffffff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <Layers size={16} style={{ color: '#dc0000' }} />
                                        Pricing Rules for: {selectedBook.name}
                                    </h4>
                                    <span style={{ fontSize: '11px', color: '#71717a' }}>ID: {selectedBook.id}</span>
                                </div>
                                {selectedBook.status === 'DRAFT' && (
                                    <button
                                        onClick={() => {
                                            setEditingRule(null);
                                            setShowRuleModal(true);
                                        }}
                                        style={{
                                            backgroundColor: '#27272a', color: '#ffffff', border: 'none', borderRadius: '6px',
                                            padding: '6px 12px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                                            display: 'flex', alignItems: 'center', gap: '4px'
                                        }}
                                    >
                                        <Plus size={14} /> Add Rule
                                    </button>
                                )}
                            </div>

                            {loadingRules ? (
                                <div style={{ padding: '30px', textAlign: 'center', color: '#a1a1aa' }}>Loading pricing rules...</div>
                            ) : rules.length === 0 ? (
                                <div style={{ padding: '40px', textAlign: 'center', color: '#71717a', fontSize: '13px' }}>
                                    No rules defined in this book.
                                </div>
                            ) : (
                                <div style={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
                                        <thead>
                                            <tr style={{ borderBottom: '1px solid #27272a', color: '#a1a1aa' }}>
                                                <th style={{ padding: '12px 24px' }}>Scope</th>
                                                <th style={{ padding: '12px 16px' }}>Site / Machine / Material</th>
                                                <th style={{ padding: '12px 16px' }}>Pricing Unit</th>
                                                <th style={{ padding: '12px 16px' }}>Base Price</th>
                                                <th style={{ padding: '12px 16px' }}>Setup Charge</th>
                                                <th style={{ padding: '12px 16px' }}>Min Job Floor</th>
                                                <th style={{ padding: '12px 16px' }}>Quantity Tiers</th>
                                                {selectedBook.status === 'DRAFT' && <th style={{ padding: '12px 24px', width: '120px', textAlign: 'right' }}>Actions</th>}
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
                                                    <tr key={rule.id} style={{ borderBottom: '1px solid #27272a' }}>
                                                        <td style={{ padding: '12px 24px', fontWeight: 600, color: '#ffffff' }}>
                                                            <span style={{
                                                                backgroundColor: rule.scope === 'TENANT_DEFAULT' ? 'rgba(220,0,0,0.1)' : 'rgba(39,39,42,0.5)',
                                                                padding: '2px 6px', borderRadius: '4px', fontSize: '10px'
                                                            }}>
                                                                {rule.scope}
                                                            </span>
                                                        </td>
                                                        <td style={{ padding: '12px 16px', color: '#e4e4e7' }}>{targetDetails}</td>
                                                        <td style={{ padding: '12px 16px', color: '#a1a1aa' }}>{rule.pricing_unit}</td>
                                                        <td style={{ padding: '12px 16px', color: '#ffffff' }}>{Number(rule.base_price).toFixed(4)} {selectedBook.currency}</td>
                                                        <td style={{ padding: '12px 16px', color: '#ffffff' }}>{Number(rule.setup_charge).toFixed(2)} {selectedBook.currency}</td>
                                                        <td style={{ padding: '12px 16px', color: '#ffffff' }}>{Number(rule.minimum_order_value).toFixed(2)} {selectedBook.currency}</td>
                                                        <td style={{ padding: '12px 16px' }}>
                                                            {rule.tiers && rule.tiers.length > 0 ? (
                                                                <span style={{ backgroundColor: 'rgba(16,185,129,0.1)', color: '#34d399', padding: '2px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>
                                                                    {rule.tiers.length} Tiers Defined
                                                                </span>
                                                            ) : (
                                                                <span style={{ color: '#71717a' }}>No tiers</span>
                                                            )}
                                                        </td>
                                                        {selectedBook.status === 'DRAFT' && (
                                                            <td style={{ padding: '12px 24px', textAlign: 'right' }}>
                                                                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                                                    <button
                                                                        onClick={() => {
                                                                            setEditingRule(rule);
                                                                            setShowRuleModal(true);
                                                                        }}
                                                                        style={{ background: 'none', border: 'none', color: '#a1a1aa', cursor: 'pointer', padding: '4px' }}
                                                                    >
                                                                        <Edit size={14} />
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleDeleteRule(rule.id)}
                                                                        style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px' }}
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
            ) : (
                <div style={{
                    backgroundColor: '#18181b', borderRadius: '12px', border: '1px dashed #27272a',
                    padding: '40px', textAlign: 'center', color: '#71717a', fontSize: '14px'
                }}>
                    <Info size={24} style={{ margin: '0 auto 10px auto', color: '#71717a' }} />
                    Select a Price Book above to configure its rules or simulate quote pricing.
                </div>
            )}

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
