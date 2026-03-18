import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
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
  ChevronRightIcon
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
        : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
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
        className="flex items-center justify-between w-full px-3 py-2 text-xs font-black text-slate-400 uppercase tracking-widest hover:text-slate-600 transition-colors"
      >
        {label}
        {isOpen ? <ChevronDownIcon className="w-3 h-3" /> : <ChevronRightIcon className="w-3 h-3" />}
      </button>
      {isOpen && <div className="space-y-1">{children}</div>}
    </div>
  );
};

export const Sidebar: React.FC = () => {
  return (
    <aside className="w-72 bg-white/50 backdrop-blur-xl border-r border-slate-200/60 h-screen sticky top-0 flex flex-col overflow-hidden">
      {/* Brand Header */}
      <div className="px-6 py-8 flex items-center gap-3">
        <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center shadow-lg shadow-slate-900/20">
          <ShieldCheckIcon className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-black text-slate-900 leading-none tracking-tight">PrintPrice OS</h1>
          <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-widest">Control Plane v2.1</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-4 py-4 space-y-8 scrollbar-hide">
        {/* PLATFORM GOVERNANCE */}
        <NavGroup label="Platform Governance">
          <NavItem to="/dashboard" icon={ChartBarIcon} label="Dashboard" />
          <NavItem to="/governance" icon={ShieldCheckIcon} label="Governance" badge="BETA" />
          <NavItem to="/deployments" icon={ArrowsRightLeftIcon} label="Deployments" />
          <NavItem to="/audit" icon={DocumentCheckIcon} label="Audit Explorer" />
          <NavItem to="/usage" icon={CalculatorIcon || ClockIcon} label="Usage & Quotas" />
        </NavGroup>

        {/* INFRASTRUCTURE & RUNTIME */}
        <NavGroup label="Infrastructure & Runtime">
          <NavItem to="/health" icon={HeartIcon} label="System Health" />
          <NavItem to="/runtime" icon={CommandLineIcon || CpuChipIcon} label="Runtime Context" />
          <NavItem to="/jobs" icon={QueueListIcon} label="Jobs" />
          <NavItem to="/queues-workers" icon={WrenchScrewdriverIcon} label="Queues & Workers" />
          <NavItem to="/tenants" icon={UsersIcon} label="Tenants" />
        </NavGroup>

        {/* EXTENDED OPERATIONS */}
        <NavGroup label="Extended Operations" defaultOpen={false}>
          <NavItem to="/ops/marketplace" icon={BuildingStorefrontIcon} label="Marketplace" />
          <NavItem to="/ops/pricing" icon={CurrencyEuroIcon} label="Pricing Intelligence" />
          <NavItem to="/ops/financials" icon={BanknotesIcon} label="Financials" />
          <NavItem to="/ops/success" icon={HeartIcon} label="Customer Operations" />
          <NavItem to="/ops/intelligence" icon={BoltIcon} label="Intelligence" />
        </NavGroup>
      </nav>

      {/* Sidebar Footer */}
      <div className="p-4 bg-slate-50/50 border-t border-slate-200/60">
        <a 
          href="/admin/help" 
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-primary/5 text-primary hover:bg-primary/10 transition-colors border border-primary/10 group"
        >
          <BookOpenIcon className="w-5 h-5 transition-transform group-hover:scale-110" />
          <span className="text-sm font-bold">OS Help Console</span>
        </a>
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
