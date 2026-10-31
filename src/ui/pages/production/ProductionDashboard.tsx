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
import { SharedModuleProps, HeaderActionGroup } from '../../components/common';

// Placeholder components for other tabs
const DispatchHistoryTab = () => <ProductionTimeline />;

export const ProductionDashboard: React.FC<SharedModuleProps> = ({
  mode = 'workspace'
}) => {
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
    <div className="flex flex-col h-full overflow-hidden bg-slate-50 dark:bg-[#0a0b0d]" data-testid="manufacturing-queue-workspace" data-mode={mode}>
      <div className="bg-white dark:bg-[#14161a] border-b border-slate-200 dark:border-[#1f2228] px-6 py-4 shrink-0">
        <HeaderActionGroup
          title={t('manufacturing.title') || 'Manufacturing Execution System'}
          subtitle={t('manufacturing.subtitle') || 'Industrial shopfloor routing, packages catalog, dispatch history and node settlement.'}
          mode={mode}
          tabs={tabs.map(tab => ({ id: tab.id, label: tab.name }))}
          activeTabId={activeTab}
          onTabChange={setActiveTab}
        />
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-auto bg-slate-50 dark:bg-[#0a0b0d]">
        {activeTab === 'incoming' && <IncomingJobsPage />}
        {activeTab === 'packages' && <ProductionPackagesTab />}
        {activeTab === 'history' && <DispatchHistoryTab />}
        {activeTab === 'matching' && <NodeMatchingTab />}
        {activeTab === 'billing' && <ProductionBillingPage />}
      </div>
    </div>
  );
};
