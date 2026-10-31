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
          const isSupplier = isSupplierUser();

          // Non-platform roles (Printhouse and Supplier): minimal sanitized contract { ok: boolean, status: 'HEALTHY' | 'DEGRADED', services: { operational: boolean } }
          if (isPrinthouse || isSupplier) {
            if (data.ok === true && data.status === 'HEALTHY' && data.services?.operational !== false) {
              setTelemetryState({
                status: 'HEALTHY',
                tooltip: isSupplier 
                  ? (t('topbar.telemetryHealthySupplierTooltip') || 'Live services fully operational. Supplier portal ready for catalog and procurement operations.')
                  : (t('topbar.telemetryHealthyPrinthouseTooltip') || 'Live services fully operational. Print house environment ready for production.')
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
      <header className="h-16 bg-white/80 dark:bg-[#18181b]/80 backdrop-blur-md border-b border-zinc-200 dark:border-zinc-800 sticky top-0 z-40 px-4 lg:px-8 flex items-center justify-between transition-colors">
        <div className="flex items-center gap-2.5 lg:gap-4">
          {/* Mobile Menu Button */}
          {onMenuClick && (
            <button 
              onClick={onMenuClick} 
              aria-label="Open navigation menu"
              className="lg:hidden p-2 rounded-xl text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              <Bars3Icon className="w-5 h-5" />
            </button>
          )}

          {/* Environment Badge */}
          {import.meta.env?.DEV || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 text-[11px] font-bold">
              <span className="w-1.5 h-1.5 bg-amber-500 rounded-full" />
              <span>{t('topbar.devPreview') || 'Development Preview'}</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-[11px] font-bold">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
              <span>{t('topbar.prodEnv') || 'Production Environment'}</span>
            </div>
          )}

          {/* Core Telemetry Badge - Derived directly from /api/system/health */}
          {telemetryState.status === 'HEALTHY' && (
            <div
              className="hidden md:flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-[11px] font-bold"
              title={telemetryState.tooltip}
            >
              <ShieldCheckIcon className="w-3.5 h-3.5" />
              <span>{t('topbar.telemetryHealthy') || 'Telemetría Núcleo: OK'}</span>
            </div>
          )}
          {telemetryState.status === 'DEGRADED' && (
            <div
              className="hidden md:flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 text-[11px] font-bold"
              title={telemetryState.tooltip}
            >
              <ExclamationTriangleIcon className="w-3.5 h-3.5" />
              <span>{t('topbar.telemetryDegraded') || 'Telemetría Degradada'}</span>
            </div>
          )}
          {telemetryState.status === 'OFFLINE' && (
            <div
              className="hidden md:flex items-center gap-1.5 px-3 py-1 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700 text-[11px] font-bold"
              title={telemetryState.tooltip}
            >
              <ExclamationCircleIcon className="w-3.5 h-3.5" />
              <span>{t('topbar.telemetryOffline') || 'Sin Telemetría'}</span>
            </div>
          )}
          {telemetryState.status === 'RESTRICTED' && (
            <div
              className="hidden md:flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 text-[11px] font-bold"
              title={telemetryState.tooltip}
            >
              <ExclamationCircleIcon className="w-3.5 h-3.5" />
              <span>{t('topbar.telemetryRestricted') || 'Telemetría Restringida'}</span>
            </div>
          )}
          {telemetryState.status === 'VERIFYING' && (
            <div
              className="hidden md:flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 text-[11px] font-bold animate-pulse"
              title={telemetryState.tooltip}
            >
              <InformationCircleIcon className="w-3.5 h-3.5" />
              <span>{t('topbar.telemetryVerifying') || 'Comprobando Núcleo...'}</span>
            </div>
          )}

          {/* Region Context */}
          <div className="hidden xl:flex items-center gap-1.5 px-3 py-1 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700 text-[11px] font-semibold">
            <MapPinIcon className="w-3.5 h-3.5 text-[#dc0000]" />
            <span>{t('topbar.region') || 'EU-WEST-1 (Primary)'}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {/* Quick Theme Toggle */}
          <button
            onClick={toggleTheme}
            id="topbar-theme-toggle"
            aria-label={currentTheme === 'dark' ? (t('topbar.toggleThemeLight') || 'Switch to Light mode') : (t('topbar.toggleThemeDark') || 'Switch to Dark mode')}
            title={currentTheme === 'dark' ? (t('topbar.toggleThemeLight') || 'Switch to Light mode') : (t('topbar.toggleThemeDark') || 'Switch to Dark mode')}
            className="p-1.5 sm:px-2.5 sm:py-1 rounded-xl text-xs font-bold border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/80 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-zinc-700 dark:text-zinc-200 cursor-pointer flex items-center justify-center"
          >
            <span>{currentTheme === 'dark' ? '🌙' : '☀️'}</span>
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
            className="px-2.5 py-1 rounded-xl text-xs font-bold border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/80 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-zinc-700 dark:text-zinc-200 cursor-pointer"
          >
            {locale.toUpperCase()}
          </button>

          {/* Global Notifications */}
          <NotificationBell />

          {/* Separator */}
          <div className="h-6 w-[1px] bg-zinc-200 dark:bg-zinc-800 mx-1 hidden sm:block" />

          {/* User Menu */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen(v => !v)}
              id="topbar-user-menu-toggle"
              className="flex items-center gap-2.5 p-1 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800/80 transition-all cursor-pointer group"
            >
              <div className="text-right hidden md:block">
                <p className="text-xs font-bold text-zinc-900 dark:text-zinc-100 leading-tight">{getAuthUser()?.name || t('common.authorizedUser') || 'Authorized User'}</p>
                <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider leading-tight">
                  {t(`role.${getUserRole()}` as any) || getUserRole()}
                </p>
              </div>
              <div className="w-8 h-8 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center text-zinc-600 dark:text-zinc-400 group-hover:border-zinc-300 dark:group-hover:border-zinc-600 transition-colors">
                <UserCircleIcon className="w-5 h-5" />
              </div>
              <ChevronDownIcon className={`w-3.5 h-3.5 text-zinc-400 transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* Dropdown */}
            {menuOpen && (
              <div className="absolute right-0 top-full mt-2 w-56 rounded-2xl bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-zinc-800 z-50 shadow-xl overflow-hidden p-1.5 space-y-1">
                {/* Context Switcher for Dual-Capability / Super Admin */}
                {isPaperSupplierHubEnabled() && (isSupplierUser() || isPrinthouseUser() || getUserRole() === 'SUPER_ADMIN') && (
                  <div className="p-2 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 rounded-xl mb-1">
                    <span className="block text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1.5 px-1">
                      {t('topbar.activeContext') || 'Active Context'}
                    </span>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setActiveContext('printhouse');
                          setMenuOpen(false);
                          navigate('/dashboard');
                        }}
                        className={`px-2 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                          getActiveContext() === 'printhouse' || !getActiveContext()
                            ? 'bg-[#dc0000] text-white shadow-2xs'
                            : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-zinc-800'
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
                        className={`px-2 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                          getActiveContext() === 'supplier'
                            ? 'bg-[#dc0000] text-white shadow-2xs'
                            : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-zinc-800'
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
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                >
                  <Cog6ToothIcon className="w-4 h-4 text-zinc-500" />
                  <span>{t('topbar.settings') || 'Settings'}</span>
                </button>
                <button
                  onClick={() => { setMenuOpen(false); setLogoutModal(true); }}
                  id="topbar-menu-logout"
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
                >
                  <ArrowRightStartOnRectangleIcon className="w-4 h-4" />
                  <span>{t('topbar.logout') || 'Logout'}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Logout Confirmation Modal */}
      {logoutModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" id="logout-dialog-overlay">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setLogoutModal(false)}
          />
          <div id="logout-dialog-panel" className="relative bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 sm:p-8 w-full max-w-sm mx-4 flex flex-col items-center gap-4 shadow-2xl z-10 animate-slide-fade">
            <div className="w-12 h-12 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 flex items-center justify-center text-[#dc0000]">
              <ExclamationTriangleIcon className="w-6 h-6" />
            </div>
            <div className="text-center">
              <h3 className="text-base font-extrabold text-zinc-900 dark:text-zinc-100">{t('topbar.closeSession') || 'Close Session?'}</h3>
              <p className="text-xs text-zinc-500 mt-1">
                {t('topbar.logoutConfirm') || 'Are you sure you want to log out of the Control Plane?'}
              </p>
            </div>
            <div className="flex gap-2.5 w-full mt-2">
              <button
                id="logout-dialog-cancel"
                onClick={() => setLogoutModal(false)}
                className="flex-1 px-4 py-2.5 text-xs font-bold rounded-xl border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                {t('topbar.cancel') || 'Cancel'}
              </button>
              <button
                id="logout-dialog-confirm"
                onClick={handleLogoutConfirm}
                className="flex-1 px-4 py-2.5 bg-[#dc0000] hover:bg-[#b50000] text-white text-xs font-bold rounded-xl transition-colors cursor-pointer shadow-2xs"
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
