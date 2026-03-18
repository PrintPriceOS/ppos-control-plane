import React, { useEffect, useState } from 'react';

export const GlobalPosture: React.FC = () => {
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

    if (!posture) return <div className="p-10 text-center">Analysing Global Posture Assets...</div>;

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 border-b pb-4">Network Posture Heatmap</h1>
            <p className="text-sm text-slate-500">Global aggregation of sovereign instance states. Visualizes risk hotspots and autonomy status across the mesh.</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                <div className="bg-white border rounded-xl p-5 shadow-sm">
                    <h3 className="font-bold text-slate-800 mb-4 border-b pb-2">Health Distribution</h3>
                    <div className="space-y-4">
                        <div className="flex justify-between items-center text-sm">
                            <span className="text-slate-600 font-medium">Degraded Regions</span>
                            <span className={`px-2 py-0.5 rounded font-bold ${posture.degradedRegions.length > 0 ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                {posture.degradedRegions.length}
                            </span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {posture.degradedRegions.map((r: string) => (
                                <span key={r} className="text-xs bg-red-50 text-red-700 border border-red-100 px-2 py-1 rounded font-mono">{r}</span>
                            ))}
                            {posture.degradedRegions.length === 0 && <span className="text-xs text-slate-400 italic">No degraded regions detected.</span>}
                        </div>
                    </div>
                </div>

                <div className="bg-white border rounded-xl p-5 shadow-sm">
                    <h3 className="font-bold text-slate-800 mb-4 border-b pb-2">Autonomy & Policy Lockdown</h3>
                    <div className="space-y-4">
                        <div className="flex justify-between items-center text-sm">
                            <span className="text-slate-600 font-medium">Autonomy Restricted</span>
                            <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded font-bold">
                                {posture.autonomyRestrictedRegions.length}
                            </span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {posture.autonomyRestrictedRegions.map((r: string) => (
                                <span key={r} className="text-xs bg-indigo-50 text-indigo-700 border border-indigo-100 px-2 py-1 rounded font-mono">{r}</span>
                            ))}
                            {posture.autonomyRestrictedRegions.length === 0 && <span className="text-xs text-slate-400 italic">Global autonomy fully active.</span>}
                        </div>
                    </div>
                </div>
            </div>

            <div className="bg-slate-900 rounded-xl p-6 text-white border border-slate-800 mt-6 font-mono text-xs">
                <div className="text-slate-500 mb-2 uppercase font-bold tracking-widest">Global Posture Vector Snapshot</div>
                <div className="text-emerald-400">
                    {JSON.stringify(posture, null, 2)}
                </div>
            </div>
        </div>
    );
};
