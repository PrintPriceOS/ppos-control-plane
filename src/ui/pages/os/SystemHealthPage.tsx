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
                    <h1 className="text-2xl font-black text-slate-900 tracking-tight">System Health</h1>
                    <p className="text-sm text-slate-500 font-medium tracking-tight">Services, workers, queues, and regional dependencies.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {services.map(s => (
                    <div key={s.id} className="glass p-6 rounded-2xl border border-white flex flex-col gap-4 group hover:border-primary/20 transition-all">
                        <div className="flex items-center justify-between">
                            <div className="p-3 rounded-xl bg-slate-100 text-slate-600 group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                                <ServerIcon className="w-6 h-6" />
                            </div>
                            <span className="text-[10px] font-black text-slate-400">PORT {s.id}</span>
                        </div>
                        <div>
                            <p className="text-lg font-black text-slate-900">{s.name}</p>
                            <div className="flex items-center gap-2 mt-1">
                                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                                <span className="text-xs font-bold text-emerald-600 uppercase tracking-widest">{s.status}</span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            <div className="glass p-8 rounded-2xl border border-white">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6">Dependencies & Backends</h3>
                <div className="space-y-4 italic-text-off">
                    {[
                        { name: 'Redis Global Cache', icon: CircleStackIcon, status: 'Connected', latency: '2ms' },
                        { name: 'OS Registry Store (MySQL)', icon: CircleStackIcon, status: 'Connected', latency: '4ms' },
                        { name: 'Federation Gateway', icon: GlobeAltIcon, status: 'Connected', latency: '12ms' }
                    ].map((dep, i) => (
                        <div key={i} className="flex items-center justify-between p-4 rounded-xl hover:bg-slate-50 transition-colors">
                            <div className="flex items-center gap-4">
                                <dep.icon className="w-5 h-5 text-slate-400" />
                                <div>
                                    <p className="text-sm font-bold text-slate-900">{dep.name}</p>
                                    <p className="text-[10px] text-slate-400 uppercase font-black">{dep.status}</p>
                                </div>
                            </div>
                            <span className="text-xs font-mono text-slate-400">{dep.latency}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};
