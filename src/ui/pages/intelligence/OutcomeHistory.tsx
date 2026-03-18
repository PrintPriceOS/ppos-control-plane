import React, { useEffect, useState } from 'react';

export const OutcomeHistory: React.FC = () => {
    const [outcomes, setOutcomes] = useState<any[]>([]);

    useEffect(() => {
        const fetchMemory = async () => {
            const rs = await fetch('/api/admin/learning/outcomes', {
                headers: { 'Authorization': 'Bearer admin-secret' }
            });
            const d = await rs.json();
            if (d.ok) setOutcomes(d.outcomes.reverse());
        };
        fetchMemory();
    }, []);

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            <h1 className="text-2xl font-bold tracking-tight border-b pb-4">Outcome Memory Ledger</h1>
            <p className="text-sm text-slate-500">Append-only log of historical optimizations and their evaluated deterministic results.</p>

            <div className="space-y-4">
                {outcomes.length === 0 ? (
                    <div className="p-8 text-center text-slate-400 border-2 border-dashed rounded-xl">Memory ledger is empty.</div>
                ) : outcomes.map((o, idx) => (
                    <div key={idx} className="bg-white border rounded-xl p-5 shadow-sm text-sm">
                        <div className="flex justify-between items-center mb-2">
                            <span className="font-mono text-xs text-slate-400">{o.candidateId}</span>
                            <span className="text-xs text-slate-400">{new Date(o.timestamp).toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <div>
                                <h3 className="font-bold text-slate-800 text-base">{o.type}</h3>
                                <p className="text-slate-600 mt-1">
                                    Target: <strong className="text-slate-700">{o.targetType}::{o.targetId}</strong>
                                </p>
                            </div>
                            <div className="text-right">
                                <span className={`px-3 py-1 rounded-full text-xs font-bold tracking-wide uppercase ${
                                    o.verdict === 'IMPROVED' ? 'bg-green-100 text-green-700' :
                                    o.verdict === 'UNSAFE' ? 'bg-red-100 text-red-700' :
                                    o.verdict === 'REGRESSED' ? 'bg-amber-100 text-amber-700' :
                                    'bg-slate-100 text-slate-700'
                                }`}>
                                    {o.verdict}
                                </span>
                            </div>
                        </div>
                        
                        <div className="mt-4 pt-4 border-t grid grid-cols-2 gap-4 text-xs">
                            <div>
                                <strong className="text-slate-500 block mb-1">Metrics Before</strong>
                                <pre className="bg-slate-50 p-2 rounded text-slate-600 border overflow-x-auto">
                                    {JSON.stringify(o.metricsBefore, null, 2)}
                                </pre>
                            </div>
                            <div>
                                <strong className="text-slate-500 block mb-1">Metrics After</strong>
                                <pre className="bg-slate-50 p-2 rounded text-slate-600 border overflow-x-auto">
                                    {JSON.stringify(o.metricsAfter, null, 2)}
                                </pre>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
