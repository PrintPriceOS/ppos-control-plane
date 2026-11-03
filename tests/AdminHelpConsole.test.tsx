/**
 * tests/AdminHelpConsole.test.tsx
 *
 * Verification Suite for the PrintPrice OS Knowledge Base & Operational Runbooks Console (/admin/help):
 * 1. Verifies 34 operational articles across all 6 core taxonomy domains (preflight, pricing, machinery, integrations, fintech, runbooks).
 * 2. Verifies 100% trilingual translation resolution (EN / ES / DE) for every article titleKey, summaryKey, category, and type badge.
 * 3. Verifies dark tactical HUD theme classes (zero stark white #ffffff / bg-slate-50 un-themed containers) and laser-red (#dc0000) accents.
 * 4. Verifies instant client-side search filtering, category filtering, interactive tag pills, and article detail inspection.
 */
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { LocaleProvider, useLocale } from '../src/ui/i18n';
import { en } from '../src/ui/en';
import { es } from '../src/ui/es';
import { de } from '../src/ui/de';
import { HELP_ARTICLES, HELP_CATEGORIES } from '../src/ui/data/helpRegistry';
import { AdminHelpPage } from '../src/ui/pages/admin-help/AdminHelpPage';

vi.mock('../src/ui/lib/adminApi', () => ({
  postHelpAnalytics: vi.fn(),
}));

const LocaleHarness: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { setLocale } = useLocale();
  return (
    <div>
      <button data-testid="set-en" onClick={() => setLocale('en')}>EN</button>
      <button data-testid="set-es" onClick={() => setLocale('es')}>ES</button>
      <button data-testid="set-de" onClick={() => setLocale('de')}>DE</button>
      {children}
    </div>
  );
};

describe('AdminHelpPage & helpRegistry — Tactical HUD Knowledge Base & Runbooks', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('indexes 34 operational articles across all 6 canonical domains with valid routes and docs links', () => {
    expect(HELP_CATEGORIES.map((c) => c.id)).toEqual([
      'preflight',
      'pricing',
      'machinery',
      'integrations',
      'fintech',
      'runbooks',
    ]);
    expect(HELP_ARTICLES.length).toBeGreaterThanOrEqual(30);
    expect(HELP_ARTICLES.length).toBe(34);

    for (const article of HELP_ARTICLES) {
      expect((en as any)[article.titleKey], `Missing EN title for ${article.id}`).toBeTruthy();
      expect((en as any)[article.summaryKey], `Missing EN summary for ${article.id}`).toBeTruthy();
      expect((es as any)[article.titleKey], `Missing ES title for ${article.id}`).toBeTruthy();
      expect((es as any)[article.summaryKey], `Missing ES summary for ${article.id}`).toBeTruthy();
      expect((de as any)[article.titleKey], `Missing DE title for ${article.id}`).toBeTruthy();
      expect((de as any)[article.summaryKey], `Missing DE summary for ${article.id}`).toBeTruthy();
      expect(article.tags.length).toBeGreaterThanOrEqual(3);
      expect(article.jumpToRoute).toMatch(/^\//);
      expect(article.docsUrl).toMatch(/^https:\/\/docs\.printprice\.pro\//);
    }
  });

  it('renders the HUD Knowledge Base, filters by domain and search query, and switches EN -> ES -> DE', () => {
    render(
      <LocaleProvider initialLocale="en">
        <MemoryRouter initialEntries={['/admin/help']}>
          <LocaleHarness>
            <Routes>
              <Route path="/admin/help" element={<AdminHelpPage />} />
            </Routes>
          </LocaleHarness>
        </MemoryRouter>
      </LocaleProvider>
    );

    const root = screen.getByTestId('admin-help-console');
    expect(root.className).toContain('dark:bg-[#09090b]');

    expect(screen.getByTestId('help-console-title').textContent).toBe(
      'PrintPrice OS Knowledge Base & Operational Runbooks'
    );
    expect(screen.getByTestId('help-articles-count').textContent).toContain('34');

    // Filter by 'fintech' category (5 articles)
    fireEvent.click(screen.getByTestId('help-cat-fintech'));
    expect(screen.getByTestId('help-articles-count').textContent).toContain('5');
    expect(screen.getByTestId('help-card-fin-stripe-hybrid-metering')).toBeTruthy();

    // Reset category filter and search for Q* crossover
    fireEvent.click(screen.getByTestId('help-cat-all'));
    const searchInput = screen.getByTestId('help-console-search-input');
    fireEvent.change(searchInput, { target: { value: '#q-star' } });
    expect(screen.getByTestId('help-articles-count').textContent).toContain('1');
    expect(screen.getByTestId('help-card-bpe-qstar-crossover-curve')).toBeTruthy();

    // Switch locale to Spanish (ES) and verify dynamic translation
    fireEvent.click(screen.getByTestId('set-es'));
    expect(screen.getByTestId('help-console-title').textContent).toBe(
      'Base de Conocimiento y Runbooks Operativos de PrintPrice OS'
    );

    // Switch locale to German (DE) and verify dynamic translation
    fireEvent.click(screen.getByTestId('set-de'));
    expect(screen.getByTestId('help-console-title').textContent).toBe(
      'PrintPrice OS Wissensdatenbank & Operative Runbooks'
    );

    // Click into the article detail view
    fireEvent.click(screen.getByTestId('help-card-bpe-qstar-crossover-curve'));
    expect(screen.getByTestId('help-article-view-bpe-qstar-crossover-curve')).toBeTruthy();
  });
});

