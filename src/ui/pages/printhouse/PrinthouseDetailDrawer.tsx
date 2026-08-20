import React, { useState, useEffect } from 'react';
import { Printhouse } from '../../types/printhouseCapabilities';
import { updatePrinthouse } from '../../api/printhouseCapabilitiesClient';
import { Drawer } from '../../components/Drawer';
import { MachineCapabilityEditor } from './MachineCapabilityEditor';
import { MediaCatalogEditor } from './MediaCatalogEditor';
import { PolicyProfileEditor } from './PolicyProfileEditor';
import { SlaProfileEditor } from './SlaProfileEditor';
import { PrinthouseReadinessPanel } from './PrinthouseReadinessPanel';
import { CapabilityAuditTimeline } from './CapabilityAuditTimeline';
import { COUNTRIES, getCountryDisplayName } from '../../lib/countryCatalog';
import { CountrySelect } from '../../components/common/CountrySelect';

interface PrinthouseDetailDrawerProps {
    printhouse: Printhouse | null;
    isOpen: boolean;
    onClose: () => void;
    onMutationSuccess: () => void;
}

type TabType = 'overview' | 'machines' | 'media' | 'policies' | 'sla' | 'readiness' | 'audit';

export const PrinthouseDetailDrawer: React.FC<PrinthouseDetailDrawerProps> = ({
    printhouse,
    isOpen,
    onClose,
    onMutationSuccess
}) => {
    const [activeTab, setActiveTab] = useState<TabType>('overview');
    const [form, setForm] = useState<Partial<Printhouse>>({});
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [refreshReadinessTrigger, setRefreshReadinessTrigger] = useState(0);

    useEffect(() => {
        if (printhouse) {
            setForm({ ...printhouse });
            setActiveTab('overview');
        }
    }, [printhouse]);

    const handleUpdatePrinthouse = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!printhouse) return;

        setLoading(true);
        setError(null);
        try {
            const res = await updatePrinthouse(printhouse.id, form);
            if (res.ok) {
                onMutationSuccess();
                triggerReadinessRefresh();
            } else {
                setError((res as any).error || 'Failed to update partner details');
            }
        } catch (err: any) {
            setError(err.message || 'An error occurred');
        } finally {
            setLoading(false);
        }
    };

    const triggerReadinessRefresh = () => {
        setRefreshReadinessTrigger(prev => prev + 1);
        onMutationSuccess();
    };

    if (!printhouse) return null;

    const tabs: { id: TabType; label: string }[] = [
        { id: 'overview', label: 'Overview' },
        { id: 'machines', label: 'Machines' },
        { id: 'media', label: 'Media' },
        { id: 'policies', label: 'Policy Profiles' },
        { id: 'sla', label: 'SLA' },
        { id: 'readiness', label: 'Readiness' },
        { id: 'audit', label: 'Audit Log' },
    ];

    return (
        <Drawer 
            isOpen={isOpen} 
            onClose={onClose} 
            title={printhouse.name}
            maxWidth="max-w-4xl"
        >
            <div className="flex flex-col h-full">
                {/* Tab buttons */}
                <div className="flex border-b ppos-border bg-zinc-50 dark:bg-zinc-900/60 overflow-x-auto shrink-0">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`px-4 py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-all shrink-0 ${
                                activeTab === tab.id
                                    ? 'border-primary text-primary bg-white dark:bg-zinc-950'
                                    : 'border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-white'
                            }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Tab content area */}
                <div className="flex-1 p-6 overflow-y-auto">
                    {error && (
                        <div className="mb-4 p-3 bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 text-xs font-bold border border-red-100 dark:border-red-900/40">
                            {error}
                        </div>
                    )}

                    {activeTab === 'overview' && (
                        <form onSubmit={handleUpdatePrinthouse} className="space-y-6">
                            <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest border-b ppos-border pb-2">Partner Information</h3>
                            
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">Legal Name</label>
                                    <input 
                                        type="text"
                                        value={form.legal_name || ''}
                                        onChange={e => setForm({ ...form, legal_name: e.target.value })}
                                        className="w-full px-3 py-1.5 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-primary"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">Status *</label>
                                    <select 
                                        value={form.status || 'DRAFT'}
                                        onChange={e => setForm({ ...form, status: e.target.value as any })}
                                        className="w-full px-3 py-1.5 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-xs font-bold text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-primary"
                                    >
                                        <option value="DRAFT">DRAFT</option>
                                        <option value="ACTIVE">ACTIVE</option>
                                        <option value="SUSPENDED">SUSPENDED</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">Default Currency</label>
                                    <input 
                                        type="text"
                                        value={form.default_currency || 'EUR'}
                                        onChange={e => setForm({ ...form, default_currency: e.target.value })}
                                        className="w-full px-3 py-1.5 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-primary"
                                    />
                                </div>
                            </div>

                            <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest border-b ppos-border pb-2 mt-6">Contact & Operations</h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">Contact Email</label>
                                    <input 
                                        type="email"
                                        value={form.contact_email || ''}
                                        onChange={e => setForm({ ...form, contact_email: e.target.value })}
                                        className="w-full px-3 py-1.5 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-primary"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">Contact Phone</label>
                                    <input 
                                        type="text"
                                        value={form.contact_phone || ''}
                                        onChange={e => setForm({ ...form, contact_phone: e.target.value })}
                                        className="w-full px-3 py-1.5 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-primary"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">Timezone</label>
                                    <input 
                                        type="text"
                                        value={form.timezone || 'Europe/Madrid'}
                                        onChange={e => setForm({ ...form, timezone: e.target.value })}
                                        className="w-full px-3 py-1.5 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-primary"
                                    />
                                </div>
                            </div>

                            <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest border-b ppos-border pb-2 mt-6">Location details</h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                                <div>
                                    <CountrySelect
                                        label="Country"
                                        value={form.country || ''}
                                        onChange={code => setForm({ ...form, country: code })}
                                        placeholder="Select country..."
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">Region</label>
                                    <input 
                                        type="text"
                                        value={form.region || ''}
                                        onChange={e => setForm({ ...form, region: e.target.value })}
                                        className="w-full px-3 py-1.5 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-primary"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">City</label>
                                    <input 
                                        type="text"
                                        value={form.city || ''}
                                        onChange={e => setForm({ ...form, city: e.target.value })}
                                        className="w-full px-3 py-1.5 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-primary"
                                    />
                                </div>
                            </div>

                            <div className="flex justify-end pt-4 border-t ppos-border">
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="px-4 py-2 bg-primary text-white text-xs font-bold uppercase tracking-wider hover:bg-primary/95 disabled:opacity-50"
                                >
                                    {loading ? 'Updating...' : 'Update Partner Details'}
                                </button>
                            </div>
                        </form>
                    )}

                    {activeTab === 'machines' && (
                        <MachineCapabilityEditor 
                            printhouseId={printhouse.id} 
                            onMutationSuccess={triggerReadinessRefresh}
                        />
                    )}

                    {activeTab === 'media' && (
                        <MediaCatalogEditor 
                            printhouseId={printhouse.id} 
                            onMutationSuccess={triggerReadinessRefresh}
                        />
                    )}

                    {activeTab === 'policies' && (
                        <PolicyProfileEditor 
                            printhouseId={printhouse.id} 
                            onMutationSuccess={triggerReadinessRefresh}
                        />
                    )}

                    {activeTab === 'sla' && (
                        <SlaProfileEditor 
                            printhouseId={printhouse.id} 
                            onMutationSuccess={triggerReadinessRefresh}
                        />
                    )}

                    {activeTab === 'readiness' && (
                        <PrinthouseReadinessPanel 
                            printhouseId={printhouse.id} 
                            refreshTrigger={refreshReadinessTrigger}
                        />
                    )}

                    {activeTab === 'audit' && (
                        <CapabilityAuditTimeline 
                            printhouseId={printhouse.id} 
                            refreshTrigger={refreshReadinessTrigger}
                        />
                    )}
                </div>
            </div>
        </Drawer>
    );
};
