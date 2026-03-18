import React, { useEffect, useState } from 'react';

export const GlobalIncidents: React.FC = () => {
    const [audit, setAudit] = useState<any[]>([]);

    useEffect(() => {
        const fetchAudit = async () => {
            const rs = await fetch('/api/admin/global/audit', {
                headers: { 'Authorization': 'Bearer admin-secret' }
            });
            const d = await rs.json();
            if (d.ok) {
                const incidents = d.audit.filter((a: any) => a.event.includes('INCIDENT'));
                setAudit(incidents);
            }
        };
        fetchAudit();
    }, []);

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 border-b pb-4">Global Incident Coordination</h1>
            <p className="text-sm text-slate-500">Audit of systemic responses triggered by network-wide degradation or policy rollout failures.</p>

            <div className="space-y-4 mt-6">
                {audit.length === 0 ? (
                    <div className="text-center p-8 text-slate-400 border-2 border-dashed rounded-xl">No global incidents requiring coordination detected.</div>
                ) : audit.map((a, i) => (
                    <div key={i} className="bg-amber-50 border border-amber-200 rounded-xl p-5 shadow-sm text-sm">
                        <div className="flex justify-between items-start mb-2">
                            <span className="font-mono text-xs text-amber-700 font-bold">{a.event}</span>
                            <span className="text-xs text-slate-500">{a.timestamp}</span>
                        </div>
                        <div className="text-amber-900 font-bold mb-2">
                             Network coordinator triggered across regions.
                        </div>
                        <div className="bg-white/50 p-2 rounded font-mono text-xs text-amber-800 border border-amber-100">
                            {JSON.stringify(a.details)}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
