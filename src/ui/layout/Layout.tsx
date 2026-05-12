import React, { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { initTheme } from '../lib/themeStore';

export const Layout: React.FC = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  useEffect(() => {
    initTheme();
  }, []);

  return (
    <div className="flex h-screen w-full ppos-bg overflow-hidden">
      {/* Mobile Backdrop */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar - fixed on mobile, static on desktop */}
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden relative">
        <Topbar onMenuClick={() => setIsSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto tactical-grid custom-scrollbar">
          <div className="p-4 lg:p-8 max-w-none space-y-8 animate-slide-fade">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};
