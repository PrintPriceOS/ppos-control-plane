import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminFetch } from '../../lib/adminApi';

export const FederationOverview: React.FC = () => {
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

    const healthyCount = instances.filter(i => i.status === 'HEALTHY').length;
    const localOps = instances.find(i => i.instanceId === 'local-ops-1');

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            <div className="flex justify-between items-center border-b ppos-border pb-4 flex-wrap gap-4">
                <h1 className="text-2xl font-black tracking-tight text-[#ECECF1]">🌍 Distributed Federation Core</h1>
                <div className="flex bg-slate-200/50 dark:bg-white/5 p-0.5 border ppos-border">
                    <Link to="/federation/registry" className="px-3 py-1 text-[10px] font-black uppercase tracking-wider text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-white transition-all">Instance Registry</Link>
                    <Link to="/federation/signals" className="px-3 py-1 text-[10px] font-black uppercase tracking-wider text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-white transition-all">Live Signals</Link>
                    <Link to="/federation/decisions" className="px-3 py-1 text-[10px] font-black uppercase tracking-wider text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-white transition-all">Decisions</Link>
                </div>
            </div>

            <p className="text-sm text-slate-400">
                PrintPrice OS forms a mesh network capable of policy-governed inter-instance load balancing.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="glass border ppos-border ppos-surface p-5 text-[#ECECF1]">
                    <h3 className="text-slate-400 text-xs font-black uppercase tracking-widest mb-1">Local Identity</h3>
                    <div className="font-mono font-black text-2xl tracking-tight text-indigo-400">{localOps?.instanceId || 'RESOLVING...'}</div>
                    <div className="text-xs text-indigo-400/80 mt-2 font-bold uppercase tracking-wider">{localOps?.serviceTier || 'UNKNOWN'} Tier Node</div>
                </div>
                
                <div className="glass border ppos-border ppos-surface p-5 text-[#ECECF1]">
                    <h3 className="text-slate-400 text-xs font-black uppercase tracking-widest mb-1">Total Mesh Nodes</h3>
                    <div className="font-mono font-black text-3xl tracking-tight text-[#ECECF1]">{instances.length}</div>
                    <div className="text-xs text-slate-400 mt-2 font-bold uppercase tracking-wider">Active Sovereign Datacenters</div>
                </div>

                <div className="glass border ppos-border ppos-surface p-5 text-[#ECECF1]">
                    <h3 className="text-slate-400 text-xs font-black uppercase tracking-widest mb-1">Peer Health Ratio</h3>
                    <div className="font-mono font-black text-3xl tracking-tight text-[#ECECF1]">{healthyCount}/{instances.length}</div>
                    <div className="text-xs text-slate-400 mt-2 font-bold uppercase tracking-wider">Instances accepting traffic.</div>
                </div>
            </div>

            <div className="p-4 bg-amber-500/10 text-amber-500 rounded-none text-sm border border-amber-500/20 flex items-start gap-4">
                <div className="font-black uppercase tracking-widest text-xs border border-amber-500/30 px-2 py-0.5 bg-amber-500/10">POLICY LOCK</div>
                <div className="text-xs font-bold leading-relaxed">Tenant data is strictly mathematically sandboxed. Regions synchronize purely via generalized capacity vectors. <strong>Payload Isolation</strong> algorithms guarantee absolute boundary compliance for any cross-region transaction.</div>
            </div>
        </div>
    );
};
