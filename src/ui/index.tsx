import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { LocaleProvider } from './i18n';
import { App } from './App';
import { sessionManager } from './lib/sessionManager';
import './index.css';

// Initialize session lifetime and multi-tab inactivity coordination
sessionManager.startSessionMonitoring();
if (typeof window !== 'undefined') {
  (window as any).__sessionManager = sessionManager;
}

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <LocaleProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </LocaleProvider>
    </React.StrictMode>
  );
}
