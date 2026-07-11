import React, { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

export interface WorkspaceTab {
  id: string;
  label: string;
  component: React.ComponentType<any>;
}

interface BetaWorkspaceShellProps {
  title: string;
  description: string;
  breadcrumbGroup: string;
  tabs: WorkspaceTab[];
  defaultTab?: string;
}

export const BetaWorkspaceShell: React.FC<BetaWorkspaceShellProps> = ({
  title,
  description,
  breadcrumbGroup,
  tabs,
  defaultTab
}) => {
  const [searchParams, setSearchParams] = useSearchParams();
  
  const currentTabId = searchParams.get('tab') || defaultTab || tabs[0]?.id;

  // Normalize URL if no tab parameter is present
  useEffect(() => {
    if (!searchParams.has('tab') && tabs.length > 0) {
      setSearchParams({ tab: currentTabId }, { replace: true });
    }
  }, [searchParams, setSearchParams, currentTabId, tabs]);

  const activeTab = tabs.find(t => t.id === currentTabId) || tabs[0];

  const handleTabChange = (tabId: string) => {
    setSearchParams({ tab: tabId }, { replace: false });
  };

  if (!activeTab) return null;

  const ActiveComponent = activeTab.component;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 border-slate-200 dark:bg-slate-950 dark:text-slate-100 dark:border-slate-800 p-6 transition-colors duration-200">
      {/* Header & Breadcrumbs */}
      <div className="mb-6">
        <nav className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wider">
          Limited Beta / {breadcrumbGroup} / <span className="text-slate-900 dark:text-slate-100">{activeTab.label}</span>
        </nav>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
          {title} — {activeTab.label}
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          {description}
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-slate-200 dark:border-slate-800 mb-6">
        {/* Mobile Dropdown Fallback */}
        <div className="sm:hidden mb-4">
          <label htmlFor="workspace-tabs" className="sr-only">Select a tab</label>
          <select
            id="workspace-tabs"
            value={currentTabId}
            onChange={(e) => handleTabChange(e.target.value)}
            className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
          >
            {tabs.map((tab) => (
              <option key={tab.id} value={tab.id}>
                {tab.label}
              </option>
            ))}
          </select>
        </div>

        {/* Desktop Tabs */}
        <div className="hidden sm:block overflow-x-auto scrollbar-none">
          <div className="flex gap-2 min-w-max pb-px">
            {tabs.map((tab) => {
              const isActive = tab.id === currentTabId;
              return (
                <button
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id)}
                  className={`px-4 py-2.5 text-sm font-semibold rounded-t-lg border-t border-l border-r transition-all duration-150 ${
                    isActive
                      ? 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-blue-600 dark:text-blue-400 -mb-px'
                      : 'bg-transparent border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Workspace Content */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-6 shadow-sm transition-colors duration-200">
        <ActiveComponent />
      </div>
    </div>
  );
};
