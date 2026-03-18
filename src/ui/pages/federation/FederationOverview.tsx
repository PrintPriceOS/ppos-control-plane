import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

export const FederationOverview: React.FC = () => {
    const [instances, setInstances] = useState<any[]>([]);

    useEffect(() => {
        const fetchStatus = async () => {
            const rs = await fetch('/api/admin/federation/registry', {
                headers: { 'Authorization': 'Bearer admin-secret' }
            });
            const d = await rs.json();
            if (d.ok) setInstances(d.instances);
        };
        fetchStatus();
    }, []);

    const healthyCount = instances.filter(i => i.status === 'HEALTHY').length;
    const localOps = instances.find(i => i.instanceId === 'local-ops-1');

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            <div className="flex justify-between items-center border-b pb-4">
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">🌍 Distributed Federation Core</h1>
                <div className="space-x-2">
                    <Link to="/federation/registry" className="px-3 py-1 bg-slate-100 text-slate-700 rounded text-sm hover:bg-slate-200">Instance Registry</Link>
                    <Link to="/federation/signals" className="px-3 py-1 bg-indigo-50 text-indigo-700 rounded text-sm hover:bg-indigo-100">Live Signals</Link>
                    <Link to="/federation/decisions" className="px-3 py-1 bg-emerald-50 text-emerald-700 rounded text-sm hover:bg-emerald-100">Decisions</Link>
                </div>
            </div>

            <p className="text-sm text-slate-500">
                PrintPrice OS forms a mesh network capable of policy-governed inter-instance load balancing.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 text-white">
                    <h3 className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-1">Local Identity</h3>
                    <div className="font-mono text-xl">{localOps?.instanceId || 'RESOLVING...'}</div>
                    <div className="text-xs text-indigo-400 mt-2">{localOps?.serviceTier || 'UNKNOWN'} Tier Node</div>
                </div>
                
                <div className="bg-white border rounded-xl p-5 shadow-sm border-slate-200">
                    <h3 className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-1">Total Mesh Nodes</h3>
                    <div className="font-mono text-3xl font-light text-slate-700">{instances.length}</div>
                    <div className="text-xs text-slate-400 mt-2">Active Sovereign Datacenters</div>
                </div>

                <div className="bg-white border rounded-xl p-5 shadow-sm border-slate-200">
                    <h3 className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-1">Peer Health Ratio</h3>
                    <div className="font-mono text-3xl font-light text-slate-700">{healthyCount}/{instances.length}</div>
                    <div className="text-xs text-slate-400 mt-2">Instances accepting traffic allocations.</div>
                </div>
            </div>

            <div className="p-4 bg-amber-50 text-amber-800 rounded-lg text-sm border border-amber-200 flex items-start gap-4">
                <div className="font-bold">POLICY LOCK</div>
                <div>Tenant data is strictly mathematically sandboxed. Regions synchronize purely via generalized capacity vectors. <strong>Payload Isolation</strong> algorithms guarantee absolute boundary compliance for any cross-region transaction.</div>
            </div>
        </div>
    );
};
