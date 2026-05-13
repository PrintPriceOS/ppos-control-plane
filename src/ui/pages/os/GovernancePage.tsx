import React, { useState } from 'react';
import { 
  ShieldCheckIcon, 
  ClockIcon,
  ExclamationCircleIcon,
  CircleStackIcon,
  CubeIcon
} from '@heroicons/react/24/outline';
import { getAudit } from '../../lib/adminApi';
import { useAdminQuery } from '../../hooks/useAdminData';
import { DataTable } from '../../components/DataTable';
import { AuditDetailDrawer } from '../../components/AuditDetailDrawer';

export const GovernancePage: React.FC = () => {
    const [selectedBlock, setSelectedBlock] = useState<any | null>(null);

    // Initial load: Governance-specific audit events (blocks, posture changes)
    const q = useAdminQuery('governance:events', () => getAudit({ limit: 50 }), 30000);

    return (
        <div className="space-y-10">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-[32px] font-black text-zinc-900 dark:text-zinc-100 tracking-tight leading-none mb-2">Governance & Policy Enforcement</h1>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400 font-medium">Real-time enforcement logic, active blocks, and posture tracking across EU-WEST-1.</p>
                </div>
                <div className="px-6 py-3 bg-emerald-50 dark:bg-emerald-950/40 rounded-none border border-emerald-100 dark:border-emerald-900/60 flex items-center gap-4 shadow-none">
                    <div className="w-10 h-10 rounded-none bg-emerald-500/10 flex items-center justify-center">
                        <ShieldCheckIcon className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div>
                        <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest leading-none mb-1">Regional Authority</p>
                        <p className="text-sm font-black text-emerald-900 dark:text-emerald-300 leading-none">POSTURE_ENFORCING</p>
                    </div>
                </div>
            </div>

            {/* Posture Context Overview */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                <PostureBlock 
                    title="Active Governance Logic" 
                    subtitle="Post-R13 Enterprise Hardening" 
                    icon={ShieldCheckIcon} 
                    color="emerald"
                    points={['Multi-Tenant Isolation Level 3', 'Strict Region Locality', 'Zero-Trust Queue Validation']}
                />
                <PostureBlock 
                    title="Operational Barriers" 
                    subtitle="Detected & Enforced" 
                    icon={ExclamationCircleIcon} 
                    color="amber"
                    points={['Tenant Throttling (3)', 'Job Rate Limit Drops (12)', 'Deployment Stalls (0)']}
                />
                <PostureBlock 
                    title="Authority Epoch" 
                    subtitle="Last Certified Update" 
                    icon={ClockIcon} 
                    color="sky"
                    points={['Epoch: v2.0.0-certified', 'Sync status: 0ms drift', 'Authority: EU-WEST-1-AUTH-01']}
                />
            </div>

            {/* Blocks / Violations History */}
            <div className="space-y-4">
                <div className="flex items-center gap-4">
                    <h2 className="text-sm font-bold text-zinc-400 uppercase tracking-widest">Active Enforcement Decision Logs</h2>
                    <div className="h-[1px] flex-1 bg-zinc-200 dark:bg-zinc-800" />
                </div>
                
                <DataTable 
                    isLoading={q.status === 'loading'}
                    data={q.data || []}
                    onRowClick={(a) => setSelectedBlock(a)}
                    columns={[
                        {
                            header: 'Severity',
                            accessor: (a) => (
                                <div className="flex items-center gap-2">
                                    <div className={`w-2 h-2 rounded-none ${a.action === 'BLOCKED' ? 'bg-[#dc0000] animate-pulse' : 'bg-amber-500'}`} />
                                    <span className={`text-[10px] font-bold uppercase tracking-widest ${a.action === 'BLOCKED' ? 'text-[#dc0000] dark:text-red-400' : 'text-amber-600 dark:text-amber-400'}`}>
                                        {a.action === 'BLOCKED' ? 'Critical' : 'Warning'}
                                    </span>
                                </div>
                            )
                        },
                        {
                            header: 'Violation Type',
                            accessor: (a) => (
                                <div className="flex flex-col">
                                    <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100">{a.policy_slug || 'POSTURE_CONSTRAINT'}</span>
                                    <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-bold uppercase tracking-widest mt-0.5">Decision: Access {a.action}</span>
                                </div>
                            )
                        },
                        {
                            header: 'Affected Context',
                            accessor: (a) => (
                                <div className="flex flex-col gap-1">
                                    <div className="flex items-center gap-1.5">
                                       <CircleStackIcon className="w-3.5 h-3.5 text-zinc-400" />
                                       <span className="text-[11px] font-mono font-bold text-zinc-900 dark:text-zinc-100">{a.tenant_id}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                       <CubeIcon className="w-3.5 h-3.5 text-zinc-400" />
                                       <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">{a.deployment_id || 'EU-WEST-1'}</span>
                                    </div>
                                </div>
                            )
                        },
                        {
                             header: 'Timestamp',
                             accessor: (a) => (
                               <div className="text-right text-[10px] font-mono font-bold text-zinc-400">
                                 {new Date(a.created_at).toLocaleString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                               </div>
                             ),
                             className: 'text-right'
                        }
                    ]}
                />
            </div>

            {/* Sidebar-style Drawer integration */}
            <AuditDetailDrawer 
                auditEntry={selectedBlock}
                isOpen={!!selectedBlock}
                onClose={() => setSelectedBlock(null)}
            />
        </div>
    );
};

const PostureBlock = ({ title, subtitle, icon: Icon, color, points }: any) => {
    // Resolve pure dark-mode adaptive zinc tokens explicitly to avoid broken static extractions
    let config = {
        bg: "bg-emerald-50 dark:bg-emerald-950/40",
        text: "text-emerald-600 dark:text-emerald-400",
        dot: "bg-emerald-500 dark:bg-emerald-400",
    };

    if (color === 'amber') {
        config = {
            bg: "bg-amber-50 dark:bg-amber-950/40",
            text: "text-amber-600 dark:text-amber-400",
            dot: "bg-amber-500 dark:bg-amber-400",
        };
    } else if (color === 'sky' || color === 'blue') {
        config = {
            bg: "bg-sky-50 dark:bg-sky-950/30",
            text: "text-sky-600 dark:text-sky-400",
            dot: "bg-sky-500 dark:bg-sky-400",
        };
    }

    return (
        <div className="p-8 rounded-none bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 shadow-none flex flex-col items-start">
            <div className={`w-14 h-14 rounded-none flex items-center justify-center mb-6 ${config.bg}`}>
                <Icon className={`w-8 h-8 ${config.text}`} />
            </div>
            <h3 className="text-lg font-black text-zinc-900 dark:text-zinc-100 tracking-tight leading-none mb-1">{title}</h3>
            <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-6">{subtitle}</p>
            <div className="space-y-3 w-full">
                {points.map((p: string, i: number) => (
                    <div key={i} className="flex items-center gap-3 p-3 rounded-none bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 group hover:bg-zinc-100 dark:hover:bg-zinc-800/50 transition-all cursor-default">
                        <div className={`w-1.5 h-1.5 rounded-none group-hover:scale-125 transition-transform ${config.dot}`} />
                        <span className="text-xs font-bold text-zinc-600 dark:text-zinc-300 transition-colors group-hover:text-zinc-900 dark:group-hover:text-zinc-100">{p}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};
