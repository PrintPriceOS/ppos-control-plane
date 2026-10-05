import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LocaleProvider } from '../src/ui/i18n';
import { LimitedBetaRuntime } from '../src/ui/pages/beta/LimitedBetaRuntime';
import { ControlledBetaRuntimeSession } from '../src/ui/pages/beta/ControlledBetaRuntimeSession';
import { ControlledBetaRuntimeActivityReview } from '../src/ui/pages/beta/ControlledBetaRuntimeActivityReview';
import { ControlledBetaCohortInterventionPreparation } from '../src/ui/pages/beta/ControlledBetaCohortInterventionPreparation';
import { ControlledBetaCohortInterventionApproval } from '../src/ui/pages/beta/ControlledBetaCohortInterventionApproval';
import { Topbar } from '../src/ui/layout/Topbar';
import { FederationLeafletMap } from '../src/ui/components/maps/FederationLeafletMap';

// Mocks
vi.mock('../src/ui/api/limitedBetaRuntimeClient', () => ({
  getLimitedBetaRuntimeReadiness: vi.fn().mockResolvedValue({ ok: true, betaRuntimeEnabled: true, restartRecoveryStatus: 'VERIFIED' }),
  createRuntimeScopePolicy: vi.fn(),
  updateRuntimeScopePolicy: vi.fn(),
  enableRuntimeForGate: vi.fn(),
  disableRuntimeForGate: vi.fn(),
  createRuntimeAccessGrant: vi.fn(),
  revokeRuntimeAccessGrant: vi.fn(),
  evaluateRuntimeAccess: vi.fn(),
  createRuntimeSession: vi.fn(),
  terminateRuntimeSession: vi.fn(),
  recordRuntimeActivity: vi.fn(),
  recordRuntimeGuardrailEvent: vi.fn(),
  triggerRuntimeKillSwitch: vi.fn().mockResolvedValue({ ok: true }),
  clearRuntimeKillSwitch: vi.fn(),
  recordRuntimeRollbackEvent: vi.fn(),
  recordRuntimeFinding: vi.fn(),
  resolveRuntimeFinding: vi.fn(),
  getRuntimeAuditTimeline: vi.fn(),
  getRuntimeEvidencePack: vi.fn(),
  createRuntimeRestartDrill: vi.fn(),
  snapshotRuntimeStateBeforeRestart: vi.fn(),
  verifyRuntimeStateAfterRestart: vi.fn(),
  compareRuntimeRestartSnapshot: vi.fn(),
  verifyKillSwitchAfterRestart: vi.fn(),
  verifyAccessGrantAfterRestart: vi.fn(),
  getRuntimeRestartRecoveryAuditTimeline: vi.fn(),
  getRuntimeRestartRecoveryEvidencePack: vi.fn()
}));

vi.mock('../src/ui/api/controlledBetaRuntimeSessionClient', () => ({
  runtimeSessionClient: {
    getReadiness: vi.fn().mockResolvedValue({ ok: true, readiness_status: 'READY', blocked_reasons: [] }),
    getAuditTimeline: vi.fn().mockResolvedValue({ ok: true, timeline: [] }),
    getEvidencePack: vi.fn().mockResolvedValue({ ok: true, evidencePack: {} }),
    getDashboard: vi.fn().mockResolvedValue({ ok: true, dashboard: { total_gates: 5, active_sessions: 2, closed_sessions: 1, revoked_sessions: 0 } }),
    createGate: vi.fn(),
    bindAcceptance: vi.fn(),
    setSessionLimits: vi.fn(),
    runGuardrails: vi.fn(),
    submitForApproval: vi.fn(),
    approve: vi.fn(),
    reject: vi.fn(),
    block: vi.fn(),
    createSession: vi.fn(),
    evaluateFeatureAccess: vi.fn(),
    sendHeartbeat: vi.fn(),
    sendEvent: vi.fn(),
    closeSession: vi.fn(),
    revokeSession: vi.fn(),
    revokeParticipantSessions: vi.fn(),
    expireSessions: vi.fn()
  }
}));

