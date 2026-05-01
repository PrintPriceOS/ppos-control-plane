// components/admin/LifecyclePolicyTab.tsx
import React, { useState } from "react";
import { 
    ClockIcon, 
    ArrowPathIcon, 
    CircleStackIcon,
    ShieldCheckIcon,
    ArchiveBoxIcon,
    TrashIcon
} from "@heroicons/react/24/outline";
import { triggerLifecycleProcess } from "../../lib/adminApi";
import { useAdminQuery } from "../../hooks/useAdminData";

export const LifecyclePolicyTab: React.FC = () => {
    const [isProcessing, setIsProcessing] = useState(false);
    const [results, setResults] = useState<any>(null);

    const handleProcessLifecycle = async () => {
        setIsProcessing(true);
        try {
            const res = await triggerLifecycleProcess();
            setResults(res.results);
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 italic-text-off">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-black text-slate-900 tracking-tight">Artifact Lifecycle Governance</h2>
                    <p className="text-xs text-slate-500 font-medium">Automated tiering (HOT/WARM/COLD) and retention enforcement.</p>
                </div>
                <button 
                    onClick={handleProcessLifecycle}
                    disabled={isProcessing}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-black hover:bg-blue-700 disabled:opacity-50 transition-all shadow-lg shadow-blue-600/10"
                >
                    <ArrowPathIcon className={`w-4 h-4 ${isProcessing ? 'animate-spin' : ''}`} />
                    EXECUTE LIFECYCLE SYNC
                </button>
            </div>

            {results && (
                <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-2xl flex items-center gap-4 animate-in zoom-in-95">
                    <ShieldCheckIcon className="w-5 h-5 text-emerald-600" />
                    <span className="text-xs font-bold text-emerald-800">
                        Lifecycle Process Complete: {results.transitioned} tiers updated, {results.purged} artifacts purged.
                    </span>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <TierCard tier="HOT" label="Active Production" color="text-orange-600" icon={CircleStackIcon} policy="7 Days" />
                <TierCard tier="WARM" label="Recent History" color="text-blue-600" icon={ArchiveBoxIcon} policy="30 Days" />
                <TierCard tier="COLD" label="Deep Archive" color="text-slate-600" icon={ClockIcon} policy="90 Days" />
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-3xl p-8">
                <h3 className="text-sm font-black uppercase tracking-widest text-slate-900 mb-6">Retention Policies</h3>
                <div className="space-y-4">
                    <PolicyRow 
                        icon={ClockIcon}
                        title="Standard Retention"
                        description="Auto-purge after 90 days in COLD tier. Affects 85% of artifacts."
                        status="ACTIVE"
                    />
                    <PolicyRow 
                        icon={ShieldCheckIcon}
                        title="Legal Hold (Forensic)"
                        description="Prevents auto-purge for artifacts flagged as CRITICAL incidents."
                        status="ACTIVE"
                    />
                    <PolicyRow 
                        icon={TrashIcon}
                        title="Aggressive Cleanup"
                        description="Purge ephemeral input artifacts after 24h of success."
                        status="INACTIVE"
                    />
                </div>
            </div>
        </div>
    );
};

const TierCard = ({ tier, label, color, icon: Icon, policy }: any) => (
    <div className="glass p-6 rounded-3xl border border-white">
        <div className="flex items-center justify-between mb-4">
            <div className={`p-3 rounded-2xl bg-white shadow-sm`}>
                <Icon className={`w-6 h-6 ${color}`} />
            </div>
            <span className={`text-xs font-black ${color}`}>{tier}</span>
        </div>
        <h4 className="text-sm font-black text-slate-900 mb-1">{label}</h4>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Retention: {policy}</p>
        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div className={`h-full bg-slate-300`} style={{ width: '60%' }} />
        </div>
    </div>
);

const PolicyRow = ({ icon: Icon, title, description, status }: any) => (
    <div className="flex items-center justify-between p-4 bg-white rounded-2xl border border-slate-100 shadow-sm">
        <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400">
                <Icon className="w-5 h-5" />
            </div>
            <div>
                <h4 className="text-xs font-black text-slate-900 uppercase tracking-tight">{title}</h4>
                <p className="text-[10px] font-medium text-slate-500">{description}</p>
            </div>
        </div>
        <span className={`text-[9px] font-black px-2 py-1 rounded-full ${status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
            {status}
        </span>
    </div>
);
