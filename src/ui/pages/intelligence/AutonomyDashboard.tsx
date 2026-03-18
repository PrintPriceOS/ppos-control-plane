import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

export const AutonomyDashboard: React.FC = () => {
    const [strategies, setStrategies] = useState<any[]>([]);

    useEffect(() => {
        const fetchStatus = async () => {
            const rs = await fetch('/api/admin/autonomy/status', {
                headers: { 'Authorization': 'Bearer admin-secret' }
            });
            const d = await rs.json();
            if (d.ok) setStrategies(d.status);
        };
        fetchStatus();
    }, []);

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            <div className="flex justify-between items-center border-b pb-4">
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">Controlled Autonomy Expansion</h1>
                <Link to="/intelligence/autonomy/policies" className="px-4 py-2 bg-slate-900 text-white rounded font-medium text-sm hover:bg-slate-800">
                    Policy Framework
                </Link>
            </div>
            
            <p className="text-sm text-slate-500">
                Phase 13 safely promotes optimization strategies into BOUNDED_AUTO mode based on historical success metrics and algorithmic confidence.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                {strategies.map((s, idx) => (
                    <div key={idx} className={`bg-white border-2 rounded-xl p-5 shadow-sm ${s.currentState === 'BOUNDED_AUTO' ? 'border-indigo-400' : 'border-slate-200'}`}>
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="font-bold text-slate-800">{s.strategyType}</h3>
                            <span className={`px-3 py-1 text-xs font-bold tracking-wider rounded-full ${
                                s.currentState === 'BOUNDED_AUTO' ? 'bg-indigo-100 text-indigo-700' :
                                s.currentState === 'SUPPRESSED' ? 'bg-red-100 text-red-700' :
                                'bg-slate-100 text-slate-700'
                            }`}>
                                {s.currentState}
                            </span>
                        </div>
                        
                        <div className="flex gap-4 mb-4">
                            <div className="flex-1 bg-slate-50 p-3 rounded border border-slate-100">
                                <span className="block text-xs text-slate-400 uppercase">Confidence</span>
                                <span className="font-mono text-sm">{(s.metrics.confidenceScore * 100).toFixed(0)}%</span>
                            </div>
                            <div className="flex-1 bg-slate-50 p-3 rounded border border-slate-100">
                                <span className="block text-xs text-slate-400 uppercase">Evaluations</span>
                                <span className="font-mono text-sm">{s.metrics.sampleSize}</span>
                            </div>
                        </div>

                        <div className="pt-3 border-t text-sm">
                            <strong className="text-slate-500 text-xs uppercase block mb-1">Eligibility Status</strong>
                            {s.isEligible ? (
                                <span className="text-green-600 flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-green-500" /> Fully Eligible for Autonomy</span>
                            ) : (
                                <span className="text-amber-600 flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-amber-500" /> {s.reason}</span>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
