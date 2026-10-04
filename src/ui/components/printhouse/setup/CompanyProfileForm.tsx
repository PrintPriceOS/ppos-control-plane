/**
 * src/ui/components/printhouse/setup/CompanyProfileForm.tsx
 * 
 * Form for viewing and editing Company Profile canonical domain data in tenants table.
 */
import React, { useState } from 'react';
import { FieldGuidance } from './FieldGuidance';
import { getAuthToken } from '../../../lib/authStore';
import { COUNTRIES, getCountryDisplayName, getCountryName } from '../../../lib/countryCatalog';
import { CountrySelect } from '../../common/CountrySelect';
import { Save, CheckCircle, AlertCircle } from 'lucide-react';
import { useLocale } from '../../../i18n';

interface CompanyData {
    companyName: string;
    legalName: string;
    tradingName: string;
    country: string;
    city: string;
    address: string;
    postalCode: string;
    phone: string;
    website: string;
    contactName: string;
    taxId: string;
    companyRegistrationId: string;
}

export const CompanyProfileForm: React.FC<{ companyData?: CompanyData; onSaved?: () => void }> = ({ companyData, onSaved }) => {
    const { t } = useLocale();
    const [form, setForm] = useState<CompanyData>({
        companyName: companyData?.companyName || '',
        legalName: companyData?.legalName || '',
        tradingName: companyData?.tradingName || '',
        country: companyData?.country || 'ES',
        city: companyData?.city || '',
        address: companyData?.address || '',
        postalCode: companyData?.postalCode || '',
        phone: companyData?.phone || '',
        website: companyData?.website || '',
        contactName: companyData?.contactName || '',
        taxId: companyData?.taxId || '',
        companyRegistrationId: companyData?.companyRegistrationId || ''
    });

    const [loading, setLoading] = useState(false);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setSuccessMsg(null);
        setErrorMsg(null);

        try {
            const token = getAuthToken();
            const res = await fetch('/api/printhouse/onboarding/company-profile', {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(form)
            });

            const data = await res.json();
            if (res.ok && data.ok) {
                setSuccessMsg('Company Profile updated successfully.');
                if (onSaved) onSaved();
            } else {
                setErrorMsg(data.error || 'Failed to update company profile.');
            }
        } catch (err) {
            setErrorMsg('Network error while saving company profile.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-[#27272a] rounded-xl p-7 shadow-sm transition-colors">
            <h2 className="text-lg font-bold text-zinc-900 dark:text-white mb-5">{t('company.title') || 'Company Profile'}</h2>

            {successMsg && (
                <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 p-3 rounded-lg mb-5 flex items-center gap-2 text-xs font-medium">
                    <CheckCircle size={16} className="text-emerald-600 dark:text-emerald-400" /> {successMsg}
                </div>
            )}

            {errorMsg && (
                <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-300 p-3 rounded-lg mb-5 flex items-center gap-2 text-xs font-medium">
                    <AlertCircle size={16} className="text-red-600 dark:text-red-400" /> {errorMsg}
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
                <div>
                    <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                        {t('company.legalName') || 'Legal Company Name'}
                        <FieldGuidance title={t('company.legalName') || 'Legal Company Name'} description="Used for contracts, invoicing, and compliance records. It may differ from the public trading name." />
                    </label>
                    <input
                        type="text"
                        required
                        value={form.legalName}
                        onChange={(e) => setForm({ ...form, legalName: e.target.value, companyName: e.target.value })}
                        className="w-full bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#dc0000] focus:border-[#dc0000] transition-colors"
                    />
                </div>

                <div>
                    <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                        {t('company.tradingName') || 'Trading / Display Name'}
                        <FieldGuidance title={t('company.tradingName') || 'Trading Name'} description="The public brand name displayed to customers in the marketplace." />
                    </label>
                    <input
                        type="text"
                        value={form.tradingName}
                        onChange={(e) => setForm({ ...form, tradingName: e.target.value })}
                        className="w-full bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#dc0000] focus:border-[#dc0000] transition-colors"
                    />
                </div>

                <div>
                    <CountrySelect
                        id="company-primary-country"
                        label={t('company.country') || 'Primary Country'}
                        required
                        value={form.country}
                        onChange={(code) => setForm({ ...form, country: code })}
                        helperText={<FieldGuidance title={t('company.country') || 'Primary Country'} description="Main country of registration and legal operations." />}
                    />
                </div>

                <div>
                    <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                        {t('company.city') || 'City / Municipality'}
                        <FieldGuidance title={t('company.city') || 'City'} description="Headquarters or principal office city." />
                    </label>
                    <input
                        type="text"
                        value={form.city}
                        onChange={(e) => setForm({ ...form, city: e.target.value })}
                        className="w-full bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#dc0000] focus:border-[#dc0000] transition-colors"
                    />
                </div>

                <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                        {t('company.address') || 'Registered Street Address'}
                        <FieldGuidance title={t('company.address') || 'Registered Address'} description="Official address corresponding to tax and incorporation documents." />
                    </label>
                    <input
                        type="text"
                        value={form.address}
                        onChange={(e) => setForm({ ...form, address: e.target.value })}
                        className="w-full bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#dc0000] focus:border-[#dc0000] transition-colors"
                    />
                </div>

                <div>
                    <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                        {t('company.postalCode') || 'Postal Code / ZIP'}
                    </label>
                    <input
                        type="text"
                        value={form.postalCode}
                        onChange={(e) => setForm({ ...form, postalCode: e.target.value })}
                        className="w-full bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#dc0000] focus:border-[#dc0000] transition-colors"
                    />
                </div>

                <div>
                    <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                        {t('company.phone') || 'Official Phone Number'}
                    </label>
                    <input
                        type="tel"
                        value={form.phone}
                        onChange={(e) => setForm({ ...form, phone: e.target.value })}
                        className="w-full bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#dc0000] focus:border-[#dc0000] transition-colors"
                    />
                </div>

                <div>
                    <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                        {t('company.website') || 'Company Website URL'}
                    </label>
                    <input
                        type="url"
                        placeholder="https://..."
                        value={form.website}
                        onChange={(e) => setForm({ ...form, website: e.target.value })}
                        className="w-full bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#dc0000] focus:border-[#dc0000] transition-colors"
                    />
                </div>

                <div>
                    <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                        {t('company.contactName') || 'Primary Contact Name'}
                    </label>
                    <input
                        type="text"
                        value={form.contactName}
                        onChange={(e) => setForm({ ...form, contactName: e.target.value })}
                        className="w-full bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#dc0000] focus:border-[#dc0000] transition-colors"
                    />
                </div>

                <div>
                    <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                        {t('company.taxId') || 'Tax ID / VAT Number'}
                        <FieldGuidance title={t('company.taxId') || 'Tax / VAT ID'} description="Used for cross-border VAT validation and B2B marketplace invoicing." />
                    </label>
                    <input
                        type="text"
                        placeholder="e.g. ESB12345678"
                        value={form.taxId}
                        onChange={(e) => setForm({ ...form, taxId: e.target.value })}
                        className="w-full bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#dc0000] focus:border-[#dc0000] transition-colors"
                    />
                </div>

                <div>
                    <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                        {t('company.registrationId') || 'Company Registration Number (Optional)'}
                        <FieldGuidance title={t('company.registrationId') || 'Registration Number'} description="National commercial register or mercantile registry identification." />
                    </label>
                    <input
                        type="text"
                        value={form.companyRegistrationId}
                        onChange={(e) => setForm({ ...form, companyRegistrationId: e.target.value })}
                        className="w-full bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#dc0000] focus:border-[#dc0000] transition-colors"
                    />
                </div>
            </div>

            <div className="flex justify-end pt-4 border-t border-zinc-200 dark:border-zinc-800">
                <button
                    type="submit"
                    disabled={loading}
                    className="bg-[#dc0000] hover:bg-red-700 text-white font-semibold px-6 py-2.5 rounded-lg text-sm transition-colors shadow-sm disabled:opacity-50 flex items-center gap-2 cursor-pointer"
                >
                    <Save size={16} />
                    <span>{loading ? (t('company.savingBtn') || 'Saving Changes...') : (t('company.saveBtn') || 'Save Company Profile')}</span>
                </button>
            </div>
        </form>
    );
};
