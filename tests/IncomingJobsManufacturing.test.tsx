import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { LocaleProvider } from '../src/ui/i18n';
import { IncomingJobsPage } from '../src/ui/pages/production/IncomingJobsPage';
import * as adminApi from '../src/ui/lib/adminApi';

const renderWithLocale = (ui: React.ReactElement, locale = 'en') => {
  return render(
    <MemoryRouter initialEntries={['/ops/jobs']}>
      <LocaleProvider initialLocale={locale as any}>
        {ui}
      </LocaleProvider>
    </MemoryRouter>
  );
};

describe('IncomingJobsPage - Manufacturing Dispatch Component Verification', () => {
  let adminFetchSpy: any;

  beforeEach(() => {
    vi.restoreAllMocks();
    adminFetchSpy = vi.spyOn(adminApi, 'adminFetch');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('1. Scenario: Valid array with jobs data renders dispatch rows correctly', async () => {
    adminFetchSpy.mockImplementation((url: string) => {
      if (url.includes('/api/admin/manufacturing/dispatches')) {
        return Promise.resolve({
          ok: true,
          dispatches: [
            {
              id: 'disp-test-001',
              production_package_id: 'pkg-101',
              print_node_id: 'node-alpha',
              sender_tenant_id: 'tenant-client-a',
              receiver_tenant_id: 'tenant-printer-b',
              status: 'SENT',
              message: 'Urgent print run',
              created_at: new Date().toISOString()
            }
          ]
        });
      }
      if (url.includes('/api/admin/manufacturing/packages/pkg-101')) {
        return Promise.resolve({
          ok: true,
          package: {
            id: 'pkg-101',
            tenant_id: 'tenant-client-a',
            source: 'STOREFRONT',
            status: 'PENDING',
            book_spec_json: {
              binding: 'PERFECT_BOUND',
              color: 'CMYK',
              trim: { widthMm: 210, heightMm: 297 },
              paperGsm: 150,
              policy: 'STANDARD'
            },
            created_at: new Date().toISOString()
          }
        });
      }
      return Promise.resolve({ ok: true });
    });

    renderWithLocale(<IncomingJobsPage />);

    expect(screen.getByText(/Syncing manufacturing pipeline/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('#disp-tes')).toBeInTheDocument();
      expect(screen.getByText('tenant-client-a')).toBeInTheDocument();
      expect(screen.getByText('PERFECT_BOUND')).toBeInTheDocument();
      expect(screen.getByText('Accept')).toBeInTheDocument();
      expect(screen.getByText('Reject')).toBeInTheDocument();
    });

    // Should NOT show error banner or empty title
    expect(screen.queryByText(/Pipeline Error/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/No Incoming Jobs Found/i)).not.toBeInTheDocument();
  });

  it('2. Scenario: Valid empty array renders "No Incoming Jobs Found" without error banner', async () => {
    adminFetchSpy.mockImplementation((url: string) => {
      if (url.includes('/api/admin/manufacturing/dispatches')) {
        return Promise.resolve({
          ok: true,
          dispatches: []
        });
      }
      return Promise.resolve({ ok: true });
    });

    renderWithLocale(<IncomingJobsPage />);

    await waitFor(() => {
      expect(screen.getByText('No Incoming Jobs Found')).toBeInTheDocument();
    });

    // Must NOT present an error
    expect(screen.queryByText(/Pipeline Error/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId('manufacturing-retry-btn')).not.toBeInTheDocument();
  });

  it('3. Scenario: Invalid payload (non-array dispatches) displays localized error banner and retry, NOT empty state', async () => {
    adminFetchSpy.mockImplementation((url: string) => {
      if (url.includes('/api/admin/manufacturing/dispatches')) {
        return Promise.resolve({
          ok: true,
          dispatches: "corrupt_data_string_instead_of_array"
        });
      }
      return Promise.resolve({ ok: true });
    });

    // Test in German locale to verify localization of error and retry
    renderWithLocale(<IncomingJobsPage />, 'de');

    await waitFor(() => {
      expect(screen.getByText('Pipeline-Fehler')).toBeInTheDocument();
      expect(screen.getByText('Ungültige Fertigungsdaten vom Server empfangen')).toBeInTheDocument();
      expect(screen.getByTestId('manufacturing-retry-btn')).toBeInTheDocument();
      expect(screen.getByText('Erneut versuchen')).toBeInTheDocument();
    });

    // Crucial requirement: Must NOT be treated as empty jobs
    expect(screen.queryByText('Keine eingehenden Aufträge gefunden')).not.toBeInTheDocument();
  });

  it('4. Scenario: HTTP error / server failure displays localized error banner and retry', async () => {
    adminFetchSpy.mockImplementation((url: string) => {
      if (url.includes('/api/admin/manufacturing/dispatches')) {
        return Promise.reject(new Error('Network connection refused (HTTP 500)'));
      }
      return Promise.resolve({ ok: true });
    });

    renderWithLocale(<IncomingJobsPage />, 'es');

    await waitFor(() => {
      expect(screen.getByText('Error de Canalización')).toBeInTheDocument();
      expect(screen.getByText('Network connection refused (HTTP 500)')).toBeInTheDocument();
      expect(screen.getByTestId('manufacturing-retry-btn')).toBeInTheDocument();
      expect(screen.getByText('Reintentar')).toBeInTheDocument();
    });

    // Crucial requirement: Must NOT be treated as empty jobs
    expect(screen.queryByText('No se encontraron trabajos entrantes')).not.toBeInTheDocument();
  });

  it('5. Scenario: Recovery after retry - Clicking retry fetches anew and renders jobs once backend recovers', async () => {
    let callCount = 0;
    adminFetchSpy.mockImplementation((url: string) => {
      if (url.includes('/api/admin/manufacturing/dispatches')) {
        callCount++;
        if (callCount === 1) {
          // First attempt fails with invalid payload
          return Promise.resolve({
            ok: false,
            error: { code: 'DISPATCH_LIST_FAILED', message: 'Database query timeout' }
          });
        }
        // Second attempt (after retry) succeeds
        return Promise.resolve({
          ok: true,
          dispatches: [
            {
              id: 'disp-recovered-99',
              production_package_id: 'pkg-recovered-99',
              print_node_id: 'node-rec',
              sender_tenant_id: 'tenant-rec-1',
              receiver_tenant_id: 'tenant-printer-1',
              status: 'SENT',
              message: 'Recovered dispatch',
              created_at: new Date().toISOString()
            }
          ]
        });
      }
      return Promise.resolve({ ok: true });
    });

    renderWithLocale(<IncomingJobsPage />);

    // First attempt shows error banner
    await waitFor(() => {
      expect(screen.getByText('Database query timeout')).toBeInTheDocument();
    });

    const retryBtn = screen.getByTestId('manufacturing-retry-btn');
    expect(retryBtn).toBeInTheDocument();

    // Click retry
    fireEvent.click(retryBtn);

    // Should sync and then show recovered job row
    await waitFor(() => {
      expect(screen.getByText('#disp-rec')).toBeInTheDocument();
      expect(screen.getByText('tenant-rec-1')).toBeInTheDocument();
    });

    // Error banner should now be completely removed
    expect(screen.queryByText(/Database query timeout/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId('manufacturing-retry-btn')).not.toBeInTheDocument();
  });
});
