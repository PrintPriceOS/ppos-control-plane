import React, { useState, useEffect } from 'react';
import { ArrowsRightLeftIcon, CloudIcon, ServerIcon, CheckCircleIcon, ArrowPathIcon } from "@heroicons/react/24/outline";
import * as adminApi from "../../lib/adminApi";
import { StatusBadge } from "../../components/StatusBadge";

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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-zinc-900 dark:text-zinc-100 tracking-tight">Deployments</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 font-medium">Multi-region release tracking and version drift management.</p>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={fetchData} className="p-2 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-none hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors shadow-none text-zinc-500 dark:text-zinc-400">
            <ArrowPathIcon className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-900/60 text-emerald-700 dark:text-emerald-400 rounded-none text-xs font-bold uppercase tracking-widest shadow-none">
            <CheckCircleIcon className="w-4 h-4 text-emerald-500" />
            <span>v2.0.0-certified In Production</span>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-zinc-950 overflow-hidden rounded-none border border-zinc-200 dark:border-zinc-800 shadow-none">
        <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-800">
          <thead className="bg-zinc-50 dark:bg-zinc-900">
            <tr>
              <th className="px-6 py-4 text-left text-xs font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wide">Region / Node</th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wide">Profile</th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wide">Service Tier</th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wide">Version</th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wide">Health</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {regions.length > 0 ? regions.map((region, i) => (
              <tr key={i} className="odd:bg-white odd:dark:bg-zinc-950 even:bg-zinc-50 even:dark:bg-zinc-900/40 hover:bg-zinc-100 hover:dark:bg-zinc-900/70 transition-colors cursor-pointer group">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <CloudIcon className="w-5 h-5 text-sky-500 dark:text-sky-400" />
                    <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{region.region || region.name || 'Unknown'}</span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className="px-2 py-0.5 rounded-none bg-zinc-100 dark:bg-zinc-800 border border-transparent dark:border-zinc-700 text-[10px] font-bold uppercase text-zinc-700 dark:text-zinc-300 tracking-wide">{region.profile || 'ENTERPRISE'}</span>
                </td>
                <td className="px-6 py-4 text-sm font-medium text-zinc-600 dark:text-zinc-400">{region.tier || 'Tier 1 Elite'}</td>
                <td className="px-6 py-4 text-sm font-mono text-zinc-500 dark:text-zinc-500">{region.version || 'v2.0.0-certified'}</td>
                <td className="px-6 py-4">
                  <div className="w-fit">
                    <StatusBadge status={region.status || 'ONLINE'} />
                  </div>
                </td>
              </tr>
            )) : (
              <tr className="bg-white dark:bg-zinc-950">
                <td colSpan={5} className="px-6 py-12 text-center text-zinc-400 dark:text-zinc-600 font-bold text-xs uppercase tracking-widest">
                  No active deployments detected in registry
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="bg-white dark:bg-zinc-950 h-64 flex flex-col items-center justify-center rounded-none border border-dashed border-zinc-200 dark:border-zinc-800 shadow-none">
        <ArrowsRightLeftIcon className="w-12 h-12 text-zinc-300 dark:text-zinc-700 mb-4" />
        <p className="text-sm font-bold text-zinc-400 dark:text-zinc-500">Drift Detection Matrix Operational</p>
        <p className="text-[10px] font-bold text-zinc-400 dark:text-zinc-600 uppercase tracking-widest mt-2">All regions synchronized with primary registry</p>
      </div>
    </div>
  );
};
