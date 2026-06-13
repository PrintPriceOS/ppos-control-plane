import React, { useState, useEffect } from 'react';
import { Printhouse } from '../../types/printhouseCapabilities';
import { listPrinthouses, createPrinthouse } from '../../api/printhouseCapabilitiesClient';
import { PrinthouseList } from './PrinthouseList';
import { PrinthouseDetailDrawer } from './PrinthouseDetailDrawer';
import { BuildingStorefrontIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { getUserRole } from '../../lib/authStore';

export const PrinthouseOnboardingPage: React.FC = () => {
    const [printhouses, setPrinthouses] = useState<Printhouse[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedPrinthouse, setSelectedPrinthouse] = useState<Printhouse | null>(null);
    
    // Register Printhouse Modal State
    const [showRegisterModal, setShowRegisterModal] = useState(false);
    const [newName, setNewName] = useState('');
    const [newTenantId, setNewTenantId] = useState('');
    const [newLegalName, setNewLegalName] = useState('');

    const userRole = getUserRole();
    const isSuperAdmin = userRole === 'SUPER_ADMIN';

    useEffect(() => {
        loadPrinthouses();
    }, []);

    const loadPrinthouses = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await listPrinthouses();
            if (res.ok) {
                setPrinthouses(res.printhouses || []);
            } else {
                setError((res as any).error || 'Failed to fetch printhouses');
            }
        } catch (err: any) {
            setError(err.message || 'An error occurred');
        } finally {
            setLoading(false);
        }
    };

    const handleCreatePrinthouse = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newName) return;

        setLoading(true);
        setError(null);
        try {
            const res = await createPrinthouse({
                name: newName,
                tenant_id: newTenantId || 'ppos-production',
                legal_name: newLegalName || undefined,
                status: 'DRAFT',
                onboarding_status: 'NOT_STARTED',
                default_currency: 'EUR',
                timezone: 'Europe/Madrid'
            });

            if (res.ok) {
                setNewName('');
                setNewTenantId('');
                setNewLegalName('');
                setShowRegisterModal(false);
                await loadPrinthouses();
            } else {
                setError((res as any).error || 'Failed to register printhouse');
            }
        } catch (err: any) {
            setError(err.message || 'An error occurred during registration');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-[32px] font-black text-zinc-900 dark:text-zinc-100 tracking-tight leading-none mb-2">Printhouse Onboarding & Capabilities</h1>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400 font-medium">Define production profiles, machine capabilities, paper catalogs, SLAs, and governance constraints for partner printers.</p>
                </div>
                <div className="px-6 py-3 bg-indigo-50 dark:bg-indigo-950/40 rounded-none border border-indigo-100 dark:border-indigo-900/60 flex items-center gap-4">
                    <div className="w-10 h-10 rounded-none bg-indigo-500/10 flex items-center justify-center">
                        <BuildingStorefrontIcon className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <div>
                        <p className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest leading-none mb-1">Onboarding Hub</p>
                        <p className="text-sm font-black text-indigo-900 dark:text-indigo-300 leading-none">{printhouses.length} Partners</p>
                    </div>
                </div>
            </div>

            {error && (
                <div className="p-3 bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 text-xs font-bold border border-red-100 dark:border-red-900/40">
                    {error}
                </div>
            )}

            <PrinthouseList 
                printhouses={printhouses}
                isLoading={loading}
                onSelectPrinthouse={setSelectedPrinthouse}
                onRefresh={loadPrinthouses}
                onCreateNew={() => setShowRegisterModal(true)}
                isSuperAdmin={isSuperAdmin}
            />

            {/* Detail Drawer */}
            <PrinthouseDetailDrawer 
                printhouse={selectedPrinthouse}
                isOpen={!!selectedPrinthouse}
                onClose={() => setSelectedPrinthouse(null)}
                onMutationSuccess={loadPrinthouses}
            />

            {/* Register Modal Dialog */}
            {showRegisterModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 max-w-md w-full p-6 space-y-6">
                        <div className="flex items-center justify-between border-b ppos-border pb-3">
                            <h3 className="text-sm font-black text-zinc-900 dark:text-zinc-100 uppercase tracking-wider">Register Print Partner</h3>
                            <button onClick={() => setShowRegisterModal(false)} className="text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors">
                                <XMarkIcon className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={handleCreatePrinthouse} className="space-y-4">
                            <div>
                                <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">Partner Name *</label>
                                <input 
                                    type="text" 
                                    required 
                                    value={newName} 
                                    onChange={e => setNewName(e.target.value)} 
                                    className="w-full px-3 py-1.5 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-primary" 
                                />
                            </div>

                            <div>
                                <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">Legal Company Name</label>
                                <input 
                                    type="text" 
                                    value={newLegalName} 
                                    onChange={e => setNewLegalName(e.target.value)} 
                                    className="w-full px-3 py-1.5 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-primary" 
                                />
                            </div>

                            <div>
                                <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">Tenant Scope *</label>
                                <input 
                                    type="text" 
                                    required
                                    placeholder="e.g. ppos-production"
                                    value={newTenantId} 
                                    onChange={e => setNewTenantId(e.target.value)} 
                                    className="w-full px-3 py-1.5 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-primary font-mono" 
                                />
                            </div>

                            <div className="flex items-center justify-end gap-3 border-t ppos-border pt-4 mt-6">
                                <button 
                                    type="button" 
                                    onClick={() => setShowRegisterModal(false)}
                                    className="px-4 py-2 border ppos-border text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                                >
                                    Cancel
                                </button>
                                <button 
                                    type="submit"
                                    disabled={loading}
                                    className="px-4 py-2 bg-primary text-white text-xs font-bold uppercase tracking-wider hover:bg-primary/95 disabled:opacity-50"
                                >
                                    {loading ? 'Registering...' : 'Register Partner'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};
