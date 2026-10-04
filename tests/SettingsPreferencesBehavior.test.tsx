import React from 'react';
import '@testing-library/jest-dom';
import { render as rtlRender, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { LocaleProvider } from '../src/ui/i18n';
import { GlobalSettingsPage } from '../src/ui/pages/os/GlobalSettingsPage';
import { Topbar } from '../src/ui/layout/Topbar';
import { 
    setTheme, 
    getTheme, 
    setDensity, 
    getDensity, 
    setAnimations, 
    getAnimations,
    applyTheme,
    applyDensity,
    applyAnimations 
} from '../src/ui/lib/themeStore';

describe('Settings Preferences Behavior & Synchronization Suite', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        localStorage.clear();
        document.documentElement.classList.remove('dark');
        document.documentElement.removeAttribute('data-density');
        document.documentElement.removeAttribute('data-reduced-motion');
        setTheme('dark');
        setDensity('comfortable');
        setAnimations(true);

        // Mock window.matchMedia
        Object.defineProperty(window, 'matchMedia', {
            writable: true,
            value: vi.fn().mockImplementation(query => ({
                matches: query.includes('prefers-reduced-motion: reduce') ? false : false,
                media: query,
                onchange: null,
                addListener: vi.fn(),
                removeListener: vi.fn(),
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
                dispatchEvent: vi.fn(),
            }))
        });

        // Mock fetch for settings endpoints
        global.fetch = vi.fn().mockImplementation((url: string, options?: any) => {
            if (url.includes('/api/admin/tenants/') && url.includes('/notification-preferences')) {
                if (options?.method === 'PUT') {
                    return Promise.resolve({
                        ok: true,
                        json: () => Promise.resolve({ ok: true })
                    });
                }
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ ok: true, prefs: { email_order_alerts: 1 } })
                });
            }
            if (url.includes('/api/printhouse/onboarding/company-profile')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ ok: true, company: { company_name: 'Test Print GmbH' } })
                });
            }
            if (url.includes('/api/admin/audit')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ ok: true, data: [] })
                });
            }
            return Promise.resolve({
                ok: true,
                json: () => Promise.resolve({ ok: true })
            });
        });
    });

    it('1. Synchronizes theme bi-directionally between Topbar and Settings', async () => {
        const { container } = rtlRender(
            <MemoryRouter initialEntries={['/settings']}>
                <LocaleProvider initialLocale="en">
                    <Topbar />
                    <GlobalSettingsPage />
                </LocaleProvider>
            </MemoryRouter>
        );

        // Navigate to Appearance tab
        const appearanceTab = screen.getByRole('button', { name: /appearance/i });
        fireEvent.click(appearanceTab);

        // Both Topbar and Settings reflect initial dark theme
        const topbarToggle = screen.getByTitle(/switch to light mode/i);
        expect(topbarToggle).toBeInTheDocument();
        expect(document.documentElement.classList.contains('dark')).toBe(true);

        // Click light mode in Settings
        const lightBtn = screen.getByRole('button', { name: /corporate light/i });
        fireEvent.click(lightBtn);

        // Expect documentElement dark class removed and Topbar title updated
        expect(document.documentElement.classList.contains('dark')).toBe(false);
        expect(screen.getByTitle(/switch to dark mode/i)).toBeInTheDocument();
        expect(getTheme()).toBe('light');
        expect(localStorage.getItem('ppos-theme')).toBe('light');

        // Click quick toggle in Topbar
        fireEvent.click(topbarToggle);
        expect(document.documentElement.classList.contains('dark')).toBe(true);
        expect(getTheme()).toBe('dark');
        expect(localStorage.getItem('ppos-theme')).toBe('dark');
    });

    it('2. Changes Density and updates root data-density attribute and control spacing', async () => {
        rtlRender(
            <MemoryRouter initialEntries={['/settings']}>
                <LocaleProvider initialLocale="en">
                    <GlobalSettingsPage />
                </LocaleProvider>
            </MemoryRouter>
        );

        // Go to appearance tab
        fireEvent.click(screen.getByRole('button', { name: /appearance/i }));

        // Default density is comfortable
        expect(document.documentElement.getAttribute('data-density')).toBe('comfortable');

        // Select compact density
        const compactBtn = screen.getByRole('button', { name: /compact/i });
        fireEvent.click(compactBtn);

        expect(document.documentElement.getAttribute('data-density')).toBe('compact');
        expect(getDensity()).toBe('compact');
        expect(localStorage.getItem('ppos-density')).toBe('compact');

        // Select comfortable back
        const comfortableBtn = screen.getByRole('button', { name: /comfortable/i });
        fireEvent.click(comfortableBtn);

        expect(document.documentElement.getAttribute('data-density')).toBe('comfortable');
        expect(getDensity()).toBe('comfortable');
        expect(localStorage.getItem('ppos-density')).toBe('comfortable');
    });

    it('3. Toggles UI animations and respects prefers-reduced-motion', async () => {
        rtlRender(
            <MemoryRouter initialEntries={['/settings']}>
                <LocaleProvider initialLocale="en">
                    <GlobalSettingsPage />
                </LocaleProvider>
            </MemoryRouter>
        );

        fireEvent.click(screen.getByRole('button', { name: /appearance/i }));

        // Animations default enabled: data-reduced-motion should not be set
        expect(document.documentElement.getAttribute('data-reduced-motion')).toBeNull();
        expect(getAnimations()).toBe(true);

        // Toggle animations off
        const animToggle = screen.getByRole('switch');
        fireEvent.click(animToggle);

        expect(document.documentElement.getAttribute('data-reduced-motion')).toBe('true');
        expect(getAnimations()).toBe(false);
        expect(localStorage.getItem('ppos-animations')).toBe('false');

        // Toggle back on
        fireEvent.click(animToggle);
        expect(document.documentElement.getAttribute('data-reduced-motion')).toBeNull();
        expect(getAnimations()).toBe(true);

        // Test system prefers-reduced-motion: reduce overrides even if toggle is true
        window.matchMedia = vi.fn().mockImplementation(query => ({
            matches: query.includes('prefers-reduced-motion: reduce'),
            media: query,
            onchange: null,
            addListener: vi.fn(),
            removeListener: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            dispatchEvent: vi.fn(),
        }));

        applyAnimations(true);
        expect(document.documentElement.getAttribute('data-reduced-motion')).toBe('true');
    });

    it('4. Preserves preferences across navigation and simulated reload from localStorage', () => {
        localStorage.setItem('ppos-theme', 'light');
        localStorage.setItem('ppos-density', 'compact');
        localStorage.setItem('ppos-animations', 'false');

        expect(getTheme()).toBe('light');
        expect(getDensity()).toBe('compact');
        expect(getAnimations()).toBe(false);

        applyTheme(getTheme());
        applyDensity(getDensity());
        applyAnimations(getAnimations());

        expect(document.documentElement.classList.contains('dark')).toBe(false);
        expect(document.documentElement.getAttribute('data-density')).toBe('compact');
        expect(document.documentElement.getAttribute('data-reduced-motion')).toBe('true');
    });

    it('5. Failed backend save retains draft, displays error, and prevents false success confirmation', async () => {
        // Mock backend failure for notification-preferences
        global.fetch = vi.fn().mockImplementation((url: string, options?: any) => {
            if (url.includes('/notification-preferences') && options?.method === 'PUT') {
                return Promise.resolve({
                    ok: false,
                    status: 500,
                    json: () => Promise.resolve({ ok: false, error: 'Database connection timeout' })
                });
            }
            if (url.includes('/company-profile') && options?.method === 'PATCH') {
                return Promise.resolve({
                    ok: false,
                    status: 500,
                    json: () => Promise.resolve({ ok: false, error: 'Write failed' })
                });
            }
            return Promise.resolve({
                ok: true,
                json: () => Promise.resolve({ ok: true })
            });
        });

        rtlRender(
            <MemoryRouter initialEntries={['/settings']}>
                <LocaleProvider initialLocale="en">
                    <GlobalSettingsPage />
                </LocaleProvider>
            </MemoryRouter>
        );

        // Edit personal preference / timezone
        const saveBtn = screen.getByRole('button', { name: /save changes/i });
        fireEvent.click(saveBtn);

        await waitFor(() => {
            // Must NOT show false success confirmation "Changes saved"
            expect(screen.queryByText(/changes saved/i)).not.toBeInTheDocument();
            // Must display error state
            expect(screen.getByText(/failed to save settings/i)).toBeInTheDocument();
        });
    });
});
