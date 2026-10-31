import React, { useState, useEffect } from 'react';
import { CapabilityAuditLog } from '../../types/printhouseCapabilities';
import { listCapabilityAudit } from '../../api/printhouseCapabilitiesClient';
import { ArrowPathIcon, ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';

interface CapabilityAuditTimelineProps {
    printhouseId: string;
    refreshTrigger: number;
}

export const CapabilityAuditTimeline: React.FC<CapabilityAuditTimelineProps> = ({
    printhouseId,
    refreshTrigger
}) => {
    const [auditLogs, setAuditLogs] = useState<CapabilityAuditLog[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [expandedLogId, setExpandedLogId] = useState<number | null>(null);

    useEffect(() => {
        loadAudits();
    }, [printhouseId, refreshTrigger]);

    const loadAudits = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await listCapabilityAudit(printhouseId);
            if (res.ok) {
                setAuditLogs(res.audit);
            } else {
                setError('Failed to load capability audit timeline');
            }
        } catch (err: any) {
            setError(err.message || 'An error occurred');
        } finally {
            setLoading(false);
        }
    };

    const toggleExpand = (id: number) => {
        setExpandedLogId(expandedLogId === id ? null : id);
    };

    if (loading && auditLogs.length === 0) {
        return (
            <div className="flex items-center justify-center py-12">
                <ArrowPathIcon className="w-6 h-6 text-primary animate-spin" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-3 bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 text-xs font-bold border border-red-100 dark:border-red-900/40">
                {error}
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between border-b ppos-border pb-4">
                <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest">Capability Change Log</h3>
                <button 
                    onClick={loadAudits}
                    className="p-1 text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
                    title="Refresh logs"
                >
                    <ArrowPathIcon className="w-4 h-4" />
                </button>
            </div>

            {auditLogs.length === 0 ? (
                <div className="py-12 text-center text-xs font-bold text-zinc-400 border border-dashed ppos-border">
                    No capability audit history found.
                </div>
            ) : (
                <div className="flow-root">
                    <ul className="-mb-8">
                        {auditLogs.map((log, logIdx) => {
                            const isExpanded = expandedLogId === log.id;
                            
                            // Safe parsing of before/after
                            const beforeObj = log.before_json ? JSON.parse(log.before_json) : null;
                            const afterObj = log.after_json ? JSON.parse(log.after_json) : null;

                            return (
                                <li key={log.id}>
                                    <div className="relative pb-8">
                                        {logIdx !== auditLogs.length - 1 ? (
                                            <span className="absolute left-4 top-4 -ml-px h-full w-0.5 bg-zinc-200 dark:bg-zinc-800" aria-hidden="true" />
                                        ) : null}
                                        <div className="relative flex space-x-3 items-start">
                                            <div>
                                                <span className="h-8 w-8 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-center text-zinc-500 font-black text-xs">
                                                    {logIdx + 1}
                                                </span>
                                            </div>
                                            <div className="flex-1 min-w-0 pt-1.5">
                                                <div className="flex items-center justify-between gap-4">
                                                    <div>
                                                        <p className="text-xs font-black text-zinc-900 dark:text-zinc-100">
                                                            {log.event_type.replace(/_/g, ' ')}{' '}
                                                            <span className="font-normal text-zinc-500">by</span>{' '}
                                                            <span className="font-mono text-[10px] bg-zinc-100 dark:bg-zinc-900 px-1 py-0.5">{log.actor_user_id}</span>{' '}
                                                            <span className="text-[9px] font-black uppercase text-zinc-400">({log.actor_role})</span>
                                                        </p>
                                                    </div>
                                                    <div className="text-right text-[10px] font-mono font-bold text-zinc-400 shrink-0">
                                                        {new Date(log.created_at).toLocaleString()}
                                                    </div>
                                                </div>
                                                
                                                {/* Collapsible details for operators */}
                                                {(beforeObj || afterObj) && (
                                                    <div className="mt-2">
                                                        <button 
                                                            onClick={() => toggleExpand(log.id)}
                                                            className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors"
                                                        >
                                                            {isExpanded ? (
                                                                <>Hide technical changes <ChevronUpIcon className="w-3 h-3" /></>
                                                            ) : (
                                                                <>View technical changes <ChevronDownIcon className="w-3 h-3" /></>
                                                            )}
                                                        </button>

                                                        {isExpanded && (
                                                            <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-3 p-3 bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 font-mono text-[10px] text-zinc-600 dark:text-zinc-400">
                                                                <div>
                                                                    <span className="block font-bold uppercase text-[9px] text-zinc-400 tracking-wider mb-1">State Before</span>
                                                                    <pre className="overflow-x-auto whitespace-pre-wrap max-h-48 p-2 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-850">
                                                                        {beforeObj ? JSON.stringify(beforeObj, null, 2) : 'NULL'}
                                                                    </pre>
                                                                </div>
                                                                <div>
                                                                    <span className="block font-bold uppercase text-[9px] text-zinc-400 tracking-wider mb-1">State After</span>
                                                                    <pre className="overflow-x-auto whitespace-pre-wrap max-h-48 p-2 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-850">
                                                                        {afterObj ? JSON.stringify(afterObj, null, 2) : 'NULL'}
                                                                    </pre>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}
        </div>
    );
};
