/**
 * src/ui/components/printhouse/pricing/quick-calibration/CalibrationCommercialDeclaration.tsx
 *
 * Phase 193F — Commercial Declaration & Inclusion Semantics UI
 * Separates manufacturing cost from external transport reference.
 */
import React from 'react';
import { Euro, Truck, Check, HelpCircle, AlertCircle } from 'lucide-react';

interface CommercialData {
    targetManufacturingPrice: number | null;
    currency: string;
    transportPricePerKg: number | null;
    transportCurrency: string;
    includesPaper: boolean | null;
    includesBinding: boolean | null;
    includesFinishing: boolean | null;
    includesPackaging: boolean | null;
}

interface CalibrationCommercialDeclarationProps {
    commercials: CommercialData;
    onChange?: (field: keyof CommercialData, value: any) => void;
    readOnly?: boolean;
    missingInclusions?: boolean;
}

export const CalibrationCommercialDeclaration: React.FC<CalibrationCommercialDeclarationProps> = ({
    commercials,
    onChange,
    readOnly = false,
    missingInclusions = false
}) => {
    return (
        <div className="bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-[#27272a] rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
                <h4 className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                    <Euro size={16} className="text-[#dc0000]" />
                    <span>Commercial Cost Declaration</span>
                </h4>
                {missingInclusions && (
                    <span className="text-[11px] font-semibold text-amber-700 bg-amber-100 dark:bg-amber-950/60 dark:text-amber-300 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <AlertCircle size={12} />
                        Inclusions Require Confirmation
                    </span>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 1. Target Manufacturing Price */}
                <div className="p-3.5 bg-zinc-50 dark:bg-zinc-900/50 rounded-lg border border-zinc-200 dark:border-zinc-800">
                    <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                        Known Manufacturing Price (EUR)
                    </label>
                    <div className="text-xs text-zinc-500 mb-2">
                        Total cost to produce the target batch of copies.
                    </div>
                    {readOnly ? (
                        <div className="text-lg font-bold text-zinc-900 dark:text-white">
                            {commercials.targetManufacturingPrice !== null
                                ? `${Number(commercials.targetManufacturingPrice).toFixed(2)} ${commercials.currency || 'EUR'}`
                                : '— (Not declared)'}
                        </div>
                    ) : (
                        <input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="e.g. 2450.00"
                            value={commercials.targetManufacturingPrice ?? ''}
                            onChange={e => onChange?.('targetManufacturingPrice', e.target.value ? parseFloat(e.target.value) : null)}
                            className="w-full text-sm font-bold bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-md px-3 py-2 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#dc0000]"
                        />
                    )}
                </div>

                {/* 2. Transport Price Per Kg (External Reference Only) */}
                <div className="p-3.5 bg-zinc-50 dark:bg-zinc-900/50 rounded-lg border border-zinc-200 dark:border-zinc-800">
                    <div className="flex items-center justify-between mb-1">
                        <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                            Transport Reference (€ / kg)
                        </label>
                        <span className="text-[10px] font-semibold text-zinc-600 bg-zinc-200 dark:bg-zinc-700 dark:text-zinc-300 px-1.5 py-0.5 rounded">
                            External reference only
                        </span>
                    </div>
                    <div className="text-xs text-zinc-500 mb-2">
                        Reference rate for national dispatch. Not mixed into manufacturing rates.
                    </div>
                    {readOnly ? (
                        <div className="text-lg font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                            <Truck size={16} className="text-zinc-400" />
                            <span>
                                {commercials.transportPricePerKg !== null
                                    ? `${Number(commercials.transportPricePerKg).toFixed(3)} ${commercials.transportCurrency || 'EUR'} / kg`
                                    : '0.950 EUR / kg (Default)'}
                            </span>
                        </div>
                    ) : (
                        <input
                            type="number"
                            step="0.001"
                            min="0"
                            placeholder="0.950"
                            value={commercials.transportPricePerKg ?? ''}
                            onChange={e => onChange?.('transportPricePerKg', e.target.value ? parseFloat(e.target.value) : null)}
                            className="w-full text-sm font-bold bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-md px-3 py-2 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#dc0000]"
                        />
                    )}
                </div>
            </div>

            {/* 3. Inclusions Checkboxes */}
            <div className="pt-2">
                <div className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-2">
                    Scope of Declared Manufacturing Cost:
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                        { key: 'includesPaper', label: 'Paper Stock', desc: 'Raw material included' },
                        { key: 'includesBinding', label: 'Binding', desc: 'Cover & block binding' },
                        { key: 'includesFinishing', label: 'Finishing / Lam', desc: 'Lamination included' },
                        { key: 'includesPackaging', label: 'Packaging', desc: 'Boxes / shrinkwrap' }
                    ].map(inc => {
                        const val = (commercials as any)[inc.key];
                        return (
                            <div
                                key={inc.key}
                                onClick={() => !readOnly && onChange?.(inc.key as any, val === true ? false : true)}
                                className={`p-2.5 rounded-lg border text-xs cursor-pointer transition-all ${
                                    val === true
                                        ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
                                        : val === false
                                        ? 'bg-zinc-100 dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700 text-zinc-500'
                                        : 'bg-amber-50 dark:bg-amber-950/20 border-amber-300 dark:border-amber-800/60 text-amber-900 dark:text-amber-300'
                                }`}
                            >
                                <div className="flex items-center justify-between font-semibold">
                                    <span>{inc.label}</span>
                                    {val === true ? (
                                        <Check size={14} className="text-emerald-600 dark:text-emerald-400" />
                                    ) : val === false ? (
                                        <span className="text-[10px] font-bold text-zinc-400">EXCLUDED</span>
                                    ) : (
                                        <HelpCircle size={14} className="text-amber-500" />
                                    )}
                                </div>
                                <div className="text-[10px] opacity-80 mt-0.5">{inc.desc}</div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};
