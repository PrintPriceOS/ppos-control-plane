import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    RectangleStackIcon, 
    InboxIcon, 
    ShieldCheckIcon,
    DocumentTextIcon,
    ExclamationTriangleIcon,
    ArrowRightIcon
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

export const SupplierDashboardPage: React.FC = () => {
    const { t } = useLocale();
    const navigate = useNavigate();
    const role = getUserRole();
    const user = getAuthUser();
    const userId = user?.id || user?.userId || user?.sub || user?.email || '';
    const tenantId = user?.tenantId || getUserTenantId() || '';
    const supplierId = user?.supplierId || getUserSupplierId() || '';
    const activeContext = getActiveContext() || '';

    const [profile, setProfile] = useState<any>(null);
    const [stats, setStats] = useState<{
        catalogVariants: number;
        offers: { total: number; active: number };
        pendingRequests: number;
        activeOrders: number;
        completedOrders: number;
    } | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let isMounted = true;
        setLoading(true);
        setError(null);

        const fetchMetrics = async () => {
            try {
                const [meResult, statsResult] = await Promise.allSettled([
                    paperSupplierFetch<any>('/api/v1/paper-suppliers/me'),
                    paperSupplierFetch<any>('/api/v1/paper-suppliers/dashboard/stats')
                ]);

                if (!isMounted) return;

                const errors: string[] = [];

                if (meResult.status === 'fulfilled' && meResult.value?.ok && meResult.value?.data) {
                    setProfile(meResult.value.data);
                } else {
                    setProfile(null);
                    const meErr = meResult.status === 'rejected'
                        ? meResult.reason?.message
                        : meResult.value?.error?.message;
                    if (meErr) errors.push(meErr);
                }

                if (statsResult.status === 'fulfilled' && statsResult.value?.ok && statsResult.value?.data) {
                    setStats(statsResult.value.data);
                } else {
                    setStats(null);
                    const statsErr = statsResult.status === 'rejected'
                        ? statsResult.reason?.message
                        : statsResult.value?.error?.message;
                    if (statsErr) errors.push(statsErr);
                }

                if (errors.length > 0) {
                    setError(Array.from(new Set(errors)).join(' | '));
                }
            } catch (err: any) {
                if (!isMounted) return;
                setError(err.message || t('supplier.dashboard.loadError') || 'Failed to load supplier dashboard metrics');
            } finally {
                if (isMounted) {
                    setLoading(false);
                }
            }
        };

        fetchMetrics();

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
                            {t('supplier.dashboard.hubBadge') || 'Paper Supplier Hub'}
                        </span>
                        <span className="px-3 py-0.5 text-xs font-medium rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
                            {t('supplier.dashboard.operationsTag') || 'Operations Console'}
                        </span>
                    </div>
                    <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                        {loading ? '...' : (profile?.name || user?.companyName || (t('common.notAvailable') || 'No disponible'))}
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
                            {t('supplier.dashboard.role') || 'Role'}
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

            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Published Catalog */}
                <div 
                    onClick={() => navigate('/supplier/catalog')}
                    className="p-6 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xs hover:shadow-md hover:border-zinc-300 dark:hover:border-zinc-700 flex flex-col justify-between cursor-pointer transition-all"
                >
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                            {t('supplier.dashboard.catalogCard') || 'Published Catalog'}
                        </span>
                        <div className="p-2 rounded-xl bg-zinc-50 dark:bg-zinc-800/60">
                            <RectangleStackIcon className="w-5 h-5 text-zinc-400" />
                        </div>
                    </div>
                    <div className="mt-4">
                        <span className={`font-black ${stats?.catalogVariants !== undefined ? 'text-3xl font-mono' : 'text-base font-sans text-zinc-400'} text-slate-900 dark:text-white`}>
                            {loading ? '...' : (stats?.catalogVariants !== undefined ? stats.catalogVariants : (t('common.notAvailable') || 'No disponible'))}
                        </span>
                        <p className="text-xs text-zinc-400 mt-1">
                            {t('supplier.dashboard.catalogCardDesc') || 'Active technical variants'}
                        </p>
                    </div>
                </div>

                {/* Commercial Offers */}
                <div 
                    onClick={() => navigate('/supplier/catalog?tab=offers')}
                    className="p-6 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xs hover:shadow-md hover:border-zinc-300 dark:hover:border-zinc-700 flex flex-col justify-between cursor-pointer transition-all"
                >
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                            {t('supplier.dashboard.offersCard') || 'Commercial Offers'}
                        </span>
                        <div className="p-2 rounded-xl bg-zinc-50 dark:bg-zinc-800/60">
                            <DocumentTextIcon className="w-5 h-5 text-zinc-400" />
                        </div>
                    </div>
                    <div className="mt-4">
                        <span className={`font-black ${stats?.offers?.active !== undefined ? 'text-3xl font-mono' : 'text-base font-sans text-zinc-400'} text-slate-900 dark:text-white`}>
                            {loading ? '...' : (stats?.offers?.active !== undefined ? stats.offers.active : (t('common.notAvailable') || 'No disponible'))}
                        </span>
                        <p className="text-xs text-zinc-400 mt-1">
                            {stats?.offers ? `${stats.offers.total} ${t('supplier.dashboard.totalRates') || 'total rates'}` : (t('supplier.dashboard.offersCardDesc') || 'Configured rates & MOQ')}
                        </p>
                    </div>
                </div>

                {/* Open RFQs / Demands */}
                <div 
                    onClick={() => navigate('/supplier/orders?status=SUBMITTED')}
                    className="p-6 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xs hover:shadow-md hover:border-zinc-300 dark:hover:border-zinc-700 flex flex-col justify-between cursor-pointer transition-all"
                >
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                            {t('supplier.dashboard.rfqCard') || 'Pending Requests'}
                        </span>
                        <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/40">
                            <InboxIcon className="w-5 h-5 text-amber-500" />
                        </div>
                    </div>
                    <div className="mt-4">
                        <span className={`font-black ${stats?.pendingRequests !== undefined ? 'text-3xl font-mono' : 'text-base font-sans text-zinc-400'} text-slate-900 dark:text-white`}>
                            {loading ? '...' : (stats?.pendingRequests !== undefined ? stats.pendingRequests : (t('common.notAvailable') || 'No disponible'))}
                        </span>
                        <p className="text-xs text-zinc-400 mt-1">
                            {t('supplier.dashboard.rfqCardDesc') || 'Awaiting quote or confirmation'}
                        </p>
                    </div>
                </div>

                {/* Orders in Fulfillment */}
                <div 
                    onClick={() => navigate('/supplier/orders')}
                    className="p-6 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xs hover:shadow-md hover:border-zinc-300 dark:hover:border-zinc-700 flex flex-col justify-between cursor-pointer transition-all"
                >
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                            {t('supplier.dashboard.activeOrdersCard') || 'Active Orders'}
                        </span>
                        <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/40">
                            <ShieldCheckIcon className="w-5 h-5 text-blue-500" />
                        </div>
                    </div>
                    <div className="mt-4">
                        <span className={`font-black ${stats?.activeOrders !== undefined ? 'text-3xl font-mono' : 'text-base font-sans text-zinc-400'} text-slate-900 dark:text-white`}>
                            {loading ? '...' : (stats?.activeOrders !== undefined ? stats.activeOrders : (t('common.notAvailable') || 'No disponible'))}
                        </span>
                        <p className="text-xs text-zinc-400 mt-1">
                            {stats?.completedOrders !== undefined ? `${stats.completedOrders} ${t('supplier.dashboard.completedOrders') || 'completed'}` : (t('supplier.dashboard.activeOrdersDesc') || 'In fulfillment / dispatch')}
                        </p>
                    </div>
                </div>
            </div>

            {/* Quick Actions & Guidance Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-6 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xs space-y-4">
                    <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-red-50 dark:bg-red-950/40">
                            <RectangleStackIcon className="w-4 h-4 text-red-600" />
                        </div>
                        {t('supplier.dashboard.quickCatalogTitle') || 'Technical Catalog Management'}
                    </h2>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                        {t('supplier.dashboard.quickCatalogDesc') || 'Import normalized paper data sheets (ODS, XLSX, CSV RFC 4180). Review ambiguous dimensions, resolve grammage conflicts, and confirm technical variants.'}
                    </p>
                    <div className="pt-2">
                        <button
                            onClick={() => navigate('/supplier/catalog')}
                            className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-semibold rounded-xl hover:bg-slate-800 dark:hover:bg-zinc-100 transition-colors shadow-2xs cursor-pointer"
                        >
                            <span>{t('supplier.dashboard.goToCatalog') || 'Open Technical Catalog'}</span>
                            <ArrowRightIcon className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>

                <div className="p-6 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xs space-y-4">
                    <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40">
                            <DocumentTextIcon className="w-4 h-4 text-emerald-500" />
                        </div>
                        {t('supplier.dashboard.quickOffersTitle') || 'Commercial Offer Rate Cards'}
                    </h2>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                        {t('supplier.dashboard.quickOffersDesc') || 'Configure price amounts, order multiples, and MOQ per pricing basis (KG, TONNE, SHEET, THOUSAND_SHEETS, PACK). Maintain full audit trails across price revisions.'}
                    </p>
                    <div className="pt-2">
                        <button
                            onClick={() => navigate('/supplier/catalog')}
                            className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-semibold rounded-xl hover:bg-slate-800 dark:hover:bg-zinc-100 transition-colors shadow-2xs cursor-pointer"
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
