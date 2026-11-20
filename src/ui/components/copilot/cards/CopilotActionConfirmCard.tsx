import React, { useState } from 'react';
import { ActionConfirmPayload } from '../types';
import { Check, X, ShieldCheck, AlertCircle } from 'lucide-react';

export const CopilotActionConfirmCard: React.FC<{ payload: ActionConfirmPayload }> = ({ payload }) => {
    const [status, setStatus] = useState<'PENDING' | 'CONFIRMED' | 'CANCELLED'>(payload.status || 'PENDING');

    const handleConfirm = () => {
        setStatus('CONFIRMED');
    };

    const handleCancel = () => {
        setStatus('CANCELLED');
    };

    return (
        <div className="my-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#18181b] p-3.5 shadow-xs">
            <div className="flex items-center justify-between pb-2.5 border-b border-zinc-100 dark:border-zinc-800/80">
                <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-red-500/10 text-[#dc0000]">
                        <ShieldCheck size={15} />
                    </div>
                    <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                        {payload.title || 'Confirmación Requerida (Modo Act)'}
                    </span>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                    HUMAN-IN-THE-LOOP
                </span>
            </div>

            <p className="text-xs text-zinc-600 dark:text-zinc-300 mt-2.5 leading-relaxed">
                {payload.summary}
            </p>

            {status === 'PENDING' && (
                <div className="mt-3.5 pt-3 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center justify-end gap-2">
                    <button
                        type="button"
                        onClick={handleCancel}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors flex items-center gap-1 cursor-pointer"
                    >
                        <X size={13} />
                        Cancelar
                    </button>
                    <button
                        type="button"
                        onClick={handleConfirm}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-[#dc0000] hover:bg-red-700 shadow-2xs transition-colors flex items-center gap-1 cursor-pointer"
                    >
                        <Check size={13} />
                        Confirmar y Aplicar
                    </button>
                </div>
            )}

            {status === 'CONFIRMED' && (
                <div className="mt-3 p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs font-bold flex items-center gap-2">
                    <Check size={14} className="text-emerald-600 dark:text-emerald-400" />
                    <span>Cambios aplicados correctamente en la configuración de la imprenta.</span>
                </div>
            )}

            {status === 'CANCELLED' && (
                <div className="mt-3 p-2.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 text-xs font-medium flex items-center gap-2">
                    <AlertCircle size={14} />
                    <span>Operación cancelada por el operador. No se modificó ningún dato.</span>
                </div>
            )}
        </div>
    );
};
