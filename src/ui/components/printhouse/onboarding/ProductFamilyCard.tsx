/**
 * src/ui/components/printhouse/onboarding/ProductFamilyCard.tsx
 *
 * Card component for one of the four binding product families:
 * - Hardcover (Tapa dura)
 * - Softcover (Rústica)
 * - Wire-O (Espiral)
 * - Saddle Stitch (Grapado)
 *
 * Requirements:
 * - Clear iconography distinguishing each binding.
 * - Multi-attribute state badge (Icon + Text + Border pattern, not just color).
 * - Keyboard accessible, high-contrast, responsive.
 */
import React from 'react';
import { BindingIcon } from './BindingFamilyIcons';
import { ProductFamilyId, FamilyStatus, FamilyState } from '../../../types/printhouseOnboardingTypes';
import { useLocale } from '../../../i18n';
import { 
    Clock, Ban, FileCheck, AlertTriangle, CheckCircle2, 
    ChevronRight, Check 
} from 'lucide-react';

export interface ProductFamilyCardProps {
    family?: FamilyState;
    familyId?: ProductFamilyId;
    title?: string;
    description?: string;
    status?: FamilyStatus;
    quoteCount?: number;
    isSelected: boolean;
    onSelect: (familyId: ProductFamilyId) => void;
    onToggleNotOffered: (familyId: ProductFamilyId) => void;
}

