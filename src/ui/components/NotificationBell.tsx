import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { BellIcon, ExclamationTriangleIcon, ExclamationCircleIcon, InformationCircleIcon, CheckBadgeIcon } from '@heroicons/react/24/outline';
import { markNotificationRead, markAllNotificationsRead } from '../lib/adminApi';
import { useAdminQuery } from '../hooks/useAdminData';
import { adminFetch } from '../lib/adminApi';

type NotifSeverity = 'error' | 'warning' | 'info' | 'success';

interface Notification {
  id: string;
  userId: string;
  title: string;
  description: string;
  date: string;
  read: boolean;
  severity: NotifSeverity;
  action_url?: string;
}

function formatRelative(iso: string): string {
  if (!iso) return 'Unknown';
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

async function fetchNotifications() {
  const [data, countRes] = await Promise.all([
    adminFetch<any>('/api/admin/notifications?limit=10'),
    adminFetch<any>('/api/admin/notifications/unread-count')
  ]);
  
  const notifications = (data.notifications || []).map((n: any) => ({
    id: n.id,
    userId: n.user_id,
    title: n.title,
    description: n.message,
    date: n.created_at,
    read: !!n.read_at,
    severity: (n.severity || 'info') as NotifSeverity,
    action_url: n.action_url
  }));
  
  return { notifications, unreadCount: countRes.count || 0 };
}

export const NotificationBell: React.FC = () => {
  const navigate = useNavigate();
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  // Use SWR via useAdminQuery with 30s polling
  const { data, refetch } = useAdminQuery('notifications_bell', fetchNotifications, 30000);
  
  const notifications: Notification[] = data?.notifications || [];
  const unreadCount = data?.unreadCount || 0;
  const hasUnread = unreadCount > 0;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Listen for the custom global event
  useEffect(() => {
    const handleRefresh = () => refetch();
    window.addEventListener('ppos:notifications:refresh', handleRefresh);
    return () => window.removeEventListener('ppos:notifications:refresh', handleRefresh);
  }, [refetch]);

  const handleMarkAsRead = async (id: string, action_url?: string) => {
    try {
      await markNotificationRead(id);
      refetch(); // Trigger SWR refresh
      if (action_url) {
        setNotifOpen(false);
        navigate(action_url);
      }
    } catch (err) {
      console.error('[NotificationBell] Failed to mark as read:', err);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await markAllNotificationsRead();
      refetch(); // Trigger SWR refresh
    } catch (err) {
      console.error('[NotificationBell] Failed to mark all as read:', err);
    }
  };

  return (
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
        <div className="absolute right-0 top-full mt-1 w-80 ppos-surface border ppos-border overflow-hidden z-50 shadow-none">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b ppos-border ppos-surface-muted">
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
              const cfg = SEVERITY_CONFIG[n.severity] || SEVERITY_CONFIG.info;
              const Icon = cfg.icon;
              return (
                <button
                  key={n.id}
                  onClick={() => handleMarkAsRead(n.id, n.action_url)}
                  className={`w-full flex items-start gap-3 px-4 py-3 text-left transition-colors ${
                    n.read ? 'hover:bg-slate-50 dark:hover:bg-white/5' : 'bg-slate-50/50 dark:bg-white/[0.02] hover:bg-slate-100 dark:hover:bg-white/5'
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
          {notifications.length === 0 && (
            <div className="px-5 py-5 flex flex-col items-center gap-1">
              <p className="text-xs font-bold text-slate-300 uppercase tracking-widest">No notifications</p>
            </div>
          )}
          {notifications.length > 0 && notifications.every(n => n.read) && (
            <div className="px-5 py-5 flex flex-col items-center gap-1">
              <CheckBadgeIcon className="w-6 h-6 text-slate-200" />
              <p className="text-xs font-bold text-slate-300 uppercase tracking-widest">All caught up</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
