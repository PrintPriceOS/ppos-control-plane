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
  ExclamationCircleIcon,
  InformationCircleIcon,
  CheckBadgeIcon,
  Bars3Icon
} from "@heroicons/react/24/outline";
import { NotificationBell } from '../components/NotificationBell';
import { clearAdminKey } from '../lib/adminApi';
import { getAuthUser, getUserRole } from '../lib/authStore';
import { PrintPriceLogo } from '../components/PrintPriceLogo';



export const Topbar: React.FC<{ onMenuClick?: () => void }> = ({ onMenuClick }) => {
  const navigate = useNavigate();

  const [menuOpen, setMenuOpen] = useState(false);
  const [logoutModal, setLogoutModal] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
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
    clearAdminKey();
    navigate('/login');
    // Force a full page reload to clear any cached state or queries
    window.location.reload();
  };

  return (
    <>
      <header className="h-16 ppos-bg border-b ppos-border sticky top-0 z-40 px-4 lg:px-8 flex items-center justify-between">
        <div className="flex items-center gap-3 lg:gap-6">
          {/* Mobile Menu Button */}
          {onMenuClick && (
            <button 
              onClick={onMenuClick} 
              className="lg:hidden p-2 text-slate-500 hover:text-black dark:hover:text-white transition-colors"
            >
              <Bars3Icon className="w-6 h-6" />
            </button>
          )}

          {/* Corporate Branding */}
          <div className="flex items-center gap-3">
            <PrintPriceLogo className="w-8 h-8 shrink-0" />
            <div className="hidden lg:block">
              <h1 className="text-sm font-black text-slate-900 dark:text-white leading-none tracking-tight">PrintPrice OS</h1>
              <p className="text-[9px] font-bold text-zinc-500 mt-1 uppercase tracking-widest">Control Plane</p>
            </div>
          </div>

          {/* Environment Badge */}
          <div className="hidden sm:flex items-center gap-2 px-3 py-1 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 animate-pulse-slow">
            <div className="w-1 h-1 bg-emerald-500" />
            <span className="text-[9px] font-black uppercase tracking-widest">Production Environment</span>
          </div>

          {/* Certification Badge */}
          <div className="hidden md:flex items-center gap-2 px-3 py-1 bg-blue-500/10 text-blue-500 border border-blue-500/20">
            <ShieldCheckIcon className="w-3.5 h-3.5" />
            <span className="text-[9px] font-black uppercase tracking-widest">v2.0.0 Certified</span>
          </div>

          {/* Region Context */}
          <div className="hidden lg:flex items-center gap-2 text-slate-400">
            <MapPinIcon className="w-4 h-4" />
            <span className="text-xs font-bold uppercase tracking-wider">EU-WEST-1 (Primary)</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Global Notifications */}
          <NotificationBell />

          {/* Role & Profile */}
          <div className="h-10 w-[1px] ppos-border mx-1" />

          {/* User Menu */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen(v => !v)}
              className="flex items-center gap-3 pl-2 hover:bg-slate-100 dark:hover:bg-[#1a1a1b]/5 pr-2 py-1 transition-all group"
            >
              <div className="text-right">
                <p className="text-xs font-black text-slate-900 dark:text-white leading-tight">{getAuthUser()?.name || 'Authorized User'}</p>
                <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest leading-tight">
                  {getUserRole()}
                </p>
              </div>
              <div className="w-8 h-8 ppos-surface-muted border ppos-border flex items-center justify-center text-slate-400 dark:text-zinc-500 group-hover:border-slate-300 dark:group-hover:border-white/20 transition-colors">
                <UserCircleIcon className="w-6 h-6" />
              </div>
              <ChevronDownIcon className={`w-3 h-3 text-zinc-500 transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* Dropdown */}
            {menuOpen && (
              <div className="absolute right-0 top-full mt-1 w-48 ppos-surface border ppos-border z-50 shadow-none">
                <div className="p-0">
                  <button
                    onClick={handleSettings}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-[10px] font-black uppercase text-slate-500 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-[#1a1a1b]/5 hover:text-black dark:hover:text-white transition-colors"
                  >
                    <Cog6ToothIcon className="w-4 h-4" />
                    Settings
                  </button>
                  <div className="border-t border-white/5" />
                  <button
                    onClick={() => { setMenuOpen(false); setLogoutModal(true); }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-[10px] font-black uppercase text-red-500 hover:bg-red-600 hover:text-white transition-colors"
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
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={() => setLogoutModal(false)}
          />
          <div className="relative ppos-surface border ppos-border p-8 w-full max-w-sm mx-4 flex flex-col items-center gap-5 shadow-none">
            <div className="w-12 h-12 bg-red-500/10 flex items-center justify-center">
              <ExclamationTriangleIcon className="w-6 h-6 text-red-500" />
            </div>
            <div className="text-center">
              <p className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest">Close Session?</p>
              <p className="text-[10px] text-zinc-500 font-bold mt-1 uppercase">
                Are you sure you want to log out of the Control Plane?
              </p>
            </div>
            <div className="flex gap-2 w-full">
              <button
                onClick={() => setLogoutModal(false)}
                className="flex-1 px-4 py-2 text-[10px] font-black uppercase border border-white/10 text-zinc-400 hover:bg-white/5 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleLogoutConfirm}
                className="flex-1 px-4 py-2 bg-red-600 text-white text-[10px] font-black uppercase hover:bg-red-700 transition-colors"
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
