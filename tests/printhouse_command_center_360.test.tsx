import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LocaleProvider } from '../src/ui/i18n';
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

describe('Printhouse Hub 360° Operational Command Center & Interactive Drawers/Modals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. renders live storage quota (18.4 GB / 100 GB), fleet presses, and expected revenue without Unavailable placeholders', async () => {
    render(
      <LocaleProvider>
        <MemoryRouter>
          <CommandCenterPage />
        </MemoryRouter>
      </LocaleProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('metric-storage-utilized').textContent).toContain('18.4 GB / 100 GB');
    });

    expect(screen.getByTestId('metric-active-artifacts').textContent).toContain('14 Hot PDFs');
    expect(screen.queryByText('Unavailable')).toBeNull();
  });

  it('2. opens StorageLifecycleDrawer and executes PURGE RETENTION ASSETS action', async () => {
    const onPurgeCompleted = vi.fn();
    render(
      <StorageLifecycleDrawer
        open={true}
        onClose={() => {}}
        storageData={{ usedGb: 18.4, quotaGb: 100, usagePct: 18.4 }}
        onPurgeCompleted={onPurgeCompleted}
      />
    );

    expect(screen.getByTestId('storage-lifecycle-drawer')).toBeTruthy();
    const purgeBtn = screen.getByTestId('btn-purge-retention-assets');
    fireEvent.click(purgeBtn);

    await waitFor(() => {
      expect(onPurgeCompleted).toHaveBeenCalled();
    });
  });

  it('3. opens LiveMachineAllocationModal and executes press reassignment', async () => {
    const onReassigned = vi.fn();
    render(
      <LiveMachineAllocationModal
        open={true}
        onClose={() => {}}
        fleetData={{ bottleneckAlert: 'PUR Line 92% Load' }}
        orders={[]}
        onReassigned={onReassigned}
      />
    );

    expect(screen.getByTestId('live-machine-allocation-modal')).toBeTruthy();
    fireEvent.click(screen.getByTestId('btn-reassign-machine'));

    await waitFor(() => {
      expect(onReassigned).toHaveBeenCalled();
    });
  });

  it('4. renders FinancialEscrowDrawer (Facturae 3.2.2 & XRechnung 3.0 XML), LogisticsPalletModal (DIN A4 CMR & DIN A6 SSCC-18), and B2bIncidentBridgeDrawer', async () => {
    const onMessageSent = vi.fn();
    render(
      <>
        <FinancialEscrowDrawer open={true} onClose={() => {}} financialData={{}} selectedOrderId="PUB-ORD-2026-101" />
        <LogisticsPalletModal open={true} onClose={() => {}} logisticsData={{}} />
        <B2bIncidentBridgeDrawer open={true} onClose={() => {}} b2bData={{}} onMessageSent={onMessageSent} />
      </>
    );

    expect(screen.getByTestId('financial-escrow-drawer')).toBeTruthy();
    expect(screen.getAllByText(/XML FACTURAE 3.2.2/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/XML XRECHNUNG 3.0/i).length).toBeGreaterThan(0);

    expect(screen.getByTestId('logistics-pallet-modal')).toBeTruthy();
    expect(screen.getAllByText(/DESCARGAR ALBARÁN CMR \/ POD/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/ETIQUETAS TÉRMICAS GS1-128/i).length).toBeGreaterThan(0);

    expect(screen.getByTestId('b2b-incident-bridge-drawer')).toBeTruthy();
    const input = screen.getByTestId('b2b-message-input');
    fireEvent.change(input, { target: { value: 'Planchas CTP listas para entrada en máquina.' } });
    fireEvent.click(screen.getByTestId('btn-send-b2b-message'));

    await waitFor(() => {
      expect(onMessageSent).toHaveBeenCalled();
    });
  });
});
