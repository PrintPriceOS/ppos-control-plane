import React, { useState, useEffect } from 'react';
import { 
  InboxIcon, 
  CheckCircleIcon, 
  XCircleIcon, 
  ArrowDownTrayIcon, 
  MagnifyingGlassIcon,
  BeakerIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  CogIcon
} from '@heroicons/react/24/outline';
import { adminFetch } from '../../lib/adminApi';
import { toDisplayText } from '../../lib/display';

interface Dispatch {
  id: string;
  job_id?: string;
  production_package_id: string;
  manufacturing_package_id?: string;
  print_node_id: string;
  sender_tenant_id: string;
  receiver_tenant_id: string;
  status: string;
  message: string;
  created_at: string;
  accepted_at: string;
  rejected_at: string;
  isSeed?: boolean;
}

interface Package {
  id: string;
  tenant_id: string;
  source: string;
  status: string;
  book_spec_json: any;
  created_at: string;
}

export const IncomingJobsPage: React.FC = () => {
  const [dispatches, setDispatches] = useState<Dispatch[]>([]);
  const [packages, setPackages] = useState<Record<string, Package>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('ALL');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch dispatches
      const dData = await adminFetch<any>('/api/admin/manufacturing/dispatches');
      
      if (dData.ok) {
        setDispatches(dData.dispatches);
        
        // Fetch linked packages safely, skipping validation seeds to prevent 404s
        const rawPackageIds = dData.dispatches.map((d: any) => d.manufacturing_package_id || d.production_package_id);
        const validPids = [...new Set(rawPackageIds)].filter(id => {
          if (!id || id === 'undefined') return false;
          if (id.startsWith('TEST-JOB-')) return false;
          // Also skip if any dispatch pointing to this ID is explicitly a seed
          const isAssociatedSeed = dData.dispatches.some((d: any) => 
            (d.manufacturing_package_id === id || d.production_package_id === id) &&
            (d.job_id?.startsWith('TEST-JOB-') || d.isSeed)
          );
          return !isAssociatedSeed;
        }) as string[];
        const pkgMap: Record<string, Package> = {};
        
        for (const pid of validPids) {
          const pData = await adminFetch<any>(`/api/admin/manufacturing/packages/${pid}`);
          if (pData?.ok && pData.package) {
            pkgMap[pid] = pData.package;
          }
        }
        setPackages(pkgMap);
      } else {
        setError(dData.error?.message || 'Failed to fetch dispatches');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (dispatchId: string, action: string) => {
    try {
      const dispatch = dispatches.find(d => d.id === dispatchId);
      if (!dispatch) return;

      let endpoint = `/api/admin/manufacturing/dispatches/${dispatchId}/${action}`;
      let method = 'POST';
      let body = undefined;

      if (action === 'IN_PRODUCTION' || action === 'COMPLETED') {
        const pkgId = dispatch.manufacturing_package_id || dispatch.production_package_id;
        if (!pkgId || pkgId === 'undefined') {
          alert('Cannot mutate state: linked manufacturing package is undefined.');
          return;
        }
        endpoint = `/api/admin/manufacturing/packages/${pkgId}/status`;
        method = 'PATCH';
        body = JSON.stringify({ status: action });
      } else if (action === 'reject') {
        body = JSON.stringify({ reason: 'Operational decision' });
      }

      const data = await adminFetch<any>(endpoint, {
        method,
        body
      });
      if (data?.ok) {
        fetchData();
      } else {
        alert(data?.error?.message || `Failed to ${action} job`);
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  const downloadBundle = (packageId: string) => {
    if (!packageId || packageId === 'undefined') return;
    window.open(`/api/admin/manufacturing/packages/${packageId}/bundle`, '_blank');
  };

  if (loading) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[400px] bg-slate-50 dark:bg-zinc-950">
        <div className="animate-spin rounded-none h-12 w-12 border-b-2 border-red-600 dark:border-red-500"></div>
        <p className="mt-4 text-slate-500 dark:text-zinc-400 font-medium animate-pulse">Syncing manufacturing pipeline...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 bg-slate-50 dark:bg-zinc-950 h-full">
        <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 rounded-none p-6 flex items-center gap-4">
          <ExclamationTriangleIcon className="h-8 w-8 text-red-500 dark:text-red-400" />
          <div>
            <h3 className="text-red-800 dark:text-red-300 font-bold uppercase tracking-wider text-sm">Pipeline Error</h3>
            <p className="text-red-600 dark:text-red-400">{toDisplayText(error)}</p>
          </div>
        </div>
      </div>
    );
  }

  const filteredDispatches = dispatches.filter(d => filter === 'ALL' || d.status === filter);

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-zinc-950">
      {/* Header */}
      <div className="bg-white dark:bg-zinc-900 border-b border-slate-200 dark:border-zinc-800 p-6 flex justify-between items-center shadow-none">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-zinc-100 tracking-tight flex items-center gap-3">
            <InboxIcon className="h-8 w-8 text-red-600 dark:text-red-500" />
            INCOMING MANUFACTURING JOBS
          </h1>
          <p className="text-slate-500 dark:text-zinc-500 text-sm font-medium mt-1 uppercase tracking-[0.1em]">Operational Cockpit — Phase 11</p>
        </div>
        
        <div className="flex gap-2">
          <button 
            onClick={fetchData}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-white dark:text-zinc-100 font-mono font-bold text-xs uppercase tracking-wider rounded-none transition-all flex items-center gap-2 border border-slate-800 dark:border-zinc-700"
          >
            <CogIcon className="h-4 w-4" />
            REFRESH
          </button>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-4 border-b border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
        <StatCard title="Pending" value={dispatches.filter(d => d.status === 'SENT').length} color="red" />
        <StatCard title="Active" value={dispatches.filter(d => d.status === 'ACCEPTED').length} color="emerald" />
        <StatCard title="Rejected" value={dispatches.filter(d => d.status === 'REJECTED').length} color="rose" />
        <StatCard title="Expired" value={dispatches.filter(d => d.status === 'EXPIRED').length} color="amber" />
      </div>

      {/* Content */}
      <div className="p-6 overflow-auto flex-1 bg-slate-50 dark:bg-zinc-950">
        <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-none shadow-none overflow-hidden">
          <table className="w-full text-sm text-left border-collapse text-slate-700 dark:text-zinc-300">
            <thead className="bg-slate-50 dark:bg-zinc-900 border-b border-slate-200 dark:border-zinc-800 text-slate-500 dark:text-zinc-500 uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 text-xs font-black uppercase tracking-widest">Job Identity</th>
                <th className="px-4 py-3 text-xs font-black uppercase tracking-widest">Specs &amp; Policy</th>
                <th className="px-4 py-3 text-xs font-black uppercase tracking-widest">Customer</th>
                <th className="px-4 py-3 text-xs font-black uppercase tracking-widest">Status</th>
                <th className="px-4 py-3 text-xs font-black uppercase tracking-widest text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
              {filteredDispatches.map(dispatch => {
                const pkgId = dispatch.manufacturing_package_id || dispatch.production_package_id;
                const pkg = packages[pkgId];
                const safeId = dispatch.id ? String(dispatch.id).substring(0, 8) : 'N/A';
                const safePkgStr = pkgId ? String(pkgId).substring(0, 8) : 'N/A';
                return (
                  <tr key={dispatch.id} className="hover:bg-slate-50/50 dark:hover:bg-zinc-800/50 transition-colors">
                    <td className="px-4 py-3 text-slate-900 dark:text-zinc-200">
                      <div className="flex flex-col">
                        <span className="font-mono text-xs font-bold uppercase">#{safeId}</span>
                        <span className="text-xs text-slate-400 dark:text-zinc-500 mt-1">PKG: {safePkgStr}</span>
                        <div className="flex items-center gap-2 mt-2">
                          <ClockIcon className="h-3 w-3 text-slate-400 dark:text-zinc-500" />
                          <span className="text-[10px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-tight">
                            {new Date(dispatch.created_at).toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {pkg ? (
                        <div className="flex flex-col gap-1">
                          <div className="flex gap-2">
                            <span className="px-1.5 py-0.5 bg-slate-100 dark:bg-zinc-800 text-[10px] font-black text-slate-600 dark:text-zinc-300 rounded-none border border-slate-200 dark:border-zinc-700 uppercase tracking-tighter">
                              {pkg.book_spec_json?.binding || 'STANDARD'}
                            </span>
                            <span className="px-1.5 py-0.5 bg-red-50 dark:bg-red-950/40 text-[10px] font-black text-red-600 dark:text-red-400 rounded-none border border-red-100 dark:border-red-900/60 uppercase tracking-tighter">
                              {pkg.book_spec_json?.color || 'CMYK'}
                            </span>
                          </div>
                          <span className="text-xs font-medium text-slate-600 dark:text-zinc-300">
                            {pkg.book_spec_json?.trim?.widthMm}x{pkg.book_spec_json?.trim?.heightMm}mm — {pkg.book_spec_json?.paperGsm}gsm
                          </span>
                          <span className="text-[10px] text-slate-400 dark:text-zinc-500 font-bold italic">POLICY: {pkg.book_spec_json?.policy || 'DEFAULT'}</span>
                        </div>
                      ) : (
                        (pkgId?.startsWith('TEST-JOB-') || dispatch.job_id?.startsWith('TEST-JOB-') || dispatch.isSeed) ? (
                          <span className="text-xs text-amber-600 dark:text-amber-400 font-bold italic">Validation seed — no production package</span>
                        ) : (
                          <span className="text-xs text-slate-400 dark:text-zinc-500 italic">Syncing package data...</span>
                        )
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs font-bold text-slate-700 dark:text-zinc-200 uppercase tracking-tight">
                      {dispatch.sender_tenant_id}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={dispatch.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2 items-center">
                        <button 
                          onClick={() => downloadBundle(dispatch.manufacturing_package_id || dispatch.production_package_id)}
                          className="p-2 bg-transparent hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-500 dark:text-zinc-500 hover:text-slate-900 dark:hover:text-zinc-100 border border-slate-200 dark:border-zinc-700 rounded-none transition-colors"
                          title="Download Bundle"
                        >
                          <ArrowDownTrayIcon className="h-4 w-4" />
                        </button>
                        
                        {dispatch.status === 'SENT' && (
                          <>
                            <button 
                              onClick={() => handleAction(dispatch.id, 'accept')}
                              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-none text-[10px] font-black uppercase tracking-widest transition-all shadow-none"
                            >
                              Accept
                            </button>
                            <button 
                              onClick={() => handleAction(dispatch.id, 'reject')}
                              className="px-3 py-1.5 bg-white dark:bg-zinc-800 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/60 rounded-none text-[10px] font-black uppercase tracking-widest transition-all shadow-none hover:bg-rose-50 dark:hover:bg-zinc-700"
                            >
                              Reject
                            </button>
                          </>
                        )}
                        
                        {dispatch.status === 'ACCEPTED' && (
                          <div className="flex items-center gap-2">
                            {pkg?.status === 'ACCEPTED_BY_PRINTER' && (
                              <button 
                                onClick={() => handleAction(dispatch.id, 'IN_PRODUCTION')}
                                className="px-3 py-1.5 bg-red-600 hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-700 text-white rounded-none text-[10px] font-black uppercase tracking-widest transition-all shadow-none"
                              >
                                Start Production
                              </button>
                            )}
                            {pkg?.status === 'IN_PRODUCTION' && (
                              <button 
                                onClick={() => handleAction(dispatch.id, 'COMPLETED')}
                                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-none text-[10px] font-black uppercase tracking-widest transition-all shadow-none"
                              >
                                Complete
                              </button>
                            )}
                            {pkg?.status === 'COMPLETED' && (
                              <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 dark:bg-green-950/40 text-emerald-700 dark:text-green-400 border border-emerald-100 dark:border-green-900/60 rounded-none text-[10px] font-black uppercase tracking-widest">
                                <CheckCircleIcon className="h-4 w-4" />
                                Finished
                              </div>
                            )}
                            {pkg?.status !== 'COMPLETED' && (
                              <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 dark:bg-zinc-800 text-slate-500 dark:text-zinc-300 border border-slate-100 dark:border-zinc-700 rounded-none text-[10px] font-black uppercase tracking-widest">
                                <ClockIcon className="h-4 w-4" />
                                {pkg?.status.replace(/_/g, ' ')}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredDispatches.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-20 text-center">
                    <InboxIcon className="h-12 w-12 text-slate-200 dark:text-zinc-700 mx-auto" />
                    <p className="mt-4 text-slate-400 dark:text-zinc-500 font-black uppercase tracking-[0.2em] text-sm italic">No Incoming Jobs Found</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const StatCard = ({ title, value, color }: { title: string, value: number, color: string }) => {
  const colorMap: Record<string, string> = {
    red: 'text-red-600 dark:text-red-500',
    emerald: 'text-emerald-600 dark:text-green-400',
    rose: 'text-rose-600 dark:text-red-400',
    amber: 'text-amber-600 dark:text-amber-400',
    indigo: 'text-red-600 dark:text-red-500'
  };

  return (
    <div className="p-4 border-r border-slate-100 dark:border-zinc-800 last:border-0 hover:bg-slate-50 dark:hover:bg-zinc-900/50 transition-colors bg-white dark:bg-zinc-950">
      <h3 className="text-[10px] font-black text-slate-400 dark:text-zinc-500 uppercase tracking-widest mb-1">{title}</h3>
      <p className={`text-2xl font-black ${colorMap[color] || 'text-zinc-900 dark:text-zinc-100'}`}>{value}</p>
    </div>
  );
};

const StatusBadge = ({ status }: { status: string }) => {
  const styles: Record<string, string> = {
    'SENT': 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400 border-red-100 dark:border-red-900/60 animate-pulse',
    'ACCEPTED': 'bg-emerald-50 dark:bg-green-950/40 text-emerald-700 dark:text-green-400 border-emerald-100 dark:border-green-900/60',
    'REJECTED': 'bg-rose-50 dark:bg-red-950/40 text-rose-700 dark:text-red-400 border-rose-100 dark:border-red-900/60',
    'EXPIRED': 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border-amber-100 dark:border-amber-900/60',
    'CANCELLED': 'bg-slate-50 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 border-slate-100 dark:border-zinc-700'
  };

  const currentStyle = styles[status] || styles['CANCELLED'];

  return (
    <span className={`px-2 py-1 rounded-none text-[10px] font-black uppercase tracking-widest border block w-max ${currentStyle}`}>
      {status}
    </span>
  );
};
