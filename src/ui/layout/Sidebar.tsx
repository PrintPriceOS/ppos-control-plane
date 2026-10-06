import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { clearAuthToken } from '../lib/authStore';
import { PrintPriceLogo } from '../components/PrintPriceLogo';
import {
  ChartBarIcon,
  UsersIcon,
  QueueListIcon,
  ExclamationTriangleIcon,
  ShieldCheckIcon,
  WrenchScrewdriverIcon,
  ArrowPathIcon,
  ClockIcon,
  BookOpenIcon,
  HeartIcon,
  BanknotesIcon,
  BellIcon,
  BoltIcon,
  BuildingOfficeIcon,
  BuildingStorefrontIcon,
  CurrencyEuroIcon,
  DocumentCheckIcon,
  CpuChipIcon,
  ArrowsRightLeftIcon,
  CommandLineIcon,
  CubeIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ChevronLeftIcon,
  PrinterIcon,
  ClipboardDocumentListIcon,
  CircleStackIcon,
  TicketIcon,
  ScaleIcon,
  DocumentArrowDownIcon,
  DocumentDuplicateIcon,
  InboxIcon,
  Square3Stack3DIcon,
  SparklesIcon,
  FingerPrintIcon,
  SignalIcon,
  XMarkIcon,
  CheckCircleIcon,
  TagIcon,
  TruckIcon
} from "@heroicons/react/24/outline";
import { useLocale } from '../i18n';
import { navigationConfig, Role } from '../config/controlPlaneNavigation';
import { getUserRole } from '../lib/authStore';
import { getModuleReadiness } from '../config/moduleReadiness';

const IconMap: Record<string, any> = {
    HomeIcon: ChartBarIcon,
    ShieldCheckIcon: ShieldCheckIcon,
    CloudIcon: ArrowsRightLeftIcon,
    InboxIcon: InboxIcon,
    CpuChipIcon: CpuChipIcon,
    WrenchScrewdriverIcon: WrenchScrewdriverIcon,
    RectangleStackIcon: Square3Stack3DIcon,
    CurrencyDollarIcon: CurrencyEuroIcon,
    BuildingOfficeIcon: BuildingOfficeIcon,
    ClipboardDocumentListIcon: ClipboardDocumentListIcon,
    Cog6ToothIcon: BoltIcon,
    SparklesIcon: SparklesIcon,
    BuildingStorefrontIcon: BuildingStorefrontIcon,
    ScaleIcon: ScaleIcon,
    BanknotesIcon: BanknotesIcon,
    CommandLineIcon: CommandLineIcon,
    DocumentCheckIcon: DocumentCheckIcon,
    PrinterIcon: PrinterIcon
};

// Printhouse setup sections for contextual submenu
export const PRINTHOUSE_SETUP_SECTIONS = [
    { key: 'OVERVIEW', label: 'Setup Overview', icon: ChartBarIcon },
    { key: 'COMPANY', label: 'Company Profile', icon: BuildingOfficeIcon },
    { key: 'SITES', label: 'Production Sites', icon: BuildingStorefrontIcon },
    { key: 'MACHINES', label: 'Machinery Fleet', icon: BoltIcon },
    { key: 'CAPABILITIES', label: 'Capabilities', icon: ShieldCheckIcon },
    { key: 'MATERIALS', label: 'Materials', icon: Square3Stack3DIcon },
    { key: 'CAPACITY', label: 'Capacity', icon: CpuChipIcon },
    { key: 'LEAD_TIMES', label: 'Lead Times', icon: ClockIcon },
    { key: 'PRICING', label: 'Industrial Pricing', icon: TagIcon },
    { key: 'SHIPPING', label: 'Shipping', icon: TruckIcon },
    { key: 'INTEGRATIONS', label: 'Integrations', icon: CommandLineIcon },
    { key: 'MARKETPLACE', label: 'Marketplace Review', icon: CheckCircleIcon }
];

