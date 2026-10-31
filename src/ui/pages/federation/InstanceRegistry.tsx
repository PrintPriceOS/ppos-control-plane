import React, { useEffect, useState } from 'react';
import { adminFetch } from '../../lib/adminApi';

export const InstanceRegistry: React.FC = () => {
    const [instances, setInstances] = useState<any[]>([]);

    useEffect(() => {
        const fetchInstances = async () => {
            try {
                const d = await adminFetch<any>('/api/admin/federation/registry');
                if (d.ok) setInstances(d.registry || []);
            } catch (e) {}
        };
        fetchInstances();
        const intervalId = setInterval(fetchInstances, 2500);
        return () => clearInterval(intervalId);
    }, []);

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            <div className="border-b ppos-border pb-4">
                <h1 className="text-2xl font-black tracking-tight text-[#ECECF1]">Distributed Instance Registry</h1>
                <p className="text-sm text-slate-400 mt-2">The complete topological ledger mapping sovereign regions currently meshed into the active OS plane.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mt-4">
                {instances.map(inst => (
                    <div key={inst.instanceId} className={`glass border p-5 ppos-surface text-[#ECECF1] ${inst.instanceId === 'local-ops-1' ? 'border-indigo-500/50 ring-2 ring-indigo-500/10' : 'ppos-border'}`}>
                        <div className="flex justify-between items-center mb-3">
                            <h3 className="font-bold text-indigo-400 font-mono">{inst.instanceId}</h3>
                            {inst.instanceId === 'local-ops-1' && <span className="bg-indigo-950 text-indigo-400 border border-indigo-500/20 text-[10px] font-black px-2 py-0.5 rounded-none uppercase tracking-wider">Local Axis</span>}
                        </div>

                        <div className="space-y-2 mt-4 text-xs bg-black/20 p-3 rounded-none border ppos-border">
                            <div className="flex justify-between"><span className="text-slate-500">Region:</span> <span className="font-mono text-[#ECECF1]">{inst.region?.toUpperCase()}</span></div>
                            <div className="flex justify-between"><span className="text-slate-500">Tier:</span> <span className="font-bold text-indigo-400 font-mono">{inst.serviceTier}</span></div>
                            <div className="flex justify-between"><span className="text-slate-500">Health:</span> 
                                <span className={`font-mono font-bold ${inst.status === 'HEALTHY' ? 'text-emerald-500' : 'text-amber-500'}`}>{inst.status}</span>
                            </div>
                        </div>

                        <div className="mt-4">
                            <span className="text-[9px] uppercase font-black text-slate-400 tracking-widest block mb-2">Capabilities</span>
                            <div className="flex flex-wrap gap-2">
                                {inst.capabilities?.map((cap: string) => (
                                    <span key={cap} className="px-2 py-1 bg-slate-800 text-slate-300 border ppos-border rounded-none text-[10px] font-mono">{cap}</span>
                                ))}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
