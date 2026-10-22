import React, { useEffect, useState } from 'react';
import { 
    BuildingOfficeIcon, 
    EnvelopeIcon, 
    CurrencyEuroIcon, 
    ShieldCheckIcon,
    ExclamationTriangleIcon,
    CheckBadgeIcon,
    IdentificationIcon,
    TagIcon
} from '@heroicons/react/24/outline';
import { paperSupplierFetch, SupplierApiError } from '../../lib/paperSupplierApi';
import { getUserRole, getAuthUser } from '../../lib/authStore';
import { useLocale } from '../../i18n';

export const SupplierSettingsPage: React.FC = () => {
    const { t } = useLocale();
    const role = getUserRole();
    const user = getAuthUser();
    const [profile, setProfile] = useState<any>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let isMounted = true;
        setLoading(true);
        setError(null);

        paperSupplierFetch<any>('/api/v1/paper-suppliers/me')
            .then((res: any) => {
                if (isMounted) {
                    if (res && res.ok && res.data) {
                        setProfile(res.data);
                    } else {
                        setProfile({
                            name: user?.companyName || 'Authorized Paper Supplier',
                            status: 'ACTIVE',
                            role: role,
                            tenantId: user?.tenantId || 'tenant-supplier',
                            currencies: ['EUR']
                        });
                    }
                    setLoading(false);
                }
            })
            .catch((err: any) => {
                if (isMounted) {
                    setError(err.message || 'Failed to load supplier profile data.');
                    setLoading(false);
                }
            });

        return () => {
            isMounted = false;
        };
    }, [role, user]);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b ppos-border pb-5">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <span className="px-2 py-0.5 text-[9px] font-black uppercase tracking-widest bg-red-600 text-white">
                            {t('supplier.settings.badge') || 'Paper Supplier Hub'}
                        </span>
                        <span className="px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-slate-200 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300">
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
                        <p className="text-xs font-black text-emerald-500 uppercase tracking-wider">
                            {profile?.status || 'ACTIVE'}
                        </p>
                    </div>
                    <div className="h-8 w-[1px] bg-slate-200 dark:bg-zinc-800" />
                    <div className="text-right">
                        <p className="text-[10px] font-bold uppercase text-zinc-400">
                            {t('supplier.settings.roleLabel') || 'Role'}
                        </p>
                        <p className="text-xs font-black text-slate-800 dark:text-zinc-200 uppercase tracking-wider">
                            {role}
                        </p>
                    </div>
                </div>
            </div>

            {error && (
                <div className="p-4 bg-red-500/10 border border-red-500/30 text-red-500 text-xs flex items-center gap-2">
                    <ExclamationTriangleIcon className="w-5 h-5 shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            {/* Profile Information Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Organization Data */}
                <div className="p-6 ppos-surface border ppos-border space-y-4">
                    <div className="flex items-center gap-2 border-b ppos-border pb-3">
                        <BuildingOfficeIcon className="w-5 h-5 text-red-600" />
                        <h2 className="text-sm font-black uppercase tracking-wider text-slate-900 dark:text-white">
                            {t('supplier.settings.orgCardTitle') || 'Corporate Identity'}
                        </h2>
                    </div>

                    <div className="space-y-3 text-xs">
                        <div>
                            <span className="text-[10px] font-bold uppercase text-zinc-400">
                                {t('supplier.settings.companyName') || 'Company Name'}
                            </span>
                            <p className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">
                                {loading ? '...' : (profile?.name || user?.companyName || '—')}
                            </p>
                        </div>

                        <div>
                            <span className="text-[10px] font-bold uppercase text-zinc-400">
                                {t('supplier.settings.contactEmail') || 'Registered Contact Email'}
                            </span>
                            <p className="font-mono text-slate-800 dark:text-zinc-200 mt-0.5">
                                {user?.email || '—'}
                            </p>
                        </div>

                        <div>
                            <span className="text-[10px] font-bold uppercase text-zinc-400">
                                {t('supplier.settings.supplierId') || 'Supplier Organization ID'}
                            </span>
                            <p className="font-mono text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                                {profile?.supplierId || user?.supplierId || '—'}
                            </p>
                        </div>

                        <div>
                            <span className="text-[10px] font-bold uppercase text-zinc-400">
                                {t('supplier.settings.tenantId') || 'Tenancy Scope'}
                            </span>
                            <p className="font-mono text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                                {profile?.tenantId || user?.tenantId || '—'}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Commercial & Currency Capabilities */}
                <div className="p-6 ppos-surface border ppos-border space-y-4">
                    <div className="flex items-center gap-2 border-b ppos-border pb-3">
                        <CurrencyEuroIcon className="w-5 h-5 text-emerald-500" />
                        <h2 className="text-sm font-black uppercase tracking-wider text-slate-900 dark:text-white">
                            {t('supplier.settings.commercialCardTitle') || 'Trading Conditions & Currencies'}
                        </h2>
                    </div>

                    <div className="space-y-4 text-xs">
                        <div>
                            <span className="text-[10px] font-bold uppercase text-zinc-400">
                                {t('supplier.settings.currencies') || 'Approved Currencies'}
                            </span>
                            <div className="flex flex-wrap gap-2 mt-1.5">
                                {(profile?.currencies && profile.currencies.length > 0 ? profile.currencies : ['EUR']).map((cur: string) => (
                                    <span key={cur} className="px-2.5 py-1 text-xs font-mono font-bold bg-slate-100 dark:bg-zinc-800 text-slate-800 dark:text-zinc-200 border border-slate-200 dark:border-zinc-700">
                                        {cur}
                                    </span>
                                ))}
                            </div>
                        </div>

                        <div>
                            <span className="text-[10px] font-bold uppercase text-zinc-400">
                                {t('supplier.settings.scopeStatus') || 'Governance Scope'}
                            </span>
                            <div className="flex items-center gap-2 mt-1.5">
                                <ShieldCheckIcon className="w-4 h-4 text-emerald-500" />
                                <span className="font-bold text-slate-800 dark:text-zinc-200">
                                    {t('supplier.settings.approvedSupplier') || 'Approved Paper Supplier (PAPER_SUPPLIER)'}
                                </span>
                            </div>
                            <p className="text-[11px] text-zinc-500 mt-1 leading-relaxed">
                                {t('supplier.settings.scopeDesc') || 'Authorized to publish physical paper catalogs, create commercial rate cards, and participate in governed procurement.'}
                            </p>
                        </div>

                        <div className="pt-2 border-t ppos-border text-[11px] text-zinc-400 italic">
                            {t('supplier.settings.readOnlyNote') || 'To modify corporate registration data or add trading currencies, contact the platform governance team.'}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
