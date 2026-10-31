import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LocaleProvider } from '../src/ui/i18n';
import { MachineDrawerProvider } from '../src/ui/components/federation/MachineDrawerContext';
import { FederationLeafletMap } from '../src/ui/components/maps/FederationLeafletMap';
import { MachineDetailDrawer } from '../src/ui/components/MachineDetailDrawer';

// Mock Leaflet and map container
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: any) => <div data-testid="map-container">{children}</div>,
  TileLayer: () => <div data-testid="tile-layer" />,
  CircleMarker: ({ children, eventHandlers }: any) => (
    <div data-testid="circle-marker" onClick={eventHandlers?.click}>
      {children}
    </div>
  ),
  Popup: ({ children }: any) => <div data-testid="popup">{children}</div>
}));

// Mock adminApi
const mockGetRoutingMap = vi.fn();
const mockGetMachineFederationDetails = vi.fn();
const mockGetMachineTelemetry = vi.fn();
const mockGetMachineDispatchHistory = vi.fn();
const mockGetMachineCapacityAnalysis = vi.fn();

vi.mock('../src/ui/lib/adminApi', () => ({
  getRoutingMap: (...args: any[]) => mockGetRoutingMap(...args),
  getRoutingLive: vi.fn().mockResolvedValue({ decisions: [] }),
  getMachineFederationDetails: (...args: any[]) => mockGetMachineFederationDetails(...args),
  getMachineTelemetry: (...args: any[]) => mockGetMachineTelemetry(...args),
  getMachineDispatchHistory: (...args: any[]) => mockGetMachineDispatchHistory(...args),
  getMachineCapacityAnalysis: (...args: any[]) => mockGetMachineCapacityAnalysis(...args),
  clearAdminKey: vi.fn(),
  getSystemHealth: vi.fn().mockResolvedValue({ ok: true })
}));

