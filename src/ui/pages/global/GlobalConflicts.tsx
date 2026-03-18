import React, { useEffect, useState } from 'react';

export const GlobalConflicts: React.FC = () => {
    const [audit, setAudit] = useState<any[]>([]);

    useEffect(() => {
        const fetchAudit = async () => {
            const rs = await fetch('/api/admin/global/audit', {
                headers: { 'Authorization': 'Bearer admin-secret' }
            });
            const d = await rs.json();
            if (d.ok) {
                const conflicts = d.audit.filter((a: any) => a.event.includes('BLOCKED_BY_LOCAL_SOVEREIGNTY'));
                setAudit(conflicts);
            }
        };
        fetchAudit();
    }, []);

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 border-b pb-4 underline decoration-red-500 decoration-4">Sovereignty Conflicts</h1>
            <p className="text-sm text-slate-500">Cases where local Guardrails or Tenant SLAs hard-rejected a Global Governance directive. Represents the absolute boundary of Zero-Trust.</p>

            <div className="space-y-4 mt-6">
                {audit.length === 0 ? (
                    <div className="text-center p-8 text-slate-400 border-2 border-dashed rounded-xl">No global policy conflicts reported. Local sovereignty is in alignment with global authority.</div>
                ) : audit.map((a, i) => (
                    <div key={i} className="bg-red-50 border border-red-200 rounded-xl p-5 shadow-sm text-sm relative overflow-hidden">
                        <div className="absolute right-0 top-0 bg-red-600 text-white px-3 py-1 text-[10px] font-bold uppercase -skew-x-12">Conflict Detected</div>
                        <div className="flex flex-col gap-2">
                             <span className="font-mono text-xs text-red-500 font-bold tracking-widest">{a.event}</span>
                             <div className="text-red-900">
                                <strong>Origin Authority:</strong> {a.originInstance} 
                                <br />
                                <strong>Blocked Target:</strong> {a.targetInstance}
                             </div>
                             <div className="bg-red-100/50 p-3 rounded font-mono text-xs text-red-800 border border-red-200 mt-2">
                                <strong>Reason:</strong> {a.details.reason}
                                <div className="mt-2 pt-2 border-t border-red-200 text-red-600">
                                    Local Sovereign Precedence Engine enforced absolute block.
                                </div>
                             </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
