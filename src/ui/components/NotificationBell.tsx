import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BellIcon,
  ExclamationTriangleIcon,
  ExclamationCircleIcon,
  InformationCircleIcon,
  CheckBadgeIcon
} from '@heroicons/react/24/outline';
import { markNotificationRead, markAllNotificationsRead, adminFetch } from '../lib/adminApi';
import { useAdminQuery } from '../hooks/useAdminData';
import { getAuthToken, getUserTenantId, getUserPrinthouseId, getUserRole } from '../lib/authStore';
import { useLocale } from '../i18n';

type NotifSeverity = 'error' | 'warning' | 'info' | 'success';

export interface NotificationItem {
  id: string;
  userId?: string;
  orderId?: string;
  eventType?: string;
  title: string;
  description: string;
  date: string;
  read: boolean;
  severity: NotifSeverity;
  action_url?: string;
  metadata?: any;
}

function mapRawSeverity(sev?: string): NotifSeverity {
  const s = String(sev || 'info').toUpperCase();
  if (s === 'CRITICAL' || s === 'ERROR') return 'error';
  if (s === 'WARNING') return 'warning';
  if (s === 'SUCCESS') return 'success';
  return 'info';
}

function formatRelative(iso: string, locale = 'es'): string {
  if (!iso) return locale === 'es' ? 'Ahora' : 'Just now';
  const diff = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (diff < 60) {
    if (locale === 'de') return `Vor ${Math.max(1, diff)}s`;
    if (locale === 'en') return `${Math.max(1, diff)}s ago`;
    return `Hace ${Math.max(1, diff)}s`;
  }
  if (diff < 3600) {
    const m = Math.floor(diff / 60);
    if (locale === 'de') return `Vor ${m} Min.`;
    if (locale === 'en') return `${m}m ago`;
    return `Hace ${m}m`;
  }
  if (diff < 86400) {
    const h = Math.floor(diff / 3600);
    if (locale === 'de') return `Vor ${h} Std.`;
    if (locale === 'en') return `${h}h ago`;
    return `Hace ${h}h`;
  }
  const d = Math.floor(diff / 86400);
  if (locale === 'de') return `Vor ${d} T.`;
  if (locale === 'en') return `${d}d ago`;
  return `Hace ${d}d`;
}

const SEVERITY_CONFIG: Record<NotifSeverity, { icon: React.ElementType; bg: string; iconColor: string }> = {
  error: {
    icon: ExclamationCircleIcon,
    bg: 'bg-red-50 dark:bg-red-900/25',
    iconColor: 'text-red-500 dark:text-red-400'
  },
  warning: {
    icon: ExclamationTriangleIcon,
    bg: 'bg-amber-50 dark:bg-amber-900/25',
    iconColor: 'text-amber-500 dark:text-amber-400'
  },
  info: {
    icon: InformationCircleIcon,
    bg: 'bg-blue-50 dark:bg-blue-900/25',
    iconColor: 'text-blue-500 dark:text-blue-400'
  },
  success: {
    icon: CheckBadgeIcon,
    bg: 'bg-emerald-50 dark:bg-emerald-900/25',
    iconColor: 'text-emerald-500 dark:text-emerald-400'
  }
};

async function fetchNotifications() {
  const [data, countRes] = await Promise.all([
    adminFetch<any>('/api/admin/notifications?limit=15'),
    adminFetch<any>('/api/admin/notifications/unread-count')
  ]);

  const notifications: NotificationItem[] = (data.notifications || []).map((n: any) => ({
    id: n.id,
    userId: n.user_id,
    orderId: n.order_id || n.orderId || n.metadata?.orderId,
    eventType: n.event_type || n.eventType || n.type,
    title: n.title,
    description: n.message || n.description || '',
    date: n.created_at || n.timestamp || new Date().toISOString(),
    read: !!n.read_at || !!n.read,
    severity: mapRawSeverity(n.severity),
    action_url: n.action_url || n.actionUrl,
    metadata: n.metadata || n.metadata_json
  }));

  return { notifications, unreadCount: countRes.count || 0 };
}

