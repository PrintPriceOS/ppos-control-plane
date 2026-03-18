import React, { useEffect, useState } from 'react';

export const StrategyPerformance: React.FC = () => {
    const [strategies, setStrategies] = useState<any[]>([]);

    useEffect(() => {
        const fetchStrats = async () => {
            const rs = await fetch('/api/admin/learning/strategies', {
                headers: { 'Authorization': 'Bearer admin-secret' }
            });
            const d = await rs.json();
            if (d.ok) setStrategies(d.strategies);
        };
        fetchStrats();
    }, []);

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            <h1 className="text-2xl font-bold tracking-tight border-b pb-4">Contextual Strategy Ranking</h1>
            <p className="text-sm text-slate-500">Live ranking of optimization maneuvers evaluated over recorded history.</p>

            <div className="space-y-4">
                {strategies.length === 0 ? (
                    <div className="p-8 text-center text-slate-400 border-2 border-dashed rounded-xl">Accumulating evaluation history... minimum sample size required.</div>
                ) : strategies.map((s, idx) => (
                    <div key={idx} className="bg-white border rounded-xl p-5 shadow-sm flex justify-between items-center">
                        <div>
                            <span className="text-xs uppercase font-bold text-slate-400 tracking-wider">Rank #{idx+1}</span>
                            <h3 className="font-bold text-lg text-slate-800 mt-1">{s.type}</h3>
                            <p className="text-sm text-slate-600">Sample Size: {s.sampleSize} executions.</p>
                        </div>
                        <div className="flex gap-6 text-right">
                            <div>
                                <p className="text-xs text-slate-400 uppercase tracking-wide">Avg Improvement</p>
                                <p className="font-bold text-lg text-slate-700">{s.averageImprovement > 0 ? `+${s.averageImprovement}` : '0'}</p>
                            </div>
                            <div>
                                <p className="text-xs text-slate-400 uppercase tracking-wide">Success Rate</p>
                                <p className={`font-bold text-lg ${s.successRate > 70 ? 'text-green-600' : 'text-amber-600'}`}>
                                    {s.successRate}%
                                </p>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
