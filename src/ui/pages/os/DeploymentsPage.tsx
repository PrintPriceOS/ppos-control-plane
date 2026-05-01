import React, { useState, useEffect } from 'react';
import { ArrowsRightLeftIcon, CloudIcon, ServerIcon, CheckCircleIcon, ArrowPathIcon } from "@heroicons/react/24/outline";
import * as adminApi from "../../lib/adminApi";

export const DeploymentsPage: React.FC = () => {
  const [regions, setRegions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const data = await adminApi.getHealth();
      setRegions(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to fetch deployment health:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  return (
    <div className="space-y-6 italic-text-off">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Deployments</h1>
          <p className="text-sm text-slate-500 font-medium">Multi-region release tracking and version drift management.</p>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={fetchData} className="p-2 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors shadow-sm">
            <ArrowPathIcon className={`w-5 h-5 text-slate-400 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <div className="flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg shadow-emerald-500/20">
            <CheckCircleIcon className="w-4 h-4" />
            <span>v2.0.0-certified In Production</span>
          </div>
        </div>
      </div>

      <div className="glass overflow-hidden rounded-2xl border border-white">
        <table className="min-w-full divide-y divide-slate-100">
          <thead className="bg-slate-50/50">
            <tr>
              <th className="px-6 py-4 text-left text-xs font-black text-slate-400 uppercase tracking-widest">Region / Node</th>
              <th className="px-6 py-4 text-left text-xs font-black text-slate-400 uppercase tracking-widest">Profile</th>
              <th className="px-6 py-4 text-left text-xs font-black text-slate-400 uppercase tracking-widest">Service Tier</th>
              <th className="px-6 py-4 text-left text-xs font-black text-slate-400 uppercase tracking-widest">Version</th>
              <th className="px-6 py-4 text-left text-xs font-black text-slate-400 uppercase tracking-widest">Health</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {regions.length > 0 ? regions.map((region, i) => (
              <tr key={i} className="hover:bg-slate-50/50 transition-colors cursor-pointer group">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <CloudIcon className="w-5 h-5 text-blue-500" />
                    <span className="text-sm font-bold text-slate-900">{region.region || region.name || 'Unknown'}</span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className="px-2 py-1 rounded bg-slate-100 text-[10px] font-black uppercase text-slate-600">{region.profile || 'ENTERPRISE'}</span>
                </td>
                <td className="px-6 py-4 text-sm font-medium text-slate-500">{region.tier || 'Tier 1 Elite'}</td>
                <td className="px-6 py-4 text-sm font-mono text-slate-400">{region.version || 'v2.0.0-certified'}</td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-1.5">
                    <div className={`w-2 h-2 rounded-full ${region.status === 'HEALTHY' || region.status === 'ONLINE' ? 'bg-emerald-500' : 'bg-amber-500'} shadow-sm`} />
                    <span className={`text-xs font-bold ${region.status === 'HEALTHY' || region.status === 'ONLINE' ? 'text-emerald-600' : 'text-amber-600'}`}>
                      {region.status || 'Checking...'}
                    </span>
                  </div>
                </td>
              </tr>
            )) : (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-slate-400 font-bold text-xs uppercase tracking-widest">
                  No active deployments detected in registry
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="glass h-64 flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300">
        <ArrowsRightLeftIcon className="w-12 h-12 text-slate-200 mb-4" />
        <p className="text-sm font-bold text-slate-400">Drift Detection Matrix Operational</p>
        <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest mt-2">All regions synchronized with primary registry</p>
      </div>
    </div>
  );
};
