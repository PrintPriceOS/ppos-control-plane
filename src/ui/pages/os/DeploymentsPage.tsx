import React from 'react';
import { ArrowsRightLeftIcon, CloudIcon, ServerIcon, CheckCircleIcon } from "@heroicons/react/24/outline";

export const DeploymentsPage: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Deployments</h1>
          <p className="text-sm text-slate-500 font-medium">Multi-region release tracking and version drift management.</p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg shadow-emerald-500/20">
          <CheckCircleIcon className="w-4 h-4" />
          <span>v2.0.0-certified In Production</span>
        </div>
      </div>

      <div className="glass overflow-hidden rounded-2xl border border-white">
        <table className="min-w-full divide-y divide-slate-100 italic-text-off">
          <thead className="bg-slate-50/50">
            <tr>
              <th className="px-6 py-4 text-left text-xs font-black text-slate-400 uppercase tracking-widest">Region</th>
              <th className="px-6 py-4 text-left text-xs font-black text-slate-400 uppercase tracking-widest">Profile</th>
              <th className="px-6 py-4 text-left text-xs font-black text-slate-400 uppercase tracking-widest">Service Tier</th>
              <th className="px-6 py-4 text-left text-xs font-black text-slate-400 uppercase tracking-widest">Version</th>
              <th className="px-6 py-4 text-left text-xs font-black text-slate-400 uppercase tracking-widest">Health</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            <tr className="hover:bg-slate-50/50 transition-colors cursor-pointer group">
              <td className="px-6 py-4">
                <div className="flex items-center gap-3">
                  <CloudIcon className="w-5 h-5 text-blue-500" />
                  <span className="text-sm font-bold text-slate-900">eu-west-1 (Primary)</span>
                </div>
              </td>
              <td className="px-6 py-4">
                <span className="px-2 py-1 rounded bg-slate-100 text-[10px] font-black uppercase text-slate-600">Enterprise</span>
              </td>
              <td className="px-6 py-4 text-sm font-medium text-slate-500">Tier 1 Elite</td>
              <td className="px-6 py-4 text-sm font-mono text-slate-400">v2.0.0-certified</td>
              <td className="px-6 py-4">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/20" />
                  <span className="text-xs font-bold text-emerald-600">Healthy</span>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="glass h-64 flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300">
        <ArrowsRightLeftIcon className="w-12 h-12 text-slate-200 mb-4" />
        <p className="text-sm font-bold text-slate-400">Drift Detection Matrix Coming Soon</p>
      </div>
    </div>
  );
};
