import React from 'react';
import { 
  ShieldCheckIcon, 
  MapPinIcon, 
  UserCircleIcon,
  ArrowPathIcon,
  BellIcon
} from "@heroicons/react/24/outline";

export const Topbar: React.FC = () => {
  return (
    <header className="h-20 bg-white/70 backdrop-blur-md border-b border-slate-200/60 sticky top-0 z-40 px-8 flex items-center justify-between">
      <div className="flex items-center gap-6">
        {/* Environment Badge */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-100 animate-pulse-slow">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          <span className="text-[10px] font-black uppercase tracking-widest">Production Environment</span>
        </div>

        {/* Certification Badge */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 border border-blue-100">
          <ShieldCheckIcon className="w-4 h-4" />
          <span className="text-[10px] font-black uppercase tracking-widest">v2.0.0 Certified</span>
        </div>

        {/* Region Context */}
        <div className="flex items-center gap-2 text-slate-400">
          <MapPinIcon className="w-4 h-4" />
          <span className="text-xs font-bold uppercase tracking-wider">EU-WEST-1 (Primary)</span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        {/* Global Notifications */}
        <button className="p-2 rounded-xl text-slate-400 hover:text-slate-900 hover:bg-slate-100 transition-all relative">
          <BellIcon className="w-6 h-6" />
          <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-white" />
        </button>

        {/* Role & Profile */}
        <div className="h-10 w-[1px] bg-slate-200 mx-1" />
        
        <div className="flex items-center gap-3 pl-2">
            <div className="text-right">
                <p className="text-sm font-black text-slate-900 leading-tight">System Admin</p>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-tight">Superuser (os:admin)</p>
            </div>
            <div className="w-10 h-10 bg-slate-100 rounded-xl border border-slate-200 flex items-center justify-center text-slate-400">
                <UserCircleIcon className="w-8 h-8" />
            </div>
        </div>
      </div>
    </header>
  );
};
