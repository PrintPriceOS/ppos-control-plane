import React, { useState } from 'react';
import { PreflightAlertsPayload } from '../types';
import { AlertTriangle, ShieldAlert, CheckCircle2, Wrench, ArrowUpRight } from 'lucide-react';

export const CopilotPreflightAlertCard: React.FC<{ payload: PreflightAlertsPayload }> = ({ payload }) => {
    const [fixedMap, setFixedMap] = useState<Record<string, boolean>>({});

    const handleAutoFix = (orderId: string, issueType: string) => {
        const key = `${orderId}-${issueType}`;
        setFixedMap(prev => ({ ...prev, [key]: true }));
    };

    return (
        <div className="my-2.5 rounded-xl border border-red-500/30 dark:border-red-950/60 bg-red-50/30 dark:bg-red-950/20 p-3.5 shadow-xs">
            <div className="flex items-center justify-between pb-2.5 border-b border-red-200/50 dark:border-red-900/40">
                <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-red-500/15 text-red-600 dark:text-red-400">
                        <ShieldAlert size={15} />
                    </div>
                    <span className="text-xs font-bold text-red-950 dark:text-red-200">
                        Auditoría Preflight de 6 Ejes
                    </span>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300">
                    {payload.alerts.length} archivos con alertas
                </span>
            </div>

            <div className="mt-3 space-y-3">
                {payload.alerts.map((alert, idx) => (
                    <div 
                        key={idx} 
                        className="p-3 rounded-lg bg-white/80 dark:bg-[#18181b]/90 border border-zinc-200/80 dark:border-zinc-800"
                    >
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100 font-mono">
                                {alert.orderId}
                            </span>
                            <span className="text-[11px] text-zinc-500 truncate max-w-[200px]" title={alert.fileName}>
                                {alert.fileName}
                            </span>
                        </div>

                        <div className="mt-2 space-y-1.5">
                            {alert.issues.map((iss, iIdx) => {
                                const isFixed = fixedMap[`${alert.orderId}-${iss.type}`];
                                return (
                                    <div 
                                        key={iIdx} 
                                        className="text-[11px] p-2 rounded bg-zinc-50 dark:bg-zinc-900/70 border border-zinc-100 dark:border-zinc-800 flex items-start justify-between gap-2"
                                    >
                                        <div className="flex items-start gap-1.5 min-w-0">
                                            <AlertTriangle 
                                                size={13} 
                                                className={`mt-0.5 shrink-0 ${iss.severity === 'CRITICAL' ? 'text-red-500' : 'text-amber-500'}`} 
                                            />
                                            <span className="text-zinc-700 dark:text-zinc-300">
                                                {iss.desc}
                                            </span>
                                        </div>

                                        {iss.autoFixable && (
                                            <div className="shrink-0">
                                                {isFixed ? (
                                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded">
                                                        <CheckCircle2 size={11} /> Reparado
                                                    </span>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleAutoFix(alert.orderId, iss.type)}
                                                        className="inline-flex items-center gap-1 text-[10px] font-bold text-red-600 dark:text-red-400 bg-red-500/10 hover:bg-red-500/20 px-2 py-0.5 rounded cursor-pointer transition-colors"
                                                    >
                                                        <Wrench size={10} /> Auto-Fix
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        <div className="mt-2.5 pt-2 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between text-[11px]">
                            <span className="text-zinc-400">Inspección de Sangrado, Lomo y TAC</span>
                            <a 
                                href={`#/orders`} 
                                className="inline-flex items-center gap-1 text-[#dc0000] hover:underline font-bold"
                            >
                                Abrir orden en taller <ArrowUpRight size={11} />
                            </a>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
