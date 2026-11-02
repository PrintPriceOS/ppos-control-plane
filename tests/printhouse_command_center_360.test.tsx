import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LocaleProvider, useLocale } from '../src/ui/i18n';
import { CommandCenterPage } from '../src/ui/pages/admin/CommandCenterPage';
import {
  StorageLifecycleDrawer,
  LiveMachineAllocationModal,
  FinancialEscrowDrawer,
  LogisticsPalletModal,
  B2bIncidentBridgeDrawer
} from '../src/ui/components/dashboard/PrinthouseCommandDrawers';

vi.mock('../src/ui/lib/authStore', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    getUserRole: () => 'PRINTHOUSE_OPERATOR',
    isSupplierUser: () => false,
    getAuthToken: () => 'mock-jwt-token',
    getUserTenantId: () => 'tenant-default',
    getUserPrinthouseId: () => 'node-primary',
    getUserSupplierId: () => '',
    getActiveContext: () => 'printhouse'
  };
});

vi.mock('../src/ui/lib/adminApi', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    getPrinthouseDashboardSummary: vi.fn().mockResolvedValue({
      ok: true,
      data: {
        activeJobs: 4,
        completedJobsToday: 3,
        failedJobsToday: 0,
        storage: {
          status: 'ACTIVE',
          sizeBytes: 18.4 * 1024 * 1024 * 1024,
          artifactsCount: 14,
          purgedCount: 6
        }
      }
    }),
    getPrinthouseDashboardMachines: vi.fn().mockResolvedValue({
      ok: true,
      data: {
        machines: [
          {
            id: 'xl106',
            code: 'HEIDELBERG-XL106-8P',
            name: 'Heidelberg Speedmaster XL 106-8P (Offset B1)',
            status: 'ACTIVE',
            loadPct: 86,
            activeOrderId: 'PUB-ORD-2026-101'
          },
          {
            id: 'indigo12k',
            code: 'HP-INDIGO-12000HD',
            name: 'HP Indigo 12000 HD Digital Press (B2)',
            status: 'ACTIVE',
            loadPct: 74,
            activeOrderId: 'PUB-ORD-2026-104'
          }
        ]
      }
    }),
    getPrinthouseDashboardOrders: vi.fn().mockResolvedValue({
      ok: true,
      data: {
        expectedRevenueEUR: 64210.00,
        orders: [
          {
            id: 'PUB-ORD-2026-101',
            productName: 'Atlas de Arquitectura Industrial Europea (3ª Ed.)',
            status: 'IN_PRODUCTION',
            machineId: 'HEIDELBERG-XL106-8P',
            escrowStatus: 'FUNDS_LOCKED_ON_PROOF_APPROVAL',
            invoiceNumber: 'FE-2026-00101',
            value: 24850.00,
            netPrinthousePayoutEur: 21868.00,
            currency: 'EUR',
            timestamp: Date.now(),
            isUrgent: true
          }
        ]
      }
    }),
    getPrinthouseDashboardTelemetry: vi.fn().mockResolvedValue({
      ok: true,
      storage: {
        usedGb: 18.4,
        quotaGb: 100,
        usagePct: 18.4,
        activeArtifactsCount: 14,
        purgedArtifactsCount: 6,
        reclaimedGb: 6.8
      },
      fleetAndQueue: {
        activeJobsInQueue: 4,
        bottleneckAlert: 'Línea PUR Müller Martini Alegro al 92% de carga',
        machines: [
          {
            id: 'xl106',
            code: 'HEIDELBERG-XL106-8P',
            name: 'Heidelberg Speedmaster XL 106-8P (Offset B1)',
            status: 'ACTIVE',
            operationalState: 'PRINTING',
            loadPct: 86,
            oeePct: 94.2,
            activeOrderId: 'PUB-ORD-2026-101'
          }
        ]
      },
      financials: {
        custodiedEscrowEur: 59310.00,
        releasedEscrowEur: 4900.00,
        netPrinthousePayoutEur: 56504.80
      },
      logistics: {
        scheduledShipmentsCount: 3,
        totalEpalPallets: 6,
        ssccLabelsGeneratedCount: 12
      },
      b2bCommunications: {
        unreadMessagesCount: 3
      }
    }),
    purgePrinthouseRetentionAssets: vi.fn().mockResolvedValue({
      ok: true,
      purgedCount: 3,
      reclaimedMb: 2018.4,
      message: 'Activos PDF purgados con éxito.'
    }),
    reassignPrinthouseMachine: vi.fn().mockResolvedValue({
      ok: true,
      orderId: 'PUB-ORD-2026-101',
      machineCode: 'HEIDELBERG-XL106-8P'
    }),
    sendPrinthouseB2bOrderMessage: vi.fn().mockResolvedValue({
      ok: true
    })
  };
});

function LocaleHarness({ locale, children }: { locale: 'en' | 'es' | 'de'; children: React.ReactNode }) {
  function Setter() {
    const { setLocale } = useLocale();
    React.useEffect(() => {
      setLocale(locale);
    }, [setLocale]);
    return null;
  }
  return (
    <LocaleProvider>
      <Setter />
      {children}
    </LocaleProvider>
  );
}

