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
      "flex items-center justify-between px-3 py-2 text-sm font-medium rounded-lg transition-all duration-200 group",
      isActive
        ? "bg-primary/10 text-primary border border-primary/20"
        : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.06]"
    ].join(" ")}
  >
    <div className="flex items-center gap-3">
      <Icon className="w-5 h-5 flex-shrink-0" />
      <span>{label}</span>
    </div>
    {badge && (
      <span className="bg-primary/10 text-primary text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase">
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
    <aside className="w-72 bg-white/50 dark:bg-[#1C1C1E] border-r border-slate-200/60 dark:border-white/[0.08] h-screen sticky top-0 flex flex-col overflow-hidden">
      {/* Brand Header */}
      <div className="px-6 py-7 flex items-center gap-3.5">
        <div className="w-10 h-10 bg-[#dc0000] rounded-xl flex items-center justify-center shadow-lg shadow-red-500/20 ring-1 ring-transparent">
          <ShieldCheckIcon className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-black text-slate-900 dark:text-[#ECECF1] leading-none tracking-tight">PrintPrice OS</h1>
          <p className="text-[10px] font-bold text-slate-400 dark:text-zinc-400 mt-1 uppercase tracking-widest">
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
      <div className="p-4 bg-slate-50/50 dark:bg-black/20 border-t border-slate-200/60 dark:border-white/[0.08] space-y-2">
        <a 
          href="/admin/help" 
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-primary/5 text-primary hover:bg-primary/10 transition-colors border border-primary/10 group"
        >
          <BookOpenIcon className="w-5 h-5 transition-transform group-hover:scale-110" />
          <span className="text-sm font-bold">OS Help Console</span>
        </a>
        
        <button 
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 transition-all border border-transparent hover:border-red-100 dark:hover:border-red-900/20 group"
        >
          <ArrowPathIcon className="w-5 h-5 transition-transform group-hover:rotate-180" />
          <span className="text-sm font-bold">Logout Session</span>
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
