import React, { useEffect, useState } from 'react';

export const OptimizationCandidates: React.FC = () => {
    const [candidates, setCandidates] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchCandidates = async () => {
            try {
                const rs = await fetch('/api/admin/optimization/candidates', {
                    headers: { 'Authorization': 'Bearer admin-secret' }
                });
                const d = await rs.json();
                if (d.ok) setCandidates(d.candidates);
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        fetchCandidates();
    }, []);

    const handleApply = async (id: string) => {
        await fetch('/api/admin/optimization/apply', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer admin-secret' },
            body: JSON.stringify({ candidateId: id })
        });
        alert('Action applied. Check outcomes.');
    };

    if (loading) return <div className="p-6">Loading candidates...</div>;

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            <h1 className="text-2xl font-bold tracking-tight border-b pb-4">Optimization Candidates</h1>
            
            <div className="space-y-4">
                {candidates.map(c => (
                    <div key={c.id} className="bg-white border rounded-xl p-5 shadow-sm">
                        <div className="flex justify-between items-start">
                            <div>
                                <h3 className="font-bold text-slate-800">{c.type} &rarr; {c.targetId}</h3>
                                <p className="text-sm text-slate-600 mt-1">{c.rationale?.summary}</p>
                                
                                <div className="flex items-center gap-4 mt-4">
                                    <span className={`px-2 py-1 rounded text-xs font-medium ${c.riskLevel === 'HIGH' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                                        Risk: {c.riskLevel}
                                    </span>
                                    <span className="text-sm text-slate-500">
                                        Expected: <strong className="text-slate-700">{c.expectedBenefit?.metric} {c.expectedBenefit?.expectedDelta}</strong>
                                    </span>
                                    {c.blockedByContract && (
                                        <span className="px-2 py-1 rounded text-xs font-medium bg-amber-100 text-amber-700">Blocked by Contract</span>
                                    )}
                                </div>
                            </div>
                            <div>
                                {!c.blockedByContract && (
                                    <button 
                                        onClick={() => handleApply(c.id)}
                                        className="px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded hover:bg-slate-800 transition"
                                    >
                                        Apply (Advisory)
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
