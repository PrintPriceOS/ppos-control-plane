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
import { clearAdminKey, getSystemHealth } from '../lib/adminApi';
import { getAuthUser, getUserRole, isPrinthouseUser, isSupplierUser, getActiveContext, setActiveContext, isPaperSupplierHubEnabled } from '../lib/authStore';
import { PrintPriceLogo } from '../components/PrintPriceLogo';




import { useLocale } from '../i18n';
import { getTheme, setTheme, subscribeTheme } from '../lib/themeStore';

export const Topbar: React.FC<{ onMenuClick?: () => void }> = ({ onMenuClick }) => {
  const navigate = useNavigate();
  const { locale, setLocale, t } = useLocale();
  const [currentTheme, setCurrentThemeState] = useState(getTheme());
  const [telemetryState, setTelemetryState] = useState<{
    status: 'VERIFYING' | 'HEALTHY' | 'DEGRADED' | 'OFFLINE' | 'RESTRICTED';
    tooltip: string;
  }>({
    status: 'VERIFYING',
    tooltip: t('topbar.telemetryVerifyingTooltip') || 'Checking process state and dependencies on /api/system/health...'
  });

  const [menuOpen, setMenuOpen] = useState(false);
  const [logoutModal, setLogoutModal] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let isMounted = true;

    const fetchHealth = () => {
      getSystemHealth()
        .then(data => {
          if (!isMounted) return;

          // 1. Authentication or Authorization failures: Never treat as degraded infrastructure or offline server
          if (data?.statusCode === 401 || data?.statusCode === 403 || data?.status === 'UNAUTHORIZED' || data?.status === 'FORBIDDEN') {
            const code = data.statusCode || (data.status === 'UNAUTHORIZED' ? 401 : 403);
            setTelemetryState({
              status: 'RESTRICTED',
              tooltip: t('topbar.telemetryRestrictedTooltip', { code }) || `Unauthorized access to infrastructure telemetry (HTTP ${code}).`
            });
            return;
          }

          // 2. Unreachable, missing endpoint (404), or generic server error without health payload
          if (!data || data.status === 'UNREACHABLE' || data.statusCode === 404 || (data.statusCode && data.statusCode >= 500 && !data.dependencies && !data.services)) {
            const code = data?.statusCode || 'ERR';
            setTelemetryState({
              status: 'OFFLINE',
              tooltip: t('topbar.telemetryOfflineTooltip', { code }) || `Diagnostic unavailable: telemetry service unreachable (HTTP ${code}).`
            });
            return;
          }

          // 3. Inspect health response
          const isPrinthouse = isPrinthouseUser();

          // Printhouse payload evaluation: { ok: boolean, status: 'HEALTHY' | 'DEGRADED', services: { operational: boolean } }
          if (isPrinthouse) {
            if (data.ok === true && data.status === 'HEALTHY' && data.services?.operational !== false) {
              setTelemetryState({
                status: 'HEALTHY',
                tooltip: t('topbar.telemetryHealthyPrinthouseTooltip') || 'Live services fully operational. Print house environment ready for production.'
              });
            } else {
              setTelemetryState({
                status: 'DEGRADED',
                tooltip: t('topbar.telemetryDegradedTooltip') || 'Degraded telemetry: evaluated dependencies reported issues. Check system connectivity.'
              });
            }
            return;
          }

          // Platform / Super Admin payload evaluation: includes dependencies, pid, uptime
          const redisStatus = data?.dependencies?.redis?.status;
          const redisLatency = data?.dependencies?.redis?.latency;
          const isRedisReady = redisStatus === 'ready' && redisLatency === 'OK';
          const isUptimeValid = typeof data?.uptime_seconds === 'number' && data.uptime_seconds >= 0;

          if (data.ok === true && isRedisReady && isUptimeValid) {
            setTelemetryState({
              status: 'HEALTHY',
              tooltip: t('topbar.telemetryHealthyAdminTooltip', {
                pid: data.pid ?? '—',
                uptime: data.uptime_seconds ?? 0,
                redisStatus: redisStatus || 'ready',
                latency: redisLatency || 'OK'
              }) || `Infrastructure telemetry OK: Node.js process (PID ${data.pid ?? '—'}, ${data.uptime_seconds}s uptime), Redis status '${redisStatus}' with latency '${redisLatency}'.`
            });
          } else if (redisStatus || redisLatency) {
            // Real evaluated dependency reported degraded status
            setTelemetryState({
              status: 'DEGRADED',
              tooltip: t('topbar.telemetryDegradedAdminTooltip', {
                redisStatus: redisStatus || 'unknown',
                latency: redisLatency || 'unknown'
              }) || `Degraded telemetry: Redis status='${redisStatus || 'unknown'}', latency='${redisLatency || 'unknown'}'. Check service connectivity.`
            });
          } else if (data.ok === false || data.status === 'DEGRADED') {
            setTelemetryState({
              status: 'DEGRADED',
              tooltip: t('topbar.telemetryDegradedTooltip') || 'Degraded telemetry: evaluated dependencies reported issues. Check system connectivity.'
            });
          } else {
            setTelemetryState({
              status: 'OFFLINE',
              tooltip: t('topbar.telemetryOfflineTooltip', { code: data.statusCode || 200 }) || `Diagnostic unavailable: telemetry service unreachable (HTTP ${data.statusCode || 200}).`
            });
          }
        })
        .catch(() => {
          if (isMounted) {
            setTelemetryState({
              status: 'OFFLINE',
              tooltip: t('topbar.telemetryOfflineTooltip', { code: 'NET_ERR' }) || 'Diagnostic unavailable: telemetry service unreachable (HTTP NET_ERR).'
            });
          }
        });
    };

    fetchHealth();
    // Bounded periodic refresh every 60s, cleaned up on unmount
    const intervalId = setInterval(fetchHealth, 60000);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, [t]);

  useEffect(() => {
    const unsubscribe = subscribeTheme((theme) => {
      setCurrentThemeState(theme);
    });
    return unsubscribe;
  }, []);

  const toggleTheme = () => {
    const next = currentTheme === 'dark' ? 'light' : 'dark';
    setTheme(next);
  };

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
          {import.meta.env?.DEV || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? (
            <div className="hidden sm:flex items-center gap-2 px-3 py-1 bg-amber-500/10 text-amber-500 border border-amber-500/20">
              <div className="w-1 h-1 bg-amber-500 rounded-full" />
              <span className="text-[9px] font-black uppercase tracking-widest">{t('topbar.devPreview') || 'Development Preview'}</span>
            </div>
          ) : (
            <div className="hidden sm:flex items-center gap-2 px-3 py-1 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 animate-pulse-slow">
              <div className="w-1 h-1 bg-emerald-500" />
              <span className="text-[9px] font-black uppercase tracking-widest">{t('topbar.prodEnv') || 'Production Environment'}</span>
            </div>
          )}

          {/* Core Telemetry Badge - Derived directly from /api/system/health */}
          {telemetryState.status === 'HEALTHY' && (
            <div
              className="hidden md:flex items-center gap-2 px-3 py-1 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
              title={telemetryState.tooltip}
            >
              <ShieldCheckIcon className="w-3.5 h-3.5" />
              <span className="text-[9px] font-black uppercase tracking-widest">{t('topbar.telemetryHealthy') || 'Telemetría Núcleo: OK'}</span>
            </div>
          )}
          {telemetryState.status === 'DEGRADED' && (
            <div
              className="hidden md:flex items-center gap-2 px-3 py-1 bg-amber-500/10 text-amber-500 border border-amber-500/20"
              title={telemetryState.tooltip}
            >
              <ExclamationTriangleIcon className="w-3.5 h-3.5" />
              <span className="text-[9px] font-black uppercase tracking-widest">{t('topbar.telemetryDegraded') || 'Telemetría Degradada'}</span>
            </div>
          )}
          {telemetryState.status === 'OFFLINE' && (
            <div
              className="hidden md:flex items-center gap-2 px-3 py-1 bg-zinc-500/10 text-zinc-400 border border-zinc-500/20"
              title={telemetryState.tooltip}
            >
              <ExclamationCircleIcon className="w-3.5 h-3.5" />
              <span className="text-[9px] font-black uppercase tracking-widest">{t('topbar.telemetryOffline') || 'Sin Telemetría'}</span>
            </div>
          )}
          {telemetryState.status === 'RESTRICTED' && (
            <div
              className="hidden md:flex items-center gap-2 px-3 py-1 bg-purple-500/10 text-purple-400 border border-purple-500/20"
              title={telemetryState.tooltip}
            >
              <ExclamationCircleIcon className="w-3.5 h-3.5" />
              <span className="text-[9px] font-black uppercase tracking-widest">{t('topbar.telemetryRestricted') || 'Telemetría Restringida'}</span>
            </div>
          )}
          {telemetryState.status === 'VERIFYING' && (
            <div
              className="hidden md:flex items-center gap-2 px-3 py-1 bg-blue-500/10 text-blue-400 border border-blue-500/20 animate-pulse"
              title={telemetryState.tooltip}
            >
              <InformationCircleIcon className="w-3.5 h-3.5" />
              <span className="text-[9px] font-black uppercase tracking-widest">{t('topbar.telemetryVerifying') || 'Comprobando Núcleo...'}</span>
            </div>
          )}

          {/* Region Context */}
          <div className="hidden lg:flex items-center gap-2 text-slate-400">
            <MapPinIcon className="w-4 h-4" />
            <span className="text-xs font-bold uppercase tracking-wider">{t('topbar.region') || 'EU-WEST-1 (Primary)'}</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Quick Theme Toggle */}
          <button
            onClick={toggleTheme}
            id="topbar-theme-toggle"
            aria-label={currentTheme === 'dark' ? (t('topbar.toggleThemeLight') || 'Switch to Light mode') : (t('topbar.toggleThemeDark') || 'Switch to Dark mode')}
            title={currentTheme === 'dark' ? (t('topbar.toggleThemeLight') || 'Switch to Light mode') : (t('topbar.toggleThemeDark') || 'Switch to Dark mode')}
            className="px-2 py-1 text-[10px] font-black uppercase tracking-wider border ppos-border hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors text-zinc-600 dark:text-zinc-300"
          >
            {currentTheme === 'dark' ? '🌙' : '☀️'}
          </button>

          {/* Quick Language Toggle */}
          <button
            onClick={() => {
              const nextLoc = locale === 'en' ? 'es' : locale === 'es' ? 'de' : 'en';
              setLocale(nextLoc);
            }}
            id="topbar-lang-toggle"
            aria-label={t('topbar.toggleLanguage', { lang: locale.toUpperCase() }) || `Language: ${locale.toUpperCase()}`}
            title={t('topbar.toggleLanguage', { lang: locale.toUpperCase() }) || `Language: ${locale.toUpperCase()}`}
            className="px-2.5 py-1 text-[10px] font-black uppercase tracking-widest border ppos-border hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors text-zinc-700 dark:text-zinc-200"
          >
            {locale.toUpperCase()}
          </button>

          {/* Global Notifications */}
          <NotificationBell />

          {/* Role & Profile */}
          <div className="h-6 w-[1px] ppos-border mx-1" />

          {/* User Menu */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen(v => !v)}
              id="topbar-user-menu-toggle"
              className="flex items-center gap-3 pl-2 hover:bg-slate-100 dark:hover:bg-[#1a1a1b]/5 pr-2 py-1 transition-all group"
            >
              <div className="text-right">
                <p className="text-xs font-black text-slate-900 dark:text-white leading-tight">{getAuthUser()?.name || t('common.authorizedUser') || 'Authorized User'}</p>
                <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest leading-tight">
                  {t(`role.${getUserRole()}` as any) || getUserRole()}
                </p>
              </div>
              <div className="w-8 h-8 ppos-surface-muted border ppos-border flex items-center justify-center text-slate-400 dark:text-zinc-500 group-hover:border-slate-300 dark:group-hover:border-white/20 transition-colors">
                <UserCircleIcon className="w-6 h-6" />
              </div>
              <ChevronDownIcon className={`w-3 h-3 text-zinc-500 transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* Dropdown */}
            {menuOpen && (
              <div className="absolute right-0 top-full mt-1 w-52 ppos-surface border ppos-border z-50 shadow-none">
                <div className="p-0">
                  {/* Context Switcher for Dual-Capability / Super Admin */}
                  {isPaperSupplierHubEnabled() && (isSupplierUser() || isPrinthouseUser() || getUserRole() === 'SUPER_ADMIN') && (
                    <div className="p-2 border-b border-white/5 bg-slate-50/50 dark:bg-zinc-900/50">
                      <span className="block text-[9px] font-black uppercase text-zinc-500 mb-1 px-2">
                        {t('topbar.activeContext') || 'Active Context'}
                      </span>
                      <div className="grid grid-cols-2 gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setActiveContext('printhouse');
                            setMenuOpen(false);
                            navigate('/dashboard');
                          }}
                          className={`px-2 py-1 text-[9px] font-bold uppercase rounded ${
                            getActiveContext() === 'printhouse' || !getActiveContext()
                              ? 'bg-[#dc0000] text-white'
                              : 'text-zinc-400 hover:text-black dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5'
                          }`}
                        >
                          Printhouse
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveContext('supplier');
                            setMenuOpen(false);
                            navigate('/supplier/dashboard');
                          }}
                          className={`px-2 py-1 text-[9px] font-bold uppercase rounded ${
                            getActiveContext() === 'supplier'
                              ? 'bg-[#dc0000] text-white'
                              : 'text-zinc-400 hover:text-black dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5'
                          }`}
                        >
                          Supplier
                        </button>
                      </div>
                    </div>
                  )}

                  <button
                    onClick={handleSettings}
                    id="topbar-menu-settings"
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-[10px] font-black uppercase text-slate-500 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-[#1a1a1b]/5 hover:text-black dark:hover:text-white transition-colors"
                  >
                    <Cog6ToothIcon className="w-4 h-4" />
                    {t('topbar.settings') || 'Settings'}
                  </button>
                  <div className="border-t border-white/5" />
                  <button
                    onClick={() => { setMenuOpen(false); setLogoutModal(true); }}
                    id="topbar-menu-logout"
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-[10px] font-black uppercase text-red-500 hover:bg-red-600 hover:text-white transition-colors"
                  >
                    <ArrowRightStartOnRectangleIcon className="w-4 h-4" />
                    {t('topbar.logout') || 'Logout'}
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>
      </header>

      {/* Logout Confirmation Modal */}
      {logoutModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true" id="logout-dialog-overlay">
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={() => setLogoutModal(false)}
          />
          <div id="logout-dialog-panel" className="relative ppos-surface border ppos-border p-8 w-full max-w-sm mx-4 flex flex-col items-center gap-5 shadow-none">
            <div className="w-12 h-12 bg-red-500/10 flex items-center justify-center">
              <ExclamationTriangleIcon className="w-6 h-6 text-red-500" />
            </div>
            <div className="text-center">
              <p className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest">{t('topbar.closeSession') || 'Close Session?'}</p>
              <p className="text-[10px] text-zinc-500 font-bold mt-1 uppercase">
                {t('topbar.logoutConfirm') || 'Are you sure you want to log out of the Control Plane?'}
              </p>
            </div>
            <div className="flex gap-2 w-full">
              <button
                id="logout-dialog-cancel"
                onClick={() => setLogoutModal(false)}
                className="flex-1 px-4 py-2 text-[10px] font-black uppercase border border-white/10 text-zinc-400 hover:bg-white/5 transition-colors"
              >
                {t('topbar.cancel') || 'Cancel'}
              </button>
              <button
                id="logout-dialog-confirm"
                onClick={handleLogoutConfirm}
                className="flex-1 px-4 py-2 bg-red-600 text-white text-[10px] font-black uppercase hover:bg-red-700 transition-colors"
              >
                {t('topbar.logout') || 'Logout'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
