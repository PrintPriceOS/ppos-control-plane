import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { clearAuthToken } from '../lib/authStore';
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
  PrinterIcon,
  ClipboardDocumentListIcon,
  CircleStackIcon,
  TicketIcon,
  CpuChipIcon as WorkerIcon,
  ScaleIcon,
  DocumentArrowDownIcon,
  DocumentDuplicateIcon,
  InboxIcon,
  Square3Stack3DIcon,
  SparklesIcon,
  FingerPrintIcon,
  SignalIcon,
} from "@heroicons/react/24/outline";
import { t } from '../i18n';

interface NavItemProps {
  to: string;
  icon: any;
  label: string;
  badge?: string;
}

const NavItem: React.FC<NavItemProps> = ({ to, icon: Icon, label, badge }) => (
  <NavLink
    to={to}
    className={({ isActive }) => [
      "flex items-center justify-between px-3 py-1.5 text-xs font-bold transition-all duration-100 group",
      isActive
        ? "bg-primary text-white"
        : "text-slate-500 dark:text-zinc-400 hover:text-black dark:hover:text-white hover:bg-black/5 dark:hover:bg-[#1a1a1b]/[0.05]"
    ].join(" ")}
  >
    <div className="flex items-center gap-3">
      <Icon className="w-5 h-5 flex-shrink-0" />
      <span>{label}</span>
    </div>
    {badge && (
      <span className="bg-primary text-white text-[9px] font-black px-1 py-0.5 uppercase">
        {badge}
      </span>
    )}
  </NavLink>
);

interface NavGroupProps {
  label: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

const NavGroup: React.FC<NavGroupProps> = ({ label, children, defaultOpen = true }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <div className="space-y-1">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full px-3 py-2 text-xs font-black text-slate-400 dark:text-zinc-600 uppercase tracking-widest hover:text-slate-600 dark:hover:text-zinc-400 transition-colors"
      >
        {label}
        {isOpen ? <ChevronDownIcon className="w-3 h-3" /> : <ChevronRightIcon className="w-3 h-3" />}
      </button>
      {isOpen && <div className="space-y-1">{children}</div>}
    </div>
  );
};

import { navigationConfig, Role } from '../config/controlPlaneNavigation';
import { getUserRole } from '../lib/authStore';

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

import { getModuleReadiness } from '../config/moduleReadiness';

export const Sidebar: React.FC = () => {
  const navigate = useNavigate();
  const userRole = getUserRole() as Role;

  const handleLogout = () => {
    clearAuthToken();
    navigate('/login', { replace: true });
  };

  const visibleModules = navigationConfig.filter(item => 
    item.roles.includes(userRole) || userRole === 'SUPER_ADMIN'
  );

  return (
    <aside className="w-64 bg-white dark:bg-[#0e0e0f] border-r border-slate-200 dark:border-white/10 h-screen sticky top-0 flex flex-col overflow-hidden">
      {/* Brand Header */}
      <div className="px-5 py-6 flex items-center gap-3 border-b border-slate-100 dark:border-white/5">
        <div className="w-8 h-8 bg-[#dc0000] flex items-center justify-center">
          <ShieldCheckIcon className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-sm font-black text-slate-900 dark:text-white leading-none tracking-tight">PrintPrice OS</h1>
          <p className="text-[9px] font-bold text-zinc-500 mt-1 uppercase tracking-widest">
            {userRole === 'SUPER_ADMIN' ? 'Control Plane' : 'Printhouse Hub'}
          </p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-4 py-4 space-y-4 scrollbar-hide">
        <NavGroup label="Main Menu">
          {visibleModules.map(item => {
            const readiness = getModuleReadiness(item.id);
            const badge = readiness?.status === 'ACTIVE' ? undefined : readiness?.status;
            return (
              <NavItem 
                key={item.id} 
                to={item.path} 
                icon={IconMap[item.icon] || CubeIcon} 
                label={item.label} 
                badge={badge}
              />
            );
          })}
        </NavGroup>
      </nav>

      {/* Sidebar Footer */}
      <div className="p-3 bg-slate-50 dark:bg-[#131314]/5 border-t border-slate-100 dark:border-white/10 space-y-1">
        <a 
          href="/admin/help" 
          className="flex items-center gap-3 px-3 py-2 text-primary hover:bg-primary hover:text-white transition-colors border border-primary/20 group"
        >
          <BookOpenIcon className="w-4 h-4" />
          <span className="text-[10px] font-black uppercase">OS Help Console</span>
        </a>
        
        <button 
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2 text-slate-500 dark:text-zinc-500 hover:text-black dark:hover:text-white hover:bg-slate-200 dark:hover:bg-red-600 transition-all group"
        >
          <ArrowPathIcon className="w-4 h-4" />
          <span className="text-[10px] font-black uppercase">Logout Session</span>
        </button>
      </div>
    </aside>
  );
};

// Fallback for missing icon in import
const CalculatorIcon = (props: any) => (
  <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 15.75V18m-3-1.875V18M15.75 12H18m-3 0V9.375M12 9.375V12m0 0V14.625M12 9.375h2.625M12 9.375V6.75m0 2.625h-2.625m2.625 0V12m0 0h2.625m-2.625 0v2.625m-2.625-2.625h2.625" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 15.75h.008v.008H9v-.008Zm0-3h.008v.008H9v-.008Zm0-3h.008v.008H9v-.008Zm3-3h.008v.008H12v-.008Z" />
    <rect width="18" height="18" x="3" y="3" rx="2" />
  </svg>
);
