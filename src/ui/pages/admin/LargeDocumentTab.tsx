// pages/admin/LargeDocumentTab.tsx
import React from "react";
import { getPreflightJobs } from "../../lib/adminApi";
import { useAdminQuery } from "../../hooks/useAdminData";
import { 
    DocumentDuplicateIcon, 
    ExclamationCircleIcon,
    BoltIcon,
    ClockIcon,
    ScaleIcon
} from "@heroicons/react/24/outline";

export const LargeDocumentTab: React.FC = () => {
    const { data, status, error } = useAdminQuery("large-document-jobs", () => getPreflightJobs({ largeOnly: true }));

    if (status === "loading") return <div className="p-20 text-center animate-pulse font-bold text-slate-400">Syncing Industrial Pipeline...</div>;
    if (status === "error") return <div className="p-10 bg-red-50 text-red-700 rounded-none">Error: {error}</div>;

    const jobs = data?.jobs || [];

    return (
        <div className="space-y-6 animate-slide-fade">
            {/* Pipeline Vitals */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <VitalCard label="Active Isolated Jobs" value={String(jobs.filter((j: any) => j.status === 'PROCESSING').length)} icon={BoltIcon} color="blue" />
                <VitalCard label="Avg Large Latency" value="18m" icon={ClockIcon} color="amber" />
                <VitalCard label="Peak Memory Load" value="14.2 GB" icon={ScaleIcon} color="indigo" />
                <VitalCard label="Stalled Artifacts" value="0" icon={ExclamationCircleIcon} color="emerald" />
            </div>

            <div className="glass rounded-none border border-white overflow-hidden shadow-none">
                <div className="px-6 py-4 bg-slate-50/50 border-b border-white flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <DocumentDuplicateIcon className="w-5 h-5 text-slate-400" />
                        <div className="font-bold text-slate-800 text-sm tracking-tight">Isolated Large Document Queue</div>
                    </div>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-100 px-2 py-0.5 rounded-none">DEDICATED-RESOURCES</span>
                </div>
                <div className="p-0">
                    {jobs.length === 0 ? (
                        <div className="p-20 text-center text-slate-400 italic text-xs uppercase tracking-widest">No active large-scale documents in pipeline</div>
                    ) : (
                        <table className="w-full text-left text-xs">
                            <thead className="bg-slate-50 text-slate-400 font-black uppercase tracking-widest border-b border-slate-100">
                                <tr>
                                    <th className="px-6 py-3">Job ID</th>
                                    <th className="px-6 py-3">Filename</th>
                                    <th className="px-6 py-3">Size</th>
                                    <th className="px-6 py-3">Status</th>
                                    <th className="px-6 py-3">Progress</th>
                                    <th className="px-6 py-3">Created At</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {jobs.map((j: any) => (
                                    <tr key={j.jobId} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="px-6 py-4 font-mono text-slate-600">{j.jobId.substring(0, 12)}...</td>
                                        <td className="px-6 py-4 font-bold text-slate-800">{j.filename || 'anonymous_industrial.pdf'}</td>
                                        <td className="px-6 py-4">
                                            <span className="font-black text-indigo-600">{(j.fileSize / (1024 * 1024)).toFixed(0)} MB</span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <StatusBadge status={j.status} />
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="w-24 h-1.5 bg-slate-100 rounded-none overflow-hidden border border-slate-200">
                                                <div className="h-full bg-blue-500 rounded-none" style={{ width: `${j.progress}%` }} />
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-slate-400">{new Date(j.createdAt).toLocaleString()}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
};

const VitalCard = ({ label, value, icon: Icon, color }: { label: string, value: string, icon: any, color: string }) => (
    <div className="glass rounded-none p-4 border border-white flex items-center gap-4">
        <div className={`p-2 rounded-none bg-${color}-50 text-${color}-600`}>
            <Icon className="w-5 h-5" />
        </div>
        <div>
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{label}</div>
            <div className="text-lg font-black text-slate-800">{value}</div>
        </div>
    </div>
);

const StatusBadge = ({ status }: { status: string }) => (
    <span className={`px-2 py-0.5 rounded-none text-[9px] font-black uppercase tracking-widest border ${
        status === 'PROCESSING' ? 'bg-blue-50 border-blue-100 text-blue-700 animate-pulse' : 
        status === 'COMPLETED' ? 'bg-emerald-50 border-emerald-100 text-emerald-700' :
        'bg-slate-50 border-slate-100 text-slate-500'
    }`}>
        {status}
    </span>
);
