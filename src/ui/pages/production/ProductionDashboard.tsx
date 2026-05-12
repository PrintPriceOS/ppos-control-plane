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
// Placeholder components for other tabs
const ProductionPackagesTab = () => (
    <div className="p-10 text-center text-slate-400 font-bold uppercase tracking-[0.2em] border-2 border-dashed border-slate-200 rounded-none m-6">
        Manufacturing Packages Catalog — Phase 11
    </div>
);
const DispatchHistoryTab = () => <ProductionTimeline />;
const NodeMatchingTab = () => (
    <div className="p-10 text-center text-slate-400 font-bold uppercase tracking-[0.2em] border-2 border-dashed border-slate-200 rounded-none m-6">
        Node Matching Intelligence — Phase 11
    </div>
);

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
    <div className="flex flex-col h-full overflow-hidden">
      {/* Tab Navigation */}
      <div className="bg-white border-b border-slate-200 px-6 pt-4 flex gap-8">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`
              flex items-center gap-2 pb-4 text-sm font-black uppercase tracking-widest transition-all border-b-2
              ${activeTab === tab.id ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600'}
            `}
          >
            <tab.icon className="h-5 w-5" />
            {tab.name}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-auto">
        {activeTab === 'incoming' && <IncomingJobsPage />}
        {activeTab === 'packages' && <ProductionPackagesTab />}
        {activeTab === 'history' && <DispatchHistoryTab />}
        {activeTab === 'matching' && <NodeMatchingTab />}
        {activeTab === 'billing' && <ProductionBillingPage />}
      </div>
    </div>
  );
};
