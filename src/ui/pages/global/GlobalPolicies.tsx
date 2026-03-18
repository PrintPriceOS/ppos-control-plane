import React, { useEffect, useState } from 'react';

export const GlobalPolicies: React.FC = () => {
    const [policies, setPolicies] = useState<any[]>([]);

    useEffect(() => {
        const fetchPolicies = async () => {
            const rs = await fetch('/api/admin/global/policies', {
                headers: { 'Authorization': 'Bearer admin-secret' }
            });
            const d = await rs.json();
            if (d.ok) setPolicies(d.policies);
        };
        fetchPolicies();
    }, []);

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 border-b pb-4">Global Policy Registry</h1>
            <p className="text-sm text-slate-500">Immutable ledger containing universally scoped rules governing autonomy caps, federation constraints, and global service tier guarantees.</p>

            <div className="grid grid-cols-1 gap-4 mt-6">
                {policies.length === 0 ? (
                    <div className="text-center p-8 text-slate-400 border-2 border-dashed rounded-xl">No Global Policies registered.</div>
                ) : policies.map((p, i) => (
                    <div key={i} className={`bg-white rounded-xl shadow-sm border p-5 ${p.status === 'ACTIVE' ? 'border-emerald-300 ring-1 ring-emerald-50' : 'border-slate-200'}`}>
                        <div className="flex flex-col md:flex-row justify-between md:items-center mb-3">
                            <div>
                                <h3 className="font-bold text-slate-800 text-lg flex items-center gap-3">
                                    {p.policyId}
                                    <span className="text-xs bg-slate-100 text-slate-500 font-mono px-2 py-1 rounded">v{p.version}</span>
                                </h3>
                                <div className="text-xs text-slate-400 tracking-wider uppercase mt-1">{p.directiveType} • Scope: {p.scope}</div>
                            </div>
                            <div className="mt-2 md:mt-0">
                                <span className={`text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-widest ${
                                    p.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' :
                                    p.status === 'DRAFT' ? 'bg-slate-100 text-slate-500' :
                                    p.status === 'ROLLED_BACK' ? 'bg-red-100 text-red-700' :
                                    'bg-indigo-100 text-indigo-700'
                                }`}>{p.status}</span>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 text-sm">
                            <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                                <h4 className="text-xs font-bold text-slate-400 uppercase mb-2">Applicability Scopes</h4>
                                <div><strong>Regions:</strong> {p.appliesTo?.regions.join(', ') || 'N/A'}</div>
                                <div><strong>Enforced Tiers:</strong> {p.appliesTo?.serviceTiers.join(', ') || 'N/A'}</div>
                                <div className="mt-2 text-indigo-500 text-xs"><strong>Min OS:</strong> {p.compatibilityConstraints?.minOsVersion}</div>
                            </div>
                            <div className="bg-slate-900 p-4 rounded-lg border border-slate-800">
                                <h4 className="text-xs font-bold text-slate-400 uppercase mb-2">Immutable Payload</h4>
                                <pre className="text-[10px] text-emerald-400 font-mono overflow-x-auto whitespace-pre-wrap">
                                    {JSON.stringify(p.payload, null, 2)}
                                </pre>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
