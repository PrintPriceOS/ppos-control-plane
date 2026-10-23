import React, { useEffect, useState } from 'react';
import { 
    BuildingOfficeIcon, 
    CurrencyEuroIcon, 
    ShieldCheckIcon,
    ExclamationTriangleIcon
} from '@heroicons/react/24/outline';
import { paperSupplierFetch } from '../../lib/paperSupplierApi';
import { 
    getUserRole, 
    getAuthUser, 
    getUserTenantId, 
    getUserSupplierId, 
    getActiveContext 
} from '../../lib/authStore';
import { useLocale } from '../../i18n';

export const SupplierSettingsPage: React.FC = () => {
    const { t } = useLocale();
    const role = getUserRole();
    const user = getAuthUser();
    const userId = user?.id || user?.userId || user?.sub || user?.email || '';
    const tenantId = user?.tenantId || getUserTenantId() || '';
    const supplierId = user?.supplierId || getUserSupplierId() || '';
    const activeContext = getActiveContext() || '';

    const [profile, setProfile] = useState<any>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let isMounted = true;
        setLoading(true);
        setError(null);

        const fetchProfile = async () => {
            try {
                const res = await paperSupplierFetch<any>('/api/v1/paper-suppliers/me');
                if (!isMounted) return;

                if (res && res.ok && res.data) {
                    setProfile(res.data);
                } else {
                    setProfile(null);
                    setError(res?.error?.message || t('supplier.settings.loadError') || 'Failed to load supplier profile data.');
                }
            } catch (err: any) {
                if (!isMounted) return;
                setProfile(null);
                setError(err.message || t('supplier.settings.loadError') || 'Failed to load supplier profile data.');
            } finally {
                if (isMounted) {
                    setLoading(false);
                }
            }
        };

        fetchProfile();

        return () => {
            isMounted = false;
        };
    }, [role, userId, tenantId, supplierId, activeContext]);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-200 dark:border-zinc-800 pb-5">
                <div>
                    <div className="flex items-center gap-2 mb-2">
                        <span className="px-3 py-0.5 text-xs font-semibold rounded-full bg-red-600 text-white shadow-xs">
                            {t('supplier.settings.badge') || 'Paper Supplier Hub'}
                        </span>
                        <span className="px-3 py-0.5 text-xs font-medium rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
                            {t('supplier.settings.verifiedTag') || 'Verified Profile'}
                        </span>
                    </div>
                    <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                        {t('supplier.settings.title') || 'Supplier Organization Profile'}
                    </h1>
                    <p className="text-xs text-zinc-500 mt-1">
                        {t('supplier.settings.subtitle') || 'Registered organization identity, approved trading currencies, and governance capabilities.'}
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <div className="text-right">
                        <p className="text-[10px] font-bold uppercase text-zinc-400">
                            {t('supplier.settings.statusLabel') || 'Account Status'}
                        </p>
                        <p className={`text-xs font-black uppercase tracking-wider ${
                            profile?.status === 'APPROVED' || profile?.status === 'ACTIVE'
                                ? 'text-emerald-500'
                                : profile?.status === 'SUSPENDED'
                                    ? 'text-red-500'
                                    : 'text-zinc-400'
                        }`}>
                            {loading ? '...' : (profile?.status || (t('common.notAvailable') || 'No disponible'))}
                        </p>
                    </div>
                    <div className="h-8 w-[1px] bg-slate-200 dark:bg-zinc-800" />
                    <div className="text-right">
                        <p className="text-[10px] font-bold uppercase text-zinc-400">
                            {t('supplier.settings.roleLabel') || 'Role'}
                        </p>
                        <p className="text-xs font-black text-slate-800 dark:text-zinc-200 uppercase tracking-wider">
                            {role || (t('common.notAvailable') || 'No disponible')}
                        </p>
                    </div>
                </div>
            </div>

            {error && (
                <div className="p-4 bg-red-500/10 border border-red-500/30 text-red-500 text-xs rounded-xl flex items-center gap-2">
                    <ExclamationTriangleIcon className="w-5 h-5 shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            {/* Profile Information Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Organization Data */}
                <div className="p-6 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xs space-y-4">
                    <div className="flex items-center gap-2 border-b border-zinc-200 dark:border-zinc-800 pb-3">
                        <div className="p-1.5 rounded-lg bg-red-50 dark:bg-red-950/40">
                            <BuildingOfficeIcon className="w-5 h-5 text-red-600" />
                        </div>
                        <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                            {t('supplier.settings.orgCardTitle') || 'Corporate Identity'}
                        </h2>
                    </div>

                    <div className="space-y-3.5 text-xs">
                        <div>
                            <span className="text-[10px] font-bold uppercase text-zinc-400">
                                {t('supplier.settings.companyName') || 'Company Name'}
                            </span>
                            <p className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">
                                {loading ? '...' : (profile?.name || user?.companyName || (t('common.notAvailable') || 'No disponible'))}
                            </p>
                        </div>

                        <div>
                            <span className="text-[10px] font-bold uppercase text-zinc-400">
                                {t('supplier.settings.contactEmail') || 'Registered Contact Email'}
                            </span>
                            <p className="font-mono text-slate-800 dark:text-zinc-200 mt-0.5">
                                {loading ? '...' : (profile?.contactEmail || user?.email || (t('common.notAvailable') || 'No disponible'))}
                            </p>
                        </div>

                        <div>
                            <span className="text-[10px] font-bold uppercase text-zinc-400">
                                {t('supplier.settings.supplierId') || 'Supplier Organization ID'}
                            </span>
                            <p className="font-mono text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                                {loading ? '...' : (profile?.supplierId || supplierId || (t('common.notAvailable') || 'No disponible'))}
                            </p>
                        </div>

                        <div>
                            <span className="text-[10px] font-bold uppercase text-zinc-400">
                                {t('supplier.settings.tenantId') || 'Tenancy Scope'}
                            </span>
                            <p className="font-mono text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                                {loading ? '...' : (profile?.tenantId || tenantId || (t('common.notAvailable') || 'No disponible'))}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Commercial & Currency Capabilities */}
                <div className="p-6 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xs space-y-4">
                    <div className="flex items-center gap-2 border-b border-zinc-200 dark:border-zinc-800 pb-3">
                        <div className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40">
                            <CurrencyEuroIcon className="w-5 h-5 text-emerald-500" />
                        </div>
                        <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                            {t('supplier.settings.commercialCardTitle') || 'Trading Conditions & Currencies'}
                        </h2>
                    </div>

                    <div className="space-y-4 text-xs">
                        <div>
                            <span className="text-[10px] font-bold uppercase text-zinc-400">
                                {t('supplier.settings.currencies') || 'Approved Currencies'}
                            </span>
                            <div className="flex flex-wrap gap-2 mt-1.5">
                                {loading ? (
                                    <span className="text-xs text-zinc-400">...</span>
                                ) : profile?.currencies && Array.isArray(profile.currencies) && profile.currencies.length > 0 ? (
                                    profile.currencies.map((cur: string) => (
                                        <span key={cur} className="px-3 py-1 text-xs font-mono font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 rounded-full border border-zinc-200 dark:border-zinc-700">
                                            {cur}
                                        </span>
                                    ))
                                ) : (
                                    <span className="text-xs text-zinc-400">
                                        {t('common.notAvailable') || 'No disponible'}
                                    </span>
                                )}
                            </div>
                        </div>

                        <div>
                            <span className="text-[10px] font-bold uppercase text-zinc-400">
                                {t('supplier.settings.scopeStatus') || 'Governance Scope'}
                            </span>
                            <div className="flex items-center gap-2 mt-1.5">
                                <ShieldCheckIcon className={`w-4 h-4 ${profile?.status === 'APPROVED' ? 'text-emerald-500' : 'text-zinc-400'}`} />
                                <span className="font-semibold text-slate-800 dark:text-zinc-200">
                                    {loading ? '...' : (profile ? (t('supplier.settings.approvedSupplier') || 'Approved Paper Supplier (PAPER_SUPPLIER)') : (t('common.notAvailable') || 'No disponible'))}
                                </span>
                            </div>
                            <p className="text-[11px] text-zinc-500 mt-1 leading-relaxed">
                                {t('supplier.settings.scopeDesc') || 'Authorized to publish physical paper catalogs, create commercial rate cards, and participate in governed procurement.'}
                            </p>
                        </div>

                        <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800 text-[11px] text-zinc-400 italic">
                            {t('supplier.settings.readOnlyNote') || 'To modify corporate registration data or add trading currencies, contact the platform governance team.'}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