vi.mock('../src/ui/api/controlledBetaRuntimeActivityReviewClient', () => ({
  runtimeActivityReviewClient: {
    listReviews: vi.fn().mockResolvedValue({ ok: true, reviews: [] }),
    getReview: vi.fn(),
    getEvidencePack: vi.fn(),
    createReview: vi.fn(),
    evaluateReview: vi.fn(),
    finalizeReview: vi.fn(),
    supersedeReview: vi.fn()
  }
}));

vi.mock('../src/ui/api/controlledBetaCohortInterventionPreparationClient', () => ({
  cohortInterventionPreparationClient: {
    listPreparations: vi.fn().mockResolvedValue({ ok: true, preparations: [] }),
    getPreparation: vi.fn(),
    getEvidencePack: vi.fn(),
    createPreparationFromReview: vi.fn(),
    updateChecklistItem: vi.fn(),
    approvePreparationRole: vi.fn(),
    finalizePreparation: vi.fn(),
    rejectPreparation: vi.fn(),
    supersedePreparation: vi.fn()
  }
}));

vi.mock('../src/ui/api/controlledBetaCohortInterventionApprovalClient', () => ({
  cohortInterventionApprovalClient: {
    listApprovals: vi.fn().mockResolvedValue({ ok: true, approvals: [] }),
    getApproval: vi.fn(),
    getEvidencePack: vi.fn(),
    createApprovalFromPreparation: vi.fn(),
    signApprovalStep: vi.fn(),
    recordDecision: vi.fn(),
    requestChanges: vi.fn(),
    returnToPreparation: vi.fn(),
    escalateApproval: vi.fn(),
    supersedeApproval: vi.fn()
  }
}));

const mockOpenMachine = vi.fn();
vi.mock('../src/ui/lib/adminApi', () => ({
  getRoutingMap: vi.fn().mockResolvedValue({
    nodes: [
      { id: 'node_1', name: 'Node Berlin', company_name: 'Berlin Druck', status: 'ONLINE', is_active: true, region: 'EU-DE', queuePressure: 45 },
      { id: 'node_2', name: 'Node Madrid', company_name: 'Madrid Grafic', status: 'ONLINE', is_active: true, region: 'EU-ES', queuePressure: 12 }
    ],
    routes: [],
    source_status: 'PARTIAL_COORDINATES',
    warnings: []
  }),
  getRoutingLive: vi.fn().mockResolvedValue({ decisions: [] }),
  clearAdminKey: vi.fn(),
  getSystemHealth: vi.fn().mockResolvedValue({ ok: true })
}));

vi.mock('../src/ui/components/federation/MachineDrawerContext', () => ({
  useMachineDrawer: () => ({
    openMachine: mockOpenMachine
  })
}));

const renderWithProviders = (ui: React.ReactElement, initialLocale: 'es' | 'en' | 'de' = 'es') => {
  return render(
    <LocaleProvider initialLocale={initialLocale}>
      <MemoryRouter>
        {ui}
      </MemoryRouter>
    </LocaleProvider>
  );
};

