import React, { useState } from 'react';
import { ProductionIncident } from '../../types/productionMonitoring';
import { StatusBadge } from '../../components/StatusBadge';

interface Props {
    incidents: ProductionIncident[];
    userRole: string;
    onAcknowledge: (id: number) => void;
    onResolve: (id: number, notes: string) => void;
    onDismiss: (id: number, reason: string) => void;
    onOpenCreateModal: () => void;
}

export const ProductionIncidentsPanel: React.FC<Props> = ({
    incidents,
    userRole,
    onAcknowledge,
    onResolve,
    onDismiss,
    onOpenCreateModal
}) => {
    const isAdminOrOperator = ['SUPER_ADMIN', 'OPS_ADMIN', 'PRINTHOUSE_ADMIN', 'PRINTHOUSE_OPERATOR'].includes(userRole);

    const [actioningIncidentId, setActioningIncidentId] = useState<number | null>(null);
    const [actionType, setActionType] = useState<'RESOLVE' | 'DISMISS' | null>(null);
    const [inputText, setInputText] = useState('');

    const getSeverityChip = (sev: string) => {
        if (sev === 'CRITICAL') return 'bg-red-600 text-white border-transparent';
        if (sev === 'HIGH')     return 'border-red-600/40 text-[#dc0000] bg-red-600/10';
        if (sev === 'MEDIUM')   return 'border-amber-500/40 text-amber-400 bg-amber-500/10';
        return 'border-zinc-700 text-zinc-400 bg-zinc-800/40';
    };

    const handleActionSubmit = () => {
        if (actioningIncidentId === null || !actionType) return;
        if (actionType === 'RESOLVE') {
            onResolve(actioningIncidentId, inputText || 'Resolved by operator');
        } else {
            onDismiss(actioningIncidentId, inputText || 'Dismissed by operator');
        }
        setActioningIncidentId(null);
        setActionType(null);
        setInputText('');
    };

    return (
        <div className="glass border border-zinc-800 bg-zinc-950/40 p-6">
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 border-l-2 border-[#dc0000] pl-3">
                    Production Incidents Log
                </h3>
                {isAdminOrOperator && (
                    <button
                        className="px-3 py-1.5 bg-[#dc0000] hover:bg-red-700 text-white text-[9px] font-black uppercase tracking-widest transition-all"
                        onClick={onOpenCreateModal}
                    >
                        Report Manual Incident
                    </button>
                )}
            </div>

            <div className="space-y-3">
                {incidents.length === 0 ? (
                    <div className="py-10 text-center text-[10px] font-black uppercase tracking-widest text-zinc-600">
                        No incidents reported. All production systems nominal.
                    </div>
                ) : (
                    incidents.map((inc) => (
                        <div
                            key={inc.id}
                            className="border border-zinc-800 p-4 bg-zinc-900/20 hover:bg-zinc-900/40 transition-all"
                        >
                            <div className="flex flex-wrap justify-between items-start gap-2 mb-2">
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className={`text-[8px] font-black px-2 py-0.5 border uppercase tracking-wider ${getSeverityChip(inc.severity)}`}>
                                            {inc.severity}
                                        </span>
                                        <h4 className="text-xs font-black text-white">
                                            #{inc.id}: {inc.title}
                                        </h4>
                                    </div>
                                    <span className="text-[9px] text-zinc-500 font-mono">
                                        {inc.incident_type} · Order: {inc.order_id} · {new Date(inc.opened_at).toLocaleString()}
                                    </span>
                                </div>
                                <StatusBadge status={inc.status} />
                            </div>

                            <p className="text-[11px] text-zinc-400 my-3 leading-relaxed">
                                {inc.description}
                            </p>

                            {inc.resolution_notes && (
                                <div className="p-3 bg-emerald-950/30 border-l-2 border-emerald-500 text-[10px] font-medium text-emerald-400 mt-2">
                                    <strong>Resolution notes:</strong> {inc.resolution_notes}
                                </div>
                            )}

                            {isAdminOrOperator && inc.status !== 'RESOLVED' && inc.status !== 'DISMISSED' && (
                                <div className="mt-4 pt-3 border-t border-zinc-800 flex gap-2 justify-end">
                                    {inc.status === 'OPEN' && (
                                        <button
                                            className="px-3 py-1 border border-zinc-700 hover:bg-zinc-800 text-zinc-300 text-[9px] font-bold uppercase transition-all"
                                            onClick={() => onAcknowledge(inc.id)}
                                        >
                                            Acknowledge
                                        </button>
                                    )}
                                    <button
                                        className="px-3 py-1 border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 text-[9px] font-bold uppercase transition-all"
                                        onClick={() => { setActioningIncidentId(inc.id); setActionType('RESOLVE'); }}
                                    >
                                        Resolve
                                    </button>
                                    <button
                                        className="px-3 py-1 border border-zinc-700 bg-zinc-800/30 text-zinc-400 hover:bg-zinc-700 text-[9px] font-bold uppercase transition-all"
                                        onClick={() => { setActioningIncidentId(inc.id); setActionType('DISMISS'); }}
                                    >
                                        Dismiss
                                    </button>
                                </div>
                            )}

                            {actioningIncidentId === inc.id && (
                                <div className="mt-4 p-4 border border-zinc-800 bg-zinc-950/60">
                                    <label className="block text-[9px] font-black uppercase text-zinc-500 mb-2">
                                        {actionType === 'RESOLVE' ? 'Resolution Notes' : 'Dismissal Reason'}
                                    </label>
                                    <textarea
                                        className="w-full p-2 border border-zinc-700 bg-zinc-900 text-xs text-zinc-100 rounded-none mb-3 focus:outline-none focus:border-zinc-500"
                                        rows={2}
                                        value={inputText}
                                        onChange={(e) => setInputText(e.target.value)}
                                        placeholder={actionType === 'RESOLVE' ? 'Describe how the issue was resolved...' : 'Describe why this incident was dismissed...'}
                                    />
                                    <div className="flex gap-2 justify-end">
                                        <button
                                            className="px-3 py-1 border border-zinc-700 bg-zinc-800 text-zinc-200 text-[9px] font-bold uppercase"
                                            onClick={() => { setActioningIncidentId(null); setActionType(null); }}
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            className="px-3 py-1 bg-[#dc0000] hover:bg-red-700 text-white text-[9px] font-black uppercase"
                                            onClick={handleActionSubmit}
                                        >
                                            Submit
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};
export default ProductionIncidentsPanel;
