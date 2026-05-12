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

interface Dispatch {
  id: string;
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
        
        // Fetch linked packages
        const packageIds = [...new Set(dData.dispatches.map((d: any) => d.manufacturing_package_id || d.production_package_id))];
        const pkgMap: Record<string, Package> = {};
        
        for (const pid of packageIds as string[]) {
          const pData = await adminFetch<any>(`/api/admin/manufacturing/packages/${pid}`);
          if (pData.ok) {
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
      if (data.ok) {
        fetchData(); // Refresh
      } else {
        alert(data.error?.message || `Failed to ${action} job`);
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  const downloadBundle = (packageId: string) => {
    window.open(`/api/admin/manufacturing/packages/${packageId}/bundle`, '_blank');
  };

  if (loading) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-none h-12 w-12 border-b-2 border-indigo-500"></div>
        <p className="mt-4 text-slate-500 font-medium animate-pulse">Syncing manufacturing pipeline...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded-none p-6 flex items-center gap-4">
          <ExclamationTriangleIcon className="h-8 w-8 text-red-500" />
          <div>
            <h3 className="text-red-800 font-bold uppercase tracking-wider text-sm">Pipeline Error</h3>
            <p className="text-red-600">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  const filteredDispatches = dispatches.filter(d => filter === 'ALL' || d.status === filter);

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 p-6 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-3">
            <InboxIcon className="h-8 w-8 text-indigo-600" />
            INCOMING MANUFACTURING JOBS
          </h1>
          <p className="text-slate-500 text-sm font-medium mt-1 uppercase tracking-[0.1em]">Operational Cockpit — Phase 11</p>
        </div>
        
        <div className="flex gap-2">
          <button 
            onClick={fetchData}
            className="btn-premium"
          >
            <CogIcon className="h-4 w-4" />
            REFRESH
          </button>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-4 border-b border-slate-200 bg-white">
        <StatCard title="Pending" value={dispatches.filter(d => d.status === 'SENT').length} color="indigo" />
        <StatCard title="Active" value={dispatches.filter(d => d.status === 'ACCEPTED').length} color="emerald" />
        <StatCard title="Rejected" value={dispatches.filter(d => d.status === 'REJECTED').length} color="rose" />
        <StatCard title="Expired" value={dispatches.filter(d => d.status === 'EXPIRED').length} color="amber" />
      </div>

      {/* Content */}
      <div className="p-6 overflow-auto flex-1">
        <div className="bg-white border border-slate-200 rounded-none shadow-sm overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="p-4 text-xs font-black text-slate-500 uppercase tracking-widest">Job Identity</th>
                <th className="p-4 text-xs font-black text-slate-500 uppercase tracking-widest">Specs & Policy</th>
                <th className="p-4 text-xs font-black text-slate-500 uppercase tracking-widest">Customer</th>
                <th className="p-4 text-xs font-black text-slate-500 uppercase tracking-widest">Status</th>
                <th className="p-4 text-xs font-black text-slate-500 uppercase tracking-widest text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredDispatches.map(dispatch => {
                const pkgId = dispatch.manufacturing_package_id || dispatch.production_package_id;
                const pkg = packages[pkgId];
                return (
                  <tr key={dispatch.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="p-4">
                      <div className="flex flex-col">
                        <span className="font-mono text-xs font-bold text-slate-900 uppercase">#{dispatch.id.substring(0, 8)}</span>
                        <span className="text-xs text-slate-400 mt-1">PKG: {(dispatch.manufacturing_package_id || dispatch.production_package_id || '').substring(0, 8)}</span>
                        <div className="flex items-center gap-2 mt-2">
                          <ClockIcon className="h-3 w-3 text-slate-400" />
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">
                            {new Date(dispatch.created_at).toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      {pkg ? (
                        <div className="flex flex-col gap-1">
                          <div className="flex gap-2">
                            <span className="px-1.5 py-0.5 bg-slate-100 text-[10px] font-black text-slate-600 rounded-none border border-slate-200 uppercase tracking-tighter">
                              {pkg.book_spec_json?.binding || 'STANDARD'}
                            </span>
                            <span className="px-1.5 py-0.5 bg-indigo-50 text-[10px] font-black text-indigo-600 rounded-none border border-indigo-100 uppercase tracking-tighter">
                              {pkg.book_spec_json?.color || 'CMYK'}
                            </span>
                          </div>
                          <span className="text-xs font-medium text-slate-600">
                            {pkg.book_spec_json?.trim?.widthMm}x{pkg.book_spec_json?.trim?.heightMm}mm — {pkg.book_spec_json?.paperGsm}gsm
                          </span>
                          <span className="text-[10px] text-slate-400 font-bold italic">POLICY: {pkg.book_spec_json?.policy || 'DEFAULT'}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400 italic">Syncing package data...</span>
                      )}
                    </td>
                    <td className="p-4 text-xs font-bold text-slate-700 uppercase tracking-tight">
                      {dispatch.sender_tenant_id}
                    </td>
                    <td className="p-4">
                      <StatusBadge status={dispatch.status} />
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button 
                          onClick={() => downloadBundle(dispatch.manufacturing_package_id || dispatch.production_package_id)}
                          className="btn-premium !p-2"
                          title="Download Bundle"
                        >
                          <ArrowDownTrayIcon className="h-4 w-4" />
                        </button>
                        
                        {dispatch.status === 'SENT' && (
                          <>
                            <button 
                              onClick={() => handleAction(dispatch.id, 'accept')}
                              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-none text-[10px] font-black uppercase tracking-widest transition-all shadow-sm"
                            >
                              Accept
                            </button>
                            <button 
                              onClick={() => handleAction(dispatch.id, 'reject')}
                              className="btn-premium !text-rose-600 !bg-white !border-rose-200 !px-3 !py-1.5"
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
                                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-none text-[10px] font-black uppercase tracking-widest transition-all shadow-sm"
                              >
                                Start Production
                              </button>
                            )}
                            {pkg?.status === 'IN_PRODUCTION' && (
                              <button 
                                onClick={() => handleAction(dispatch.id, 'COMPLETED')}
                                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-none text-[10px] font-black uppercase tracking-widest transition-all shadow-sm"
                              >
                                Complete
                              </button>
                            )}
                            {pkg?.status === 'COMPLETED' && (
                              <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-none text-[10px] font-black uppercase tracking-widest">
                                <CheckCircleIcon className="h-4 w-4" />
                                Finished
                              </div>
                            )}
                            {pkg?.status !== 'COMPLETED' && (
                              <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 text-slate-500 border border-slate-100 rounded-none text-[10px] font-black uppercase tracking-widest">
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
                    <InboxIcon className="h-12 w-12 text-slate-200 mx-auto" />
                    <p className="mt-4 text-slate-400 font-black uppercase tracking-[0.2em] text-sm italic">No Incoming Jobs Found</p>
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

const StatCard = ({ title, value, color }: { title: string, value: number, color: string }) => (
  <div className={`p-4 border-r border-slate-100 last:border-0 hover:bg-slate-50 transition-colors`}>
    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{title}</h3>
    <p className={`text-2xl font-black text-${color}-600`}>{value}</p>
  </div>
);

const StatusBadge = ({ status }: { status: string }) => {
  const styles: Record<string, string> = {
    'SENT': 'bg-indigo-50 text-indigo-700 border-indigo-100 animate-pulse',
    'ACCEPTED': 'bg-emerald-50 text-emerald-700 border-emerald-100',
    'REJECTED': 'bg-rose-50 text-rose-700 border-rose-100',
    'EXPIRED': 'bg-amber-50 text-amber-700 border-amber-100',
    'CANCELLED': 'bg-slate-50 text-slate-700 border-slate-100'
  };

  return (
    <span className={`px-2 py-1 rounded-none text-[10px] font-black uppercase tracking-widest border ${styles[status] || styles['CANCELLED']}`}>
      {status}
    </span>
  );
};
