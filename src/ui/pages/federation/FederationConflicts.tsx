import React, { useEffect, useState } from 'react';
import { adminFetch } from '../../lib/adminApi';

export const FederationConflicts: React.FC = () => {
    const [conflicts, setConflicts] = useState<any[]>([]);

    useEffect(() => {
        const fetchAudit = async () => {
            try {
                const d = await adminFetch<any>('/api/admin/federation/audit');
                if (d.ok) {
                    const blocks = d.audit.filter((a: any) => 
                        a.event.includes('BLOCKED') || 
                        a.details?.code === 'DOWNGRADE_NOT_ALLOWED' || 
                        a.details?.code === 'TARGET_DEGRADED'
                    );
                    setConflicts(blocks);
                }
            } catch (e) {}
        };
        fetchAudit();
        const intervalId = setInterval(fetchAudit, 2500);
        return () => clearInterval(intervalId);
    }, []);

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            <h1 className="text-2xl font-black tracking-tight text-[#ECECF1] border-b ppos-border pb-4">Federation Policy Blocks</h1>
            <p className="text-sm text-slate-400">Audit trail of cross-mesh connectivity attempts hard-rejected by localized policy constraints or data safety boundaries.</p>

            <div className="space-y-4 mt-6">
                {conflicts.length === 0 ? (
                    <div className="p-8 text-center text-slate-500 border-2 border-dashed ppos-border rounded-none">No federation policy blocks registered.</div>
                ) : conflicts.map((c, i) => (
                    <div key={i} className="glass border border-red-500/20 bg-red-500/[0.02] p-5 text-red-400 font-mono text-xs flex flex-col md:flex-row gap-4">
                        <div className="flex-none">
                            <span className="bg-red-500/20 text-red-400 text-xs font-bold px-2 py-1 rounded-none border border-red-500/30">ACCESS DENIED</span>
                        </div>
                        <div className="flex-1">
                            <div className="mb-2 font-mono text-xs text-slate-500">ID: {c.id}</div>
                            <div className="mb-2 text-[#ECECF1] text-xs">
                                <strong>Attempt:</strong> {c.originInstance || c.origin_instance} tried to interface with {c.targetInstance || c.target_instance}
                            </div>
                            <div className="text-red-400 bg-red-500/10 p-3 rounded-none inline-block font-mono text-xs break-all border border-red-500/20 mt-1 max-w-full">
                                {JSON.stringify(c.details, null, 2)}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