export const ProductFamilyCard: React.FC<ProductFamilyCardProps> = ({
    family,
    familyId: explicitFamilyId,
    title: explicitTitle,
    description: explicitDesc,
    status: explicitStatus,
    quoteCount: explicitQuoteCount,
    isSelected,
    onSelect,
    onToggleNotOffered
}) => {
    const { t } = useLocale();

    const familyId = family ? family.id : (explicitFamilyId || 'HARDCOVER');
    const title = family ? (t(family.titleKey) || family.titleKey) : (explicitTitle || '');
    const description = family ? (t(family.descKey) || family.descKey) : (explicitDesc || '');
    const status = family ? family.status : (explicitStatus || 'PENDING');
    const quoteCount = family ? (family.quoteCount || 0) : (explicitQuoteCount || 0);

    // Render multi-attribute status badge
    const renderStatusBadge = () => {
        switch (status) {
            case 'NOT_OFFERED':
                return (
                    <span 
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-dashed border-zinc-300 dark:border-zinc-700"
                        title={t('family.status.notOfferedDesc') || 'Este producto no es producido por la imprenta'}
                        aria-label={`${t('family.status.notOffered') || 'No ofrecemos este producto'}`}
                    >
                        <Ban size={12} className="text-zinc-500 shrink-0" aria-hidden="true" />
                        <span>{t('family.status.notOffered') || 'No ofrecemos este producto'}</span>
                    </span>
                );
            case 'QUOTE_ADDED':
                return (
                    <span 
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800"
                        title={t('family.status.quoteAddedDesc') || 'Presupuesto incorporado, pendiente de revisión'}
                        aria-label={`${t('family.status.quoteAdded') || 'Presupuesto añadido'}: ${quoteCount} ${t('family.quotesCount') || 'ofertas'}`}
                    >
                        <FileCheck size={12} className="text-blue-600 dark:text-blue-400 shrink-0" aria-hidden="true" />
                        <span>{t('family.status.quoteAdded') || 'Presupuesto añadido'} ({quoteCount})</span>
                    </span>
                );
            case 'REQUIRES_REVIEW':
                return (
                    <span 
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-2 border-amber-300 dark:border-amber-700"
                        title={t('family.status.requiresReviewDesc') || 'Contiene discrepancias aritméticas o ambigüedades técnicas que requieren confirmación'}
                        aria-label={t('family.status.requiresReview') || 'Requiere revisión'}
                    >
                        <AlertTriangle size={12} className="text-amber-600 dark:text-amber-400 shrink-0" aria-hidden="true" />
                        <span>{t('family.status.requiresReview') || 'Requiere revisión'}</span>
                    </span>
                );
            case 'DATA_VALIDATED':
                return (
                    <span 
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 shadow-2xs"
                        title={t('family.status.dataValidatedDesc') || 'Especificaciones comprobadas y tarifas calibradas'}
                        aria-label={t('family.status.dataValidated') || 'Datos validados'}
                    >
                        <CheckCircle2 size={12} className="text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden="true" />
                        <span>{t('family.status.dataValidated') || 'Datos validados'}</span>
                    </span>
                );
            case 'PENDING':
            default:
                return (
                    <span 
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-zinc-100 dark:bg-zinc-800/80 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700"
                        title={t('family.status.pendingDesc') || 'Pendiente de añadir presupuestos u ofertas para calibrar'}
                        aria-label={t('family.status.pending') || 'Pendiente'}
                    >
                        <Clock size={12} className="text-zinc-500 shrink-0" aria-hidden="true" />
                        <span>{t('family.status.pending') || 'Pendiente'}</span>
                    </span>
                );
        }
    };

    const isNotOffered = status === 'NOT_OFFERED';

    return (
        <div 
            className={`relative rounded-2xl border transition-all p-5 flex flex-col justify-between ${
                isSelected 
                    ? 'bg-white dark:bg-zinc-900 border-[#dc0000] ring-2 ring-[#dc0000]/20 shadow-md' 
                    : isNotOffered
                        ? 'bg-zinc-50/70 dark:bg-zinc-900/40 border-zinc-200/80 dark:border-zinc-800/80 opacity-75'
                        : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 shadow-xs'
            }`}
            role="region"
            aria-label={`${title} - ${status}`}
        >
            {/* Top row: Icon + Status */}
            <div>
                <div className="flex items-start justify-between gap-3 mb-3">
                    <div className={`p-3 rounded-xl border flex items-center justify-center transition-colors ${
                        isSelected 
                            ? 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900 text-[#dc0000]'
                            : isNotOffered
                                ? 'bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-400'
                                : 'bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200'
                    }`}>
                        <BindingIcon family={familyId} size={32} />
                    </div>
                    <div>
                        {renderStatusBadge()}
                    </div>
                </div>

                <h3 className="text-base font-bold text-zinc-900 dark:text-white flex items-center gap-1.5 mb-1">
                    <span>{title}</span>
                    {isSelected && (
                        <span className="inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
                            {t('family.activeLabel') || 'En configuración'}
                        </span>
                    )}
                </h3>
                <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed mb-4">
                    {description}
                </p>
            </div>

            {/* Bottom Controls */}
            <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800/80 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                <button
                    type="button"
                    onClick={() => onSelect(familyId)}
                    disabled={isNotOffered}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                        isSelected
                            ? 'bg-[#dc0000] text-white shadow-xs'
                            : isNotOffered
                                ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 cursor-not-allowed'
                                : 'bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white'
                    }`}
                    aria-label={`${t('family.selectToCalibrate') || 'Seleccionar'} ${title}`}
                >
                    {isSelected ? (
                        <>
                            <Check size={14} className="shrink-0" />
                            <span>{t('family.selectedFamily') || 'Familia seleccionada'}</span>
                        </>
                    ) : (
                        <>
                            <span>{t('family.configureFamily') || 'Aportar presupuesto'}</span>
                            <ChevronRight size={14} className="shrink-0" />
                        </>
                    )}
                </button>

                <button
                    type="button"
                    onClick={() => onToggleNotOffered(familyId)}
                    className="text-[11px] text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 underline underline-offset-2 transition-colors cursor-pointer py-1 text-center"
                    aria-label={isNotOffered ? `${t('family.enableProduct') || 'Habilitar'} ${title}` : `${t('family.markNotOffered') || 'No ofrecemos'} ${title}`}
                >
                    {isNotOffered 
                        ? (t('family.enableProduct') || 'Habilitar este producto')
                        : (t('family.markNotOffered') || 'No ofrecemos este producto')}
                </button>
            </div>
        </div>
    );
};
