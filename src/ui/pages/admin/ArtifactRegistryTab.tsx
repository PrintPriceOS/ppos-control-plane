// pages/admin/ArtifactRegistryTab.tsx
import React from "react";
import { getArtifacts } from "../../lib/adminApi";
import { useAdminQuery } from "../../hooks/useAdminData";
import { 
    CircleStackIcon, 
    ArrowPathIcon,
    DocumentMagnifyingGlassIcon,
    ShieldCheckIcon,
    TrashIcon
} from "@heroicons/react/24/outline";

export const ArtifactRegistryTab: React.FC = () => {
    const { data, status, error } = useAdminQuery("artifact-registry", () => getArtifacts());

    if (status === "loading") return <div className="p-20 text-center animate-pulse font-bold text-slate-400">Querying Industrial Registry...</div>;
    if (status === "error") return <div className="p-10 bg-red-50 text-red-700 rounded-none">Error: {error}</div>;

    const artifacts = data?.artifacts || [];

    return (
        <div className="space-y-6 animate-slide-fade">
            <div className="glass rounded-none border border-white overflow-hidden shadow-none">
                <div className="px-6 py-4 bg-slate-50/50 border-b border-white flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <CircleStackIcon className="w-5 h-5 text-slate-400" />
                        <div className="font-bold text-slate-800 text-sm tracking-tight">Industrial Artifact Registry</div>
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 text-slate-400 font-black uppercase tracking-widest border-b border-slate-100">
                            <tr>
                                <th className="px-6 py-3">Artifact ID</th>
                                <th className="px-6 py-3">Type</th>
                                <th className="px-6 py-3">Job ID</th>
                                <th className="px-6 py-3">Size</th>
                                <th className="px-6 py-3">Tier</th>
                                <th className="px-6 py-3">Created At</th>
                                <th className="px-6 py-3 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {artifacts.map((a: any) => (
                                <tr key={a.id} className="hover:bg-slate-50/50 transition-colors group">
                                    <td className="px-6 py-4 font-mono text-slate-600">{a.id.substring(0, 12)}...</td>
                                    <td className="px-6 py-4">
                                        <span className="px-2 py-0.5 rounded-none bg-blue-50 text-blue-600 font-bold uppercase tracking-tighter">
                                            {a.artifact_type}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 font-mono text-slate-400">{a.job_id.substring(0, 8)}...</td>
                                    <td className="px-6 py-4 font-bold text-slate-700">{(a.size_bytes / (1024 * 1024)).toFixed(2)} MB</td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2 py-0.5 rounded-none text-[10px] font-black uppercase ${
                                            a.retention_class === 'HOT' ? 'bg-orange-50 text-orange-600' : 'bg-slate-100 text-slate-500'
                                        }`}>
                                            {a.retention_class}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-slate-400">{new Date(a.created_at).toLocaleString()}</td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button className="p-1.5 hover:bg-white rounded-none text-slate-400 hover:text-blue-600 border border-transparent hover:border-blue-100">
                                                <DocumentMagnifyingGlassIcon className="w-4 h-4" />
                                            </button>
                                            <button className="p-1.5 hover:bg-white rounded-none text-slate-400 hover:text-red-600 border border-transparent hover:border-red-100">
                                                <TrashIcon className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};
