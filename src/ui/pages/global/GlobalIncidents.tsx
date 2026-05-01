import React, { useEffect, useState } from 'react';
import { adminFetch } from '../../lib/adminApi';

export const GlobalIncidents: React.FC = () => {
    const [incidents, setIncidents] = useState<any[]>([]);

    useEffect(() => {
        const fetchIncidents = async () => {
            try {
                const d = await adminFetch<any>('/api/admin/global/audit');
                if (d.ok) {
                    setIncidents(d.audit.filter((a: any) => a.severity === 'CRITICAL'));
                }
            } catch (e) {}
        };
        fetchIncidents();
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
