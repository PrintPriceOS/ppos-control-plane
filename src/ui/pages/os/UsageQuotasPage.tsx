import React from 'react';
import { 
    ChartBarSquareIcon, 
    CloudIcon, 
    QueueListIcon, 
    ShieldCheckIcon,
    UsersIcon,
    ArrowPathIcon,
    MagnifyingGlassIcon,
    ComputerDesktopIcon,
    ExclamationTriangleIcon
} from "@heroicons/react/24/outline";
import * as adminApi from "../../lib/adminApi";
import { StatusBadge } from "../../components/StatusBadge";

const formatBytes = (bytes: number, decimals = 2) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat(Number((bytes || 0) / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

export const UsageQuotasPage: React.FC = () => {
    const [overview, setOverview] = React.useState<adminApi.OverviewResponse | null>(null);
    const [tenants, setTenants] = React.useState<adminApi.TenantDetail[]>([]);
    const [storageSummary, setStorageSummary] = React.useState<any>(null);
    const [loading, setLoading] = React.useState(true);
    const [searchQuery, setSearchQuery] = React.useState("");

    const fetchData = async () => {
        setLoading(true);
        try {
            const [overviewData, tenantsData, storageData] = await Promise.all([
                adminApi.getOverview("24h"),
                adminApi.getTenantsList(),
                adminApi.getStorageSummary()
            ]);
            setOverview(overviewData);
            setTenants(tenantsData);
            setStorageSummary(storageData);
        } catch (err) {
            console.error('Failed to fetch usage data:', err);
        } finally {
            setLoading(false);
        }
    };

    React.useEffect(() => {
        fetchData();
    }, []);

    const filteredTenants = tenants.filter(t => 
        t.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
        t.id.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const stats = [
        { 
            label: 'Total Jobs Today', 
            value: overview?.totalJobs?.toLocaleString() || '0', 
            icon: ChartBarSquareIcon, 
            config: { bg: "bg-red-50 dark:bg-red-950/40", text: "text-[#dc0000] dark:text-red-400" } 
        },
        { 
            label: 'Storage Used', 
            value: storageSummary ? formatBytes(storageSummary.totalBytes || 0) : '0 Bytes', 
            icon: CloudIcon, 
            config: { bg: "bg-sky-50 dark:bg-sky-950/30", text: "text-sky-600 dark:text-sky-400" } 
        },
        { 
            label: 'Concurrent Batches', 
            value: overview?.activeJobs?.toString() || '0', 
            icon: QueueListIcon, 
            config: { bg: "bg-amber-50 dark:bg-amber-950/40", text: "text-amber-600 dark:text-amber-400" } 
        },
        { 
            label: 'Effective Limit Score', 
            value: overview ? '98%' : '---', 
            icon: ShieldCheckIcon, 
            config: { bg: "bg-emerald-50 dark:bg-emerald-950/40", text: "text-emerald-600 dark:text-emerald-400" } 
        }
    ];

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-black text-zinc-900 dark:text-zinc-100 tracking-tight">Usage & Quotas</h1>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400 font-medium tracking-tight">Real-time tenant consumption and systemic rate-matching logic.</p>
                </div>
                <div className="flex gap-3">
                    <div className="relative">
                        <MagnifyingGlassIcon className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input 
                            type="text" 
                            placeholder="Filter tenants..." 
                            className="pl-9 pr-4 py-2 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 rounded-none text-xs font-bold focus:border-[#dc0000] outline-none transition-all w-64 shadow-none placeholder:text-zinc-400 dark:placeholder:text-zinc-600"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <button onClick={fetchData} className="p-2 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 rounded-none hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors shadow-none">
                        <ArrowPathIcon className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {stats.map((stat, i) => (
                    <div key={i} className="bg-white dark:bg-zinc-950 p-5 rounded-none border border-zinc-200 dark:border-zinc-800 flex items-center gap-4 shadow-none">
                        <div className={`p-3 rounded-none ${stat.config.bg} ${stat.config.text}`}>
                            <stat.icon className="w-6 h-6" />
                        </div>
                        <div>
                            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">{stat.label}</p>
                            <p className="text-xl font-black text-zinc-900 dark:text-zinc-100">{stat.value}</p>
                        </div>
                    </div>
                ))}
            </div>

            <div className="bg-white dark:bg-zinc-950 rounded-none border border-zinc-200 dark:border-zinc-800 overflow-hidden shadow-none">
                <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50 dark:bg-zinc-900">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-red-50 dark:bg-red-950/40 rounded-none">
                            <UsersIcon className="w-5 h-5 text-[#dc0000] dark:text-red-400" />
                        </div>
                        <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider">Tenant Quota Explorer</h2>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                        <div className="w-2 h-2 rounded-none bg-emerald-500 animate-pulse"></div>
                        Live Metering Active
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
                                <th className="px-6 py-4 text-[10px] font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wide">Tenant</th>
                                <th className="px-6 py-4 text-[10px] font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wide">Status</th>
                                <th className="px-6 py-4 text-[10px] font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wide">Plan</th>
                                <th className="px-6 py-4 text-[10px] font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wide text-right">Daily Usage</th>
                                <th className="px-6 py-4 text-[10px] font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wide text-right">RPM Limit</th>
                                <th className="px-6 py-4 text-[10px] font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wide">Storage</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                            {filteredTenants.length > 0 ? filteredTenants.map((tenant) => (
                                <tr key={tenant.id} className="odd:bg-white odd:dark:bg-zinc-950 even:bg-zinc-50 even:dark:bg-zinc-900/40 hover:bg-zinc-100 hover:dark:bg-zinc-900/70 transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="flex flex-col">
                                            <span className="text-sm font-bold text-zinc-900 dark:text-zinc-200">{tenant.name}</span>
                                            <span className="text-[10px] font-mono text-zinc-400 dark:text-zinc-500">{tenant.id}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <StatusBadge status={tenant.status} />
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="text-xs font-bold text-zinc-600 dark:text-zinc-400">{tenant.plan}</span>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex flex-col items-end">
                                            <span className="text-sm font-black text-zinc-900 dark:text-zinc-200">{tenant.dailyUsage?.toLocaleString() || '0'}</span>
                                            <span className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase">of {tenant.daily_job_limit?.toLocaleString() || '∞'}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <span className="text-sm font-bold text-zinc-900 dark:text-zinc-200">{tenant.rate_limit_rpm}</span>
                                        <span className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 ml-1">RPM</span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="w-32">
                                            <div className="flex justify-between items-center mb-1">
                                                <span className="text-[9px] font-bold text-zinc-400 uppercase">Allocated</span>
                                                <span className="text-[9px] font-bold text-zinc-900 dark:text-zinc-200">80%</span>
                                            </div>
                                            <div className="h-1.5 w-full bg-zinc-100 dark:bg-zinc-800 rounded-none overflow-hidden">
                                                <div className="h-full bg-[#dc0000] rounded-none" style={{ width: '80%' }}></div>
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            )) : (
                                <tr className="bg-white dark:bg-zinc-950">
                                    <td colSpan={6} className="px-6 py-12 text-center">
                                        <div className="flex flex-col items-center gap-2">
                                            <ExclamationTriangleIcon className="w-8 h-8 text-zinc-300 dark:text-zinc-700" />
                                            <p className="text-sm font-bold text-zinc-400 dark:text-zinc-500">No tenants matching "{searchQuery}"</p>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="bg-white dark:bg-zinc-950 p-6 rounded-none border border-zinc-200 dark:border-zinc-800 shadow-none">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-sky-50 dark:bg-sky-950/30 rounded-none text-sky-600 dark:text-sky-400">
                            <ComputerDesktopIcon className="w-5 h-5" />
                        </div>
                        <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider">Systemic Capacity</h3>
                    </div>
                    <div className="space-y-4">
                        <div>
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-xs font-semibold text-zinc-500 uppercase tracking-tight">CPU Reservation</span>
                                <span className="text-xs font-bold text-zinc-900 dark:text-zinc-200">42%</span>
                            </div>
                            <div className="h-2 w-full bg-zinc-100 dark:bg-zinc-800 rounded-none overflow-hidden">
                                <div className="h-full bg-sky-500 rounded-none transition-all duration-1000" style={{ width: '42%' }}></div>
                            </div>
                        </div>
                        <div>
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-xs font-semibold text-zinc-500 uppercase tracking-tight">Memory Pressure</span>
                                <span className="text-xs font-bold text-zinc-900 dark:text-zinc-200">28%</span>
                            </div>
                            <div className="h-2 w-full bg-zinc-100 dark:bg-zinc-800 rounded-none overflow-hidden">
                                <div className="h-full bg-amber-500 rounded-none transition-all duration-1000" style={{ width: '28%' }}></div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="bg-zinc-900 p-6 rounded-none border border-zinc-800 text-zinc-100 overflow-hidden relative shadow-none">
                    <div className="absolute top-0 right-0 p-8 opacity-5">
                        <ShieldCheckIcon className="w-32 h-32" />
                    </div>
                    <h3 className="text-sm font-bold uppercase tracking-wider mb-2 text-zinc-100">Rate Matching Policy</h3>
                    <p className="text-xs text-zinc-400 font-medium leading-relaxed mb-4 max-w-xs">
                        System is currently in <span className="text-emerald-400 font-bold">BALANCED</span> mode. 
                        Tenant traffic is being normalized against available worker fleet capacity.
                    </p>
                    <div className="flex gap-4">
                        <div className="px-3 py-1 bg-zinc-800/80 rounded-none text-[10px] font-bold uppercase tracking-widest border border-zinc-700/50 text-zinc-200">
                            Auto-Scaling: ON
                        </div>
                        <div className="px-3 py-1 bg-zinc-800/80 rounded-none text-[10px] font-bold uppercase tracking-widest border border-zinc-700/50 text-zinc-200">
                            Throttle: 0.0%
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
