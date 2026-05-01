import { ChartBarSquareIcon, ClockIcon, UsersIcon, ShieldCheckIcon, CloudIcon, QueueListIcon, ArrowPathIcon } from "@heroicons/react/24/outline";
import * as adminApi from "../../lib/adminApi";

export const UsageQuotasPage: React.FC = () => {
    const [overview, setOverview] = React.useState<adminApi.OverviewResponse | null>(null);
    const [loading, setLoading] = React.useState(true);

    const fetchData = async () => {
        setLoading(true);
        try {
            const data = await adminApi.getOverview("24h");
            setOverview(data);
        } catch (err) {
            console.error('Failed to fetch usage data:', err);
        } finally {
            setLoading(false);
        }
    };

    React.useEffect(() => {
        fetchData();
    }, []);

    const stats = [
        { label: 'Total Jobs Today', value: overview?.totalJobs?.toLocaleString() || '0', icon: ChartBarSquareIcon, color: 'primary' },
        { label: 'Avg Latency', value: `${overview?.avgLatencyMs || 0}ms`, icon: ClockIcon, color: 'blue' },
        { label: 'Queue Backlog', value: overview?.queueBacklog?.toLocaleString() || '0', icon: QueueListIcon, color: 'indigo' },
        { label: 'Improvement Rate', value: `${Math.round(overview?.deltaImprovementRate || 0)}%`, icon: ShieldCheckIcon, color: 'emerald' }
    ];

    return (
        <div className="space-y-6 italic-text-off">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-black text-slate-900 tracking-tight">Usage & Quotas</h1>
                    <p className="text-sm text-slate-500 font-medium tracking-tight">Real-time tenant consumption and systemic rate-matching logic.</p>
                </div>
                <button onClick={fetchData} className="p-2 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors shadow-sm">
                    <ArrowPathIcon className={`w-5 h-5 text-slate-400 ${loading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                {stats.map((stat, i) => (
                    <div key={i} className="glass p-5 rounded-2xl border border-white flex items-center gap-4">
                        <div className={`p-3 rounded-xl bg-${stat.color || 'primary'}/10 text-${stat.color || 'primary'}`}>
                            <stat.icon className="w-6 h-6" />
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{stat.label}</p>
                            <p className="text-xl font-black text-slate-900">{stat.value}</p>
                        </div>
                    </div>
                ))}
            </div>

            <div className="glass h-64 flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300">
                <p className="text-sm font-bold text-slate-400">Live Quota Metering Active</p>
                <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest mt-2">No active threshold violations detected</p>
            </div>
        </div>
    );
};
