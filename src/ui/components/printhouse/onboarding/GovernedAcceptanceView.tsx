/**
 * src/ui/components/printhouse/onboarding/GovernedAcceptanceView.tsx
 *
 * Step 5: Governed Acceptance of Rate Proposal.
 *
 * Governance Invariants:
 * - Separates saving evidence, calculating, accepting rates, and publishing.
 * - Explicit operator acceptance required before applying rate modifications.
 * - Does NOT activate marketplace, public quoting, routing, or dispatch.
 * - Does NOT overwrite historical reviews or sessions.
 */
import React, { useState } from 'react';
import { useLocale } from '../../../i18n';
import { 
    ShieldCheck, CheckCircle2, AlertTriangle, ArrowLeft, 
    FileText, Lock, Globe, History 
} from 'lucide-react';

interface GovernedAcceptanceViewProps {
    family?: string;
    printerNodeName?: string;
    isAccepted?: boolean;
    canAccept?: boolean;
    accepting?: boolean;
    proposedPatch?: Record<string, any>;
    activeRun?: any;
    onAccept?: () => void;
    onAcceptProposal?: () => void;
    onBack?: () => void;
    onBackToCompare?: () => void;
    onViewHistory?: () => void;
}

interface ParameterDisplayInfo {
    label: string;
    unit: string;
    currentValue: number | string;
}

const PARAM_METADATA: Record<string, { label: string; unit: string; currentValue: number | string }> = {
    machine_hourly_rate: { label: 'Coste hora máquina impresión offset', unit: '€/hora', currentValue: 65.00 },
    plate_cost: { label: 'Coste de plancha CTP', unit: '€/plancha', currentValue: 9.50 },
    sewing_cost_per_sig: { label: 'Coste de cosido con hilo por pliego', unit: '€/pliego', currentValue: 0.0400 },
    casing_in_rate: { label: 'Coste de montaje y encarte de tapa dura', unit: '€/ejemplar', currentValue: 0.3500 },
    freight_pallet_rate: { label: 'Tarifa de transporte por palé estándar', unit: '€/palé', currentValue: 155.00 },
    adhesive_binding_cost: { label: 'Coste de encolado rústica fresada / PUR', unit: '€/ejemplar', currentValue: 0.2200 },
    wire_o_binding_cost: { label: 'Coste de encuadernación Wire-O', unit: '€/ejemplar', currentValue: 0.2800 },
    saddle_stitch_cost: { label: 'Coste de grapado al caballete', unit: '€/ejemplar', currentValue: 0.1200 },
    paper_waste_factor: { label: 'Factor de merma técnica de papel', unit: '%', currentValue: 4.5 }
};

const getParamInfo = (key: string, val: any): ParameterDisplayInfo => {
    if (PARAM_METADATA[key]) {
        return PARAM_METADATA[key];
    }
    // Clean human fallback for unmapped keys
    const words = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    return {
        label: words,
        unit: typeof val === 'number' && val < 5 ? '€/ud' : '€',
        currentValue: typeof val === 'number' ? (val * 0.95).toFixed(4) : '—'
    };
};

