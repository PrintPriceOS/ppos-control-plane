import React, { useEffect, useState } from 'react';

export const InstanceRegistry: React.FC = () => {
    const [instances, setInstances] = useState<any[]>([]);

    useEffect(() => {
        const fetchRegistry = async () => {
            const rs = await fetch('/api/admin/federation/registry', {
                headers: { 'Authorization': 'Bearer admin-secret' }
            });
            const d = await rs.json();
            if (d.ok) setInstances(d.instances);
        };
        fetchRegistry();
    }, []);

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            <div className="border-b pb-4">
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">Distributed Instance Registry</h1>
                <p className="text-sm text-slate-500 mt-2">The complete topological ledger mapping sovereign regions currently meshed into the active OS plane.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mt-4">
                {instances.map(inst => (
                    <div key={inst.instanceId} className={`bg-white rounded-xl shadow-sm border p-5 ${inst.instanceId === 'local-ops-1' ? 'border-indigo-400 ring-2 ring-indigo-50' : 'border-slate-200'}`}>
                        <div className="flex justify-between items-center mb-3">
                            <h3 className="font-bold text-slate-800">{inst.instanceId}</h3>
                            {inst.instanceId === 'local-ops-1' && <span className="bg-indigo-100 text-indigo-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">Local Axis</span>}
                        </div>

                        <div className="space-y-2 mt-4 text-sm bg-slate-50 p-3 rounded-lg border border-slate-100">
                            <div className="flex justify-between"><span className="text-slate-500">Region:</span> <span className="font-mono text-slate-700">{inst.region.toUpperCase()}</span></div>
                            <div className="flex justify-between"><span className="text-slate-500">Tier:</span> <span className="font-bold text-indigo-600">{inst.serviceTier}</span></div>
                            <div className="flex justify-between"><span className="text-slate-500">Health:</span> 
                                <span className={`font-bold ${inst.status === 'HEALTHY' ? 'text-emerald-600' : 'text-amber-600'}`}>{inst.status}</span>
                            </div>
                        </div>

                        <div className="mt-4">
                            <span className="text-xs uppercase font-bold text-slate-400 tracking-wider">Capabilities</span>
                            <div className="flex flex-wrap gap-2 mt-2">
                                {inst.capabilities.map((cap: string) => (
                                    <span key={cap} className="px-2 py-1 bg-slate-100 text-slate-600 rounded text-xs">{cap}</span>
                                ))}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
