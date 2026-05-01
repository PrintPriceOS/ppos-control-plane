// components/admin/IncidentRegistryTab.tsx
import React from "react";
import { 
    ExclamationTriangleIcon, 
    FireIcon, 
    ShieldExclamationIcon,
    MagnifyingGlassIcon,
    ChevronRightIcon
} from "@heroicons/react/24/outline";
import { getIndustrialIncidents } from "../../lib/adminApi";
import { useAdminQuery } from "../../hooks/useAdminData";
import { DataTable } from "../../components/DataTable";

export const IncidentRegistryTab: React.FC = () => {
    const q = useAdminQuery("industrial:incidents", getIndustrialIncidents, 30000);
    const incidents = q.data || [];

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 italic-text-off">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-black text-slate-900 tracking-tight">Industrial Incident Registry</h2>
                    <p className="text-xs text-slate-500 font-medium">Forensic tracking of operational degradation and self-healing events.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <IncidentStat label="Active Incidents" value={incidents.filter((i: any) => i.status === 'CRITICAL').length} icon={FireIcon} color="text-red-600" bg="bg-red-50" />
                <IncidentStat label="Auto-Remediated" value="8" icon={ShieldExclamationIcon} color="text-emerald-600" bg="bg-emerald-50" />
                <IncidentStat label="Fleet Anomalies" value="12" icon={ExclamationTriangleIcon} color="text-amber-600" bg="bg-amber-50" />
            </div>

            <DataTable 
                isLoading={q.status === 'loading'}
                data={incidents}
                columns={[
                    {
                        header: 'Severity',
                        accessor: (i) => (
                            <span className={`px-2 py-1 rounded-lg font-black text-[10px] uppercase tracking-widest ${
                                i.status === 'CRITICAL' ? 'bg-red-100 text-red-700' :
                                i.status === 'WARNING' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
                            }`}>
                                {i.status}
                            </span>
                        )
                    },
                    {
                        header: 'Scope',
                        accessor: (i) => <span className="font-bold text-slate-900 uppercase text-[10px] tracking-tight">{i.metadata_json?.scope || 'Global'}</span>
                    },
                    {
                        header: 'Incident Event',
                        accessor: (i) => (
                            <div className="flex flex-col">
                                <span className="font-black text-xs text-slate-900">{i.metadata_json?.event || 'Unknown Anomaly'}</span>
                                <span className="text-[10px] text-slate-400 font-mono truncate max-w-xs">{JSON.stringify(i.metadata_json?.details || {})}</span>
                            </div>
                        )
                    },
                    {
                        header: 'Timestamp',
                        accessor: (i) => <span className="text-xs text-slate-500">{new Date(i.created_at).toLocaleString()}</span>
                    },
                    {
                        header: 'RCA Status',
                        accessor: (i) => (
                            <div className="flex items-center gap-2">
                                <div className={`w-2 h-2 rounded-full ${i.metadata_json?.details?.remediated ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                                <span className="text-[10px] font-black uppercase text-slate-500">{i.metadata_json?.details?.remediated ? 'REMEDIATED' : 'INVESTIGATING'}</span>
                            </div>
                        )
                    },
                    {
                        header: '',
                        accessor: () => <ChevronRightIcon className="w-4 h-4 text-slate-300" />,
                        className: 'w-8'
                    }
                ]}
            />
        </div>
    );
};

const IncidentStat = ({ label, value, icon: Icon, color, bg }: any) => (
    <div className={`p-6 rounded-3xl ${bg} border border-white flex items-center gap-4`}>
        <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm">
            <Icon className={`w-6 h-6 ${color}`} />
        </div>
        <div>
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest leading-none mb-1">{label}</p>
            <h3 className={`text-2xl font-black ${color} leading-none`}>{value}</h3>
        </div>
    </div>
);
