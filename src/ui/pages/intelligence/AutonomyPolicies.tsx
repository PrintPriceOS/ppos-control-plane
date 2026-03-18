import React, { useEffect, useState } from 'react';

export const AutonomyPolicies: React.FC = () => {
    const [policy, setPolicy] = useState<any>(null);

    useEffect(() => {
        const fetchPolicy = async () => {
            const rs = await fetch('/api/admin/autonomy/policy', {
                headers: { 'Authorization': 'Bearer admin-secret' }
            });
            const d = await rs.json();
            if (d.ok) setPolicy(d.policy);
        };
        fetchPolicy();
    }, []);

    if (!policy) return <div className="p-8 text-center text-slate-500">Loading Policies...</div>;

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 border-b pb-4">Autonomy Policy Framework</h1>
            
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 text-white text-sm font-mono shadow-md">
                <div className="flex items-center gap-3 mb-4">
                    <div className={`w-3 h-3 rounded-full ${policy.globalAutonomyEnabled ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
                    <span className="text-lg">Global Autonomy Killswitch: {policy.globalAutonomyEnabled ? 'ARMED' : 'DISARMED'}</span>
                </div>
                <hr className="border-slate-700 my-4" />
                
                <h3 className="text-slate-400 mb-2 uppercase tracking-wide text-xs">Whitelist Execution Strategies</h3>
                <ul className="mb-6 space-y-1">
                    {policy.allowedStrategies.map((s: string) => <li key={s} className="text-green-400">+ {s}</li>)}
                </ul>

                <h3 className="text-slate-400 mb-2 uppercase tracking-wide text-xs">Blacklist Execution Strategies (Advisory Only)</h3>
                <ul className="mb-6 space-y-1">
                    {policy.blockedStrategies.map((s: string) => <li key={s} className="text-red-400">- {s}</li>)}
                </ul>

                <h3 className="text-slate-400 mb-2 uppercase tracking-wide text-xs">Tenant Overrides</h3>
                <pre className="bg-slate-950 p-4 rounded overflow-auto border border-slate-800 text-slate-300">
                    {JSON.stringify(policy.perTenantOverrides, null, 2)}
                </pre>
            </div>

            <div className="bg-amber-50 rounded-xl p-5 border border-amber-200">
                <h3 className="text-amber-800 font-bold mb-1">Security Warning</h3>
                <p className="text-amber-700 text-sm">
                    Modifying global autonomy mappings requires re-certification of the Control Plane policies. Active Guardrails still fully overlay and will hard-block autonomous events.
                </p>
            </div>
        </div>
    );
};
