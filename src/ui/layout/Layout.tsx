import React, { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

export const Layout: React.FC = () => {
  useEffect(() => {
    const savedTheme = localStorage.getItem('ppos-theme') || 'light';
    if (savedTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, []);

  return (
    <div className="flex min-h-screen bg-slate-50/50 dark:bg-[#0e0e0f]">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar />
        <main className="flex-1 p-8 overflow-y-auto">
          <div className="max-w-none space-y-8 animate-slide-fade">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};