describe('SUPER_ADMIN Refactored Operational Screens', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. Topbar derives core telemetry signal directly from /api/system/health real dependencies contract', async () => {
    const adminApi = await import('../src/ui/lib/adminApi');

    // Healthy telemetry case: verifies process uptime and redis dependency 'ready' + 'OK' latency
    (adminApi.getSystemHealth as any).mockResolvedValueOnce({
      ok: true,
      uptime_seconds: 3600,
      pid: 4120,
      dependencies: {
        redis: {
          status: 'ready',
          latency: 'OK'
        }
      }
    });
    const { unmount } = renderWithProviders(<Topbar />);

    expect(screen.queryByText(/v2\.0\.0 Certified/i)).toBeNull();
    await waitFor(() => {
      const badge = screen.getByText(/Telemetría Núcleo: OK|Core Telemetry: OK|Kern-Telemetrie: OK/i);
      expect(badge).toBeDefined();
      expect(badge.closest('div')?.getAttribute('title')).toContain('4120');
      expect(badge.closest('div')?.getAttribute('title')).toContain('No evalúa RBAC');
    });
    unmount();

    // Degraded telemetry case: HTTP 200 / ok: true is NOT enough if redis latency or status is degraded
    (adminApi.getSystemHealth as any).mockResolvedValueOnce({
      ok: true,
      uptime_seconds: 120,
      dependencies: {
        redis: {
          status: 'connect',
          latency: 'ERROR'
        }
      }
    });
    const { unmount: unmountDegraded } = renderWithProviders(<Topbar />);
    await waitFor(() => {
      expect(screen.getByText(/Telemetría Degradada|Degraded Telemetry|Degradierte Telemetrie/i)).toBeDefined();
    });
    unmountDegraded();

    // Unreachable telemetry case: must NOT assert active operational status without backing data
    (adminApi.getSystemHealth as any).mockRejectedValueOnce(new Error('Network failure'));
    renderWithProviders(<Topbar />);
    await waitFor(() => {
      expect(screen.queryByText(/Telemetría Núcleo: OK/i)).toBeNull();
      expect(screen.getByText(/Sin Telemetría|No Telemetry|Keine Telemetrie/i)).toBeDefined();
    });
  });

  it('2. LimitedBetaRuntime replaces Phase 128.1 with functional title and confirms emergency kill switch before execution', async () => {
    renderWithProviders(<LimitedBetaRuntime />);

    // Verify Phase 128.1 is NOT present in document
    expect(screen.queryByText(/Phase 128\.1/i)).toBeNull();

    // Verify Safety warning is present
    expect(screen.getByText(/Entorno Beta Restringido por Invitación|Safety Warning/i)).toBeDefined();

    // Enter a gate ID so gate-scoped actions are enabled
    const gateInput = screen.getByPlaceholderText(/ID de Gate/i);
    fireEvent.change(gateInput, { target: { value: 'gate_test_123' } });

    // Clicking trigger kill switch opens confirmation dialog
    const killSwitchBtn = screen.getByText(/Activar Interruptor/i);
    fireEvent.click(killSwitchBtn);

    // Confirmation modal should appear with explanation
    expect(screen.getByText(/Activar Interruptor de Emergencia/i)).toBeDefined();
    expect(screen.getByText(/ALERTA DE SEGURIDAD/i)).toBeDefined();
  });

  it('3. ControlledBetaRuntimeSession replaces Phase 135 and Phase 134 references with functional terms', () => {
    renderWithProviders(<ControlledBetaRuntimeSession />);

    // Phase 135 & Phase 134 should not be in the visible UI
    expect(screen.queryByText(/Phase 135/i)).toBeNull();
    expect(screen.queryByText(/Phase 134/i)).toBeNull();

    // Functional labels should exist
    expect(screen.getByText(/ID de Gate de Sesión/i)).toBeDefined();
    expect(screen.getByText(/ID de Gate de Aceptación Previo/i)).toBeDefined();
  });

  it('4. ControlledBetaRuntimeActivityReview empty state provides actionable button to activity observation', async () => {
    renderWithProviders(<ControlledBetaRuntimeActivityReview />);

    // Phase 137 should not be present
    expect(screen.queryByText(/Phase 137/i)).toBeNull();

    // Actionable empty state should guide user
    await waitFor(() => {
      expect(screen.getByText(/Ir a Observación de Actividad/i)).toBeDefined();
    });
  });

  it('5. ControlledBetaCohortInterventionPreparation empty state provides actionable button to health reviews', async () => {
    renderWithProviders(<ControlledBetaCohortInterventionPreparation />);

    // Phase 138 should not be present
    expect(screen.queryByText(/Phase 138/i)).toBeNull();

    // Actionable empty state should guide user to health reviews
    await waitFor(() => {
      const btns = screen.getAllByText(/Ir a Revisiones de Salud/i);
      expect(btns.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('6. ControlledBetaCohortInterventionApproval empty state provides actionable button to intervention prep', async () => {
    renderWithProviders(<ControlledBetaCohortInterventionApproval />);

    // Phase 139 should not be present
    expect(screen.queryByText(/Phase 139/i)).toBeNull();

    // Actionable empty state button should exist
    await waitFor(() => {
      const btns = screen.getAllByText(/Ir a Preparación de Intervenciones/i);
      expect(btns.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('7. FederationLeafletMap detects unconfigured Carto key, retains node list, and allows inspecting machine', async () => {
    renderWithProviders(<FederationLeafletMap />);

    await waitFor(() => {
      expect(screen.getByText(/PROVIDER: UNCONFIGURED/i)).toBeDefined();
      expect(screen.getByText(/Registro Táctico de Nodos/i)).toBeDefined();
      expect(screen.getByText(/Berlin Druck/i)).toBeDefined();
      expect(screen.getByText(/Madrid Grafic/i)).toBeDefined();
    });

    // Node inspection works without map tiles
    const inspectBtns = screen.getAllByText(/Inspeccionar Máquina/i);
    expect(inspectBtns.length).toBeGreaterThanOrEqual(1);
    fireEvent.click(inspectBtns[0]);
    expect(mockOpenMachine).toHaveBeenCalledWith('node_1');
  });

  it('8. Critical actions do NOT invoke endpoints when cancelling confirmation dialog', async () => {
    const { triggerRuntimeKillSwitch } = await import('../src/ui/api/limitedBetaRuntimeClient');
    renderWithProviders(<LimitedBetaRuntime />);

    const gateInput = screen.getByPlaceholderText(/ID de Gate/i);
    fireEvent.change(gateInput, { target: { value: 'gate_test_safe' } });

    // Click trigger kill switch
    const killSwitchBtn = screen.getByText(/Activar Interruptor/i);
    fireEvent.click(killSwitchBtn);

    // Modal appears
    expect(screen.getByText(/ALERTA DE SEGURIDAD/i)).toBeDefined();

    // Click Cancel
    const cancelBtn = screen.getByText(/Cancelar/i);
    fireEvent.click(cancelBtn);

    // Endpoint must NOT be called on cancel
    expect(triggerRuntimeKillSwitch).not.toHaveBeenCalled();

    // Re-open and confirm
    fireEvent.click(killSwitchBtn);
    const confirmBtn = screen.getByText(/Confirmar/i);
    fireEvent.click(confirmBtn);

    // Endpoint must be called now
    expect(triggerRuntimeKillSwitch).toHaveBeenCalledWith({
      gate_id: 'gate_test_safe',
      reason: 'EMERGENCY_ACCESS_SUSPENSION'
    });
  });

  it('9. FederationLeafletMap with simulated tile error displays error banner, retains node list, and allows machine inspection', async () => {
    renderWithProviders(<FederationLeafletMap forceTileError={true} />);

    await waitFor(() => {
      // Must show explicit error banner
      expect(screen.getByText(/TILES: LOAD_FAILED/i)).toBeDefined();
      expect(screen.getByText(/Error al cargar teselas cartográficas/i)).toBeDefined();
      // Must retain tactical node registry list
      expect(screen.getAllByText(/Registro Táctico de Nodos/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText(/Berlin Druck/i)).toBeDefined();
      expect(screen.getByText(/Madrid Grafic/i)).toBeDefined();
    });

    // Node inspection must still be fully operative
    const inspectBtns = screen.getAllByText(/Inspeccionar Máquina/i);
    expect(inspectBtns.length).toBeGreaterThanOrEqual(1);
    fireEvent.click(inspectBtns[0]);
    expect(mockOpenMachine).toHaveBeenCalledWith('node_1');
  });
});
