import React, { useEffect, useState } from 'react';

export const AgentDecisions: React.FC = () => {
    const [decisions, setDecisions] = useState<any[]>([]);

    useEffect(() => {
        const fetchDecisions = async () => {
            const rs = await fetch('/api/admin/agents/decisions', {
                headers: { 'Authorization': 'Bearer admin-secret' }
            });
            const d = await rs.json();
            if (d.ok) setDecisions(d.decisions);
        };
        fetchDecisions();
    }, []);

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 border-b pb-4">Agent Executive Decisions</h1>
            <p className="text-sm text-slate-500">Audit log of system actions permitted by the Central Orchestrator following multi-agent peer review.</p>

            <div className="bg-white border rounded-xl overflow-hidden shadow-sm mt-4">
                <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 border-b">
                        <tr>
                            <th className="p-4 font-bold text-slate-600">Proposal ID</th>
                            <th className="p-4 font-bold text-slate-600">Action</th>
                            <th className="p-4 font-bold text-slate-600">Author Agent</th>
                            <th className="p-4 font-bold text-slate-600">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {decisions.length === 0 ? (
                            <tr><td colSpan={4} className="p-8 text-center text-slate-400">No decisions orchestrated yet.</td></tr>
                        ) : decisions.map((d, i) => (
                            <tr key={i} className="border-b last:border-0 hover:bg-slate-50">
                                <td className="p-4 font-mono text-xs">{d.proposalId}</td>
                                <td className="p-4">{d.action || 'KNOWN_ACTION'}</td>
                                <td className="p-4">{d.agentType || 'UNKNOWN_AGENT'}</td>
                                <td className="p-4">
                                    <span className={`px-2 py-1 rounded text-xs font-bold ${d.status === 'APPROVED' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{d.status}</span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
