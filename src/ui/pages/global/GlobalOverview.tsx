import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

export const GlobalOverview: React.FC = () => {
    const [posture, setPosture] = useState<any>(null);

    useEffect(() => {
        const fetchPosture = async () => {
            const rs = await fetch('/api/admin/global/posture', {
                headers: { 'Authorization': 'Bearer admin-secret' }
            });
            const d = await rs.json();
            if (d.ok) setPosture(d.posture);
        };
        fetchPosture();
    }, []);

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            <div className="flex justify-between items-center border-b pb-4">
                <h1 className="text-3xl font-black tracking-tighter text-slate-900 border-l-8 border-slate-900 pl-4">Network Sovereign Governance</h1>
                <div className="space-x-2">
                    <Link to="/global/policies" className="px-3 py-1 bg-slate-100 text-slate-700 rounded text-sm hover:bg-slate-200">Policy Registry</Link>
                    <Link to="/global/rollouts" className="px-3 py-1 bg-indigo-50 text-indigo-700 rounded text-sm hover:bg-indigo-100">Active Rollouts</Link>
                    <Link to="/global/posture" className="px-3 py-1 bg-amber-50 text-amber-700 rounded text-sm hover:bg-amber-100">Global Posture</Link>
                    <Link to="/global/conflicts" className="px-3 py-1 bg-red-50 text-red-700 rounded text-sm hover:bg-red-100">Sovereignty Conflicts</Link>
                </div>
            </div>

            <p className="text-sm text-slate-500">
                PrintPrice OS Global Control. Monitor top-level policy distributions, systemic risks, and cross-region posture aggregates strictly conforming to local isolation boundaries.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 text-white">
                    <h3 className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-1">Mashed Nodes</h3>
                    <div className="font-mono text-3xl">{posture ? posture.totalNodes : '...'}</div>
                    <div className="text-xs text-slate-500 mt-2">Active Sovereign Topology</div>
                </div>
                
                <div className="bg-white border rounded-xl p-5 shadow-sm border-slate-200">
                    <h3 className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-1">Risk Hotspots</h3>
                    <div className="font-mono text-3xl font-bold text-red-600">{posture ? posture.riskHotspots : '...'}</div>
                    <div className="text-xs text-slate-400 mt-2">Regions explicitly degraded</div>
                </div>

                <div className="bg-white border rounded-xl p-5 shadow-sm border-slate-200">
                    <h3 className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-1">Guarded Regions</h3>
                    <div className="font-mono text-3xl font-light text-amber-600">{posture ? posture.guardedRegions.length : '...'}</div>
                    <div className="text-xs text-slate-400 mt-2">Heavy internal constraint enforcement</div>
                </div>

                <div className="bg-white border rounded-xl p-5 shadow-sm border-slate-200">
                    <h3 className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-1">Autonomy Restrictions</h3>
                    <div className="font-mono text-3xl font-light text-indigo-600">{posture ? posture.autonomyRestrictedRegions.length : '...'}</div>
                    <div className="text-xs text-slate-400 mt-2">Regions locked in ADVISORY</div>
                </div>
            </div>

            <div className="p-4 bg-indigo-50 text-indigo-900 rounded-lg text-sm border border-indigo-200">
                <div className="font-bold mb-1 tracking-wide">ZERO TRUST ARCHITECTURE SECURED</div>
                All global metrics visible on this plane are derived via encrypted structural `Aggregates`. Raw tenant context drops at the datacentre boundary and cannot enter this namespace.
            </div>
        </div>
    );
};
