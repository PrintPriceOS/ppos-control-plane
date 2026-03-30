import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShieldCheckIcon,
  MapPinIcon,
  UserCircleIcon,
  BellIcon,
  Cog6ToothIcon,
  ArrowRightStartOnRectangleIcon,
  ChevronDownIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";

export const Topbar: React.FC = () => {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [logoutModal, setLogoutModal] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSettings = () => {
    setMenuOpen(false);
    navigate('/settings');
  };

  const handleLogoutConfirm = () => {
    setLogoutModal(false);
    // Clear stored credentials and redirect to login or home
    localStorage.removeItem('ppp_admin_api_key');
    navigate('/');
  };

  return (
    <>
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

          {/* User Menu */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen(v => !v)}
              className="flex items-center gap-3 pl-2 rounded-xl hover:bg-slate-100 pr-2 py-1.5 transition-all group"
            >
              <div className="text-right">
                <p className="text-sm font-black text-slate-900 leading-tight">System Admin</p>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-tight">Superuser (os:admin)</p>
              </div>
              <div className="w-10 h-10 bg-slate-100 rounded-xl border border-slate-200 flex items-center justify-center text-slate-400 group-hover:border-slate-300 transition-colors">
                <UserCircleIcon className="w-8 h-8" />
              </div>
              <ChevronDownIcon className={`w-4 h-4 text-slate-400 transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* Dropdown */}
            {menuOpen && (
              <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-2xl border border-slate-200 shadow-xl shadow-slate-200/60 overflow-hidden z-50">
                <div className="p-1">
                  <button
                    onClick={handleSettings}
                    className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    <Cog6ToothIcon className="w-4 h-4 text-slate-400" />
                    Settings
                  </button>
                  <div className="my-1 border-t border-slate-100" />
                  <button
                    onClick={() => { setMenuOpen(false); setLogoutModal(true); }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-bold text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <ArrowRightStartOnRectangleIcon className="w-4 h-4" />
                    Logout
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Logout Confirmation Modal */}
      {logoutModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={() => setLogoutModal(false)}
          />

          {/* Dialog */}
          <div className="relative bg-white rounded-2xl shadow-2xl border border-slate-200 p-8 w-full max-w-sm mx-4 flex flex-col items-center gap-5">
            <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center">
              <ExclamationTriangleIcon className="w-7 h-7 text-red-500" />
            </div>
            <div className="text-center">
              <p className="text-base font-black text-slate-900">Close Session?</p>
              <p className="text-sm text-slate-500 font-medium mt-1">
                Are you sure you want to log out of the Control Plane?
              </p>
            </div>
            <div className="flex gap-3 w-full">
              <button
                onClick={() => setLogoutModal(false)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleLogoutConfirm}
                className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 text-white text-sm font-bold hover:bg-red-700 transition-colors"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