export const NotificationBell: React.FC = () => {
  const { t, locale } = useLocale();
  const navigate = useNavigate();
  const [notifOpen, setNotifOpen] = useState(false);
  const [liveItems, setLiveItems] = useState<NotificationItem[]>([]);
  const [pulseSeverity, setPulseSeverity] = useState<'red' | 'amber' | null>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  // SWR via useAdminQuery with 30s polling
  const { data, refetch } = useAdminQuery('notifications_bell', fetchNotifications, 30000);

  // Merge live SSE notifications with polled backend notifications
  const mergedNotifications: NotificationItem[] = React.useMemo(() => {
    const byId = new Map<string, NotificationItem>();
    for (const item of [...liveItems, ...(data?.notifications || [])]) {
      if (item && item.id && !byId.has(item.id)) {
        byId.set(item.id, item);
      }
    }
    return Array.from(byId.values()).slice(0, 20);
  }, [liveItems, data?.notifications]);

  const unreadCount = React.useMemo(() => {
    const unreadInList = mergedNotifications.filter(n => !n.read).length;
    return Math.max(data?.unreadCount || 0, unreadInList);
  }, [data?.unreadCount, mergedNotifications]);

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

  // Listen for custom global refresh or routing notification events
  useEffect(() => {
    const handleRefresh = () => refetch();
    const handleIncomingRoutingEvent = (ev: Event) => {
      const customEv = ev as CustomEvent<any>;
      const payload = customEv.detail;
      if (!payload || !payload.id) return;
      const mapped: NotificationItem = {
        id: payload.id,
        orderId: payload.orderId || payload.metadata?.orderId,
        eventType: payload.eventType,
        title: payload.title,
        description: payload.description || payload.message || '',
        date: payload.timestamp || new Date().toISOString(),
        read: false,
        severity: mapRawSeverity(payload.severity),
        action_url:
          payload.actionUrl ||
          `/pricing-profiles?tab=routing&orderId=${encodeURIComponent(payload.orderId || '')}`,
        metadata: payload.metadata
      };
      setLiveItems(prev => [mapped, ...prev.filter(x => x.id !== mapped.id)].slice(0, 20));
      setPulseSeverity(mapped.severity === 'error' ? 'red' : 'amber');
    };

    window.addEventListener('ppos:notifications:refresh', handleRefresh);
    window.addEventListener('ppos:routing-notification', handleIncomingRoutingEvent as EventListener);
    return () => {
      window.removeEventListener('ppos:notifications:refresh', handleRefresh);
      window.removeEventListener('ppos:routing-notification', handleIncomingRoutingEvent as EventListener);
    };
  }, [refetch]);

  // Connect to Server-Sent Events (`/api/routing/notifications/stream`) in real time
  useEffect(() => {
    if (typeof window === 'undefined' || typeof (window as any).EventSource === 'undefined') {
      return;
    }

    const token = getAuthToken();
    const tenantId = getUserTenantId() || 'tenant-default';
    const printhouseId = getUserPrinthouseId() || 'node-primary';
    const role = getUserRole() || 'PRINTHOUSE_ADMIN';

    const params = new URLSearchParams({
      tenantId,
      printhouseId,
      role
    });
    if (token) params.set('token', token);

    let es: EventSource | null = null;
    try {
      es = new EventSource(`/api/routing/notifications/stream?${params.toString()}`);
      es.addEventListener('routing_notification', (event: MessageEvent) => {
        try {
          const payload = JSON.parse(event.data);
          if (!payload || !payload.id) return;

          // Dispatch browser event so `RoutingRulesTab` and `OperationalActivityStream` react in < 50ms
          window.dispatchEvent(new CustomEvent('ppos:routing-notification', { detail: payload }));
        } catch {
          // Ignore malformed SSE frame
        }
      });
    } catch {
      // Ignore SSE connection error in isolated unit test environments
    }

    return () => {
      if (es) {
        es.close();
      }
    };
  }, []);

  const handleMarkAsRead = async (n: NotificationItem) => {
    try {
      setLiveItems(prev => prev.map(item => (item.id === n.id ? { ...item, read: true } : item)));
      await markNotificationRead(n.id);
      refetch();
      if (n.action_url) {
        setNotifOpen(false);
        navigate(n.action_url);
      }
    } catch (err) {
      console.error('[NotificationBell] Failed to mark as read:', err);
    }
  };

  const handleInspectDecision = (e: React.MouseEvent, n: NotificationItem) => {
    e.stopPropagation();
    setLiveItems(prev => prev.map(item => (item.id === n.id ? { ...item, read: true } : item)));
    markNotificationRead(n.id).catch(() => {});
    setNotifOpen(false);
    // Notify any mounted RoutingRulesTab to open the audit drawer for this decision
    window.dispatchEvent(
      new CustomEvent('ppos:open-routing-decision-drawer', {
        detail: {
          notificationId: n.id,
          orderId: n.orderId || n.metadata?.orderId || 'PUB-ORD-2026',
          title: n.title,
          description: n.description,
          metadata: n.metadata
        }
      })
    );
    navigate(n.action_url || `/pricing-profiles?tab=routing&orderId=${encodeURIComponent(n.orderId || '')}`);
  };

  const handleMarkAllAsRead = async () => {
    try {
      setLiveItems(prev => prev.map(item => ({ ...item, read: true })));
      setPulseSeverity(null);
      await markAllNotificationsRead();
      refetch();
    } catch (err) {
      console.error('[NotificationBell] Failed to mark all as read:', err);
    }
  };

  return (
    <div className="relative" ref={notifRef} data-testid="header-notification-bell">
      <button
        data-testid="notification-bell-button"
        onClick={() => setNotifOpen(v => !v)}
        aria-label={
          hasUnread
            ? t('topbar.notificationsBtn', { count: unreadCount }) || `Notifications (${unreadCount} unread)`
            : t('topbar.notificationsBtnZero') || 'Notifications'
        }
        title={
          hasUnread
            ? t('topbar.notificationsBtn', { count: unreadCount }) || `Notifications (${unreadCount} unread)`
            : t('topbar.notificationsBtnZero') || 'Notifications'
        }
        className="p-2 transition-all relative text-slate-500 dark:text-zinc-400 hover:text-black dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#1a1a1b]/5 cursor-pointer"
      >
        <BellIcon className="w-5 h-5" />
        {hasUnread && (
          <span
            data-testid="notification-bell-unread-badge"
            className={`absolute top-1 right-1 min-w-[16px] h-4 px-1 ${
              pulseSeverity === 'amber' ? 'bg-amber-500' : 'bg-[#dc0000]'
            } border border-black rounded-full flex items-center justify-center animate-pulse`}
          >
            <span className="text-[9px] font-mono font-black text-white leading-none">{unreadCount}</span>
          </span>
        )}
      </button>

      {/* Notifications Dropdown */}
      {notifOpen && (
        <div
          data-testid="notification-bell-dropdown"
          className="absolute right-0 top-full mt-1 w-96 ppos-surface border ppos-border overflow-hidden z-50 shadow-2xl rounded-xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b ppos-border ppos-surface-muted">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#10b981] animate-pulse" />
              <p className="text-[10px] font-black text-slate-900 dark:text-white uppercase tracking-widest">
                {t('topbar.notificationsTitle') || 'Real-Time Routing & System Alerts'}
              </p>
              {hasUnread && (
                <span className="px-1.5 py-0.5 bg-[#dc0000] text-white text-[8px] font-black uppercase rounded">
                  {unreadCount} {t('topbar.newBadge') || 'new'}
                </span>
              )}
            </div>
            {hasUnread && (
              <button
                data-testid="notification-bell-mark-all-read"
                onClick={handleMarkAllAsRead}
                className="text-[9px] font-bold text-zinc-500 hover:text-white transition-colors uppercase cursor-pointer"
              >
                {t('topbar.markAllRead') || 'Mark all read'}
              </button>
            )}
          </div>

          {/* List */}
          <div className="divide-y divide-slate-100 dark:divide-white/5 max-h-[400px] overflow-y-auto">
            {mergedNotifications.map(n => {
              const cfg = SEVERITY_CONFIG[n.severity] || SEVERITY_CONFIG.info;
              const Icon = cfg.icon;
              return (
                <div
                  key={n.id}
                  data-testid={`notification-dropdown-item-${n.id}`}
                  onClick={() => handleMarkAsRead(n)}
                  className={`w-full flex items-start gap-3 px-4 py-3 text-left transition-colors cursor-pointer ${
                    n.read
                      ? 'hover:bg-slate-50 dark:hover:bg-white/5'
                      : 'bg-slate-50/50 dark:bg-white/[0.03] hover:bg-slate-100 dark:hover:bg-white/5'
                  }`}
                >
                  {/* Severity Icon */}
                  <div className={`shrink-0 w-7 h-7 rounded-lg ${cfg.bg} flex items-center justify-center mt-0.5`}>
                    <Icon className={`w-4 h-4 ${cfg.iconColor}`} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p
                        className={`text-[11px] leading-snug ${
                          n.read
                            ? 'font-medium text-slate-500 dark:text-zinc-400'
                            : 'font-bold text-slate-900 dark:text-white'
                        }`}
                      >
                        {n.title}
                      </p>
                      {!n.read && <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-[#dc0000] mt-1.5" />}
                    </div>
                    <p className="text-[10px] text-zinc-500 dark:text-zinc-400 font-medium mt-0.5 leading-relaxed line-clamp-2">
                      {n.description}
                    </p>
                    <div className="flex items-center justify-between gap-2 mt-2">
                      <span className="text-[9px] font-mono font-bold text-zinc-500 uppercase tracking-wider">
                        {formatRelative(n.date, locale)}
                      </span>
                      <button
                        type="button"
                        data-testid={`notification-view-decision-btn-${n.id}`}
                        onClick={e => handleInspectDecision(e, n)}
                        className="px-2 py-0.5 rounded bg-[#dc0000]/15 hover:bg-[#dc0000] text-[#dc0000] hover:text-white border border-[#dc0000]/30 text-[9px] font-mono font-black uppercase transition-colors cursor-pointer"
                      >
                        Ver Decisión ↗
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer */}
          {mergedNotifications.length === 0 && (
            <div className="px-5 py-5 flex flex-col items-center gap-1">
              <p className="text-xs font-bold text-slate-300 uppercase tracking-widest">No notifications</p>
            </div>
          )}
          {mergedNotifications.length > 0 && mergedNotifications.every(n => n.read) && (
            <div className="px-5 py-4 flex flex-col items-center gap-1">
              <CheckBadgeIcon className="w-5 h-5 text-emerald-500/60" />
              <p className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-widest">All caught up</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
