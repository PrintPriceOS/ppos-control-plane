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
import { clearAdminKey, getNotifications, markNotificationRead, markAllNotificationsRead } from '../lib/adminApi';
import { getAuthUser, getUserRole } from '../lib/authStore';

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

// --- Helpers ---

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatRelative(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

const SEVERITY_CONFIG: Record<NotifSeverity, { icon: React.ElementType; bg: string; iconColor: string }> = {
  error:   { icon: ExclamationCircleIcon,   bg: 'bg-red-50 dark:bg-red-900/25',     iconColor: 'text-red-500 dark:text-red-400' },
  warning: { icon: ExclamationTriangleIcon, bg: 'bg-amber-50 dark:bg-amber-900/25', iconColor: 'text-amber-500 dark:text-amber-400' },
  info:    { icon: InformationCircleIcon,   bg: 'bg-blue-50 dark:bg-blue-900/25',   iconColor: 'text-blue-500 dark:text-blue-400' },
  success: { icon: CheckBadgeIcon,          bg: 'bg-emerald-50 dark:bg-emerald-900/25', iconColor: 'text-emerald-500 dark:text-emerald-400' },
};

// ─── Component ───────────────────────────────────────────────────────────────

export const Topbar: React.FC = () => {
  const navigate = useNavigate();

  const [menuOpen, setMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [logoutModal, setLogoutModal] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>(
    (window as any).INITIAL_NOTIFICATIONS && Array.isArray((window as any).INITIAL_NOTIFICATIONS)
      ? (window as any).INITIAL_NOTIFICATIONS
      : []
  );

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

  const fetchNotifications = async () => {
    try {
      const data = await getNotifications(10);
      setNotifications(data.map((n: any) => ({
        id: n.id,
        userId: n.user_id,
        title: n.title,
        description: n.message,
        date: n.created_at,
        read: !!n.is_read,
        severity: n.severity as NotifSeverity
      })));
    } catch (err) {
      console.warn('[TOPBAR] Failed to fetch notifications:', err);
    }
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000); // Polling every 30s
    return () => clearInterval(interval);
  }, []);

  const handleMarkAsRead = async (id: string) => {
    try {
      await markNotificationRead(id);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    } catch (err) {
      console.error('[TOPBAR] Failed to mark as read:', err);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await markAllNotificationsRead();
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    } catch (err) {
      console.error('[TOPBAR] Failed to mark all as read:', err);
    }
  };

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
      <header className="h-16 bg-white dark:bg-[#0e0e0f] border-b border-slate-200 dark:border-white/10 sticky top-0 z-40 px-8 flex items-center justify-between">
        <div className="flex items-center gap-6">
          {/* Environment Badge */}
          <div className="flex items-center gap-2 px-3 py-1 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 animate-pulse-slow">
            <div className="w-1 h-1 bg-emerald-500" />
            <span className="text-[9px] font-black uppercase tracking-widest">Production Environment</span>
          </div>

          {/* Certification Badge */}
          <div className="flex items-center gap-2 px-3 py-1 bg-blue-500/10 text-blue-500 border border-blue-500/20">
            <ShieldCheckIcon className="w-3.5 h-3.5" />
            <span className="text-[9px] font-black uppercase tracking-widest">v2.0.0 Certified</span>
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
              className="p-2 transition-all relative text-slate-500 dark:text-zinc-500 hover:text-black dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#1a1a1b]/5"
            >
              <BellIcon className="w-5 h-5" />
              {hasUnread && (
                <span className="absolute top-1.5 right-1.5 min-w-[14px] h-3.5 px-0.5 bg-red-600 border border-black flex items-center justify-center">
                  <span className="text-[8px] font-black text-white leading-none">{unreadCount}</span>
                </span>
              )}
            </button>

            {/* Notifications Dropdown */}
            {notifOpen && (
              <div className="absolute right-0 top-full mt-1 w-80 bg-white dark:bg-[#131314] border border-slate-200 dark:border-white/10 overflow-hidden z-50 shadow-xl">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-[#131314]/5">
                  <div className="flex items-center gap-2">
                    <p className="text-[10px] font-black text-slate-900 dark:text-white uppercase tracking-widest">Notifications</p>
                    {hasUnread && (
                      <span className="px-1.5 py-0.5 bg-red-600 text-white text-[8px] font-black uppercase">
                        {unreadCount} new
                      </span>
                    )}
                  </div>
                  {hasUnread && (
                    <button
                      onClick={handleMarkAllAsRead}
                      className="text-[9px] font-bold text-zinc-500 hover:text-white transition-colors uppercase"
                    >
                      Mark all read
                    </button>
                  )}
                </div>

                {/* List */}
                <div className="divide-y divide-slate-100 dark:divide-white/5 max-h-[380px] overflow-y-auto">
                  {notifications.map(n => {
                    const cfg = SEVERITY_CONFIG[n.severity];
                    const Icon = cfg.icon;
                    return (
                      <button
                        key={n.id}
                        onClick={() => handleMarkAsRead(n.id)}
                        className={`w-full flex items-start gap-3 px-4 py-3 text-left transition-colors ${
                          n.read ? 'hover:bg-slate-50 dark:hover:bg-[#1a1a1b]/5' : 'bg-slate-50/50 dark:bg-[#131314]/[0.02] hover:bg-slate-100 dark:hover:bg-[#1a1a1b]/5'
                        }`}
                      >
                        {/* Severity Icon */}
                        <div className={`shrink-0 w-7 h-7 ${cfg.bg} flex items-center justify-center mt-0.5`}>
                          <Icon className={`w-4 h-4 ${cfg.iconColor}`} />
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <p className={`text-[11px] leading-snug ${n.read ? 'font-medium text-slate-500 dark:text-zinc-400' : 'font-bold text-slate-900 dark:text-white'}`}>
                              {n.title}
                            </p>
                            {!n.read && (
                              <span className="shrink-0 w-1.5 h-1.5 bg-red-600 mt-1.5" />
                            )}
                          </div>
                          <p className="text-[10px] text-zinc-500 font-medium mt-0.5 leading-relaxed line-clamp-2">
                            {n.description}
                          </p>
                          <p className="text-[8px] font-black text-zinc-600 uppercase tracking-wider mt-1.5">
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
          <div className="h-10 w-[1px] bg-slate-200 dark:bg-[#131314]/10 mx-1" />

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
              <div className="w-8 h-8 bg-slate-100 dark:bg-[#1a1a1b] border border-slate-200 dark:border-white/10 flex items-center justify-center text-slate-400 dark:text-zinc-500 group-hover:border-slate-300 dark:group-hover:border-white/20 transition-colors">
                <UserCircleIcon className="w-6 h-6" />
              </div>
              <ChevronDownIcon className={`w-3 h-3 text-zinc-500 transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* Dropdown */}
            {menuOpen && (
              <div className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-[#131314] border border-slate-200 dark:border-white/10 z-50 shadow-xl">
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
          <div className="relative bg-white dark:bg-[#131314] border border-slate-200 dark:border-white/10 p-8 w-full max-w-sm mx-4 flex flex-col items-center gap-5 shadow-2xl">
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
