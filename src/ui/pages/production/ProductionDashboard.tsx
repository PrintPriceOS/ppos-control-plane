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

// Placeholder components for other tabs
const DispatchHistoryTab = () => <ProductionTimeline />;

export const ProductionDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState('incoming');

  const tabs = [
    { id: 'incoming', name: 'Incoming Jobs', icon: InboxIcon },
    { id: 'packages', name: 'Manufacturing Packages', icon: Square3Stack3DIcon },
    { id: 'history', name: 'Dispatch History', icon: ArrowsRightLeftIcon },
    { id: 'matching', name: 'Node Matching', icon: SparklesIcon },
    { id: 'billing', name: 'Financial Settlement', icon: BanknotesIcon }
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden bg-slate-50 dark:bg-zinc-950">
      {/* Tab Navigation */}
      <div className="bg-white dark:bg-zinc-950 border-b border-slate-200 dark:border-zinc-800 px-6 pt-4 flex gap-8">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`
              flex items-center gap-2 pb-4 text-sm font-black uppercase tracking-widest transition-all border-b-2
              ${activeTab === tab.id 
                ? 'border-red-600 dark:border-red-500 text-red-600 dark:text-red-500' 
                : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'}
            `}
          >
            <tab.icon className="h-5 w-5" />
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
