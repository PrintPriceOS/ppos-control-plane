import React, { useState } from 'react';
import { 
  ShieldCheckIcon, 
  ShieldExclamationIcon, 
  ScaleIcon, 
  MapIcon, 
  UserGroupIcon, 
  ClockIcon,
  ExclamationCircleIcon,
  EllipsisHorizontalCircleIcon,
  CircleStackIcon,
  CubeIcon
} from '@heroicons/react/24/outline';
import { getAudit } from '../../lib/adminApi';
import { useAdminQuery } from '../../hooks/useAdminData';
import { DataTable } from '../../components/DataTable';
import { GovernanceSnapshotViewer } from '../../components/GovernanceSnapshotViewer';
import { AuditDetailDrawer } from '../../components/AuditDetailDrawer';

export const GovernancePage: React.FC = () => {
    const [selectedBlock, setSelectedBlock] = useState<any | null>(null);

    // Initial load: Governance-specific audit events (blocks, posture changes)
    const q = useAdminQuery('governance:events', () => getAudit({ limit: 50 }), 30000);

    return (
        <div className="space-y-10 italic-text-off">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-[32px] font-black text-slate-900 tracking-tight leading-none mb-2">Governance & Policy Enforcement</h1>
                    <p className="text-sm text-slate-500 font-medium">Real-time enforcement logic, active blocks, and posture tracking across EU-WEST-1.</p>
                </div>
                <div className="px-6 py-3 bg-emerald-50 rounded-2xl border border-emerald-100 flex items-center gap-4 shadow-sm">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                        <ShieldCheckIcon className="w-6 h-6 text-emerald-500" />
                    </div>
                    <div>
                        <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest leading-none mb-1">Regional Authority</p>
                        <p className="text-sm font-black text-emerald-900 leading-none">POSTURE_ENFORCING</p>
                    </div>
                </div>
            </div>

            {/* Posture Context Overview */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
                    color="blue"
                    points={['Epoch: v2.0.0-certified', 'Sync status: 0ms drift', 'Authority: EU-WEST-1-AUTH-01']}
                />
            </div>

            {/* Blocks / Violations History */}
            <div className="space-y-4">
                <div className="flex items-center gap-4">
                    <h2 className="text-sm font-black text-slate-400 uppercase tracking-widest">Active Enforcement Decision Logs</h2>
                    <div className="h-[1px] flex-1 bg-slate-100" />
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
                                    <div className={`w-2 h-2 rounded-full ${a.action === 'BLOCKED' ? 'bg-red-500 animate-pulse' : 'bg-amber-400'}`} />
                                    <span className={`text-[10px] font-black uppercase tracking-widest ${a.action === 'BLOCKED' ? 'text-red-600' : 'text-amber-600'}`}>
                                        {a.action === 'BLOCKED' ? 'Critical' : 'Warning'}
                                    </span>
                                </div>
                            )
                        },
                        {
                            header: 'Violation Type',
                            accessor: (a) => (
                                <div className="flex flex-col">
                                    <span className="text-xs font-black text-slate-900">{a.policy_slug || 'POSTURE_CONSTRAINT'}</span>
                                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Decision: Access {a.action}</span>
                                </div>
                            )
                        },
                        {
                            header: 'Affected Context',
                            accessor: (a) => (
                                <div className="flex flex-col gap-1">
                                    <div className="flex items-center gap-1.5">
                                       <CircleStackIcon className="w-3.5 h-3.5 text-slate-300" />
                                       <span className="text-[11px] font-mono font-bold text-slate-700">{a.tenant_id}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                       <CubeIcon className="w-3.5 h-3.5 text-slate-300" />
                                       <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{a.deployment_id || 'EU-WEST-1'}</span>
                                    </div>
                                </div>
                            )
                        },
                        {
                             header: 'Timestamp',
                             accessor: (a) => (
                               <div className="text-right text-[10px] font-mono font-bold text-slate-400">
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

const PostureBlock = ({ title, subtitle, icon: Icon, color, points }: any) => (
    <div className="p-8 rounded-[40px] bg-white border border-slate-100/60 shadow-xl shadow-slate-100/50 flex flex-col items-start italic-text-off">
        <div className={`w-14 h-14 rounded-2xl bg-${color}-50 flex items-center justify-center mb-6`}>
            <Icon className={`w-8 h-8 text-${color}-500`} />
        </div>
        <h3 className="text-lg font-black text-slate-900 tracking-tight leading-none mb-1">{title}</h3>
        <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6">{subtitle}</p>
        <div className="space-y-3 w-full">
            {points.map((p: string, i: number) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-2xl bg-slate-50 border border-slate-100 group hover:bg-white transition-all cursor-default">
                    <div className={`w-1.5 h-1.5 rounded-full bg-${color}-400 group-hover:scale-125 transition-transform`} />
                    <span className="text-xs font-bold text-slate-600 transition-colors group-hover:text-slate-900">{p}</span>
                </div>
            ))}
        </div>
    </div>
);
