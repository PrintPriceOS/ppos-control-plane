import React from 'react';
import { createRoot } from 'react-dom/client';
import { LocaleProvider } from './i18n';
import { AdminDashboard } from './pages/AdminDashboard';
import './index.css';

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <LocaleProvider>
        <AdminDashboard />
      </LocaleProvider>
    </React.StrictMode>
  );
}