describe('Node and Machine Inspection Contract & Drawer Regression', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetMachineFederationDetails.mockResolvedValue({ ok: true, data: [] });
    mockGetMachineTelemetry.mockResolvedValue({ ok: true, data: [] });
    mockGetMachineDispatchHistory.mockResolvedValue({ ok: true, data: [] });
    mockGetMachineCapacityAnalysis.mockResolvedValue({ ok: true, data: [] });
  });

  it('1. End-to-end: clicking Inspect Node in FederationLeafletMap preserves node identity and displays node ID in drawer (no "Node: N/A")', async () => {
    mockGetRoutingMap.mockResolvedValue({
      nodes: [
        {
          id: 'node-fra-01',
          name: 'Frankfurt Production Cluster',
          company_name: 'Druckhaus Rhein-Main',
          status: 'ONLINE',
          is_active: true,
          region: 'EU-DE',
          lat: 50.1109,
          lng: 8.6821,
          queuePressure: 42
        }
      ],
      routes: [],
      source_status: 'PARTIAL_COORDINATES',
      warnings: []
    });

    render(
      <LocaleProvider initialLocale="es">
        <MemoryRouter>
          <MachineDrawerProvider>
            <FederationLeafletMap />
          </MachineDrawerProvider>
        </MemoryRouter>
      </LocaleProvider>
    );

    // Wait for nodes to load in tactical registry
    await waitFor(() => {
      expect(screen.getByText('Druckhaus Rhein-Main')).toBeDefined();
    });

    // Click inspect button for the known node
    const inspectBtn = screen.getByText('Inspeccionar Máquina');
    fireEvent.click(inspectBtn);

    // Drawer must open preserving exact node identity
    await waitFor(() => {
      // Must display resolved node ID in drawer title/header
      expect(screen.getByText('Nodo: node-fra-01')).toBeDefined();
      expect(screen.getAllByText('ID: node-fra-01').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Druckhaus Rhein-Main').length).toBeGreaterThanOrEqual(2);
    });

    // Verification: MUST NEVER display "Node: N/A" or "Nodo: N/A"
    expect(screen.queryByText(/Node: N\/A/i)).toBeNull();
    expect(screen.queryByText(/Nodo: N\/A/i)).toBeNull();

    // Verification: Distinguish node from machine - no fake machine invented
    expect(screen.getByText('Sin máquina física asociada al nodo')).toBeDefined();
    expect(screen.getByText('Equipo no asignado (Solo infraestructura de nodo)')).toBeDefined();

    // Verification: Missing telemetry shows "Sin datos" - NO fake 100% uptime default
    expect(screen.getAllByText('Sin datos').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('100%')).toBeNull();
  });

  it('2. Distinguishes node with assigned physical machine from unassigned node', async () => {
    const nodeWithMachine = {
      id: 'node-muc-02',
      name: 'Munich Digital Hub',
      company_name: 'Bavaria Druck GmbH',
      status: 'ONLINE',
      machine: {
        name: 'HP Indigo 12000 HD',
        model: 'Indigo 12000',
        manufacturer: 'HP',
        status: 'PRINTING'
      }
    };

    render(
      <LocaleProvider initialLocale="es">
        <MachineDetailDrawer
          machineId="node-muc-02"
          nodeContext={nodeWithMachine}
          isOpen={true}
          onClose={() => {}}
        />
      </LocaleProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Nodo: node-muc-02')).toBeDefined();
      expect(screen.getByText('HP Indigo 12000 HD')).toBeDefined();
      expect(screen.getByText('PRINTING')).toBeDefined();
      expect(screen.getByText(/HP \/ Indigo 12000/i)).toBeDefined();
    });

    // Should NOT show "Sin máquina física asociada al nodo"
    expect(screen.queryByText('Sin máquina física asociada al nodo')).toBeNull();
  });

  it('3. Real telemetry display when measurements exist (avoids "Sin datos" when data is present)', async () => {
    mockGetMachineTelemetry.mockResolvedValue({
      ok: true,
      data: {
        jobs_running: 4,
        jobs_queued: 12,
        jobs_failed_24h: 1,
        throughput_h: 350,
        utilization_pct: 78,
        avg_turnaround: 18
      }
    });

    const nodeWithTelemetry = {
      id: 'node-ber-01',
      name: 'Berlin Spree Hub',
      uptime_pct: 99.8
    };

    render(
      <LocaleProvider initialLocale="es">
        <MachineDetailDrawer
          machineId="node-ber-01"
          nodeContext={nodeWithTelemetry}
          isOpen={true}
          onClose={() => {}}
        />
      </LocaleProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('99.8%')).toBeDefined();
      expect(screen.getByText('4')).toBeDefined();
      expect(screen.getByText('12')).toBeDefined();
      expect(screen.getByText('78%')).toBeDefined();
      expect(screen.getByText('18m')).toBeDefined();
    });
  });

  it('4. Multilingual support across ES, EN, and DE in MachineDetailDrawer', async () => {
    const unassignedNode = {
      id: 'node-test-01',
      name: 'Test Cluster'
    };

    // Test English
    const { unmount: unmountEn } = render(
      <LocaleProvider initialLocale="en">
        <MachineDetailDrawer
          machineId="node-test-01"
          nodeContext={unassignedNode}
          isOpen={true}
          onClose={() => {}}
        />
      </LocaleProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Node: node-test-01')).toBeDefined();
      expect(screen.getByText('No physical machine associated with this node')).toBeDefined();
      expect(screen.getAllByText('No data').length).toBeGreaterThanOrEqual(1);
    });
    unmountEn();

    // Test German
    const { unmount: unmountDe } = render(
      <LocaleProvider initialLocale="de">
        <MachineDetailDrawer
          machineId="node-test-01"
          nodeContext={unassignedNode}
          isOpen={true}
          onClose={() => {}}
        />
      </LocaleProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Knoten: node-test-01')).toBeDefined();
      expect(screen.getByText('Keine physische Maschine mit diesem Knoten verknüpft')).toBeDefined();
      expect(screen.getAllByText('Keine Daten').length).toBeGreaterThanOrEqual(1);
    });
    unmountDe();
  });
});
