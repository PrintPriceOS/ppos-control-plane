// pages/admin/TenantStorageTab.tsx
import React from "react";
import { getTenantsList, getTelemetrySnapshot } from "../../lib/adminApi";
import { useAdminQuery } from "../../hooks/useAdminData";
import { 
    CloudIcon, 
    ChartPieIcon,
    ExclamationTriangleIcon,
    ArrowTrendingUpIcon
} from "@heroicons/react/24/outline";

export const TenantStorageTab: React.FC = () => {
    const tenants = useAdminQuery("tenants-list", getTenantsList);
    const telemetry = useAdminQuery("telemetry-snapshot", getTelemetrySnapshot);

    if (tenants.status === "loading") return <div className="p-20 text-center animate-pulse font-bold text-slate-400">Calculating Tenant Footprints...</div>;

    const storage = telemetry.data?.storage || { totalSizeBytes: 0, capacityBytes: 1024 ** 4 };

    return (
        <div className="space-y-6 animate-slide-fade">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Global Capacity */}
                <div className="bg-white dark:bg-[#131314] border border-white/10 p-6">
                    <div className="flex items-center gap-2 text-slate-400 mb-4">
                        <CloudIcon className="w-5 h-5" />
                        <span className="text-[10px] font-black uppercase tracking-widest">Global Registry Footprint</span>
                    </div>
                    <div className="text-3xl font-black text-white tracking-tighter">
                        {Number((storage.totalSizeBytes || 0) / (1024 ** 3)).toFixed(2)} GB
                    </div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                        of {Number((storage.capacityBytes || 1024**4) / (1024 ** 3)).toFixed(0)} GB Industrial Quota
                    </div>
                    <div className="w-full h-2 bg-white/5 mt-6 overflow-hidden border border-white/10">
                        <div 
                            className="h-full bg-primary" 
                            style={{ width: `${(storage.totalSizeBytes / storage.capacityBytes) * 100}%` }} 
                        />
                    </div>
                </div>

                {/* Tier Distribution */}
                <div className="bg-white dark:bg-[#131314] border border-white/10 p-6">
                    <div className="flex items-center gap-2 text-slate-400 mb-4">
                        <ChartPieIcon className="w-5 h-5" />
                        <span className="text-[10px] font-black uppercase tracking-widest">Tier Distribution</span>
                    </div>
                    <div className="space-y-3">
                        <TierRow label="HOT (Active)" percentage={85} color="orange" />
                        <TierRow label="WARM (Lineage)" percentage={10} color="amber" />
                        <TierRow label="COLD (Archive)" percentage={5} color="blue" />
                    </div>
                </div>

                {/* Governance Warnings */}
                <div className="bg-white dark:bg-[#131314] border border-white/10 p-6">
                    <div className="flex items-center gap-2 text-slate-400 mb-4">
                        <ExclamationTriangleIcon className="w-5 h-5" />
                        <span className="text-[10px] font-black uppercase tracking-widest">Governance Alerts</span>
                    </div>
                    <div className="p-3 bg-amber-500/10 border border-amber-500/20 flex items-center gap-3">
                        <div className="w-8 h-8 bg-amber-500 flex items-center justify-center text-slate-900 dark:text-white">
                            <ArrowTrendingUpIcon className="w-5 h-5" />
                        </div>
                        <div>
                            <div className="text-[10px] font-bold text-amber-800 uppercase">Velocity Warning</div>
                            <div className="text-xs text-amber-700">Storage growing 4.2GB/day. Quota overflow in 84 days.</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Tenant Breakdown */}
            <div className="bg-white dark:bg-[#131314] border border-white/10 overflow-hidden">
                <div className="px-6 py-4 bg-white/5 border-b border-white/10">
                    <div className="font-bold text-slate-800 text-sm tracking-tight">Tenant Storage Governance</div>
                </div>
                <table className="w-full text-left text-xs">
                    <thead className="bg-white/5 text-slate-400 font-black uppercase tracking-widest border-b border-white/10">
                        <tr>
                            <th className="px-6 py-3">Tenant</th>
                            <th className="px-6 py-3">Artifacts</th>
                            <th className="px-6 py-3">Total Storage</th>
                            <th className="px-6 py-3">Quota Usage</th>
                            <th className="px-6 py-3">Retention Mode</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                        {tenants.data?.map((t: any) => (
                            <tr key={t.id} className="hover:bg-white/5 transition-colors">
                                <td className="px-6 py-4">
                                    <div className="font-bold text-slate-800">{t.name}</div>
                                    <div className="text-[10px] text-slate-400 font-mono">{t.id}</div>
                                </td>
                                <td className="px-6 py-4 font-bold text-slate-400">842</td>
                                <td className="px-6 py-4 font-black text-slate-900 dark:text-white">4.21 GB</td>
                                <td className="px-6 py-4">
                                    <div className="flex items-center gap-2">
                                        <div className="w-20 h-1.5 bg-white/5 overflow-hidden">
                                            <div className="h-full bg-primary" style={{ width: '42%' }} />
                                        </div>
                                        <span className="font-bold text-slate-500">42%</span>
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                    <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 text-[10px] font-black uppercase">Standard-Industrial</span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

const TierRow = ({ label, percentage, color }: { label: string, percentage: number, color: string }) => (
    <div className="space-y-1">
        <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest">
            <span className="text-slate-400">{label}</span>
            <span className={`text-${color}-600`}>{percentage}%</span>
        </div>
        <div className="w-full h-1.5 bg-white/5 overflow-hidden">
            <div className={`h-full bg-${color}-500`} style={{ width: `${percentage}%` }} />
        </div>
    </div>
);
