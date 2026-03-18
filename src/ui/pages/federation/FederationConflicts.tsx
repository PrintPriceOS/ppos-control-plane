import React, { useEffect, useState } from 'react';

export const FederationConflicts: React.FC = () => {
    const [conflicts, setConflicts] = useState<any[]>([]);

    useEffect(() => {
        const fetchAudit = async () => {
            const rs = await fetch('/api/admin/federation/audit', {
                headers: { 'Authorization': 'Bearer admin-secret' }
            });
            const d = await rs.json();
            if (d.ok) {
                // Filter only BLOCKED actions preventing dangerous cross-mesh topology
                const blocks = d.audit.filter((a: any) => a.event.includes('POLICY_BLOCKED') || a.event.includes('BLOCKED'));
                setConflicts(blocks);
            }
        };
        fetchAudit();
    }, []);

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 border-b pb-4">Federation Policy Blocks</h1>
            <p className="text-sm text-slate-500">Audit trail of cross-mesh connectivity attempts hard-rejected by localized policy constraints or data safety boundaries.</p>

            <div className="space-y-4 mt-6">
                {conflicts.length === 0 ? (
                    <div className="p-8 text-center text-slate-400 border-2 border-dashed rounded-xl">No federation policy blocks registered.</div>
                ) : conflicts.map((c, i) => (
                    <div key={i} className="bg-red-50 border border-red-100 rounded-xl p-5 shadow-sm text-sm flex flex-col md:flex-row gap-4">
                        <div className="flex-none">
                            <span className="bg-red-200 text-red-800 text-xs font-bold px-2 py-1 rounded">ACCESS DENIED</span>
                        </div>
                        <div className="flex-1">
                            <div className="mb-2 font-mono text-xs text-slate-600">ID: {c.id}</div>
                            <div className="mb-2 text-slate-800">
                                <strong>Attempt:</strong> {c.originInstance} tried to interface with {c.targetInstance}
                            </div>
                            <div className="text-red-700 bg-red-100 p-2 rounded inline-block font-mono text-xs break-all">
                                {JSON.stringify(c.details)}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
