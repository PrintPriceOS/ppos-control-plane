import React from 'react';
import { MachineLoadSnapshot } from '../../types/productionMonitoring';
import { StatusBadge } from '../../components/StatusBadge';

interface Props {
    machines: MachineLoadSnapshot[];
    onRaiseOfflineIncident: (machineId: string, name: string, tenantId: string, printhouseId: string) => void;
}

export const MachineLoadPanel: React.FC<Props> = ({ machines, onRaiseOfflineIncident }) => {
    return (
        <div className="glass border border-slate-200 dark:border-zinc-800 bg-white/90 dark:bg-zinc-950/40 backdrop-blur-sm p-6">
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 dark:text-zinc-400 mb-6 border-l-2 border-[#dc0000] pl-3">
                Printhouse Machine Fleet Workloads
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {!Array.isArray(machines) || machines.length === 0 ? (
                    <div className="col-span-full py-10 text-center text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-zinc-650">
                        No printers currently monitored.
                    </div>
                ) : (
                    machines.map((mac) => {
                        const isOffline = mac.load_status === 'OFFLINE';
                        return (
                            <div
                                key={mac.machine_id}
                                className="border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950/30 p-4 flex flex-col justify-between hover:border-slate-300 dark:hover:border-zinc-700 hover:bg-slate-100/50 dark:hover:bg-zinc-900/40 transition-all"
                            >
                                <div>
                                    <div className="flex justify-between items-start mb-3">
                                        <div>
                                            <h4 className="text-sm font-black text-slate-900 dark:text-zinc-200 leading-none mb-1">
                                                {mac.machine_name}
                                            </h4>
                                            <span className="text-[9px] font-mono text-slate-500 dark:text-zinc-450">
                                                {mac.machine_id} · {mac.machine_type}
                                            </span>
                                        </div>
                                        <StatusBadge status={mac.load_status || 'IDLE'} />
                                    </div>

                                    <div className="grid grid-cols-2 gap-3 my-3 border border-slate-200 dark:border-zinc-800 bg-slate-100/50 dark:bg-zinc-900/20 p-3">
                                        <div>
                                            <div className="text-[8px] font-black text-slate-500 dark:text-zinc-450 uppercase tracking-widest mb-0.5">Active Jobs</div>
                                            <div className="font-mono font-black text-slate-900 dark:text-white text-sm">{mac.active_jobs_count}</div>
                                        </div>
                                        <div>
                                            <div className="text-[8px] font-black text-slate-500 dark:text-zinc-450 uppercase tracking-widest mb-0.5">Queued Jobs</div>
                                            <div className="font-mono font-black text-slate-900 dark:text-white text-sm">{mac.queued_jobs_count}</div>
                                        </div>
                                    </div>

                                    <div className="space-y-1.5 text-[10px] font-medium text-slate-500 dark:text-zinc-400">
                                        <div className="flex justify-between">
                                            <span>Est. Queue Wait</span>
                                            <span className="font-mono text-slate-700 dark:text-zinc-300">
                                                {isOffline ? '∞ Infinite' : `${mac.estimated_queue_minutes}m`}
                                            </span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span>Capacity Score</span>
                                            <span className="font-mono text-slate-700 dark:text-zinc-300">{mac.capacity_score}/100</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span>Next Slot</span>
                                            <span className="font-mono text-slate-700 dark:text-zinc-300">
                                                {isOffline ? 'N/A' : mac.next_available_at ? new Date(mac.next_available_at).toLocaleTimeString() : 'Immediate'}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {isOffline && (
                                    <div className="mt-4 pt-3 border-t border-slate-200 dark:border-zinc-800">
                                        <button
                                            className="w-full text-center px-3 py-1.5 border border-red-600/30 bg-red-650/10 dark:bg-red-600/10 text-[#dc0000] dark:text-red-500 text-[9px] font-black uppercase tracking-wider hover:bg-red-650/20 dark:hover:bg-red-600/20 transition-all cursor-pointer"
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
