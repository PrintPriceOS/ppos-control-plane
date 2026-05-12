import React from "react";
import * as adminApi from "../lib/adminApi";
import {
    BuildingOfficeIcon,
    CheckCircleIcon,
    XCircleIcon,
    CpuChipIcon,
    CalendarIcon,
    BoltIcon,
    GlobeAltIcon,
    ChartBarSquareIcon,
    SignalIcon,
    HeartIcon,
    ShieldCheckIcon,
    ExclamationTriangleIcon,
    RocketLaunchIcon
} from "@heroicons/react/24/outline";
import { Drawer } from "./Drawer";
import { COLORS } from "../design-system/tokens";

interface Props {
    printerId: string | null;
    onClose: () => void;
    onAction: (id: string, action: 'approve' | 'suspend') => void;
}

export const PrinterNodeDrawer: React.FC<Props> = ({ printerId, onClose, onAction }) => {
    const [data, setData] = React.useState<any>(null);
    const [loading, setLoading] = React.useState(false);

    React.useEffect(() => {
        if (printerId) {
            setLoading(true);
            adminApi.getPrinters().then(printers => {
                const found = printers.find(p => p.id === printerId);
                if (found) {
                    setData({ profile: found.profile, id: found.id, ...found });
                }
                setLoading(false);
            }).catch(err => {
                console.error(err);
                setLoading(false);
            });
        }
    }, [printerId]);

    if (!printerId) return null;

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'ACTIVE': return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-500 border-emerald-500/20';
            case 'PENDING_REVIEW': return 'bg-amber-500/10 text-amber-600 dark:text-amber-500 border-amber-500/20';
            case 'SUSPENDED': return 'bg-red-500/10 text-[#dc0000] border-red-500/20';
            default: return `${COLORS.adaptive.surfaceMuted} ${COLORS.adaptive.textMuted} ${COLORS.adaptive.borderSubtle}`;
        }
    };

    const profile = data?.profile || {};
    const machines = data?.machines || [];
    const capacity = data?.capacity || [];
    const reservations = data?.reservations || [];
    const assignments = data?.assignments || [];
    const eligibility = data?.eligibility || { reasons: [], is_eligible: false };
    const health_warnings = data?.health_warnings || [];
    const performance = data?.performance || {};
    const service_regions = data?.service_regions || [];

    return (
        <Drawer 
          isOpen={!!printerId} 
          onClose={onClose} 
          title={profile.name ? `Printer: ${profile.name}` : `Printer Node: ${printerId}`}
          maxWidth="max-w-xl"
        >
            <div className="space-y-8 italic-text-off">
                {/* Header Subtitle Banner */}
                <div className={`flex items-center gap-3 p-4 border ${COLORS.adaptive.borderPrimary} ${COLORS.adaptive.surface}`}>
                    <div className={`w-12 h-12 rounded-none flex items-center justify-center border-2 ${getStatusColor(profile.status)}`}>
                        <BuildingOfficeIcon className="w-6 h-6" />
                    </div>
                    <div>
                        <h3 className={`text-base font-black ${COLORS.adaptive.textPrimary} tracking-tight`}>{profile.name || 'Loading Node...'}</h3>
                        <p className={`text-[10px] font-black ${COLORS.adaptive.textMuted} uppercase tracking-widest`}>ID: {printerId}</p>
                    </div>
                </div>

                {loading ? (
                    <div className="p-20 flex flex-col items-center gap-4">
                        <div className="w-10 h-10 border-4 border-zinc-200 dark:border-zinc-800 border-t-[#dc0000] rounded-none animate-spin" />
                        <span className={`text-xs font-black uppercase tracking-widest ${COLORS.adaptive.textMuted}`}>Loading node data...</span>
                    </div>
                ) : data && (
                    <div className="space-y-8">
                        {/* Section 1: Actions & Summary */}
                        <div className="space-y-4">
                            <div className="flex gap-3">
                                {profile.status !== 'ACTIVE' ? (
                                    <button
                                        onClick={() => onAction(printerId, 'approve')}
                                        className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-[#10B981] text-white rounded-none text-xs font-black hover:bg-[#059669] transition-all"
                                    >
                                        <CheckCircleIcon className="w-4 h-4" /> Approve & Enable Routing
                                    </button>
                                ) : (
                                    <button
                                        onClick={() => onAction(printerId, 'suspend')}
                                        className={`flex-1 flex items-center justify-center gap-2 px-6 py-3 border border-[#dc0000] text-[#dc0000] rounded-none text-xs font-black hover:bg-[#dc0000]/10 transition-all`}
                                    >
                                        <XCircleIcon className="w-4 h-4" /> Suspend Operations
                                    </button>
                                )}
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                                <div className={`p-3 rounded-none border ${COLORS.adaptive.borderPrimary} ${COLORS.adaptive.surface} text-center`}>
                                    <div className={`text-[8px] font-black ${COLORS.adaptive.textMuted} uppercase mb-1`}>Status</div>
                                    <div className={`text-xs font-bold ${COLORS.adaptive.textPrimary}`}>{profile.status || '---'}</div>
                                </div>
                                <div className={`p-3 rounded-none border ${COLORS.adaptive.borderPrimary} ${COLORS.adaptive.surface} text-center`}>
                                    <div className={`text-[8px] font-black ${COLORS.adaptive.textMuted} uppercase mb-1`}>Connect</div>
                                    <div className={`text-xs font-bold ${COLORS.adaptive.textPrimary}`}>{profile.connect_status || '---'}</div>
                                </div>
                                <div className={`p-3 rounded-none border ${COLORS.adaptive.borderPrimary} ${COLORS.adaptive.surface} text-center`}>
                                    <div className={`text-[8px] font-black ${COLORS.adaptive.textMuted} uppercase mb-1`}>Quality</div>
                                    <div className={`text-xs font-bold ${COLORS.adaptive.textPrimary}`}>{Number((profile.quality_score || 0) * 100).toFixed(0)}%</div>
                                </div>
                                <div className={`p-3 rounded-none border ${COLORS.adaptive.borderPrimary} ${COLORS.adaptive.surface} text-center col-span-3`}>
                                    <div className={`text-[8px] font-black ${COLORS.adaptive.textMuted} uppercase mb-1`}>Last API Sync</div>
                                    <div className={`text-xs font-bold ${COLORS.adaptive.textPrimary} flex items-center justify-center gap-2`}>
                                        <SignalIcon className={`w-3 h-3 ${profile.sync_status === 'HEALTHY' ? 'text-[#10B981]' : 'text-[#dc0000]'}`} />
                                        {profile.last_sync_at ? new Date(profile.last_sync_at).toLocaleString() : 'NEVER'}
                                        <span className={`ml-2 px-2 py-0.5 rounded-none text-[8px] font-black uppercase ${profile.sync_status === 'HEALTHY' ? 'bg-[#10B981]/10 text-[#10B981]' : 'bg-[#dc0000]/10 text-[#dc0000]'}`}>
                                            {profile.sync_status || 'UNKNOWN'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Section 2: Hardware */}
                        <div className="space-y-3">
                            <h3 className={`font-black ${COLORS.adaptive.textSecondary} text-[10px] uppercase tracking-widest flex items-center gap-2`}>
                                <CpuChipIcon className="w-4 h-4 text-[#dc0000]" />
                                Production Hardware
                            </h3>
                            <div className="grid gap-2">
                                {machines.map((m: any, idx: number) => (
                                    <div key={idx} className={`p-4 rounded-none border ${COLORS.adaptive.borderPrimary} ${COLORS.adaptive.surface} flex items-center justify-between`}>
                                        <div>
                                            <div className={`text-xs font-black ${COLORS.adaptive.textPrimary}`}>{m.nickname || m.name}</div>
                                            <div className={`text-[10px] font-bold ${COLORS.adaptive.textMuted} uppercase flex items-center gap-2`}>
                                                {m.type} • {m.status}
                                                <span className={`flex items-center gap-1 ${m.machine_health === 'OK' ? 'text-[#10B981]' : 'text-[#dc0000]'}`}>
                                                    <HeartIcon className="w-3 h-3" /> {m.machine_health || 'UNKNOWN'}
                                                </span>
                                            </div>
                                            {m.last_status_update && (
                                                <div className={`text-[8px] italic ${COLORS.adaptive.textMuted} mt-1 uppercase`}>Updated: {new Date(m.last_status_update).toLocaleTimeString()}</div>
                                            )}
                                        </div>
                                        <div className={`text-xs font-heavy ${COLORS.adaptive.textSecondary} ${COLORS.adaptive.surfaceMuted} px-2 py-1 rounded-none border ${COLORS.adaptive.borderSubtle} text-right`}>
                                            <div className={`text-[8px] font-black ${COLORS.adaptive.textMuted} uppercase`}>Index</div>
                                            {m.capacity_index}
                                        </div>
                                    </div>
                                ))}
                                {machines.length === 0 && (
                                    <div className={`p-4 text-center ${COLORS.adaptive.surfaceMuted} rounded-none border ${COLORS.adaptive.borderSubtle} ${COLORS.adaptive.textMuted} text-[10px] uppercase font-black tracking-widest`}>
                                        No hardware registered
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Section 3: Capacity History */}
                        <div className="space-y-3">
                            <h3 className={`font-black ${COLORS.adaptive.textSecondary} text-[10px] uppercase tracking-widest flex items-center gap-2`}>
                                <CalendarIcon className="w-4 h-4 text-[#dc0000]" />
                                Capacity Log (Last 7 Days)
                            </h3>
                            <div className={`rounded-none border ${COLORS.adaptive.borderPrimary} ${COLORS.adaptive.surface} divide-y ${COLORS.adaptive.borderSubtle}`}>
                                {capacity.map((c: any, idx: number) => (
                                    <div key={idx} className="px-4 py-3 flex items-center justify-between">
                                        <div className={`text-xs font-bold ${COLORS.adaptive.textPrimary}`}>{new Date(c.date).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}</div>
                                        <div className="flex items-center gap-6">
                                            <div className="text-right">
                                                <div className={`text-[8px] font-black ${COLORS.adaptive.textMuted} uppercase`}>Available</div>
                                                <div className={`text-xs font-black ${COLORS.adaptive.textPrimary}`}>{c.capacity_available}</div>
                                            </div>
                                            <div className="text-right">
                                                <div className={`text-[8px] font-black ${COLORS.adaptive.textMuted} uppercase`}>Lead Time</div>
                                                <div className={`text-xs font-black ${COLORS.adaptive.textSecondary}`}>{c.lead_time_days}d</div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                {capacity.length === 0 && (
                                    <div className={`p-4 text-center ${COLORS.adaptive.textMuted} text-[10px] uppercase font-black`}>No capacity data recorded</div>
                                )}
                            </div>
                        </div>

                        {/* Section 4: Active Reservations */}
                        <div className="space-y-3">
                            <h3 className={`font-black ${COLORS.adaptive.textSecondary} text-[10px] uppercase tracking-widest flex items-center gap-2`}>
                                <BoltIcon className="w-4 h-4 text-amber-500" />
                                Active Capacity Reservations
                            </h3>
                            <div className={`rounded-none border ${COLORS.adaptive.borderPrimary} ${COLORS.adaptive.surface} divide-y ${COLORS.adaptive.borderSubtle} overflow-hidden`}>
                                {reservations.map((r: any, idx: number) => (
                                    <div key={idx} className="px-4 py-3 flex items-center justify-between bg-amber-500/5">
                                        <div>
                                            <div className={`text-[10px] font-black ${COLORS.adaptive.textPrimary} uppercase`}>Res ID: {r.id.split('-')[0]}</div>
                                            <div className={`text-[8px] font-bold ${COLORS.adaptive.textMuted} uppercase`}>Job: {r.job_id.split('-')[0]} • Units: {r.reserved_units}</div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-[8px] font-black text-amber-500 uppercase">Expires In</div>
                                            <div className={`text-[10px] font-black ${COLORS.adaptive.textPrimary}`}>
                                                {Math.max(0, Math.round((new Date(r.expires_at).getTime() - Date.now()) / 60000))} min
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                {reservations.length === 0 && (
                                    <div className={`p-4 text-center ${COLORS.adaptive.textMuted} text-[10px] uppercase font-black`}>No active capacity reservations</div>
                                )}
                            </div>
                        </div>

                        {/* Section 5: Assignment History */}
                        <div className="space-y-3">
                            <h3 className={`font-black ${COLORS.adaptive.textSecondary} text-[10px] uppercase tracking-widest flex items-center gap-2`}>
                                <RocketLaunchIcon className="w-4 h-4 text-[#dc0000]" />
                                Recent Dispatches
                            </h3>
                            <div className={`rounded-none border ${COLORS.adaptive.borderPrimary} ${COLORS.adaptive.surface} divide-y ${COLORS.adaptive.borderSubtle} overflow-hidden`}>
                                {assignments.map((a: any, idx: number) => (
                                    <div key={idx} className="px-4 py-3 flex items-center justify-between">
                                        <div>
                                            <div className={`text-[10px] font-black ${COLORS.adaptive.textPrimary} uppercase`}>Assignment ID: {a.id.split('-')[0]}</div>
                                            <div className={`text-[8px] font-bold ${COLORS.adaptive.textMuted} uppercase`}>Job: {a.job_id.split('-')[0]} • Attempt: {a.dispatch_attempt}</div>
                                        </div>
                                        <div className="text-right">
                                            <div className={`text-[10px] font-black uppercase ${a.assignment_status === 'ACCEPTED' ? 'text-[#10B981]' :
                                                a.assignment_status === 'REJECTED' ? 'text-[#dc0000]' :
                                                    'text-amber-500'
                                                }`}>
                                                {a.assignment_status}
                                            </div>
                                            <div className={`text-[8px] font-bold ${COLORS.adaptive.textMuted} uppercase`}>{new Date(a.created_at).toLocaleTimeString()}</div>
                                        </div>
                                    </div>
                                ))}
                                {assignments.length === 0 && (
                                    <div className={`p-4 text-center ${COLORS.adaptive.textMuted} text-[10px] uppercase font-black`}>No recent assignments</div>
                                )}
                            </div>
                        </div>

                        {/* Section 6: Eligibility & Health */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-3">
                                <h3 className={`font-black ${COLORS.adaptive.textSecondary} text-[10px] uppercase tracking-widest flex items-center gap-2`}>
                                    <ShieldCheckIcon className="w-4 h-4 text-[#dc0000]" />
                                    Eligibility Check
                                </h3>
                                <div className={`p-4 rounded-none border ${COLORS.adaptive.borderPrimary} ${COLORS.adaptive.surface} space-y-2`}>
                                    {eligibility.reasons.map((r: any, idx: number) => (
                                        <div key={idx} className="flex items-center justify-between">
                                            <span className={`text-[10px] font-bold ${COLORS.adaptive.textSecondary} uppercase`}>{r.label}</span>
                                            {r.met ? <CheckCircleIcon className="w-4 h-4 text-[#10B981]" /> : <XCircleIcon className="w-4 h-4 text-[#dc0000]" />}
                                        </div>
                                    ))}
                                    <div className={`mt-3 pt-3 border-t ${COLORS.adaptive.borderSubtle} text-center font-black text-[10px] tracking-widest ${eligibility.is_eligible ? 'text-[#10B981]' : 'text-[#dc0000]'}`}>
                                        {eligibility.is_eligible ? 'ROUTING ENABLED' : 'ROUTING DISABLED'}
                                    </div>
                                </div>
                            </div>
                            <div className="space-y-3">
                                <h3 className={`font-black ${COLORS.adaptive.textSecondary} text-[10px] uppercase tracking-widest flex items-center gap-2`}>
                                    <BoltIcon className="w-4 h-4 text-[#dc0000]" />
                                    Node Health
                                </h3>
                                <div className="space-y-2">
                                    {health_warnings.map((w: any, idx: number) => (
                                        <div key={idx} className={`p-3 rounded-none border flex gap-2 ${w.severity === 'CRITICAL' ? 'bg-[#dc0000]/10 border-[#dc0000]/20 text-[#dc0000]' : 'bg-amber-500/10 border-amber-500/20 text-amber-500'}`}>
                                            <ExclamationTriangleIcon className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                                            <div className="text-[10px] font-bold leading-tight">{w.message}</div>
                                        </div>
                                    ))}
                                    {health_warnings.length === 0 && (
                                        <div className="p-4 text-center bg-[#10B981]/10 rounded-none border border-[#10B981]/20 text-[#10B981] text-[10px] font-black uppercase tracking-widest">
                                            Healthy
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Section 7: Historical Performance */}
                        <div className="space-y-3">
                            <h3 className={`font-black ${COLORS.adaptive.textSecondary} text-[10px] uppercase tracking-widest flex items-center gap-2`}>
                                <ChartBarSquareIcon className="w-4 h-4 text-[#dc0000]" />
                                Historical Performance
                            </h3>
                            <div className={`rounded-none border ${COLORS.adaptive.borderPrimary} ${COLORS.adaptive.surfaceMuted} p-5`}>
                                <div className="grid grid-cols-2 gap-8 mb-4">
                                    <div>
                                        <div className={`text-[8px] font-black ${COLORS.adaptive.textMuted} uppercase tracking-widest mb-1`}>Jobs Processed</div>
                                        <div className={`text-2xl font-black ${COLORS.adaptive.textPrimary}`}>{performance?.jobs_processed || 0}</div>
                                    </div>
                                    <div className="text-right">
                                        <div className={`text-[8px] font-black ${COLORS.adaptive.textMuted} uppercase tracking-widest mb-1`}>Success Rate</div>
                                        <div className="text-2xl font-black text-[#10B981]">
                                            {Number(((performance?.jobs_success || 0) / (performance?.jobs_processed || 1)) * 100 || 100).toFixed(0)}%
                                        </div>
                                    </div>
                                </div>
                                <div className={`space-y-3 pt-4 border-t ${COLORS.adaptive.borderSubtle}`}>
                                    <div className="flex items-center justify-between text-[10px]">
                                        <span className={`font-bold uppercase ${COLORS.adaptive.textSecondary} tracking-wider`}>On-Time Delivery</span>
                                        <span className={`font-black ${COLORS.adaptive.textPrimary}`}>{Number((performance?.on_time_delivery_rate || 0) * 100 || 100).toFixed(0)}%</span>
                                    </div>
                                    <div className={`w-full ${COLORS.adaptive.surface} h-1.5 rounded-none overflow-hidden border ${COLORS.adaptive.borderPrimary}`}>
                                        <div
                                            className="bg-[#10B981] h-full transition-all duration-1000"
                                            style={{ width: `${Number((performance?.on_time_delivery_rate || 0) * 100 || 100)}%` }}
                                        />
                                    </div>
                                    <div className="flex items-center justify-between text-[10px]">
                                        <span className={`font-bold uppercase ${COLORS.adaptive.textSecondary} tracking-wider`}>Reprint Rate</span>
                                        <span className={`font-black ${performance?.reprint_rate > 0.05 ? 'text-[#dc0000]' : COLORS.adaptive.textPrimary}`}>
                                            {Number((performance?.reprint_rate || 0) * 100 || 0).toFixed(1)}%
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Section 8: Regions */}
                        <div className="space-y-3">
                            <h3 className={`font-black ${COLORS.adaptive.textSecondary} text-[10px] uppercase tracking-widest flex items-center gap-2`}>
                                <GlobeAltIcon className="w-4 h-4 text-[#dc0000]" />
                                Service Regions
                            </h3>
                            <div className="flex flex-wrap gap-2">
                                {service_regions.map((r: any, idx: number) => (
                                    <span key={idx} className={`px-3 py-1 ${COLORS.adaptive.surface} border ${COLORS.adaptive.borderPrimary} rounded-none text-xs font-bold ${COLORS.adaptive.textSecondary}`}>
                                        {r.region} ({r.country})
                                    </span>
                                ))}
                                {service_regions.length === 0 && (
                                    <div className={`w-full p-4 text-center ${COLORS.adaptive.surfaceMuted} rounded-none ${COLORS.adaptive.textMuted} text-[10px] font-black uppercase`}>No regions defined</div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </Drawer>
    );
};
