/**
 * src/ui/components/printhouse/onboarding/GuidedStepCompany.tsx
 *
 * Stage A: "Tu imprenta"
 * 
 * Responsibilities:
 * - Collects & confirms essential company identity and primary facility.
 * - Reuses existing account data without duplicate prompts.
 * - Clear, human guidance answering "Why we need this" and "What is saved".
 * - Seamless draft saving and live submission to /api/printhouse/onboarding/company-profile
 *   and /api/printhouse/onboarding/sites.
 */

import React, { useState, useEffect } from 'react';
import { Building2, MapPin, User, Phone, FileCheck, ArrowRight, ArrowLeft, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useLocale } from '../../../i18n';
import { CountrySelect } from '../../common/CountrySelect';
import { getAuthToken } from '../../../lib/authStore';
import { CompanyDraftData } from '../../../lib/onboardingDraftStore';
import { normalizeUiError } from '../../../utils/errorUtils';

interface GuidedStepCompanyProps {
    initialCompany: CompanyDraftData;
    onSaveAndContinue: (data: CompanyDraftData) => Promise<void>;
    onBackToWelcome: () => void;
    onOpenFullSetup?: () => void;
    onDraftChange?: (data: CompanyDraftData) => void;
}

export const GuidedStepCompany: React.FC<GuidedStepCompanyProps> = ({
    initialCompany,
    onSaveAndContinue,
    onBackToWelcome,
    onOpenFullSetup,
    onDraftChange
}) => {
    const { t } = useLocale();
    const [form, setForm] = useState<CompanyDraftData>(initialCompany);
    const [saving, setSaving] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [savedNotice, setSavedNotice] = useState(false);

    useEffect(() => {
        setForm(initialCompany);
    }, [initialCompany]);

    const handleChange = (field: keyof CompanyDraftData, value: string) => {
        setForm(prev => {
            const currentEdited = prev.userEditedFields || [];
            const userEditedFields = currentEdited.includes(field) ? currentEdited : [...currentEdited, field];
            const nextForm: CompanyDraftData = {
                ...prev,
                [field]: value,
                userEditedFields
            };
            onDraftChange?.(nextForm);
            return nextForm;
        });
        setSavedNotice(false);
        setErrorMsg(null);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMsg(null);

        // Validation: Company legal name and city are strictly required by the backend
        if (!form.legalName.trim()) {
            setErrorMsg(t('guided.company.errLegalName') || 'Por favor, introduce el nombre legal o razón social de tu imprenta.');
            return;
        }

        if (!form.country.trim()) {
            setErrorMsg(t('guided.company.errCountry') || 'Por favor, selecciona el país principal de producción.');
            return;
        }

        if (!form.city.trim()) {
            setErrorMsg(t('guided.company.errCity') || 'Por favor, introduce la ciudad de tu primera planta.');
            return;
        }

        setSaving(true);
        try {
            await onSaveAndContinue(form);
            setSavedNotice(true);
        } catch (err: any) {
            setErrorMsg(normalizeUiError(err, t('guided.company.errSave') || 'Hubo un error al guardar los datos de tu imprenta.'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="max-w-3xl mx-auto space-y-6">
            {/* Header / Why this matters */}
            <div className="space-y-1">
                <span className="text-[11px] font-black uppercase tracking-widest text-[#dc0000]">
                    {t('guided.stageA.badge') || 'Etapa 1 de 4 · Tu imprenta'}
                </span>
                <h2 className="text-2xl sm:text-3xl font-black text-zinc-900 dark:text-zinc-100 tracking-tight">
                    {t('guided.stageA.title') || 'Datos básicos de tu empresa y taller'}
                </h2>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    {t('guided.stageA.subtitle') || 'Necesitamos esta información para asociar tus tarifas, calcular el transporte y preparar los presupuestos.'}
                </p>
            </div>

            {errorMsg && (
                <div role="alert" className="p-4 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-red-800 dark:text-red-300 flex items-start gap-3 text-xs font-medium">
                    <AlertCircle size={18} className="text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                        <span className="font-bold">{t('common.attention') || 'Atención'}:</span> {errorMsg}
                    </div>
                </div>
            )}

            {savedNotice && (
                <div role="status" className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 flex items-center gap-2.5 text-xs font-semibold">
                    <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span>{t('guided.company.savedSuccess') || 'Datos guardados correctamente.'}</span>
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
                {/* Card 1: Identidad Legal y Comercial */}
                <div className="bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 sm:p-6 shadow-2xs space-y-4">
                    <div className="flex items-center gap-2.5 pb-3 border-b border-zinc-100 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100">
                        <Building2 size={18} className="text-[#dc0000]" />
                        <h3 className="text-sm font-bold">
                            {t('guided.company.sectionLegal') || 'Identidad de la imprenta'}
                        </h3>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="sm:col-span-2">
                            <label htmlFor="company-legal-name" className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                                {t('company.legalName') || 'Razón social o Nombre legal'} <span className="text-[#dc0000]">*</span>
                            </label>
                            <input
                                id="company-legal-name"
                                type="text"
                                required
                                value={form.legalName}
                                onChange={(e) => handleChange('legalName', e.target.value)}
                                placeholder="Ej: Artes Gráficas del Norte S.L."
                                className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-900/80 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-[#dc0000]/30 focus:border-[#dc0000] transition-colors"
                            />
                            <p className="text-[11px] text-zinc-500 mt-1">
                                {t('guided.company.legalNameHint') || 'Figura en contratos y albaranes oficiales.'}
                            </p>
                        </div>

                        <div>
                            <label htmlFor="company-trading-name" className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                                {t('company.tradingName') || 'Nombre comercial / Marca'}
                            </label>
                            <input
                                id="company-trading-name"
                                type="text"
                                value={form.tradingName}
                                onChange={(e) => handleChange('tradingName', e.target.value)}
                                placeholder="Ej: GrafiNorte"
                                className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-900/80 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-[#dc0000]/30 focus:border-[#dc0000] transition-colors"
                            />
                        </div>

                        <div>
                            <label htmlFor="company-tax-id" className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                                {t('company.taxId') || 'NIF / CIF / VAT ID'}
                            </label>
                            <input
                                id="company-tax-id"
                                type="text"
                                value={form.taxId}
                                onChange={(e) => handleChange('taxId', e.target.value)}
                                placeholder="Ej: B12345678 o DE123456789"
                                className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-900/80 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-[#dc0000]/30 focus:border-[#dc0000] transition-colors"
                            />
                        </div>
                    </div>
                </div>

                {/* Card 2: Contacto y Ubicación de la Planta */}
                <div className="bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 sm:p-6 shadow-2xs space-y-4">
                    <div className="flex items-center gap-2.5 pb-3 border-b border-zinc-100 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100">
                        <MapPin size={18} className="text-[#dc0000]" />
                        <h3 className="text-sm font-bold">
                            {t('guided.company.sectionSite') || 'Ubicación de tu planta de producción'}
                        </h3>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <CountrySelect
                                id="company-country-select"
                                label={t('company.country') || 'País principal'}
                                required
                                value={form.country}
                                onChange={(code) => handleChange('country', code)}
                            />
                        </div>

                        <div>
                            <label htmlFor="company-site-city" className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                                {t('company.city') || 'Ciudad / Municipio'} <span className="text-[#dc0000]">*</span>
                            </label>
                            <input
                                id="company-site-city"
                                type="text"
                                required
                                value={form.city}
                                onChange={(e) => handleChange('city', e.target.value)}
                                placeholder="Ej: Valencia o Frankfurt"
                                className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-900/80 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-[#dc0000]/30 focus:border-[#dc0000] transition-colors"
                            />
                        </div>

                        <div>
                            <label htmlFor="company-site-name" className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                                {t('guided.company.siteNameLabel') || 'Nombre de la sede o planta'}
                            </label>
                            <input
                                id="company-site-name"
                                type="text"
                                value={form.siteName || ''}
                                onChange={(e) => handleChange('siteName', e.target.value)}
                                placeholder="Ej: Planta Principal o Taller Central"
                                className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-900/80 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-[#dc0000]/30 focus:border-[#dc0000] transition-colors"
                            />
                            <p className="text-[11px] text-zinc-500 mt-1">
                                {t('guided.company.sitesNotice') || 'Podrás añadir plantas adicionales desde la configuración completa.'}
                            </p>
                        </div>

                        <div>
                            <label htmlFor="company-contact-name" className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                                {t('company.contactName') || 'Persona de contacto'}
                            </label>
                            <input
                                id="company-contact-name"
                                type="text"
                                value={form.contactName}
                                onChange={(e) => handleChange('contactName', e.target.value)}
                                placeholder="Ej: Carlos Martínez"
                                className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-900/80 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-[#dc0000]/30 focus:border-[#dc0000] transition-colors"
                            />
                        </div>

                        <div>
                            <label htmlFor="company-phone" className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                                {t('company.phone') || 'Teléfono directo'}
                            </label>
                            <input
                                id="company-phone"
                                type="tel"
                                value={form.phone}
                                onChange={(e) => handleChange('phone', e.target.value)}
                                placeholder="+34 912 345 678"
                                className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-900/80 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-[#dc0000]/30 focus:border-[#dc0000] transition-colors"
                            />
                        </div>

                        <div>
                            <label htmlFor="company-website" className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                                {t('company.website') || 'Sitio web'}
                            </label>
                            <input
                                id="company-website"
                                type="url"
                                value={form.website}
                                onChange={(e) => handleChange('website', e.target.value)}
                                placeholder="https://www.tuimprenta.com"
                                className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-900/80 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-[#dc0000]/30 focus:border-[#dc0000] transition-colors"
                            />
                        </div>
                    </div>
                </div>

                {/* Footer Controls: Back, Save & Continue, and Access to Full Setup */}
                <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-3 pt-3">
                    <button
                        type="button"
                        onClick={onBackToWelcome}
                        className="px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-bold transition-colors flex items-center justify-center gap-2 cursor-pointer"
                    >
                        <ArrowLeft size={15} />
                        <span>{t('guided.action.back') || 'Volver a bienvenida'}</span>
                    </button>

                    <div className="flex items-center gap-3 w-full sm:w-auto">
                        {onOpenFullSetup && (
                            <button
                                type="button"
                                onClick={onOpenFullSetup}
                                className="px-3.5 py-2.5 rounded-xl text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 text-xs font-semibold transition-colors cursor-pointer"
                            >
                                {t('guided.action.openFullSetup') || 'Abrir configuración completa'}
                            </button>
                        )}
                        <button
                            type="submit"
                            disabled={saving}
                            className="flex-1 sm:flex-initial px-6 py-2.5 rounded-xl bg-[#dc0000] hover:bg-[#b50000] text-white text-xs font-bold shadow-xs hover:shadow transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                        >
                            {saving ? (
                                <>
                                    <RefreshCw size={15} className="animate-spin" />
                                    <span>{t('common.saving') || 'Guardando...'}</span>
                                </>
                            ) : (
                                <>
                                    <span>{t('guided.action.continueToProducts') || 'Guardar y elegir qué produces'}</span>
                                    <ArrowRight size={15} />
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </form>
        </div>
    );
};