interface SidebarProps {
    isOpen: boolean;
    onClose?: () => void;
    isCollapsed?: boolean;
    onToggleCollapse?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
    isOpen,
    onClose,
    isCollapsed: propIsCollapsed,
    onToggleCollapse
}) => {
  const { t } = useLocale();
  const navigate = useNavigate();
  const location = useLocation();
  const userRole = getUserRole() as Role;

  // Local storage persistence for sidebar collapse preference
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
      if (typeof window !== 'undefined') {
          const saved = localStorage.getItem('ppos_sidebar_collapsed');
          if (saved !== null) return saved === 'true';
          // Collapse on screens < 1280px by default
          return window.innerWidth < 1280;
      }
      return false;
  });

  const effectiveCollapsed = propIsCollapsed !== undefined ? propIsCollapsed : isCollapsed;

  const handleToggle = () => {
      const next = !effectiveCollapsed;
      setIsCollapsed(next);
      if (typeof window !== 'undefined') {
          localStorage.setItem('ppos_sidebar_collapsed', String(next));
      }
      onToggleCollapse?.();
  };

  const handleLogout = () => {
    clearAuthToken();
    navigate('/login', { replace: true });
  };

  const visibleModules = navigationConfig.filter(item => 
    item.roles.includes(userRole) || userRole === 'SUPER_ADMIN'
  );

  const isPrinthouseSetupRoute = location.pathname.startsWith('/printhouse/setup');
  const currentTab = (new URLSearchParams(location.search).get('tab') || 'OVERVIEW').toUpperCase();

  const [setupSubmenuOpen, setSetupSubmenuOpen] = useState(true);

  // Tab key mapping for Printhouse Setup
  const getSetupSectionLabel = (key: string, defaultLabel: string) => {
    const keyMap: Record<string, string> = {
      'OVERVIEW': 'setup.tabs.overview',
      'COMPANY': 'setup.tabs.company',
      'SITES': 'setup.tabs.sites',
      'MACHINES': 'setup.tabs.machines',
      'CAPABILITIES': 'setup.tabs.capabilities',
      'MATERIALS': 'setup.tabs.materials',
      'CAPACITY': 'setup.tabs.capacity',
      'LEAD_TIMES': 'setup.tabs.leadTimes',
      'PRICING': 'setup.tabs.pricing',
      'SHIPPING': 'setup.tabs.shipping',
      'INTEGRATIONS': 'setup.tabs.integrations',
      'MARKETPLACE': 'setup.tabs.marketplace'
    };
    const transKey = keyMap[key];
    if (transKey) {
      const translated = t(transKey);
      if (translated && translated !== transKey) return translated;
    }
    return defaultLabel;
  };

  const getNavLabel = (item: { id: string; label: string }) => {
    const transKey = `nav.${item.id}`;
    const translated = t(transKey);
    if (translated && translated !== transKey) return translated;
    return item.label;
  };

  return (
    <aside
      className={`${isOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 fixed lg:static z-50 ${
        effectiveCollapsed ? 'w-16' : 'w-64'
      } ppos-bg border-r ppos-border h-full flex flex-col overflow-hidden transition-all duration-200 ease-in-out shrink-0 select-none`}
      aria-label={t('sidebar.appSidebar') || 'Application Sidebar'}
    >
      {/* Brand Header */}
      <div className={`px-4 py-4 flex items-center ${effectiveCollapsed ? 'justify-center' : 'justify-between'} border-b border-slate-100 dark:border-white/5 shrink-0`}>
        <div className="flex items-center gap-3 overflow-hidden">
          <PrintPriceLogo className="w-8 h-8 shrink-0" />
          {!effectiveCollapsed && (
            <div className="min-w-0">
              <h1 className="text-sm font-black text-slate-900 dark:text-white leading-none tracking-tight truncate">PrintPrice OS</h1>
              <p className="text-[9px] font-bold text-zinc-500 mt-1 uppercase tracking-widest truncate">
                {userRole === 'SUPER_ADMIN' ? 'Control Plane' : 'Printhouse Hub'}
              </p>
            </div>
          )}
        </div>

        {/* Mobile Close Button */}
        {onClose && (
          <button 
            onClick={onClose} 
            className="lg:hidden p-1 text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors"
            aria-label={t('sidebar.closeMobile') || 'Close mobile sidebar'}
          >
            <XMarkIcon className="w-6 h-6" />
          </button>
        )}
      </div>

      {/* Collapse / Expand Toggle Control (Visible on Desktop) */}
      <div className={`hidden lg:flex items-center px-3 py-2 border-b border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-zinc-900/40 ${
        effectiveCollapsed ? 'justify-center' : 'justify-between'
      }`}>
        {!effectiveCollapsed && (
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500">
            {t('nav.navigation') || 'Navigation'}
          </span>
        )}
        <button
          type="button"
          onClick={handleToggle}
          title={effectiveCollapsed ? (t('nav.expandSidebar') || 'Expand sidebar') : (t('nav.collapseSidebar') || 'Collapse sidebar')}
          aria-label={effectiveCollapsed ? (t('nav.expandSidebar') || 'Expand sidebar') : (t('nav.collapseSidebar') || 'Collapse sidebar')}
          className="p-1 rounded text-slate-400 hover:text-black dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
        >
          {effectiveCollapsed ? <ChevronRightIcon className="w-4 h-4" /> : <ChevronLeftIcon className="w-4 h-4" />}
        </button>
      </div>

      {/* Navigation Scroll Area */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-1 scrollbar-hide">
        {/* Contextual Printhouse Setup Group */}
        <div className="space-y-1 mb-2">
            <button
                type="button"
                onClick={() => {
                    if (effectiveCollapsed) {
                        handleToggle();
                    } else {
                        setSetupSubmenuOpen(!setupSubmenuOpen);
                    }
                }}
                title={t('nav.printhouseSetup') || 'Printhouse setup'}
                className={`w-full flex items-center ${
                    effectiveCollapsed ? 'justify-center px-2' : 'justify-between px-3'
                } py-2 text-xs font-bold transition-all rounded ${
                    isPrinthouseSetupRoute
                        ? 'bg-red-50/80 dark:bg-red-950/40 text-[#dc0000] dark:text-red-400'
                        : 'text-slate-600 dark:text-zinc-300 hover:bg-black/5 dark:hover:bg-white/5'
                }`}
            >
                <div className="flex items-center gap-3 min-w-0">
                    <PrinterIcon className="w-5 h-5 shrink-0 text-[#dc0000]" />
                    {!effectiveCollapsed && (
                        <span className="truncate">{t('nav.printhouseSetup') || 'Printhouse setup'}</span>
                    )}
                </div>
                {!effectiveCollapsed && (
                    setupSubmenuOpen ? <ChevronDownIcon className="w-3.5 h-3.5 shrink-0" /> : <ChevronRightIcon className="w-3.5 h-3.5 shrink-0" />
                )}
            </button>

            {/* Submenu Items under Printhouse setup */}
            {!effectiveCollapsed && setupSubmenuOpen && (
                <div className="pl-6 space-y-0.5 border-l-2 border-slate-200 dark:border-zinc-800 ml-5 my-1">
                    {PRINTHOUSE_SETUP_SECTIONS.map(sec => {
                        const isSubActive = isPrinthouseSetupRoute && currentTab === sec.key;
                        const targetUrl = sec.key === 'OVERVIEW' ? '/printhouse/setup' : `/printhouse/setup?tab=${sec.key}`;
                        const SecIcon = sec.icon;
                        const labelText = getSetupSectionLabel(sec.key, sec.label);

                        return (
                            <NavLink
                                key={sec.key}
                                to={targetUrl}
                                className={`flex items-start gap-2.5 px-2.5 py-1.5 text-xs font-semibold rounded transition-colors group ${
                                    isSubActive
                                        ? 'bg-[#dc0000] text-white font-bold shadow-xs'
                                        : 'text-slate-500 dark:text-zinc-400 hover:text-black dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5'
                                }`}
                            >
                                <SecIcon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${isSubActive ? 'text-white' : 'text-slate-400 dark:text-zinc-500 group-hover:text-black dark:group-hover:text-white'}`} />
                                <span className="leading-snug break-words">{labelText}</span>
                            </NavLink>
                        );
                    })}
                </div>
            )}
        </div>

        {/* Regular Modules */}
        <div className="pt-2 border-t border-slate-100 dark:border-white/5 space-y-1">
          {visibleModules.filter(m => m.id !== 'printhouse-setup').map(item => {
            const readiness = getModuleReadiness(item.id);
            const badge = readiness?.status === 'ACTIVE' ? undefined : readiness?.status;
            const Icon = IconMap[item.icon] || CubeIcon;
            const itemLabel = getNavLabel(item);

            return (
              <NavLink
                key={item.id}
                id={`nav-${item.id}`}
                data-nav-id={item.id}
                to={item.path}
                title={effectiveCollapsed ? itemLabel : undefined}
                className={({ isActive }) => [
                  `flex items-center ${effectiveCollapsed ? 'justify-center px-2' : 'justify-between px-3'} py-2 text-xs font-bold transition-all duration-100 group rounded`,
                  isActive
                    ? "bg-primary text-white"
                    : "text-slate-500 dark:text-zinc-400 hover:text-black dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5"
                ].join(" ")}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Icon className="w-5 h-5 flex-shrink-0" />
                  {!effectiveCollapsed && <span className="truncate">{itemLabel}</span>}
                </div>
                {!effectiveCollapsed && badge && (
                  <span className="bg-primary text-white text-[9px] font-black px-1 py-0.5 uppercase shrink-0">
                    {badge}
                  </span>
                )}
              </NavLink>
            );
          })}
        </div>
      </nav>

      {/* Sidebar Footer */}
      <div className={`p-2 ppos-surface-muted border-t ppos-border space-y-1 shrink-0 ${effectiveCollapsed ? 'flex flex-col items-center' : ''}`}>
        <a 
          href="/admin/help" 
          title={t('nav.helpConsole') || 'OS Help Console'}
          className={`flex items-center ${effectiveCollapsed ? 'justify-center p-2' : 'gap-3 px-3 py-2'} text-primary hover:bg-primary hover:text-white transition-colors border border-primary/20 group rounded`}
        >
          <BookOpenIcon className="w-4 h-4 shrink-0" />
          {!effectiveCollapsed && <span className="text-[10px] font-black uppercase truncate">{t('nav.helpConsole') || 'OS Help Console'}</span>}
        </a>
        
        <button 
          onClick={handleLogout}
          title={t('nav.logout') || 'Logout Session'}
          className={`w-full flex items-center ${effectiveCollapsed ? 'justify-center p-2' : 'gap-3 px-3 py-2'} text-slate-500 dark:text-zinc-500 hover:text-black dark:hover:text-white hover:bg-slate-200 dark:hover:bg-red-600 transition-all group rounded cursor-pointer`}
        >
          <ArrowPathIcon className="w-4 h-4 shrink-0" />
          {!effectiveCollapsed && <span className="text-[10px] font-black uppercase truncate">{t('nav.logout') || 'Logout Session'}</span>}
        </button>
      </div>
    </aside>
  );
};
