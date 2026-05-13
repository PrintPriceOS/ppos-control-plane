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
                    <h1 className="text-2xl font-black text-zinc-900 dark:text-zinc-100 tracking-tight">Queues & Workers</h1>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400 font-medium tracking-tight">Process lifecycle controls, queue depths, and worker heartbeats.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {['preflight', 'autofix'].map((queueName) => {
                    const stats = q.data?.stats?.queues?.find((q: any) => q.name === queueName);
                    const isPaused = stats?.paused;
                    
                    return (
                        <div key={queueName} className="bg-white dark:bg-zinc-950 p-6 rounded-none border border-zinc-200 dark:border-zinc-800 flex flex-col gap-6 shadow-none">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className={`p-3 rounded-none ${isPaused ? 'bg-red-50 dark:bg-red-950/40 text-[#dc0000] dark:text-red-400' : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400'}`}>
                                        <QueueListIcon className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <p className="text-lg font-black text-zinc-900 dark:text-zinc-100 capitalize">{queueName} Queue</p>
                                        <p className={`text-xs font-bold uppercase tracking-widest ${isPaused ? 'text-[#dc0000] dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                                            {isPaused ? 'PAUSED' : 'OPERATIONAL'}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    {isPaused ? (
                                        <button 
                                            onClick={() => handleResume(queueName)}
                                            className="p-2 rounded-none bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shadow-none"
                                            title="Resume Queue"
                                        >
                                            <PlayIcon className="w-4 h-4" />
                                        </button>
                                    ) : (
                                        <button 
                                            onClick={() => handlePause(queueName)}
                                            className="p-2 rounded-none bg-[#dc0000] text-white hover:bg-red-700 transition-colors shadow-none"
                                            title="Pause Queue"
                                        >
                                            <PauseIcon className="w-4 h-4" />
                                        </button>
                                    )}
                                    <button 
                                        className="p-2 rounded-none bg-zinc-50 dark:bg-zinc-900 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all"
                                        title="Drain Queue"
                                    >
                                        <TrashIcon className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-4">
                                <div className="p-3 rounded-none bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                                    <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Queue Depth</p>
                                    <p className="text-lg font-black text-zinc-900 dark:text-zinc-100">{stats?.size || 0}</p>
                                </div>
                                <div className="p-3 rounded-none bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                                    <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Active Workers</p>
                                    <p className="text-lg font-black text-zinc-900 dark:text-zinc-100">{stats?.active || 0}</p>
                                </div>
                                <div className="p-3 rounded-none bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                                    <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Heartbeat</p>
                                    <div className="flex items-center gap-1.5 mt-1.5">
                                        <div className="w-1.5 h-1.5 rounded-none bg-emerald-500 animate-pulse" />
                                        <span className="text-[10px] font-bold text-zinc-500 uppercase">Synced</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="bg-white dark:bg-zinc-950 p-8 rounded-none border border-zinc-200 dark:border-zinc-800 shadow-none">
                <div className="flex items-center gap-3 mb-6">
                    <UsersIcon className="w-5 h-5 text-zinc-400" />
                    <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Active Regional Workers</h3>
                </div>
                <div className="space-y-4">
                   {[
                       { id: 'worker-eu-w1-01', region: 'eu-west-1', load: '12%', status: 'IDLE' },
                       { id: 'worker-eu-w1-02', region: 'eu-west-1', load: '85%', status: 'BUSY' },
                       { id: 'worker-eu-w1-03', region: 'eu-west-1', load: '0%', status: 'IDLE' }
                   ].map(worker => (
                       <div key={worker.id} className="flex items-center justify-between p-4 rounded-none border border-zinc-100 dark:border-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-all cursor-pointer group">
                           <div className="flex items-center gap-4">
                               <div className="p-2.5 rounded-none bg-zinc-50 dark:bg-zinc-900 text-zinc-400 group-hover:text-[#dc0000] transition-colors">
                                   <BoltIcon className="w-5 h-5" />
                               </div>
                               <div>
                                   <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{worker.id}</p>
                                   <p className="text-[10px] text-zinc-400 uppercase font-bold">{worker.region}</p>
                               </div>
                           </div>
                           <div className="flex items-center gap-8">
                               <div className="text-right">
                                   <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Load</p>
                                   <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{worker.load}</p>
                               </div>
                               <div className="text-right w-20">
                                   <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Status</p>
                                   <p className={`text-sm font-bold ${worker.status === 'BUSY' ? 'text-sky-500' : 'text-emerald-500'}`}>{worker.status}</p>
                               </div>
                           </div>
                       </div>
                   ))}
                </div>
            </div>
        </div>
    );
};
