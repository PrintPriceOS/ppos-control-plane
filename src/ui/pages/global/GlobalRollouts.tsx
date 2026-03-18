import React, { useEffect, useState } from 'react';

export const GlobalRollouts: React.FC = () => {
    const [rollouts, setRollouts] = useState<any[]>([]);

    useEffect(() => {
        const fetchRollouts = async () => {
            const rs = await fetch('/api/admin/global/rollouts', {
                headers: { 'Authorization': 'Bearer admin-secret' }
            });
            const d = await rs.json();
            if (d.ok) setRollouts(d.rollouts);
        };
        fetchRollouts();
    }, []);

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 border-b pb-4">Global Governance Rollouts</h1>
            <p className="text-sm text-slate-500">Track phased deployment of governance directives across the federated network. Supports Dry Run, Canary, and Staged phases.</p>

            <div className="space-y-4 mt-6">
                {rollouts.length === 0 ? (
                    <div className="text-center p-8 text-slate-400 border-2 border-dashed rounded-xl">No active or historical rollouts found.</div>
                ) : rollouts.map((r, i) => (
                    <div key={i} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                        <div className="bg-slate-50 p-4 border-b flex justify-between items-center">
                            <div>
                                <span className="text-xs font-mono text-slate-500 block mb-1">{r.rolloutId}</span>
                                <h3 className="font-bold text-slate-800">Policy: {r.policyId} (v{r.version})</h3>
                            </div>
                            <span className={`text-[10px] font-bold px-2 py-1 rounded uppercase bg-indigo-100 text-indigo-700`}>{r.phase}</span>
                        </div>
                        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <h4 className="text-xs font-bold text-slate-400 uppercase mb-2">Target Status</h4>
                                <div className="space-y-1">
                                    {Object.entries(r.statusByTarget).map(([node, status]: [string, any]) => (
                                        <div key={node} className="flex justify-between text-sm">
                                            <span className="text-slate-600 font-mono">{node}</span>
                                            <span className={`font-medium ${status.includes('OK') || status.includes('APPLIED') ? 'text-emerald-600' : 'text-red-600'}`}>{status}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div className="bg-slate-50 p-3 rounded-lg">
                                <h4 className="text-xs font-bold text-slate-400 uppercase mb-2 text-right">Conflicts / Blocks</h4>
                                {r.blockedTargets.length === 0 && r.projectedConflicts.length === 0 ? (
                                    <div className="text-right text-xs text-slate-400 italic">No sovereignty violations detected.</div>
                                ) : (
                                    <div className="space-y-2">
                                        {[...r.blockedTargets, ...r.projectedConflicts].map((c: any, ci: number) => (
                                            <div key={ci} className="text-xs text-red-700 bg-red-50 p-2 rounded border border-red-100">
                                                <strong>{c.target}:</strong> {c.reason}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
