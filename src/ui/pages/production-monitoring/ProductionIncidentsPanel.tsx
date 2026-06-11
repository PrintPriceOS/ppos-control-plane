import React, { useState } from 'react';
import { ProductionIncident } from '../../types/productionMonitoring';
import { COLORS } from '../../design-system/tokens';

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
    const isAdminOrOperator = userRole === 'SUPER_ADMIN' || userRole === 'OPS_ADMIN' || userRole === 'PRINTHOUSE_ADMIN' || userRole === 'PRINTHOUSE_OPERATOR';
    
    const [actioningIncidentId, setActioningIncidentId] = useState<number | null>(null);
    const [actionType, setActionType] = useState<'RESOLVE' | 'DISMISS' | null>(null);
    const [inputText, setInputText] = useState('');

    const getSeverityStyle = (sev: string) => {
        switch (sev) {
            case 'CRITICAL': return 'bg-red-600 text-white';
            case 'HIGH': return 'bg-red-500/10 text-red-500 border border-red-500/20';
            case 'MEDIUM': return 'bg-amber-500/10 text-amber-600 border border-amber-500/20';
            default: return 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300';
        }
    };

    const getStatusStyle = (status: string) => {
        switch (status) {
            case 'OPEN': return 'bg-red-500/10 text-red-600 border border-red-500/20';
            case 'ACKNOWLEDGED': return 'bg-blue-500/10 text-blue-600 border border-blue-500/20';
            case 'RESOLVED': return 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20';
            default: return 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400';
        }
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
        <div className={`border ${COLORS.adaptive.borderPrimary} ${COLORS.adaptive.surface} p-6`}>
            <div className="flex justify-between items-center mb-6">
                <h3 className={`text-xs font-black uppercase tracking-widest ${COLORS.adaptive.textSecondary}`}>
                    Production Incidents Log
                </h3>
                {isAdminOrOperator && (
                    <button 
                        className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-[10px] font-black uppercase tracking-wider"
                        onClick={onOpenCreateModal}
                    >
                        Report Manual Incident
                    </button>
                )}
            </div>

            <div className="space-y-4">
                {incidents.length === 0 ? (
                    <div className="py-8 text-center text-xs font-semibold text-zinc-500">
                        No incidents reported. All production systems nominal.
                    </div>
                ) : (
                    incidents.map((inc) => (
                        <div 
                            key={inc.id}
                            className={`border ${COLORS.adaptive.borderPrimary} p-4 bg-zinc-50/50 dark:bg-zinc-900/10`}
                        >
                            <div className="flex flex-wrap justify-between items-start gap-2 mb-2">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-sm uppercase ${getSeverityStyle(inc.severity)}`}>
                                            {inc.severity}
                                        </span>
                                        <h4 className={`text-xs font-black ${COLORS.adaptive.textPrimary}`}>
                                            #{inc.id}: {inc.title}
                                        </h4>
                                    </div>
                                    <span className="text-[9px] text-zinc-500 font-mono">
                                        Type: {inc.incident_type} • Order: {inc.order_id} • Opened: {new Date(inc.opened_at).toLocaleString()}
                                    </span>
                                </div>
                                <span className={`px-2 py-0.5 text-[10px] font-bold border ${getStatusStyle(inc.status)}`}>
                                    {inc.status}
                                </span>
                            </div>

                            <p className={`text-xs ${COLORS.adaptive.textSecondary} my-3 leading-relaxed`}>
                                {inc.description}
                            </p>

                            {inc.resolution_notes && (
                                <div className="p-3 bg-zinc-100/50 dark:bg-zinc-800/20 border-l-2 border-emerald-500 text-[11px] font-medium text-emerald-700 dark:text-emerald-400 mt-2">
                                    <strong>Resolution notes:</strong> {inc.resolution_notes}
                                </div>
                            )}

                            {isAdminOrOperator && inc.status !== 'RESOLVED' && inc.status !== 'DISMISSED' && (
                                <div className="mt-4 pt-3 border-t border-zinc-200/50 dark:border-zinc-800/30 flex gap-2 justify-end">
                                    {inc.status === 'OPEN' && (
                                        <button 
                                            className="px-3 py-1 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-800 dark:text-zinc-200 text-[10px] font-bold uppercase tracking-wider"
                                            onClick={() => onAcknowledge(inc.id)}
                                        >
                                            Acknowledge
                                        </button>
                                    )}
                                    <button 
                                        className="px-3 py-1 border border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/20 text-[10px] font-bold uppercase tracking-wider"
                                        onClick={() => {
                                            setActioningIncidentId(inc.id);
                                            setActionType('RESOLVE');
                                        }}
                                    >
                                        Resolve
                                    </button>
                                    <button 
                                        className="px-3 py-1 border border-zinc-500/20 bg-zinc-500/10 text-zinc-700 dark:text-zinc-400 hover:bg-zinc-500/20 text-[10px] font-bold uppercase tracking-wider"
                                        onClick={() => {
                                            setActioningIncidentId(inc.id);
                                            setActionType('DISMISS');
                                        }}
                                    >
                                        Dismiss
                                    </button>
                                </div>
                            )}

                            {actioningIncidentId === inc.id && (
                                <div className="mt-4 p-4 border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
                                    <label className="block text-[10px] font-black uppercase text-zinc-400 mb-2">
                                        {actionType === 'RESOLVE' ? 'Provide Resolution Notes' : 'Provide Dismissal Reason'}
                                    </label>
                                    <textarea 
                                        className="w-full p-2 border border-zinc-300 dark:border-zinc-700 bg-transparent text-xs text-zinc-900 dark:text-zinc-100 rounded-none mb-3"
                                        rows={2}
                                        value={inputText}
                                        onChange={(e) => setInputText(e.target.value)}
                                        placeholder={actionType === 'RESOLVE' ? 'Describe how the issue was resolved...' : 'Describe why this incident was dismissed...'}
                                    />
                                    <div className="flex gap-2 justify-end">
                                        <button 
                                            className="px-3 py-1 bg-zinc-200 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 text-[10px] font-bold uppercase"
                                            onClick={() => {
                                                setActioningIncidentId(null);
                                                setActionType(null);
                                            }}
                                        >
                                            Cancel
                                        </button>
                                        <button 
                                            className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-[10px] font-black uppercase"
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
