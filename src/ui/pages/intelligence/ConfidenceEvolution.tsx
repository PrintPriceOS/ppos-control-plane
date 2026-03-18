import React, { useEffect, useState } from 'react';

export const ConfidenceEvolution: React.FC = () => {
    const [confidenceData, setConfidenceData] = useState<any[]>([]);

    useEffect(() => {
        const fetchConf = async () => {
            const rs = await fetch('/api/admin/learning/confidence', {
                headers: { 'Authorization': 'Bearer admin-secret' }
            });
            const d = await rs.json();
            if (d.ok) setConfidenceData(d.confidence);
        };
        fetchConf();
    }, []);

    const renderTrendIcon = (trend: string) => {
        if (trend === 'UP') return <span className="text-green-500 font-bold">↑ GROWING</span>;
        if (trend === 'DOWN') return <span className="text-red-500 font-bold">↓ DECAYING</span>;
        return <span className="text-slate-400 font-bold">→ STABLE</span>;
    };

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            <h1 className="text-2xl font-bold tracking-tight border-b pb-4">Confidence Evolution Model</h1>
            <p className="text-sm text-slate-500">Real-time system trust levels per optimization strategy. Low-confidence strategies (&lt;30%) are suppressed automatically.</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                {confidenceData.length === 0 ? (
                    <div className="col-span-2 p-8 text-center text-slate-400 border-2 border-dashed rounded-xl">No confidence data initialized.</div>
                ) : confidenceData.map((c, idx) => (
                    <div key={idx} className="bg-white border rounded-xl p-5 shadow-sm">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="font-bold text-slate-800">{c.strategyType}</h3>
                            <span className="text-xs">{renderTrendIcon(c.trend)}</span>
                        </div>
                        
                        <div className="mb-2 flex justify-between text-sm">
                            <span className="text-slate-500">System Trust Score</span>
                            <span className={`font-bold ${c.confidenceScore < 0.3 ? 'text-red-600' : 'text-blue-600'}`}>
                                {(c.confidenceScore * 100).toFixed(0)}%
                            </span>
                        </div>
                        
                        <div className="w-full bg-slate-100 rounded-full h-2.5 mb-1 overflow-hidden">
                            <div className={`h-2.5 rounded-full ${c.confidenceScore < 0.3 ? 'bg-red-500' : 'bg-blue-600'}`} style={{ width: `${Math.max(c.confidenceScore * 100, 2)}%` }}></div>
                        </div>
                        <div className="flex justify-between text-xs text-slate-400 mt-1">
                            <span>0% (Suppressed)</span>
                            <span>100% (Absolute)</span>
                        </div>

                        <div className="mt-4 pt-3 border-t flex justify-between text-xs text-slate-500">
                            <span>Evaluations: {c.sampleSize}</span>
                            <span>Updated: {new Date(c.lastUpdated).toLocaleTimeString()}</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
