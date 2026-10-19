import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { LocaleProvider } from '../src/ui/i18n';
import { Topbar } from '../src/ui/layout/Topbar';
import * as authStore from '../src/ui/lib/authStore';

describe('Topbar Telemetry Contract & Classification Suite', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        localStorage.clear();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('1. Healthy Printhouse Telemetry: Displays healthy badge with localized printhouse tooltip', async () => {
        vi.spyOn(authStore, 'isPrinthouseUser').mockReturnValue(true);
        vi.spyOn(authStore, 'getUserRole').mockReturnValue('PRINTHOUSE_OPERATOR');

        global.fetch = vi.fn().mockImplementation((url: string) => {
            if (url === '/api/system/health') {
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    json: () => Promise.resolve({
                        ok: true,
                        status: 'HEALTHY',
                        services: { operational: true },
                        timestamp: new Date().toISOString()
                    })
                });
            }
            return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
        });

        render(
            <MemoryRouter>
                <LocaleProvider initialLocale="en">
                    <Topbar />
                </LocaleProvider>
            </MemoryRouter>
        );

        await waitFor(() => {
            expect(screen.getByText('Core Telemetry: OK')).toBeInTheDocument();
        });

        const badge = screen.getByText('Core Telemetry: OK').closest('div');
        expect(badge?.getAttribute('title')).toContain('Live services fully operational');
        // Crucial: Must NEVER mention Redis or PID to printhouse user!
        expect(badge?.getAttribute('title')).not.toContain('Redis');
        expect(badge?.getAttribute('title')).not.toContain('PID');
    });

    it('2. Healthy Admin Telemetry: Displays healthy badge with detailed infrastructure tooltip in EN', async () => {
        vi.spyOn(authStore, 'isPrinthouseUser').mockReturnValue(false);
        vi.spyOn(authStore, 'getUserRole').mockReturnValue('SUPER_ADMIN');

        global.fetch = vi.fn().mockImplementation((url: string) => {
            if (url === '/api/system/health') {
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    json: () => Promise.resolve({
                        ok: true,
                        status: 'HEALTHY',
                        pid: 4567,
                        uptime_seconds: 120,
                        dependencies: {
                            redis: { status: 'ready', latency: 'OK' }
                        }
                    })
                });
            }
            return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
        });

        render(
            <MemoryRouter>
                <LocaleProvider initialLocale="en">
                    <Topbar />
                </LocaleProvider>
            </MemoryRouter>
        );

        await waitFor(() => {
            expect(screen.getByText('Core Telemetry: OK')).toBeInTheDocument();
        });

        const badge = screen.getByText('Core Telemetry: OK').closest('div');
        expect(badge?.getAttribute('title')).toContain('PID 4567');
        expect(badge?.getAttribute('title')).toContain('120s uptime');
        expect(badge?.getAttribute('title')).toContain("Redis status 'ready' with latency 'OK'");
    });

    it('3. Real Dependency Degradation: Admin sees degraded badge with specific dependency evidence', async () => {
        vi.spyOn(authStore, 'isPrinthouseUser').mockReturnValue(false);
        vi.spyOn(authStore, 'getUserRole').mockReturnValue('SUPER_ADMIN');

        global.fetch = vi.fn().mockImplementation((url: string) => {
            if (url === '/api/system/health') {
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    json: () => Promise.resolve({
                        ok: false,
                        status: 'DEGRADED',
                        dependencies: {
                            redis: { status: 'reconnecting', latency: 'TIMEOUT' }
                        }
                    })
                });
            }
            return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
        });

        render(
            <MemoryRouter>
                <LocaleProvider initialLocale="en">
                    <Topbar />
                </LocaleProvider>
            </MemoryRouter>
        );

        await waitFor(() => {
            expect(screen.getByText('Degraded Telemetry')).toBeInTheDocument();
        });

        const badge = screen.getByText('Degraded Telemetry').closest('div');
        expect(badge?.getAttribute('title')).toContain("Redis status='reconnecting', latency='TIMEOUT'");
    });

    it('4. HTTP 404 Endpoint Not Found: Must NOT classify as "Degraded Telemetry" or fabricate Redis failure', async () => {
        vi.spyOn(authStore, 'isPrinthouseUser').mockReturnValue(false);
        vi.spyOn(authStore, 'getUserRole').mockReturnValue('SUPER_ADMIN');

        global.fetch = vi.fn().mockImplementation((url: string) => {
            if (url === '/api/system/health') {
                return Promise.resolve({
                    ok: false,
                    status: 404,
                    json: () => Promise.resolve({ error: 'Endpoint not found' })
                });
            }
            return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
        });

        render(
            <MemoryRouter>
                <LocaleProvider initialLocale="en">
                    <Topbar />
                </LocaleProvider>
            </MemoryRouter>
        );

        await waitFor(() => {
            expect(screen.getByText('No Telemetry')).toBeInTheDocument();
        });

        // Must NOT show Degraded Telemetry
        expect(screen.queryByText('Degraded Telemetry')).not.toBeInTheDocument();
        const badge = screen.getByText('No Telemetry').closest('div');
        // Must explain diagnostic unavailable HTTP 404, NOT Redis status unknown
        expect(badge?.getAttribute('title')).toContain('HTTP 404');
        expect(badge?.getAttribute('title')).not.toContain('Redis');
    });

    it('5. HTTP 401 Unauthorized: Must NOT classify as service failure or degraded Redis', async () => {
        vi.spyOn(authStore, 'isPrinthouseUser').mockReturnValue(true);

        global.fetch = vi.fn().mockImplementation((url: string) => {
            if (url === '/api/system/health') {
                return Promise.resolve({
                    ok: false,
                    status: 401,
                    json: () => Promise.resolve({ error: 'Bearer token required' })
                });
            }
            return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
        });

        render(
            <MemoryRouter>
                <LocaleProvider initialLocale="en">
                    <Topbar />
                </LocaleProvider>
            </MemoryRouter>
        );

        await waitFor(() => {
            expect(screen.getByText('Restricted Telemetry')).toBeInTheDocument();
        });

        expect(screen.queryByText('Degraded Telemetry')).not.toBeInTheDocument();
        const badge = screen.getByText('Restricted Telemetry').closest('div');
        expect(badge?.getAttribute('title')).toContain('HTTP 401');
        expect(badge?.getAttribute('title')).not.toContain('Redis');
    });

    it('6. Language switching updates telemetry text reactively (ES, EN, DE)', async () => {
        vi.spyOn(authStore, 'isPrinthouseUser').mockReturnValue(true);

        global.fetch = vi.fn().mockImplementation((url: string) => {
            if (url === '/api/system/health') {
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    json: () => Promise.resolve({
                        ok: true,
                        status: 'HEALTHY',
                        services: { operational: true }
                    })
                });
            }
            return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
        });

        // Test in German
        const { unmount } = render(
            <MemoryRouter>
                <LocaleProvider initialLocale="de">
                    <Topbar />
                </LocaleProvider>
            </MemoryRouter>
        );

        await waitFor(() => {
            expect(screen.getByText('Kern-Telemetrie: OK')).toBeInTheDocument();
        });

        const deBadge = screen.getByText('Kern-Telemetrie: OK').closest('div');
        expect(deBadge?.getAttribute('title')).toContain('Druckerei-Umgebung produktionsbereit');

        unmount();

        // Test in Spanish
        render(
            <MemoryRouter>
                <LocaleProvider initialLocale="es">
                    <Topbar />
                </LocaleProvider>
            </MemoryRouter>
        );

        await waitFor(() => {
            expect(screen.getByText('Telemetría Núcleo: OK')).toBeInTheDocument();
        });

        const esBadge = screen.getByText('Telemetría Núcleo: OK').closest('div');
        expect(esBadge?.getAttribute('title')).toContain('Entorno de imprenta listo para producción');
    });
});
