import React from 'react';
import { HeartIcon, ServerIcon, CubeIcon, CircleStackIcon, GlobeAltIcon, CheckCircleIcon } from "@heroicons/react/24/outline";

export const SystemHealthPage: React.FC = () => {
    const services = [
        { id: 8001, name: 'Preflight Service', status: 'UP', load: '12%' },
        { id: 8002, name: 'Autofix Worker', status: 'UP', load: '45%' },
        { id: 8080, name: 'Control Plane API', status: 'UP', load: '8%' },
    ];

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-black text-zinc-900 dark:text-zinc-100 tracking-tight">System Health</h1>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400 font-medium tracking-tight">Services, workers, queues, and regional dependencies.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {services.map(s => (
                    <div key={s.id} className="bg-white dark:bg-zinc-950 p-6 rounded-none border border-zinc-200 dark:border-zinc-800 flex flex-col gap-4 group hover:border-zinc-400 dark:hover:border-zinc-700 transition-all shadow-none">
                        <div className="flex items-center justify-between">
                            <div className="p-3 rounded-none bg-zinc-50 dark:bg-zinc-900 text-zinc-400 group-hover:text-[#dc0000] transition-colors">
                                <ServerIcon className="w-6 h-6" />
                            </div>
                            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">PORT {s.id}</span>
                        </div>
                        <div>
                            <p className="text-lg font-black text-zinc-900 dark:text-zinc-100">{s.name}</p>
                            <div className="flex items-center gap-2 mt-1">
                                <div className="w-2 h-2 rounded-none bg-emerald-500" />
                                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">{s.status}</span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            <div className="bg-white dark:bg-zinc-950 p-8 rounded-none border border-zinc-200 dark:border-zinc-800 shadow-none">
                <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-6">Dependencies & Backends</h3>
                <div className="space-y-4">
                    {[
                        { name: 'Redis Global Cache', icon: CircleStackIcon, status: 'Connected', latency: '2ms' },
                        { name: 'OS Registry Store (MySQL)', icon: CircleStackIcon, status: 'Connected', latency: '4ms' },
                        { name: 'Federation Gateway', icon: GlobeAltIcon, status: 'Connected', latency: '12ms' }
                    ].map((dep, i) => (
                        <div key={i} className="flex items-center justify-between p-4 rounded-none border border-zinc-100 dark:border-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors">
                            <div className="flex items-center gap-4">
                                <dep.icon className="w-5 h-5 text-zinc-400" />
                                <div>
                                    <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{dep.name}</p>
                                    <p className="text-[10px] text-zinc-400 uppercase font-bold">{dep.status}</p>
                                </div>
                            </div>
                            <span className="text-xs font-mono text-zinc-400">{dep.latency}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};
