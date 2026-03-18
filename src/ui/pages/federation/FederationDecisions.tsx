import React, { useEffect, useState } from 'react';

export const FederationDecisions: React.FC = () => {
    const [audit, setAudit] = useState<any[]>([]);

    useEffect(() => {
        const fetchAudit = async () => {
            const rs = await fetch('/api/admin/federation/audit', {
                headers: { 'Authorization': 'Bearer admin-secret' }
            });
            const d = await rs.json();
            if (d.ok) {
                // Filter only successful federation routing/agreements
                const decisions = d.audit.filter((a: any) => !a.event.includes('BLOCKED'));
                setAudit(decisions);
            }
        };
        fetchAudit();
    }, []);

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 border-b pb-4">Federated Arbitration Trace</h1>
            <p className="text-sm text-slate-500">Log of successfully executed topological shifts negotiated between global instances.</p>

            <div className="bg-white border rounded-xl overflow-hidden shadow-sm mt-4">
                <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 border-b">
                        <tr>
                            <th className="p-4 font-bold text-slate-600">Event Signature</th>
                            <th className="p-4 font-bold text-slate-600">Origin</th>
                            <th className="p-4 font-bold text-slate-600">Target Segment</th>
                            <th className="p-4 font-bold text-slate-600">Detail Record</th>
                        </tr>
                    </thead>
                    <tbody>
                        {audit.length === 0 ? (
                            <tr><td colSpan={4} className="p-8 text-center text-slate-400">No successful federation events recorded.</td></tr>
                        ) : audit.map((a, i) => (
                            <tr key={i} className="border-b last:border-0 hover:bg-slate-50">
                                <td className="p-4 font-mono text-xs">{a.event}</td>
                                <td className="p-4"><span className="bg-slate-200 text-slate-700 px-2 py-0.5 rounded font-bold text-xs">{a.originInstance}</span></td>
                                <td className="p-4"><span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded font-bold text-xs">{a.targetInstance}</span></td>
                                <td className="p-4 text-xs font-mono text-slate-500">{JSON.stringify(a.details)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
