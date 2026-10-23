import React, { useEffect, useState } from 'react';
import { 
    BuildingOfficeIcon, 
    CurrencyEuroIcon, 
    ShieldCheckIcon,
    ExclamationTriangleIcon,
    CheckCircleIcon,
    ArrowPathIcon,
    LockClosedIcon
} from '@heroicons/react/24/outline';
import { paperSupplierFetch, SupplierApiError } from '../../lib/paperSupplierApi';
import { 
    getUserRole, 
    getAuthUser, 
    getUserTenantId, 
    getUserSupplierId, 
    getActiveContext 
} from '../../lib/authStore';
import { useLocale } from '../../i18n';
import { CountrySelect } from '../../components/common/CountrySelect';
import { TimezoneSelect } from '../../components/common/TimezoneSelect';

export const SupplierSettingsPage: React.FC = () => {
    const { t } = useLocale();
    const role = getUserRole();
    const user = getAuthUser();
    const userId = user?.id || user?.userId || user?.sub || user?.email || '';
    const tenantId = user?.tenantId || getUserTenantId() || '';
    const supplierId = user?.supplierId || getUserSupplierId() || '';
    const activeContext = getActiveContext() || '';

    const isViewer = role === 'SUPPLIER_VIEWER';

    const [profile, setProfile] = useState<any>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    // Editable form state for authorized fields
    const [name, setName] = useState<string>('');
    const [contactEmail, setContactEmail] = useState<string>('');
    const [phone, setPhone] = useState<string>('');
    const [address, setAddress] = useState<string>('');
    const [country, setCountry] = useState<string>('');
    const [timezone, setTimezone] = useState<string>('Europe/Madrid');

    const [saving, setSaving] = useState<boolean>(false);
    const [saveFeedback, setSaveFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

    const getStatusLabel = (st?: string) => {
        if (!st) return t('common.notAvailable') || 'No disponible';
        const key = `status.${st.toLowerCase()}`;
        const translated = t(key as any);
        if (translated && translated !== key) return translated;
        const statusMap: Record<string, string> = {
            ACTIVE: 'Activo',
            APPROVED: 'Aprobado',
            SUSPENDED: 'Suspendido',
            PENDING_REVIEW: 'En revisión'
        };
        return statusMap[st] || st;
    };

    const getRoleLabel = (r?: string) => {
        if (!r) return t('common.notAvailable') || 'No disponible';
        return t(`role.${r}` as any) || r;
    };

    useEffect(() => {
        let isMounted = true;
        setLoading(true);
        setError(null);

        const fetchProfile = async () => {
            try {
                const res = await paperSupplierFetch<any>('/api/v1/paper-suppliers/me');
                if (!isMounted) return;

                if (res && res.ok && res.data) {
                    const d = res.data;
                    setProfile(d);
                    setName(d.name || '');
                    setContactEmail(d.contactEmail || '');
                    setPhone(d.phone || '');
                    setAddress(d.address || '');
                    setCountry(d.country || 'ES');
                    setTimezone(d.timezone || 'Europe/Madrid');
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

    const handleSaveProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isViewer) return;

        setSaving(true);
        setSaveFeedback(null);

        try {
            const res = await paperSupplierFetch<any>('/api/v1/paper-suppliers/profile', {
                method: 'PATCH',
                body: JSON.stringify({
                    name: name.trim(),
                    contactEmail: contactEmail.trim(),
                    phone: phone.trim(),
                    address: address.trim(),
                    country: country.trim(),
                    timezone: timezone.trim()
                })
            });

            if (res && res.ok && res.data) {
                setProfile((prev: any) => ({ ...prev, ...res.data }));
                setSaveFeedback({
                    type: 'success',
                    message: t('supplier.settings.saveSuccess') || 'Profile details updated successfully.'
                });
                setTimeout(() => setSaveFeedback(null), 4000);
            } else {
                setSaveFeedback({
                    type: 'error',
                    message: res?.error?.message || t('supplier.settings.saveError') || 'Failed to update profile.'
                });
            }
        } catch (err: any) {
            setSaveFeedback({
                type: 'error',
                message: err.message || t('supplier.settings.saveError') || 'Failed to update profile.'
            });
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-200 dark:border-zinc-800 pb-5">
                <div>
                    <div className="flex items-center gap-2 mb-2">
                        <span className="px-3 py-0.5 text-xs font-semibold rounded-full bg-[#dc0000] text-white shadow-xs">
                            {t('supplier.settings.badge') || 'Paper Supplier Hub'}
                        </span>
                        <span className="px-3 py-0.5 text-xs font-medium rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
                            {t('supplier.settings.verifiedTag') || 'Verified Profile'}
                        </span>
                    </div>
                    <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                        {t('supplier.settings.title') || 'Supplier Organization Profile'}
                    </h1>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1 font-medium">
                        {t('supplier.settings.subtitle') || 'Registered organization identity, approved trading currencies, and governance capabilities.'}
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <div className="text-right">
                        <p className="text-[10px] font-bold uppercase text-zinc-500 dark:text-zinc-400 tracking-wider">
                            {t('supplier.settings.statusLabel') || 'Account Status'}
                        </p>
                        <p className={`text-xs font-black uppercase tracking-wider ${
                            profile?.status === 'APPROVED' || profile?.status === 'ACTIVE'
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : profile?.status === 'SUSPENDED'
                                    ? 'text-red-600 dark:text-red-400'
                                    : 'text-zinc-500 dark:text-zinc-400'
                        }`}>
                            {loading ? '...' : getStatusLabel(profile?.status)}
                        </p>
                    </div>
                    <div className="h-8 w-[1px] bg-zinc-200 dark:bg-zinc-800" />
                    <div className="text-right">
                        <p className="text-[10px] font-bold uppercase text-zinc-500 dark:text-zinc-400 tracking-wider">
                            {t('supplier.settings.roleLabel') || 'Role'}
                        </p>
                        <p className="text-xs font-black text-slate-800 dark:text-zinc-200 uppercase tracking-wider">
                            {getRoleLabel(role)}
                        </p>
                    </div>
                </div>
            </div>

            {error && (
                <div className="p-4 bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-xs rounded-xl flex items-center gap-2">
                    <ExclamationTriangleIcon className="w-5 h-5 shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            {isViewer && (
                <div className="p-3 bg-amber-500/10 border-l-2 border-amber-500 text-xs text-amber-700 dark:text-amber-400 font-medium rounded-r-xl flex items-center gap-2">
                    <LockClosedIcon className="w-4 h-4 shrink-0 text-amber-600" />
                    <span>{t('supplier.hub.viewerReadOnly') || 'Modo solo lectura: Acceso restringido (SUPPLIER_VIEWER).'}</span>
                </div>
            )}

            {saveFeedback && (
                <div className={`p-4 rounded-xl text-xs flex items-center gap-2 ${
                    saveFeedback.type === 'success'
                        ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400'
                        : 'bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400'
                }`}>
                    {saveFeedback.type === 'success' ? (
                        <CheckCircleIcon className="w-5 h-5 shrink-0" />
                    ) : (
                        <ExclamationTriangleIcon className="w-5 h-5 shrink-0" />
                    )}
                    <span>{saveFeedback.message}</span>
                </div>
            )}

            {/* Profile Information & Edit Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Main Editable Form (2 Cols) */}
                <form onSubmit={handleSaveProfile} className="lg:col-span-2 p-6 sm:p-8 bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xs space-y-6">
                    <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-3">
                        <div className="flex items-center gap-2.5">
                            <div className="p-2 rounded-xl bg-red-50 dark:bg-red-950/40 text-[#dc0000]">
                                <BuildingOfficeIcon className="w-5 h-5" />
                            </div>
                            <div>
                                <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                                    {profile?.name ? profile.name : (t('supplier.settings.orgCardTitle') || 'Corporate Identity & Contact')}
                                </h2>
                                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                                    {t('supplier.settings.editNotice') || 'Authorized operational contact data for buyer communications.'}
                                </p>
                            </div>
                        </div>

                        {!isViewer && (
                            <button
                                type="submit"
                                disabled={saving || loading}
                                className="inline-flex items-center gap-2 px-4 py-2 bg-[#dc0000] hover:bg-[#b00000] text-white text-xs font-bold rounded-xl transition-colors cursor-pointer shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {saving && <ArrowPathIcon className="w-4 h-4 animate-spin" />}
                                <span>{saving ? (t('supplier.settings.saving') || 'Guardando...') : (t('supplier.settings.save') || 'Guardar Cambios')}</span>
                            </button>
                        )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                        <div>
                            <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 mb-1.5">
                                {t('supplier.settings.companyName') || 'Company Name'} *
                            </label>
                            <input
                                type="text"
                                value={name}
                                onChange={e => setName(e.target.value)}
                                disabled={isViewer || loading}
                                required
                                placeholder="e.g. Antalis International"
                                className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#dc0000]/30 focus:border-[#dc0000] disabled:bg-zinc-100 dark:disabled:bg-zinc-800 disabled:cursor-not-allowed font-medium"
                            />
                        </div>

                        <div>
                            <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 mb-1.5">
                                {t('supplier.settings.contactEmail') || 'Registered Contact Email'} *
                            </label>
                            <input
                                type="email"
                                value={contactEmail}
                                onChange={e => setContactEmail(e.target.value)}
                                disabled={isViewer || loading}
                                required
                                placeholder="orders@supplier.com"
                                className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#dc0000]/30 focus:border-[#dc0000] disabled:bg-zinc-100 dark:disabled:bg-zinc-800 disabled:cursor-not-allowed font-mono text-xs"
                            />
                        </div>

                        <div>
                            <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 mb-1.5">
                                {t('supplier.settings.phone') || 'Contact Telephone'}
                            </label>
                            <input
                                type="text"
                                value={phone}
                                onChange={e => setPhone(e.target.value)}
                                disabled={isViewer || loading}
                                placeholder="+34 91 123 4567"
                                className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#dc0000]/30 focus:border-[#dc0000] disabled:bg-zinc-100 dark:disabled:bg-zinc-800 disabled:cursor-not-allowed font-medium"
                            />
                        </div>

                        <div>
                            <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 mb-1.5">
                                {t('supplier.settings.address') || 'Commercial / Warehouse Address'}
                            </label>
                            <input
                                type="text"
                                value={address}
                                onChange={e => setAddress(e.target.value)}
                                disabled={isViewer || loading}
                                placeholder="Calle Logística 12, Polígono Industrial"
                                className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#dc0000]/30 focus:border-[#dc0000] disabled:bg-zinc-100 dark:disabled:bg-zinc-800 disabled:cursor-not-allowed font-medium"
                            />
                        </div>

                        <div>
                            <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 mb-1.5">
                                {t('supplier.settings.country') || 'Operating Country'}
                            </label>
                            <CountrySelect
                                value={country}
                                onChange={setCountry}
                                disabled={isViewer || loading}
                            />
                        </div>

                        <div>
                            <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 mb-1.5">
                                {t('supplier.settings.timezone') || 'Operational Timezone'}
                            </label>
                            <TimezoneSelect
                                value={timezone}
                                onChange={setTimezone}
                                countryCode={country}
                                disabled={isViewer || loading}
                            />
                        </div>
                    </div>
                </form>

                {/* Governed Read-Only System Identity & Currencies (1 Col) */}
                <div className="space-y-6">
                    {/* Tenancy & Identifiers */}
                    <div className="p-6 bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xs space-y-4">
                        <div className="flex items-center gap-2 border-b border-zinc-200 dark:border-zinc-800 pb-3">
                            <ShieldCheckIcon className="w-5 h-5 text-zinc-500" />
                            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                                {t('supplier.settings.governedIdentifiers') || 'System Governance'}
                            </h2>
                        </div>

                        <div className="space-y-3.5 text-xs">
                            <div>
                                <span className="text-[10px] font-bold uppercase text-zinc-500 dark:text-zinc-400 tracking-wider">
                                    {t('supplier.settings.supplierId') || 'Supplier Organization ID'}
                                </span>
                                <p className="font-mono text-xs font-bold text-zinc-800 dark:text-zinc-200 mt-0.5 select-all">
                                    {loading ? '...' : (profile?.supplierId || supplierId || (t('common.notAvailable') || 'No disponible'))}
                                </p>
                            </div>

                            <div>
                                <span className="text-[10px] font-bold uppercase text-zinc-500 dark:text-zinc-400 tracking-wider">
                                    {t('supplier.settings.tenantId') || 'Tenancy Scope'}
                                </span>
                                <p className="font-mono text-xs text-zinc-600 dark:text-zinc-300 mt-0.5 select-all">
                                    {loading ? '...' : (profile?.tenantId || tenantId || (t('common.notAvailable') || 'No disponible'))}
                                </p>
                            </div>

                            <div>
                                <span className="text-[10px] font-bold uppercase text-zinc-500 dark:text-zinc-400 tracking-wider">
                                    {t('supplier.settings.scopeStatus') || 'Governance Scope'}
                                </span>
                                <div className="flex items-center gap-2 mt-1">
                                    <ShieldCheckIcon className={`w-4 h-4 ${profile?.status === 'APPROVED' || profile?.status === 'ACTIVE' ? 'text-emerald-500' : 'text-zinc-400'}`} />
                                    <span className="font-semibold text-slate-800 dark:text-zinc-200">
                                        {loading ? '...' : (profile ? (t('supplier.settings.approvedSupplier') || 'Approved Paper Supplier (PAPER_SUPPLIER)') : (t('common.notAvailable') || 'No disponible'))}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Commercial & Currency Capabilities */}
                    <div className="p-6 bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xs space-y-4">
                        <div className="flex items-center gap-2 border-b border-zinc-200 dark:border-zinc-800 pb-3">
                            <div className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40">
                                <CurrencyEuroIcon className="w-5 h-5 text-emerald-500" />
                            </div>
                            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                                {t('supplier.settings.commercialCardTitle') || 'Trading Conditions & Currencies'}
                            </h2>
                        </div>

                        <div className="space-y-3.5 text-xs">
                            <div>
                                <span className="text-[10px] font-bold uppercase text-zinc-500 dark:text-zinc-400 tracking-wider">
                                    {t('supplier.settings.currencies') || 'Approved Trading Currencies'}
                                </span>
                                <div className="flex flex-wrap gap-2 mt-1.5">
                                    {loading ? (
                                        <span className="text-xs text-zinc-400">...</span>
                                    ) : profile?.currencies && Array.isArray(profile.currencies) && profile.currencies.length > 0 ? (
                                        profile.currencies.map((cur: string) => (
                                            <span key={cur} className="px-3 py-1 text-xs font-mono font-bold bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 rounded-full border border-zinc-200 dark:border-zinc-700">
                                                {cur}
                                            </span>
                                        ))
                                    ) : (
                                        <span className="text-xs text-zinc-500 dark:text-zinc-400">
                                            {t('common.notAvailable') || 'No disponible'}
                                        </span>
                                    )}
                                </div>
                            </div>

                            <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800 text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed italic">
                                {t('supplier.settings.readOnlyNote') || 'To modify corporate registration data or add trading currencies, contact the platform governance team.'}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
