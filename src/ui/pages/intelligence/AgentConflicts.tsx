import React, { useEffect, useState } from 'react';

export const AgentConflicts: React.FC = () => {
    const [conflicts, setConflicts] = useState<any[]>([]);

    useEffect(() => {
        const fetchConflicts = async () => {
            const rs = await fetch('/api/admin/agents/decisions', {
                headers: { 'Authorization': 'Bearer admin-secret' }
            });
            const d = await rs.json();
            if (d.ok) {
                // Filter only decisions that were blocked due to conflict resolution
                const onlyBlocked = d.decisions.filter((x:any) => x.status === 'BLOCKED');
                setConflicts(onlyBlocked);
            }
        };
        fetchConflicts();
    }, []);

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 border-b pb-4">Orchestrator Conflict Resolution</h1>
            <p className="text-sm text-slate-500">Record of inter-agent policy friction automatically resolved by the conflict engine hierarchy.</p>

            <div className="space-y-4 mt-6">
                {conflicts.length === 0 ? (
                    <div className="p-8 text-center text-slate-400 border-2 border-dashed rounded-xl">No severe conflicts currently logged.</div>
                ) : conflicts.map((c, i) => (
                    <div key={i} className="bg-red-50 border border-red-100 rounded-xl p-5 shadow-sm text-sm">
                        <div className="flex justify-between items-center mb-2">
                            <span className="font-bold text-red-800">Proposal Blocked</span>
                            <span className="font-mono text-xs text-red-400">{c.proposalId}</span>
                        </div>
                        <div className="text-red-700 mb-2">
                            <strong>Reason for Veto:</strong> {c.reason}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