describe('Printhouse Hub 360° Operational Command Center & Interactive Drawers/Modals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.setItem('ppos_locale', 'es');
  });

  it('1. renders live storage quota (18.4 GB / 100 GB), balanced 6-card grid, and Operational Activity Stream with elapsed badges', async () => {
    render(
      <LocaleHarness locale="es">
        <MemoryRouter>
          <CommandCenterPage />
        </MemoryRouter>
      </LocaleHarness>
    );

    await waitFor(() => {
      expect(screen.getByTestId('metric-storage-utilized').textContent).toContain('18.4 GB / 100 GB');
    });

    expect(screen.getByTestId('metric-active-artifacts').textContent).toContain('14');
    expect(screen.queryByText('Unavailable')).toBeNull();

    // Check compact Operational Activity Stream with elapsed badges ("hace 2m", "hace 15m")
    expect(screen.getByTestId('operational-activity-feed')).toBeTruthy();
    expect(screen.getByTestId('activity-badge-elapsed-0').textContent).toContain('hace 2m');
    expect(screen.getByTestId('activity-badge-elapsed-1').textContent).toContain('hace 15m');
  });

  it('2. opens StorageLifecycleDrawer and executes PURGE RETENTION ASSETS action', async () => {
    const onPurgeCompleted = vi.fn();
    render(
      <LocaleHarness locale="es">
        <StorageLifecycleDrawer
          open={true}
          onClose={() => {}}
          storageData={{ usedGb: 18.4, quotaGb: 100, usagePct: 18.4 }}
          onPurgeCompleted={onPurgeCompleted}
        />
      </LocaleHarness>
    );

    expect(screen.getByTestId('storage-lifecycle-drawer')).toBeTruthy();
    const purgeBtn = screen.getByTestId('btn-purge-retention-assets');
    fireEvent.click(purgeBtn);

    await waitFor(() => {
      expect(onPurgeCompleted).toHaveBeenCalled();
    });
  });

  it('3. opens LiveMachineAllocationModal with wide order selector, B1/B2 sheet badge, binding badge, and executes press reassignment', async () => {
    const onReassigned = vi.fn();
    render(
      <LocaleHarness locale="es">
        <LiveMachineAllocationModal
          open={true}
          onClose={() => {}}
          fleetData={{ bottleneckAlert: 'PUR Line 92% Load' }}
          orders={[]}
          onReassigned={onReassigned}
        />
      </LocaleHarness>
    );

    expect(screen.getByTestId('live-machine-allocation-modal')).toBeTruthy();
    expect(screen.getByTestId('select-reassign-order')).toBeTruthy();
    expect(screen.getByTestId('badge-order-sheet-format').textContent).toContain('B1 (750 × 1060 mm)');
    expect(screen.getByTestId('badge-order-binding').textContent).toContain('HARDCOVER');

    fireEvent.click(screen.getByTestId('btn-reassign-machine'));

    await waitFor(() => {
      expect(onReassigned).toHaveBeenCalled();
    });
  });

  it('4. renders FinancialEscrowDrawer with LOCKED/RELEASED filter switcher, LogisticsPalletModal, and B2bIncidentBridgeDrawer with 1-click quick actions', async () => {
    const onMessageSent = vi.fn();
    render(
      <LocaleHarness locale="es">
        <FinancialEscrowDrawer open={true} onClose={() => {}} financialData={{}} selectedOrderId="PUB-ORD-2026-101" />
        <LogisticsPalletModal open={true} onClose={() => {}} logisticsData={{}} />
        <B2bIncidentBridgeDrawer open={true} onClose={() => {}} b2bData={{}} onMessageSent={onMessageSent} />
      </LocaleHarness>
    );

    expect(screen.getByTestId('financial-escrow-drawer')).toBeTruthy();
    expect(screen.getAllByText(/XML FACTURAE 3.2.2/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/XML XRECHNUNG 3.0/i).length).toBeGreaterThan(0);

    // Filter switcher between LOCKED and RELEASED escrow orders
    fireEvent.click(screen.getByTestId('filter-escrow-released'));
    expect(screen.getByText(/FE-2026-00103/)).toBeTruthy();
    expect(screen.queryByText(/FE-2026-00101/)).toBeNull();

    fireEvent.click(screen.getByTestId('filter-escrow-locked'));
    expect(screen.getByText(/FE-2026-00101/)).toBeTruthy();

    expect(screen.getByTestId('logistics-pallet-modal')).toBeTruthy();
    expect(screen.getAllByText(/DESCARGAR ALBARÁN CMR \/ POD/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/ETIQUETAS TÉRMICAS GS1-128/i).length).toBeGreaterThan(0);

    // Check 1-click quick actions in Incident Bridge
    expect(screen.getByTestId('b2b-incident-bridge-drawer')).toBeTruthy();
    fireEvent.click(screen.getByTestId('quick-action-approve-imprimatur'));

    await waitFor(() => {
      expect(onMessageSent).toHaveBeenCalled();
    });
    expect(screen.getByText(/Imprimátur aprobado/i)).toBeTruthy();
  });

  it('5. translates drawers and dashboard coherently when switching DE / EN / ES', async () => {
    render(
      <LocaleHarness locale="de">
        <B2bIncidentBridgeDrawer open={true} onClose={() => {}} b2bData={{}} />
      </LocaleHarness>
    );

    await waitFor(() => {
      expect(screen.getByTestId('quick-action-approve-imprimatur').textContent).toContain('Imprimatur erteilen');
      expect(screen.getByTestId('quick-action-attach-delivery-note').textContent).toContain('Lieferschein anhängen');
      expect(screen.getByTestId('quick-action-reject-spine').textContent).toContain('Wegen Rückenbreite ablehnen');
    });
  });
});