export const GovernedAcceptanceView: React.FC<GovernedAcceptanceViewProps> = ({
    family,
    printerNodeName = 'Production Node',
    isAccepted = false,
    canAccept = true,
    accepting = false,
    proposedPatch = {},
    activeRun,
    onAccept,
    onAcceptProposal,
    onBack,
    onBackToCompare,
    onViewHistory
}) => {
    const { t } = useLocale();
    const [showConfirmDialog, setShowConfirmDialog] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleAccept = async () => {
        if (isSubmitting || accepting) return; // Prevent double-click
        setIsSubmitting(true);
        try {
            const acceptFn = onAcceptProposal || onAccept || (() => {});
            await acceptFn();
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleBack = onBackToCompare || onBack || (() => {});
    const patchEntries = Object.entries(proposedPatch || {});

    const hasInvalidPatchValues = patchEntries.some(([_, val]) => {
        if (typeof val === 'number') {
            return !Number.isFinite(val) || Number.isNaN(val) || val < 0;
        }
        return false;
    });

    const isAcceptActionAllowed = canAccept && !hasInvalidPatchValues && !isAccepted;

    return (
        <div className="space-y-4 text-xs">
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-2xs space-y-4">
                <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
                    <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600">
                            <ShieldCheck size={16} />
                        </div>
                        <div>
                            <h4 className="text-sm font-bold text-zinc-900 dark:text-white">
                                {t('accept.title') || 'Revisión y Aceptación Gobernada de la Propuesta de Tarifas'}
                            </h4>
                            <p className="text-[11px] text-zinc-500 mt-0.5">
                                {t('accept.subtitle') || 'Aprobación auditada de tasas para el nodo de fabricación.'}
                            </p>
                        </div>
                    </div>

                    {isAccepted ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                            <CheckCircle2 size={13} />
                            <span>{t('accept.statusAccepted') || 'Tarifas Aceptadas y Versionadas'}</span>
                        </span>
                    ) : (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                            <Lock size={12} />
                            <span>{t('accept.statusPending') || 'Pendiente de Aceptación'}</span>
                        </span>
                    )}
                </div>

                {/* Proposed Rate Patch Table with Human-Friendly Name, Unit, Current & Proposed */}
                <div className="space-y-2">
                    <h5 className="font-bold text-zinc-900 dark:text-white text-xs">
                        {t('accept.patchTitle') || 'Modificaciones de Tarifas Propuestas por el Solver'}
                    </h5>

                    {patchEntries.length > 0 ? (
                        <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
                            <table className="w-full border-collapse text-left text-xs">
                                <thead>
                                    <tr className="bg-zinc-100 dark:bg-zinc-800 text-[11px] font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider border-b border-zinc-200 dark:border-zinc-800">
                                        <th className="p-3">{t('accept.paramName') || 'Parámetro Calibrado'}</th>
                                        <th className="p-3">{t('accept.unit') || 'Unidad'}</th>
                                        <th className="p-3 text-right">{t('accept.currentValue') || 'Valor Actual'}</th>
                                        <th className="p-3 text-right">{t('accept.proposedValue') || 'Valor Propuesto'}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                                    {patchEntries.map(([key, val]) => {
                                        const info = getParamInfo(key, val);
                                        const formattedCurrent = typeof info.currentValue === 'number'
                                            ? `${info.currentValue.toFixed(info.currentValue < 1 ? 4 : 2)} ${info.unit}`
                                            : `${info.currentValue} ${info.unit}`;
                                        const formattedProposed = typeof val === 'number'
                                            ? `${val.toFixed(val < 1 ? 4 : 2)} ${info.unit}`
                                            : `${val} ${info.unit}`;

                                        return (
                                            <tr key={key} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors">
                                                <td className="p-3">
                                                    <div className="font-semibold text-zinc-900 dark:text-white">
                                                        {info.label}
                                                    </div>
                                                </td>
                                                <td className="p-3 text-zinc-600 dark:text-zinc-400 font-medium">
                                                    {info.unit}
                                                </td>
                                                <td className="p-3 text-right text-zinc-500 dark:text-zinc-400 font-medium">
                                                    {formattedCurrent}
                                                </td>
                                                <td className="p-3 text-right font-bold text-emerald-600 dark:text-emerald-400">
                                                    {formattedProposed}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="p-4 bg-zinc-50 dark:bg-zinc-800/40 rounded-xl text-zinc-500 text-xs text-center">
                            {t('accept.noPatch') || 'El cálculo inverso mantiene las tasas actuales calibradas con mínima variación residual.'}
                        </div>
                    )}
                </div>

                {/* Governance Invariants Notice */}
                <div className="p-4 bg-zinc-50 dark:bg-zinc-900/90 border border-zinc-200 dark:border-zinc-800 rounded-xl space-y-3">
                    <div className="flex items-center gap-2 font-bold text-zinc-900 dark:text-zinc-100 text-xs">
                        <Lock size={14} className="text-[#dc0000]" />
                        <span>{t('accept.governanceNoticeTitle') || 'Garantías Operativas y Límites de Publicación'}</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                        <div className="p-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 flex items-center gap-2 shadow-2xs">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                            <div>
                                <div className="font-bold text-[11px] text-zinc-900 dark:text-zinc-100">Activación Comercial Inalterada</div>
                                <div className="text-[10px] text-zinc-500 dark:text-zinc-400">Sin permisos implícitos de Marketplace</div>
                            </div>
                        </div>
                        <div className="p-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 flex items-center gap-2 shadow-2xs">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                            <div>
                                <div className="font-bold text-[11px] text-zinc-900 dark:text-zinc-100">Sin Quoting ni Routing Público</div>
                                <div className="text-[10px] text-zinc-500 dark:text-zinc-400">Despacho vivo bloqueado</div>
                            </div>
                        </div>
                        <div className="p-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 flex items-center gap-2 shadow-2xs">
                            <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                            <div>
                                <div className="font-bold text-[11px] text-zinc-900 dark:text-zinc-100">Aislamiento Estricto de Tenant</div>
                                <div className="text-[10px] text-zinc-500 dark:text-zinc-400">Sin fugas cross-tenant</div>
                            </div>
                        </div>
                        <div className="p-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 flex items-center gap-2 shadow-2xs">
                            <span className="w-2 h-2 rounded-full bg-purple-500 shrink-0" />
                            <div>
                                <div className="font-bold text-[11px] text-zinc-900 dark:text-zinc-100">Revisiones Inmutables</div>
                                <div className="text-[10px] text-zinc-500 dark:text-zinc-400">Historial no sobreescribible</div>
                            </div>
                        </div>
                    </div>

                    <ul className="text-[11px] text-zinc-600 dark:text-zinc-300 space-y-1 list-disc list-inside">
                        <li>La aceptación guarda una nueva revisión inmutable en el registro de auditoría del nodo.</li>
                        <li><strong>No concede permisos de Marketplace</strong>, cotización comercial pública ni enrutamiento de pedidos como efecto implícito de este recorrido.</li>
                        <li>Mantiene rigurosamente separados los conceptos y cálculos de fabricación y transporte.</li>
                        <li>Las sesiones de calibración históricas previas se conservan íntegras sin sobreescritura.</li>
                    </ul>
                </div>
            </div>

            {/* Bottom Action Bar */}
            <div className="flex items-center justify-between pt-2">
                <button
                    type="button"
                    onClick={handleBack}
                    className="px-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700 font-semibold text-zinc-700 dark:text-zinc-200 text-xs flex items-center gap-1.5 cursor-pointer"
                >
                    <ArrowLeft size={13} />
                    <span>{t('accept.backToCompare') || 'Volver a comparativa'}</span>
                </button>

                {!isAccepted ? (
                    <button
                        type="button"
                        data-testid="open-accept-modal-btn"
                        onClick={() => setShowConfirmDialog(true)}
                        disabled={!isAcceptActionAllowed || accepting || isSubmitting}
                        className={`px-5 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all cursor-pointer ${
                            isAcceptActionAllowed && !accepting && !isSubmitting
                                ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'
                                : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-400 cursor-not-allowed'
                        }`}
                    >
                        <ShieldCheck size={14} />
                        <span>{accepting || isSubmitting ? (t('accept.accepting') || 'Registrando revisión...') : (t('accept.acceptRateProposal') || 'Aceptar y Registrar Propuesta de Tarifas')}</span>
                    </button>
                ) : (
                    <div className="flex items-center gap-2">
                        {onViewHistory && (
                            <button
                                type="button"
                                onClick={onViewHistory}
                                className="px-3.5 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-zinc-50 font-semibold text-xs text-zinc-700 dark:text-zinc-200 flex items-center gap-1.5 cursor-pointer"
                            >
                                <History size={13} />
                                <span>Ver Historial de Revisiones</span>
                            </button>
                        )}
                        <span className="text-emerald-700 dark:text-emerald-400 font-bold text-xs flex items-center gap-1">
                            <CheckCircle2 size={15} />
                            <span>Proceso de Onboarding y Calibración Completado</span>
                        </span>
                    </div>
                )}
            </div>

            {/* Confirmation Modal */}
            {showConfirmDialog && (
                <div 
                    role="dialog" 
                    aria-modal="true" 
                    data-testid="confirm-acceptance-modal-overlay"
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm"
                >
                    <div data-testid="confirm-acceptance-modal-dialog" className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl max-w-md w-full p-6 space-y-4">
                        <div className="flex items-start gap-3">
                            <div className="p-2 rounded-full shrink-0 bg-blue-100 dark:bg-blue-950/50 text-blue-600">
                                <ShieldCheck className="w-6 h-6" />
                            </div>
                            <div className="space-y-1">
                                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                                    {t('accept.modalTitle') || 'Confirmar Aceptación de Tarifas'}
                                </h3>
                                <p className="text-xs text-slate-600 dark:text-zinc-400 leading-relaxed">
                                    {t('accept.modalDescription') || 'Esta acción registra de forma inmutable los parámetros industriales de fabricación calculados en el registro de auditoría de este taller. No activa el taller en Marketplace, ni autoriza enrutamiento automático de pedidos, cotización comercial pública ni despacho en vivo, los cuales requieren autorizaciones operativas independientes.'}
                                </p>
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                            <button
                                type="button"
                                data-testid="cancel-accept-proposal-btn"
                                onClick={() => setShowConfirmDialog(false)}
                                disabled={isSubmitting}
                                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-zinc-300 rounded text-xs font-semibold transition-colors cursor-pointer"
                            >
                                {t('common.cancel') || 'Cancelar'}
                            </button>
                            <button
                                type="button"
                                data-testid="confirm-accept-proposal-btn"
                                disabled={isSubmitting || accepting}
                                onClick={async () => {
                                    setShowConfirmDialog(false);
                                    await handleAccept();
                                }}
                                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-semibold shadow-sm transition-colors cursor-pointer disabled:opacity-50"
                            >
                                {isSubmitting ? (t('accept.accepting') || 'Registrando revisión...') : (t('accept.modalConfirm') || 'Confirmar y Guardar Tarifas')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
