import React from 'react';
import { MachineLoadSnapshot } from '../../types/productionMonitoring';
import { COLORS } from '../../design-system/tokens';

interface Props {
    machines: MachineLoadSnapshot[];
    onRaiseOfflineIncident: (machineId: string, name: string, tenantId: string, printhouseId: string) => void;
}

export const MachineLoadPanel: React.FC<Props> = ({ machines, onRaiseOfflineIncident }) => {
    
    const getLoadStyle = (status: string) => {
        switch (status) {
            case 'OFFLINE':
                return { bg: 'bg-red-500/10 border-red-500/20 text-red-500', label: 'OFFLINE' };
            case 'OVERLOADED':
                return { bg: 'bg-orange-500/10 border-orange-500/20 text-orange-600', label: 'OVERLOADED' };
            case 'BUSY':
                return { bg: 'bg-amber-500/10 border-amber-500/20 text-amber-600', label: 'BUSY' };
            case 'NORMAL':
                return { bg: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600', label: 'NORMAL' };
            default:
                return { bg: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300', label: 'IDLE' };
        }
    };

    return (
        <div className={`border ${COLORS.adaptive.borderPrimary} ${COLORS.adaptive.surface} p-6`}>
            <h3 className={`text-xs font-black uppercase tracking-widest mb-6 ${COLORS.adaptive.textSecondary}`}>
                Printhouse Machine Fleet Workloads
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {machines.length === 0 ? (
                    <div className="col-span-full py-8 text-center text-xs font-semibold text-zinc-500">
                        No printers currently monitored.
                    </div>
                ) : (
                    machines.map((mac) => {
                        const style = getLoadStyle(mac.load_status);
                        const isOffline = mac.load_status === 'OFFLINE';
                        return (
                            <div 
                                key={mac.machine_id}
                                className={`border ${COLORS.adaptive.borderPrimary} p-4 flex flex-col justify-between hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors`}
                            >
                                <div>
                                    <div className="flex justify-between items-start mb-2">
                                        <div>
                                            <h4 className={`text-sm font-black ${COLORS.adaptive.textPrimary}`}>
                                                {mac.machine_name}
                                            </h4>
                                            <span className="text-[10px] font-mono text-zinc-500">
                                                {mac.machine_id} • {mac.machine_type}
                                            </span>
                                        </div>
                                        <span className={`px-2 py-0.5 border text-[9px] font-black uppercase tracking-wider ${style.bg}`}>
                                            {style.label}
                                        </span>
                                    </div>
                                    
                                    <div className="grid grid-cols-2 gap-4 my-4 bg-zinc-50 dark:bg-zinc-800/10 p-2 border border-zinc-100 dark:border-zinc-800/30">
                                        <div>
                                            <div className="text-[8px] font-black text-zinc-400 uppercase tracking-widest">Active Jobs</div>
                                            <div className={`text-sm font-bold ${COLORS.adaptive.textPrimary}`}>{mac.active_jobs_count}</div>
                                        </div>
                                        <div>
                                            <div className="text-[8px] font-black text-zinc-400 uppercase tracking-widest">Queued Jobs</div>
                                            <div className={`text-sm font-bold ${COLORS.adaptive.textPrimary}`}>{mac.queued_jobs_count}</div>
                                        </div>
                                    </div>
                                    
                                    <div className="space-y-1 text-[11px] font-medium text-zinc-500">
                                        <div className="flex justify-between">
                                            <span>Est. Queue wait:</span>
                                            <span className="font-mono text-zinc-800 dark:text-zinc-200">
                                                {isOffline ? 'Infinite' : `${mac.estimated_queue_minutes} mins`}
                                            </span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span>Capacity Score:</span>
                                            <span className="font-mono text-zinc-800 dark:text-zinc-200">{mac.capacity_score}/100</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span>Next Slot:</span>
                                            <span className="font-mono text-zinc-800 dark:text-zinc-200">
                                                {isOffline ? 'N/A' : mac.next_available_at ? new Date(mac.next_available_at).toLocaleTimeString() : 'Immediate'}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {isOffline && (
                                    <div className="mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-800/50">
                                        <button 
                                            className="w-full text-center px-3 py-1.5 border border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400 text-xs font-black uppercase tracking-wider hover:bg-red-500/20 transition-colors"
                                            onClick={() => onRaiseOfflineIncident(mac.machine_id, mac.machine_name, mac.tenant_id, mac.printhouse_id)}
                                        >
                                            Raise Warning Incident
                                        </button>
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
};
export default MachineLoadPanel;
