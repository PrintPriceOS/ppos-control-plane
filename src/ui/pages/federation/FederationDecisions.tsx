import React, { useEffect, useState } from 'react';
import { adminFetch } from '../../lib/adminApi';
import { DataTable } from '../../components/DataTable';

export const FederationDecisions: React.FC = () => {
    const [audit, setAudit] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchAudit = async () => {
            try {
                const d = await adminFetch<any>('/api/admin/federation/audit');
                if (d.ok) {
                    const decisions = d.audit.filter((a: any) => !a.event.includes('BLOCKED'));
                    setAudit(decisions);
                }
            } catch (e) {} finally {
                setIsLoading(false);
            }
        };
        fetchAudit();
        const intervalId = setInterval(fetchAudit, 2500);
        return () => clearInterval(intervalId);
    }, []);

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            <h1 className="text-2xl font-black tracking-tight text-[#ECECF1] border-b ppos-border pb-4">Federated Arbitration Trace</h1>
            <p className="text-sm text-slate-400">Log of successfully executed topological shifts negotiated between global instances.</p>

            <div className="glass border ppos-border ppos-surface mt-4 overflow-hidden">
                <DataTable 
                    isLoading={isLoading}
                    data={audit}
                    columns={[
                        {
                            header: 'Event Signature',
                            accessor: (a) => <span className="font-mono text-xs text-[#ECECF1]">{a.event}</span>
                        },
                        {
                            header: 'Origin',
                            accessor: (a) => <span className="bg-slate-800 text-[#ECECF1] px-2 py-0.5 rounded-none font-bold text-xs border ppos-border">{a.originInstance || a.origin_instance}</span>
                        },
                        {
                            header: 'Target Segment',
                            accessor: (a) => <span className="bg-indigo-950 text-indigo-400 px-2 py-0.5 rounded-none font-bold text-xs border border-indigo-500/20">{a.targetInstance || a.target_instance}</span>
                        },
                        {
                            header: 'Detail Record',
                            accessor: (a) => <span className="text-xs font-mono text-slate-400 block max-w-md truncate" title={JSON.stringify(a.details)}>{JSON.stringify(a.details)}</span>
                        }
                    ]}
                />
            </div>
        </div>
    );
};
