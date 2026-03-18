import React, { useEffect, useState } from 'react';
import { DataTable } from '../../components/DataTable';
import { IntelligenceDetailDrawer } from '../../components/IntelligenceDetailDrawer';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';

export const AnomalyList: React.FC = () => {
    const [anomalies, setAnomalies] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedAnomaly, setSelectedAnomaly] = useState<any>(null);

    useEffect(() => {
        fetch('/api/admin/intelligence/anomalies', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('ppos_token') || 'admin-secret'}` }
        })
        .then(res => res.json())
        .then(data => {
            if (data.ok) setAnomalies(data.anomalies);
            setLoading(false);
        })
        .catch(() => setLoading(false));
    }, []);

    const columns = [
        { 
            header: 'Severity', 
            accessor: (a: any) => (
                <span className={`px-2 py-1 rounded-lg text-[10px] font-black border ${
                    a.severity === 'CRITICAL' ? 'bg-rose-50 text-rose-600 border-rose-100' :
                    a.severity === 'HIGH' ? 'bg-orange-50 text-orange-600 border-orange-100' :
                    'bg-amber-50 text-amber-600 border-amber-100'
                }`}>
                    {a.severity}
                </span>
            ),
            sortKey: 'severity'
        },
        { header: 'Type', accessor: 'type' },
        { header: 'Summary', accessor: 'summary' },
        { header: 'Entity', accessor: (a: any) => `${a.entityType}:${a.entityId}` },
        { 
            header: 'Time', 
            accessor: (a: any) => new Date(a.timestamp).toLocaleTimeString(),
            sortKey: 'timestamp'
        }
    ];

    return (
        <div className="space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-black text-slate-900 flex items-center gap-3">
                        <ExclamationTriangleIcon className="w-8 h-8 text-amber-500" />
                        Operational Anomalies
                    </h2>
                    <p className="text-slate-500 font-medium mt-1">Real-time detection of failure clusters and processing stalls.</p>
                </div>
            </div>

            <DataTable 
                columns={columns} 
                data={anomalies} 
                isLoading={loading}
                onRowClick={(a) => setSelectedAnomaly(a)} 
            />

            <IntelligenceDetailDrawer 
                isOpen={!!selectedAnomaly}
                onClose={() => setSelectedAnomaly(null)}
                data={selectedAnomaly}
                type="anomaly"
            />
        </div>
    );
};
