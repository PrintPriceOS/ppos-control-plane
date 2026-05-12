/**
 * src/ui/pages/admin/IndustrialMapTab.tsx
 * 
 * Visualization tab for the global federation dispatch map.
 */
import React, { useState } from 'react';
import { FederationMap } from '../../components/federation/FederationMap';
import { useAdminQuery } from '../../hooks/useAdminData';
import { getRoutingLive, getRoutingMap } from '../../lib/adminApi';
import { toDisplayText } from '../../lib/formatters';

export const IndustrialMapTab: React.FC = () => {
    const { data: liveData } = useAdminQuery('routing:live', getRoutingLive, 5000);
    const { data: mapState } = useAdminQuery('routing:map', getRoutingMap, 5000);
    const [isExpanded, setIsExpanded] = useState(false);

    const warnings = mapState?.warnings || [];
    const sourceStatus = mapState?.source_status || '';
    const hasWarnings = warnings.length > 0 || sourceStatus === 'PARTIAL_COORDINATES' || sourceStatus === 'NO_COORDINATES_AVAILABLE';

    return (
        <div className="space-y-6">
            {/* Compact Telemetry Warning Strip */}
            {hasWarnings && (
                <div className="border-l-2 border-amber-500 bg-amber-500/5 dark:bg-amber-500/[0.02] border border-amber-500/20 rounded-none overflow-hidden transition-all">
                    <div 
                        className="px-3 py-2 flex items-center justify-between cursor-pointer hover:bg-amber-500/10 transition-colors select-none"
                        onClick={() => setIsExpanded(!isExpanded)}
                    >
                        <div className="flex items-center gap-3">
                            <div className="w-1.5 h-1.5 bg-amber-500 animate-pulse" />
                            <span className="text-[10px] font-black text-amber-600 dark:text-amber-500 uppercase tracking-wider">
                                {toDisplayText(sourceStatus).replace(/_/g, ' ')} — {warnings.length} {warnings.length === 1 ? 'node' : 'nodes'} excluded from map
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-[8px] font-bold text-amber-600/80 dark:text-amber-500/80 uppercase tracking-widest">
                                {isExpanded ? 'Collapse Telemetry' : 'Inspect Exclusions'}
                            </span>
                            <span className="text-[9px] font-mono text-amber-600 dark:text-amber-500 font-bold">
                                {isExpanded ? '▲' : '▼'}
                            </span>
                        </div>
                    </div>

                    {isExpanded && warnings.length > 0 && (
                        <div className="border-t border-amber-500/10 bg-white/50 dark:bg-black/20 divide-y divide-amber-500/5 max-h-60 overflow-y-auto custom-scrollbar">
                            {warnings.map((w: any, idx: number) => (
                                <div key={w?.id || idx} className="px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-[9px] font-mono">
                                    <div className="flex items-center gap-2">
                                        <span className="px-1.5 py-0.5 bg-amber-500/10 text-amber-700 dark:text-amber-400 font-bold text-[8px]">
                                            {toDisplayText(w?.type || w?.entityType || 'NODE')}
                                        </span>
                                        <span className="font-bold text-slate-800 dark:text-zinc-200">
                                            {toDisplayText(w?.name || 'Unknown')}
                                        </span>
                                        <span className="text-slate-400 dark:text-zinc-500 text-[8px]">
                                            ({toDisplayText(w?.id || w?.entityId || 'N/A')})
                                        </span>
                                    </div>
                                    <span className="text-amber-600 dark:text-amber-500/90 text-[8px] max-w-md truncate">
                                        {toDisplayText(w?.message || w?.reason || w)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
                {/* Main Tactical Surface */}
                <div className="xl:col-span-3 min-h-[700px] flex flex-col">
                    <div className="flex-1 relative">
                        <FederationMap />
                    </div>
                </div>

                {/* Live Event Stream */}
                <div className="space-y-6">
                    <div className="bg-white dark:bg-[#131314] border border-white/10 overflow-hidden flex flex-col h-[700px] rounded-none">
                        <div className="px-4 py-3 border-b border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-[#131314]/[0.02] flex items-center justify-between">
                            <h3 className="text-[10px] font-black text-slate-900 dark:text-white uppercase tracking-widest">Routing Decalog</h3>
                            <div className="w-1.5 h-1.5 bg-primary animate-pulse" />
                        </div>
                        
                        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                            {Array.isArray(liveData?.decisions) && liveData.decisions.map((d: any) => {
                                const safeDecId = d?.id ? String(d.id).substring(0, 8) : 'N/A';
                                return (
                                    <div key={d?.id || Math.random()} className="p-3 bg-white/5 border border-white/5 rounded-none">
                                        <div className="flex justify-between items-start mb-2">
                                            <span className="text-[8px] font-mono font-bold text-blue-600 uppercase tracking-tighter">#{safeDecId}</span>
                                            <span className="text-[9px] font-black text-emerald-500 uppercase">{toDisplayText(d?.routing_score)}%</span>
                                        </div>
                                        <p className="text-[9px] font-bold text-slate-800 dark:text-zinc-300 leading-relaxed mb-2">
                                            {toDisplayText(d?.explanation)}
                                        </p>
                                        <div className="flex justify-between items-center text-[7px] font-black text-slate-400 uppercase">
                                            <span>Node: {toDisplayText(d?.selected_machine_id)}</span>
                                            <span>{d?.created_at ? new Date(d.created_at).toLocaleTimeString() : ''}</span>
                                        </div>
                                    </div>
                                );
                            })}

                            {(!liveData?.decisions || liveData.decisions.length === 0) && (
                                <div className="h-full flex flex-col items-center justify-center opacity-20 grayscale">
                                    <div className="w-12 h-12 border-2 border-dashed border-white/10 mb-4 rounded-none" />
                                    <span className="text-[8px] font-black uppercase">Scanning for Routing Events...</span>
                                </div>
                            )}
                        </div>
                        
                        <div className="p-4 border-t border-slate-200 dark:border-white/5 bg-slate-50/50 dark:bg-[#131314]/[0.01]">
                            <div className="flex items-center justify-between text-[8px] font-black text-slate-400 uppercase tracking-widest">
                                <span>Session Decisions</span>
                                <span className="text-slate-900 dark:text-white">{liveData?.decisions?.length || 0}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Regional Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatusCard label="Federation Uptime" value="---" trend="SIGNAL LOSS" />
                <StatusCard label="Routing Efficiency" value="---" trend="ANALYZING" />
                <StatusCard label="Cross-Border Load" value="---" trend="OFFLINE" />
                <StatusCard label="Carbon Reduction" value="---" trend="NO DATA" />
            </div>

        </div>
    );
};

const StatusCard = ({ label, value, trend }: { label: string, value: string, trend: string }) => (
    <div className="p-4 bg-white dark:bg-[#131314] border border-white/10 rounded-none">
        <div className="flex justify-between items-start mb-2">
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{label}</span>
            <span className={`text-[8px] font-black ${trend.startsWith('+') ? 'text-emerald-500' : 'text-blue-500'}`}>{trend}</span>
        </div>
        <div className="text-xl font-black text-slate-900 dark:text-white tabular-nums">{value}</div>
    </div>
);
