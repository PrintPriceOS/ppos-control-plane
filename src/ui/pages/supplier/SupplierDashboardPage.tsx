import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    CubeIcon, 
    RectangleStackIcon, 
    InboxIcon, 
    ShieldCheckIcon,
    ArrowUpTrayIcon,
    DocumentTextIcon,
    ExclamationTriangleIcon,
    PlusIcon,
    ArrowRightIcon
} from '@heroicons/react/24/outline';
import { paperSupplierFetch } from '../../lib/paperSupplierApi';
import { getUserRole, getAuthUser } from '../../lib/authStore';
import { useLocale } from '../../i18n';

export const SupplierDashboardPage: React.FC = () => {
    const { t } = useLocale();
    const navigate = useNavigate();
    const role = getUserRole();
    const user = getAuthUser();
    const [profile, setProfile] = useState<any>(null);
    const [catalogCount, setCatalogCount] = useState<number | null>(null);
    const [offersCount, setOffersCount] = useState<number | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let isMounted = true;
        setLoading(true);
        setError(null);

        Promise.allSettled([
            paperSupplierFetch<any>('/api/v1/paper-suppliers/me'),
            paperSupplierFetch<any>('/api/v1/paper-suppliers/catalog/products?limit=1'),
            paperSupplierFetch<any>('/api/v1/paper-suppliers/offers?limit=1')
        ]).then(([meResult, catalogResult, offersResult]) => {
            if (!isMounted) return;

            if (meResult.status === 'fulfilled' && meResult.value?.ok) {
                setProfile(meResult.value.data);
            } else {
                setProfile({
                    name: user?.companyName || 'Authorized Paper Supplier',
                    status: 'ACTIVE',
                    role: role,
                    tenantId: user?.tenantId || 'tenant-supplier'
                });
            }

            if (catalogResult.status === 'fulfilled' && catalogResult.value?.ok) {
                const total = catalogResult.value.data?.total;
                setCatalogCount(typeof total === 'number' ? total : 0);
            } else {
                setCatalogCount(null);
            }

            if (offersResult.status === 'fulfilled' && offersResult.value?.ok) {
                const total = offersResult.value.data?.total;
                setOffersCount(typeof total === 'number' ? total : 0);
            } else {
                setOffersCount(null);
            }

            setLoading(false);
        }).catch((err) => {
            if (!isMounted) return;
            setError(err.message || 'Failed to load supplier dashboard metrics');
            setLoading(false);
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
                            {t('supplier.dashboard.hubBadge') || 'Paper Supplier Hub'}
                        </span>
                        <span className="px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-slate-200 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300">
                            {t('supplier.dashboard.operationsTag') || 'Operations Console'}
                        </span>
                    </div>
                    <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                        {profile?.name || user?.companyName || 'Supplier Operations Console'}
                    </h1>
                    <p className="text-xs text-zinc-500 mt-1">
                        {t('supplier.dashboard.hubDescription') || 'Publish technical paper catalogs, manage commercial pricing matrices, and monitor print house demand.'}
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <div className="text-right">
                        <p className="text-[10px] font-bold uppercase text-zinc-400">
                            {t('supplier.dashboard.status') || 'Status'}
                        </p>
                        <p className="text-xs font-black text-emerald-500 uppercase tracking-wider">
                            {profile?.status || 'ACTIVE'}
                        </p>
                    </div>
                    <div className="h-8 w-[1px] bg-slate-200 dark:bg-zinc-800" />
                    <div className="text-right">
                        <p className="text-[10px] font-bold uppercase text-zinc-400">
                            {t('supplier.dashboard.role') || 'Role'}
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

            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Published Catalog */}
                <div 
                    onClick={() => navigate('/supplier/catalog')}
                    className="p-5 ppos-surface border ppos-border flex flex-col justify-between hover:border-slate-400 dark:hover:border-zinc-700 cursor-pointer transition-colors"
                >
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">
                            {t('supplier.dashboard.catalogCard') || 'Published Catalog'}
                        </span>
                        <RectangleStackIcon className="w-5 h-5 text-zinc-400" />
                    </div>
                    <div className="mt-3">
                        <span className="text-3xl font-black font-mono text-slate-900 dark:text-white">
                            {loading ? '...' : (catalogCount !== null ? catalogCount : '—')}
                        </span>
                        <p className="text-[10px] text-zinc-400 mt-1">
                            {t('supplier.dashboard.catalogCardDesc') || 'Active technical variants'}
                        </p>
                    </div>
                </div>

                {/* Commercial Offers */}
                <div 
                    onClick={() => navigate('/supplier/catalog')}
                    className="p-5 ppos-surface border ppos-border flex flex-col justify-between hover:border-slate-400 dark:hover:border-zinc-700 cursor-pointer transition-colors"
                >
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">
                            {t('supplier.dashboard.offersCard') || 'Commercial Offers'}
                        </span>
                        <DocumentTextIcon className="w-5 h-5 text-zinc-400" />
                    </div>
                    <div className="mt-3">
                        <span className="text-3xl font-black font-mono text-slate-900 dark:text-white">
                            {loading ? '...' : (offersCount !== null ? offersCount : '—')}
                        </span>
                        <p className="text-[10px] text-zinc-400 mt-1">
                            {t('supplier.dashboard.offersCardDesc') || 'Configured rates & MOQ brackets'}
                        </p>
                    </div>
                </div>

                {/* Open RFQs / Demands */}
                <div 
                    onClick={() => navigate('/supplier/orders')}
                    className="p-5 ppos-surface border ppos-border flex flex-col justify-between hover:border-slate-400 dark:hover:border-zinc-700 cursor-pointer transition-colors"
                >
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">
                            {t('supplier.dashboard.rfqCard') || 'Incoming Orders'}
                        </span>
                        <InboxIcon className="w-5 h-5 text-zinc-400" />
                    </div>
                    <div className="mt-3">
                        <span className="text-3xl font-black font-mono text-slate-400 dark:text-zinc-600">
                            —
                        </span>
                        <p className="text-[10px] text-zinc-400 mt-1">
                            {t('supplier.dashboard.rfqCardDesc') || 'Planned for Phase I4'}
                        </p>
                    </div>
                </div>

                {/* Domain Security / Access Scope */}
                <div 
                    onClick={() => navigate('/supplier/settings')}
                    className="p-5 ppos-surface border ppos-border flex flex-col justify-between hover:border-slate-400 dark:hover:border-zinc-700 cursor-pointer transition-colors"
                >
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">
                            {t('supplier.dashboard.scopeCard') || 'Verified Tenancy'}
                        </span>
                        <ShieldCheckIcon className="w-5 h-5 text-emerald-500" />
                    </div>
                    <div className="mt-3">
                        <span className="text-sm font-black text-emerald-500 uppercase tracking-wider">
                            {t('supplier.dashboard.scopeActive') || 'Authorized Scope'}
                        </span>
                        <p className="text-[10px] text-zinc-400 mt-1">
                            {profile?.tenantId || user?.tenantId || 'Active supplier tenancy'}
                        </p>
                    </div>
                </div>
            </div>

            {/* Quick Actions & Guidance Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-6 ppos-surface border ppos-border space-y-3">
                    <h2 className="text-sm font-black uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-2">
                        <RectangleStackIcon className="w-4 h-4 text-red-600" />
                        {t('supplier.dashboard.quickCatalogTitle') || 'Technical Catalog Management'}
                    </h2>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                        {t('supplier.dashboard.quickCatalogDesc') || 'Import normalized paper data sheets (ODS, XLSX, CSV RFC 4180). Review ambiguous dimensions, resolve grammage conflicts, and confirm technical variants.'}
                    </p>
                    <div className="pt-2">
                        <button
                            onClick={() => navigate('/supplier/catalog')}
                            className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold uppercase tracking-wider hover:bg-slate-800 transition-colors"
                        >
                            <span>{t('supplier.dashboard.goToCatalog') || 'Open Technical Catalog'}</span>
                            <ArrowRightIcon className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>

                <div className="p-6 ppos-surface border ppos-border space-y-3">
                    <h2 className="text-sm font-black uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-2">
                        <DocumentTextIcon className="w-4 h-4 text-emerald-500" />
                        {t('supplier.dashboard.quickOffersTitle') || 'Commercial Offer Rate Cards'}
                    </h2>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                        {t('supplier.dashboard.quickOffersDesc') || 'Configure price amounts, order multiples, and MOQ per pricing basis (KG, TONNE, SHEET, THOUSAND_SHEETS, PACK). Maintain full audit trails across price revisions.'}
                    </p>
                    <div className="pt-2">
                        <button
                            onClick={() => navigate('/supplier/catalog')}
                            className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold uppercase tracking-wider hover:bg-slate-800 transition-colors"
                        >
                            <span>{t('supplier.dashboard.goToOffers') || 'Manage Offers & Rates'}</span>
                            <ArrowRightIcon className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
