import React, { useEffect, useState } from 'react';

export const OptimizationOutcomes: React.FC = () => {
    const [outcomes, setOutcomes] = useState<any[]>([]);
    
    useEffect(() => {
        const fetchOutcomes = async () => {
            const rs = await fetch('/api/admin/optimization/outcomes', {
                headers: { 'Authorization': 'Bearer admin-secret' }
            });
            const d = await rs.json();
            if (d.ok) setOutcomes(d.outcomes);
        };
        fetchOutcomes();
    }, []);

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            <h1 className="text-2xl font-bold tracking-tight border-b pb-4">Decision vs Outcome Evaluation</h1>
            <p className="text-sm text-slate-500">History of applied actions and actual measured results.</p>
            
            <div className="space-y-4">
                {outcomes.length === 0 ? (
                    <div className="p-8 text-center text-slate-400 border-2 border-dashed rounded-xl">No outcomes recorded yet. Apply a candidate.</div>
                ) : outcomes.map((o, idx) => (
                    <div key={idx} className="bg-white border rounded-xl p-5 shadow-sm">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="font-bold text-slate-800">Candidate: {o.candidateId}</h3>
                                <p className="text-sm text-slate-600 mt-1">{o.summary}</p>
                            </div>
                            <div>
                                <span className={`px-3 py-1 rounded-full text-xs font-bold tracking-wide ${o.verdict === 'IMPROVED' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                    {o.verdict}
                                </span>
                            </div>
                        </div>
                        {o.rollbackRecommended && (
                             <div className="mt-3 text-xs font-medium text-red-600 flex items-center gap-1">
                                 <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                                 Rollback triggers fired due to assertion failures or regressions.
                             </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};
