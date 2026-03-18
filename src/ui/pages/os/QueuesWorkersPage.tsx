import React from 'react';
import { QueueListIcon, UsersIcon, PlayIcon, PauseIcon, TrashIcon, ExclamationTriangleIcon, BoltIcon, ClockIcon } from "@heroicons/react/24/outline";
import { getAdminQueueStats, pauseQueue, resumeQueue, drainQueue } from "../../lib/adminApi";
import { useAdminQuery } from "../../hooks/useAdminData";

export const QueuesWorkersPage: React.FC = () => {
    const q = useAdminQuery("queue-stats", getAdminQueueStats, 10000);

    const handlePause = async (queue: any) => {
        if (!confirm(`Are you sure you want to PAUSE the ${queue} queue?`)) return;
        await pauseQueue(queue, 'Admin manual intervention');
        q.refetch();
    };

    const handleResume = async (queue: any) => {
        if (!confirm(`Are you sure you want to RESUME the ${queue} queue?`)) return;
        await resumeQueue(queue, 'Admin manual intervention');
        q.refetch();
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-black text-slate-900 tracking-tight">Queues & Workers</h1>
                    <p className="text-sm text-slate-500 font-medium tracking-tight">Process lifecycle controls, queue depths, and worker heartbeats.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {['preflight', 'autofix'].map((queueName) => {
                    const stats = q.data?.stats?.queues?.find((q: any) => q.name === queueName);
                    const isPaused = stats?.paused;
                    
                    return (
                        <div key={queueName} className="glass p-6 rounded-2xl border border-white flex flex-col gap-6">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className={`p-3 rounded-xl ${isPaused ? 'bg-red-50 text-red-500' : 'bg-emerald-50 text-emerald-500'}`}>
                                        <QueueListIcon className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <p className="text-lg font-black text-slate-900 capitalize italic-text-off">{queueName} Queue</p>
                                        <p className={`text-xs font-bold uppercase tracking-widest ${isPaused ? 'text-red-500' : 'text-emerald-500'}`}>
                                            {isPaused ? 'PAUSED' : 'OPERATIONAL'}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    {isPaused ? (
                                        <button 
                                            onClick={() => handleResume(queueName)}
                                            className="p-2 rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 transition-colors shadow-lg shadow-emerald-500/20"
                                            title="Resume Queue"
                                        >
                                            <PlayIcon className="w-4 h-4" />
                                        </button>
                                    ) : (
                                        <button 
                                            onClick={() => handlePause(queueName)}
                                            className="p-2 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors shadow-lg shadow-red-500/20"
                                            title="Pause Queue"
                                        >
                                            <PauseIcon className="w-4 h-4" />
                                        </button>
                                    )}
                                    <button 
                                        className="p-2 rounded-lg bg-slate-100 text-slate-400 hover:text-slate-900 hover:bg-slate-200 transition-all"
                                        title="Drain Queue"
                                    >
                                        <TrashIcon className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-4">
                                <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 italic-text-off">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Queue Depth</p>
                                    <p className="text-lg font-black text-slate-900">{stats?.size || 0}</p>
                                </div>
                                <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 italic-text-off">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Active Workers</p>
                                    <p className="text-lg font-black text-slate-900">{stats?.active || 0}</p>
                                </div>
                                <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 italic-text-off">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Heartbeat</p>
                                    <div className="flex items-center gap-1.5 mt-1.5">
                                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                        <span className="text-[10px] font-bold text-slate-500 uppercase">Synced</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="glass p-8 rounded-2xl border border-white">
                <div className="flex items-center gap-3 mb-6">
                    <UsersIcon className="w-5 h-5 text-slate-400" />
                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Active Regional Workers</h3>
                </div>
                <div className="space-y-4 italic-text-off">
                   {[
                       { id: 'worker-eu-w1-01', region: 'eu-west-1', load: '12%', status: 'IDLE' },
                       { id: 'worker-eu-w1-02', region: 'eu-west-1', load: '85%', status: 'BUSY' },
                       { id: 'worker-eu-w1-03', region: 'eu-west-1', load: '0%', status: 'IDLE' }
                   ].map(worker => (
                       <div key={worker.id} className="flex items-center justify-between p-4 rounded-xl border border-slate-50 hover:bg-slate-50 transition-all cursor-pointer group">
                           <div className="flex items-center gap-4">
                               <div className="p-2.5 rounded-lg bg-slate-100 text-slate-400 group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                                   <BoltIcon className="w-5 h-5" />
                               </div>
                               <div>
                                   <p className="text-sm font-bold text-slate-900">{worker.id}</p>
                                   <p className="text-[10px] text-slate-400 uppercase font-black">{worker.region}</p>
                               </div>
                           </div>
                           <div className="flex items-center gap-8">
                               <div className="text-right">
                                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Load</p>
                                   <p className="text-sm font-bold text-slate-900">{worker.load}</p>
                               </div>
                               <div className="text-right w-20">
                                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</p>
                                   <p className={`text-sm font-bold ${worker.status === 'BUSY' ? 'text-blue-500' : 'text-emerald-500'}`}>{worker.status}</p>
                               </div>
                           </div>
                       </div>
                   ))}
                </div>
            </div>
        </div>
    );
};
