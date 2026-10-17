/**
 * src/ui/components/printhouse/onboarding/GuidedStepProducts.tsx
 *
 * Stage B: "Qué produces"
 *
 * Responsibilities:
 * - Large iconography cards with clean human labels for the 4 canonical families:
 *   Tapa dura, Rústica, Wire-O, Grapado.
 * - Allows selecting only what the printhouse actually manufactures.
 * - Relevant questions per selection without hallucinating technical machinery or materials.
 * - Zero real customer names/jobs as canned templates.
 */

import React from 'react';
import { Layers, ArrowRight, ArrowLeft, Info, Check, ShieldCheck } from 'lucide-react';
import { useLocale } from '../../../i18n';
import { ProductFamilyId, FamilyState } from '../../../types/printhouseOnboardingTypes';
import { BindingIcon } from './BindingFamilyIcons';

interface GuidedStepProductsProps {
    families: Record<ProductFamilyId, FamilyState>;
    enabledFamilies: Record<ProductFamilyId, boolean>;
    selectedFamilyId: ProductFamilyId;
    onToggleFamily: (familyId: ProductFamilyId) => void;
    onSelectActiveFamily: (familyId: ProductFamilyId) => void;
    onContinueToPricing: () => void;
    onBackToCompany: () => void;
    onOpenFullSetup?: () => void;
}

const FAMILY_DEFINITIONS: Array<{
    id: ProductFamilyId;
    titleKey: string;
    descKey: string;
    capabilitiesHint: string;
}> = [
    {
        id: 'HARDCOVER',
        titleKey: 'family.hardcover.title',
        descKey: 'family.hardcover.desc',
        capabilitiesHint: 'Encuadernación en tapa dura con cartón rígido (alrededor de 2.0 - 2.5 mm), guardas y montaje.'
    },
    {
        id: 'SOFTCOVER',
        titleKey: 'family.softcover.title',
        descKey: 'family.softcover.desc',
        capabilitiesHint: 'Cubierta flexible hendida con encolado fresado PUR o cosido con hilo vegetal.'
    },
    {
        id: 'WIRE_O',
        titleKey: 'family.wireO.title',
        descKey: 'family.wireO.desc',
        capabilitiesHint: 'Perforado de hojas y encuadernación con doble anilla metálica Wire-O para apertura plana 360°.'
    },
    {
        id: 'SADDLE_STITCH',
        titleKey: 'family.saddleStitch.title',
        descKey: 'family.saddleStitch.desc',
        capabilitiesHint: 'Plegado de pliegos encartados y cosido con dos grapas de alambre al caballete.'
    }
];

export const GuidedStepProducts: React.FC<GuidedStepProductsProps> = ({
    families,
    enabledFamilies,
    selectedFamilyId,
    onToggleFamily,
    onSelectActiveFamily,
    onContinueToPricing,
    onBackToCompany,
    onOpenFullSetup
}) => {
    const { t } = useLocale();
    const activeCount = Object.values(enabledFamilies).filter(Boolean).length;

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            {/* Header */}
            <div className="space-y-1">
                <span className="text-[11px] font-black uppercase tracking-widest text-[#dc0000]">
                    {t('guided.stageB.badge') || 'Etapa 2 de 4 · Qué produces'}
                </span>
                <h2 className="text-2xl sm:text-3xl font-black text-zinc-900 dark:text-zinc-100 tracking-tight">
                    {t('guided.stageB.title') || '¿Qué tipos de producto fabrica tu imprenta?'}
                </h2>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    {t('guided.stageB.subtitle') || 'Marca las familias de encuadernación que realizáis en vuestro taller. Puedes empezar con una y añadir más en cualquier momento.'}
                </p>
            </div>

            {/* 4 Large Iconography Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {FAMILY_DEFINITIONS.map(def => {
                    const isEnabled = Boolean(enabledFamilies[def.id]);
                    const isFocus = selectedFamilyId === def.id;

                    return (
                        <div
                            key={def.id}
                            className={`p-5 rounded-2xl border-2 transition-all flex flex-col justify-between bg-white dark:bg-[#18181b] ${
                                isEnabled
                                    ? isFocus
                                        ? 'border-[#dc0000] ring-2 ring-[#dc0000]/20 shadow-sm'
                                        : 'border-zinc-300 dark:border-zinc-700 hover:border-zinc-400'
                                    : 'border-dashed border-zinc-200 dark:border-zinc-800 opacity-60 hover:opacity-90'
                            }`}
                        >
                            <div className="space-y-3">
                                <div className="flex items-start justify-between gap-3">
                                    <div className={`p-3 rounded-2xl border transition-colors ${
                                        isEnabled 
                                            ? 'bg-red-50 dark:bg-red-950/40 text-[#dc0000] border-red-200 dark:border-red-900/60'
                                            : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 border-zinc-200 dark:border-zinc-700'
                                    }`}>
                                        <BindingIcon family={def.id} size={32} />
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() => onToggleFamily(def.id)}
                                        aria-pressed={isEnabled}
                                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                                            isEnabled
                                                ? 'bg-[#dc0000] text-white shadow-2xs'
                                                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                                        }`}
                                    >
                                        {isEnabled ? (
                                            <>
                                                <Check size={13} />
                                                <span>{t('guided.products.offered') || 'Fabricamos'}</span>
                                            </>
                                        ) : (
                                            <span>{t('guided.products.notOffered') || 'No fabricamos'}</span>
                                        )}
                                    </button>
                                </div>

                                <div>
                                    <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                                        {t(def.titleKey)}
                                    </h3>
                                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">
                                        {t(def.descKey)}
                                    </p>
                                </div>
                            </div>

                            {/* Additional human guidance on capabilities */}
                            <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800/80">
                                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                                    {def.capabilitiesHint}
                                </p>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Informative Note: Declaration vs Technical Machine */}
            <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 flex items-start gap-3">
                <Info size={18} className="text-[#dc0000] shrink-0 mt-0.5" />
                <div className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                    <span className="font-bold text-zinc-900 dark:text-zinc-200">
                        {t('guided.products.truthGuaranteeTitle') || 'Declaración honesta de producto'}:
                    </span>{' '}
                    {t('guided.products.truthGuaranteeDesc') || 'Seleccionar una familia declara las líneas que fabricáis, pero no inventa maquinaria ni capacidades falsas en vuestro taller. Las tarifas y especificaciones se calibran a continuación a partir de un presupuesto real.'}
                </div>
            </div>

            {/* Footer Navigation */}
            <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-3 pt-3">
                <button
                    type="button"
                    onClick={onBackToCompany}
                    className="px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-bold transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                    <ArrowLeft size={15} />
                    <span>{t('guided.action.backToCompany') || 'Volver a datos de imprenta'}</span>
                </button>

                <div className="flex items-center gap-3">
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
                        type="button"
                        disabled={activeCount === 0}
                        onClick={onContinueToPricing}
                        className="px-6 py-2.5 rounded-xl bg-[#dc0000] hover:bg-[#b50000] text-white text-xs font-bold shadow-xs hover:shadow transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                        <span>{t('guided.action.continueToPricing') || 'Continuar a calibrar precios'}</span>
                        <ArrowRight size={15} />
                    </button>
                </div>
            </div>
        </div>
    );
};
