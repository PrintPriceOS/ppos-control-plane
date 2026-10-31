import React, { useState } from 'react';
import { 
  InboxIcon, 
  Square3Stack3DIcon, 
  ArrowsRightLeftIcon, 
  SparklesIcon,
  BanknotesIcon 
} from '@heroicons/react/24/outline';
import { IncomingJobsPage } from './IncomingJobsPage';
import { ProductionTimeline } from './ProductionTimeline';
import { ProductionBillingPage } from './ProductionBillingPage';
import { ProductionPackagesTab } from './ProductionPackagesTab';
import { NodeMatchingTab } from './NodeMatchingTab';
import { useLocale } from '../../i18n';

// Placeholder components for other tabs
const DispatchHistoryTab = () => <ProductionTimeline />;

export const ProductionDashboard: React.FC = () => {
  const { t } = useLocale();
  const [activeTab, setActiveTab] = useState('incoming');

  const tabs = [
    { id: 'incoming', name: t('manufacturing.tabIncoming') || 'Incoming Jobs', icon: InboxIcon },
    { id: 'packages', name: t('manufacturing.tabPackages') || 'Manufacturing Packages', icon: Square3Stack3DIcon },
    { id: 'history', name: t('manufacturing.tabHistory') || 'Dispatch History', icon: ArrowsRightLeftIcon },
    { id: 'matching', name: t('manufacturing.tabMatching') || 'Node Matching', icon: SparklesIcon },
    { id: 'billing', name: t('manufacturing.tabBilling') || 'Financial Settlement', icon: BanknotesIcon }
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden bg-slate-50 dark:bg-zinc-950">
      {/* Canonical Level 1 Header */}
      <div className="bg-white dark:bg-zinc-900 border-b border-slate-200 dark:border-zinc-800 px-6 py-4 flex justify-between items-center shrink-0">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-zinc-100 tracking-tight flex items-center gap-3">
            {t('manufacturing.title') || 'Manufacturing Execution System'}
          </h1>
          <p className="text-sm font-medium text-slate-500 dark:text-zinc-400 mt-1">
            {t('manufacturing.subtitle') || 'Industrial shopfloor routing, packages catalog, dispatch history and node settlement.'}
          </p>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="bg-white dark:bg-zinc-950 border-b border-slate-200 dark:border-zinc-800 px-6 pt-4 flex gap-8 shrink-0">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`
              flex items-center gap-2 pb-4 text-xs font-black uppercase tracking-wider transition-all border-b-2 cursor-pointer
              ${activeTab === tab.id 
                ? 'border-red-600 dark:border-red-500 text-red-600 dark:text-red-500' 
                : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'}
            `}
          >
            <tab.icon className="h-4 w-4" />
            {tab.name}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-auto bg-slate-50 dark:bg-zinc-950">
        {activeTab === 'incoming' && <IncomingJobsPage />}
        {activeTab === 'packages' && <ProductionPackagesTab />}
        {activeTab === 'history' && <DispatchHistoryTab />}
        {activeTab === 'matching' && <NodeMatchingTab />}
        {activeTab === 'billing' && <ProductionBillingPage />}
      </div>
    </div>
  );
};
