/**
 * src/ui/pages/admin/IndustrialMapTab.tsx
 * 
 * Visualization tab for the global federation dispatch map.
 */
import React from 'react';
import { FederationMap } from '../../components/federation/FederationMap';
import { useAdminQuery } from '../../hooks/useAdminData';
import { getRoutingLive } from '../../lib/adminApi';



export const IndustrialMapTab: React.FC = () => {
    const { data: liveData } = useAdminQuery('routing:live', getRoutingLive, 5000);



    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
                {/* Main Tactical Surface */}
                <div className="xl:col-span-3 min-h-[700px]">
                    <FederationMap />
                </div>

                {/* Live Event Stream */}
                <div className="space-y-6">
                    <div className="bg-white dark:bg-[#131314] border border-white/10 overflow-hidden flex flex-col h-[700px]">
                        <div className="px-4 py-3 border-b border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-[#131314]/[0.02] flex items-center justify-between">
                            <h3 className="text-[10px] font-black text-slate-900 dark:text-white uppercase tracking-widest">Routing Decalog</h3>
                            <div className="w-1.5 h-1.5 bg-primary animate-pulse" />
                        </div>
                        
                        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                            {Array.isArray(liveData?.decisions) && liveData.decisions.map((d: any) => (
                                <div key={d.id} className="p-3 bg-white/5 border border-white/5">
                                    <div className="flex justify-between items-start mb-2">
                                        <span className="text-[8px] font-mono font-bold text-blue-600 uppercase tracking-tighter">#{d.id.slice(-8)}</span>
                                        <span className="text-[9px] font-black text-emerald-500 uppercase">{d.routing_score}%</span>
                                    </div>
                                    <p className="text-[9px] font-bold text-slate-800 dark:text-zinc-300 leading-relaxed mb-2">
                                        {d.explanation}
                                    </p>
                                    <div className="flex justify-between items-center text-[7px] font-black text-slate-400 uppercase">
                                        <span>Node: {d.selected_machine_id}</span>
                                        <span>{new Date(d.created_at).toLocaleTimeString()}</span>
                                    </div>
                                </div>
                            ))}

                            {(!liveData?.decisions || liveData.decisions.length === 0) && (
                                <div className="h-full flex flex-col items-center justify-center opacity-20 grayscale">
                                    <div className="w-12 h-12 border-2 border-dashed border-white/10 mb-4" />
                                    <span className="text-[8px] font-black uppercase">Scanning for Routing Events...</span>
                                </div>
                            )}
                        </div>
                        
                        <div className="p-4 border-t border-slate-200 dark:border-white/5 bg-slate-50/50 dark:bg-[#131314]/[0.01]">
                            <div className="flex items-center justify-between text-[8px] font-black text-slate-400 uppercase tracking-widest">
                                <span>Session Decisions</span>
                                <span className="text-slate-900 dark:text-slate-900 dark:text-white">{liveData?.decisions?.length || 0}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Regional Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatusCard label="Federation Uptime" value="99.98%" trend="+0.02%" />
                <StatusCard label="Routing Efficiency" value="94.2%" trend="+1.5%" />
                <StatusCard label="Cross-Border Load" value="28.5%" trend="-2.1%" />
                <StatusCard label="Carbon Reduction" value="12.4kg" trend="+0.8kg" />
            </div>

        </div>
    );
};

const StatusCard = ({ label, value, trend }: { label: string, value: string, trend: string }) => (
    <div className="p-4 bg-white dark:bg-[#131314] border border-white/10">
        <div className="flex justify-between items-start mb-2">
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{label}</span>
            <span className={`text-[8px] font-black ${trend.startsWith('+') ? 'text-emerald-500' : 'text-blue-500'}`}>{trend}</span>
        </div>
        <div className="text-xl font-black text-slate-900 dark:text-white tabular-nums">{value}</div>
    </div>
);
