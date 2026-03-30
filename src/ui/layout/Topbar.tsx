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
  CheckIcon,
} from "@heroicons/react/24/outline";

// ─── Notification types ──────────────────────────────────────────────────────

type NotifSeverity = 'error' | 'warning' | 'info' | 'success';

interface Notification {
  id: string;
  userId: string;
  title: string;
  description: string;
  date: string; // ISO 8601
  read: boolean;
  severity: NotifSeverity;
}

// ─── Mock data ───────────────────────────────────────────────────────────────

const INITIAL_NOTIFICATIONS: Notification[] = [
  {
    id: 'n1',
    userId: 'usr_admin_001',
    title: 'Anomaly detected in EU-WEST-1',
    description: 'The intelligence layer flagged an unusual spike in job failure rate (↑ 340%) over the last 15 minutes.',
    date: '2026-03-30T14:22:00Z',
    read: false,
    severity: 'error',
  },
  {
    id: 'n2',
    userId: 'usr_admin_001',
    title: 'Deployment rollout paused',
    description: 'Deployment #d-8812 was automatically paused by the guardrail engine due to a confidence threshold breach.',
    date: '2026-03-30T11:05:00Z',
    read: false,
    severity: 'warning',
  },
  {
    id: 'n3',
    userId: 'usr_admin_001',
    title: 'Federation sync completed',
    description: 'All 4 regional instances have successfully synced global governance policies (v2.0.0).',
    date: '2026-03-30T09:00:00Z',
    read: true,
    severity: 'success',
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatRelative(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

const SEVERITY_CONFIG: Record<NotifSeverity, { icon: React.ElementType; bg: string; iconColor: string }> = {
  error:   { icon: ExclamationCircleIcon, bg: 'bg-red-50',    iconColor: 'text-red-500' },
  warning: { icon: ExclamationTriangleIcon, bg: 'bg-amber-50', iconColor: 'text-amber-500' },
  info:    { icon: InformationCircleIcon,  bg: 'bg-blue-50',  iconColor: 'text-blue-500' },
  success: { icon: CheckBadgeIcon,         bg: 'bg-emerald-50', iconColor: 'text-emerald-500' },
};

// ─── Component ───────────────────────────────────────────────────────────────

export const Topbar: React.FC = () => {
  const navigate = useNavigate();

  const [menuOpen, setMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [logoutModal, setLogoutModal] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>(INITIAL_NOTIFICATIONS);

  const menuRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter(n => !n.read).length;
  const hasUnread = unreadCount > 0;

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const markAsRead = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const handleSettings = () => {
    setMenuOpen(false);
    navigate('/settings');
  };

  const handleLogoutConfirm = () => {
    setLogoutModal(false);
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
          <div className="relative" ref={notifRef}>
            <button
              onClick={() => setNotifOpen(v => !v)}
              className="p-2 rounded-xl transition-all relative text-slate-400 hover:text-slate-900 hover:bg-slate-100"
            >
              <BellIcon className="w-6 h-6" />
              {hasUnread && (
                <span className="absolute top-1.5 right-1.5 min-w-[16px] h-4 px-0.5 bg-red-500 rounded-full border-2 border-white flex items-center justify-center">
                  <span className="text-[9px] font-black text-white leading-none">{unreadCount}</span>
                </span>
              )}
            </button>

            {/* Notifications Dropdown */}
            {notifOpen && (
              <div className="absolute right-0 top-full mt-2 w-96 bg-white rounded-2xl border border-slate-200 shadow-xl shadow-slate-200/60 overflow-hidden z-50">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-black text-slate-900">Notifications</p>
                    {hasUnread && (
                      <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-600 text-[10px] font-black">
                        {unreadCount} new
                      </span>
                    )}
                  </div>
                  {hasUnread && (
                    <button
                      onClick={markAllAsRead}
                      className="flex items-center gap-1 text-[11px] font-bold text-slate-400 hover:text-slate-700 transition-colors"
                    >
                      <CheckIcon className="w-3 h-3" />
                      Mark all read
                    </button>
                  )}
                </div>

                {/* List */}
                <div className="divide-y divide-slate-50 max-h-[420px] overflow-y-auto">
                  {notifications.map(n => {
                    const cfg = SEVERITY_CONFIG[n.severity];
                    const Icon = cfg.icon;
                    return (
                      <button
                        key={n.id}
                        onClick={() => markAsRead(n.id)}
                        className={`w-full flex items-start gap-4 px-5 py-4 text-left transition-colors ${
                          n.read ? 'hover:bg-slate-50' : 'bg-slate-50/80 hover:bg-slate-100/80'
                        }`}
                      >
                        {/* Severity Icon */}
                        <div className={`shrink-0 w-9 h-9 rounded-xl ${cfg.bg} flex items-center justify-center mt-0.5`}>
                          <Icon className={`w-5 h-5 ${cfg.iconColor}`} />
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <p className={`text-sm leading-snug ${n.read ? 'font-medium text-slate-600' : 'font-bold text-slate-900'}`}>
                              {n.title}
                            </p>
                            {!n.read && (
                              <span className="shrink-0 w-2 h-2 rounded-full bg-red-500 mt-1.5" />
                            )}
                          </div>
                          <p className="text-xs text-slate-400 font-medium mt-0.5 leading-relaxed line-clamp-2">
                            {n.description}
                          </p>
                          <p className="text-[10px] font-bold text-slate-300 uppercase tracking-wider mt-1.5">
                            {formatRelative(n.date)}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Footer */}
                {notifications.every(n => n.read) && (
                  <div className="px-5 py-5 flex flex-col items-center gap-1">
                    <CheckBadgeIcon className="w-6 h-6 text-slate-200" />
                    <p className="text-xs font-bold text-slate-300 uppercase tracking-widest">All caught up</p>
                  </div>
                )}
              </div>
            )}
          </div>

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
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={() => setLogoutModal(false)}
          />
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
