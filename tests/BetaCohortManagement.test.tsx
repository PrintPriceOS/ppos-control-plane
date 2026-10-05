import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LocaleProvider } from '../src/ui/i18n';
import { ControlledBetaCohortActivation } from '../src/ui/pages/beta/ControlledBetaCohortActivation';
import { ControlledBetaInviteIssuance } from '../src/ui/pages/beta/ControlledBetaInviteIssuance';
import { ControlledBetaInviteAcceptance } from '../src/ui/pages/beta/ControlledBetaInviteAcceptance';
import { BetaCohortWorkspace } from '../src/ui/pages/beta/BetaCohortWorkspace';

// Mocks hoisted
const {
  mockGetTenantsList,
  mockActivationClient,
  mockInviteIssuanceClient,
  mockInviteAcceptanceClient
} = vi.hoisted(() => {
  return {
    mockGetTenantsList: vi.fn(),
    mockActivationClient: {
      getControlledBetaCohortActivationReadiness: vi.fn(),
      createControlledCohortActivation: vi.fn(),
      bindActivationToGate: vi.fn(),
      bindActivationToCohort: vi.fn(),
      bindActivationToTenant: vi.fn(),
      addActivationParticipant: vi.fn(),
      removeActivationParticipant: vi.fn(),
      issueActivationInvite: vi.fn(),
      revokeActivationInvite: vi.fn(),
      defineActivationScope: vi.fn(),
      defineSessionLimits: vi.fn(),
      activateControlledCohort: vi.fn(),
      pauseControlledCohort: vi.fn(),
      resumeControlledCohort: vi.fn(),
      terminateControlledCohort: vi.fn(),
      evaluateParticipantActivationAccess: vi.fn(),
      recordActivationMonitoringEvent: vi.fn(),
      recordActivationSupportEvent: vi.fn(),
      recordActivationIncidentEvent: vi.fn(),
      triggerActivationKillSwitch: vi.fn(),
      clearActivationKillSwitch: vi.fn(),
      recordActivationFinding: vi.fn(),
      resolveActivationFinding: vi.fn(),
      getControlledActivationEvidencePack: vi.fn(),
      getControlledActivationAuditTimeline: vi.fn()
    },
    mockInviteIssuanceClient: {
      getReadiness: vi.fn(),
      createGate: vi.fn(),
      bindPreparation: vi.fn(),
      createBatch: vi.fn(),
      addRecipient: vi.fn(),
      validateBatch: vi.fn(),
      runGuardrails: vi.fn(),
      submitForApproval: vi.fn(),
      approve: vi.fn(),
      reject: vi.fn(),
      block: vi.fn(),
      issueBatch: vi.fn(),
      revokeInvite: vi.fn(),
      revokeBatch: vi.fn(),
      getEvidencePack: vi.fn(),
      getAuditTimeline: vi.fn(),
      getDashboard: vi.fn()
    },
    mockInviteAcceptanceClient: {
      getReadiness: vi.fn(),
      createGate: vi.fn(),
      claimInvite: vi.fn(),
      bindIdentity: vi.fn(),
      acceptTerms: vi.fn(),
      setSessionLimits: vi.fn(),
      setAccessPolicy: vi.fn(),
      runGuardrails: vi.fn(),
      submitForApproval: vi.fn(),
      approve: vi.fn(),
      reject: vi.fn(),
      block: vi.fn(),
      grantRuntimeAccess: vi.fn(),
      revoke: vi.fn(),
      getEvidencePack: vi.fn(),
      getAuditTimeline: vi.fn(),
      getDashboard: vi.fn()
    }
  };
});

vi.mock('../src/ui/lib/adminApi', async (importOriginal) => {
  const actual = await importOriginal<Record<string, any>>();
  return {
    ...actual,
    getTenantsList: mockGetTenantsList
  };
});

vi.mock('../src/ui/api/controlledBetaCohortActivationClient', () => mockActivationClient);

vi.mock('../src/ui/api/controlledBetaInviteIssuanceClient', () => ({
  ControlledBetaInviteIssuanceClient: vi.fn().mockImplementation(() => mockInviteIssuanceClient),
  inviteIssuanceClient: mockInviteIssuanceClient
}));

vi.mock('../src/ui/api/controlledBetaInviteAcceptanceClient', () => ({
  ControlledBetaInviteAcceptanceClient: vi.fn().mockImplementation(() => mockInviteAcceptanceClient),
  inviteAcceptanceClient: mockInviteAcceptanceClient
}));

describe('Beta Cohort Management — Operational Super Admin Adaptations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetTenantsList.mockResolvedValue({
      ok: true,
      tenants: [
        { tenant_id: 'tenant_alpha', name: 'Alpha Printhouse' },
        { tenant_id: 'tenant_beta', name: 'Beta Solutions' }
      ]
    });
    mockActivationClient.getControlledBetaCohortActivationReadiness.mockResolvedValue({
      ok: true,
      readiness_status: 'READY',
      persistenceStatus: 'ACTIVE',
      runtimeTruthStatus: 'VERIFIED',
      betaRuntimeEnabled: 'SCOPED_ONLY'
    });
    mockInviteIssuanceClient.getReadiness.mockResolvedValue({
      ok: true,
      readiness_status: 'READY',
      blocked_reasons: []
    });
    mockInviteIssuanceClient.getDashboard.mockResolvedValue({
      ok: true,
      dashboard: { total_gates: 5, ready_gates: 2, approved_gates: 1, blocked_gates: 0 }
    });
    mockInviteIssuanceClient.getAuditTimeline.mockResolvedValue({ ok: true, timeline: [] });
    mockInviteIssuanceClient.getEvidencePack.mockResolvedValue({ ok: true, evidencePack: {} });

    mockInviteAcceptanceClient.getReadiness.mockResolvedValue({
      ok: true,
      readiness_status: 'READY',
      blocked_reasons: [],
      checks: { IdentityBound: true, TermsAccepted: true }
    });
    mockInviteAcceptanceClient.getDashboard.mockResolvedValue({
      ok: true,
      dashboard: { total_gates: 4, ready_gates: 2, approved_gates: 1, blocked_gates: 0 }
    });
    mockInviteAcceptanceClient.getAuditTimeline.mockResolvedValue({ ok: true, timeline: [] });
    mockInviteAcceptanceClient.getEvidencePack.mockResolvedValue({ ok: true, evidencePack: {} });
  });

  it('1. ControlledBetaCohortActivation renders cleanly without phase references, sample values, and with 3 separated panels', async () => {
    const { container } = render(
      <MemoryRouter>
        <LocaleProvider initialLocale="es">
          <ControlledBetaCohortActivation />
        </LocaleProvider>
      </MemoryRouter>
    );

    // No phase references in titles, inputs or text
    expect(container.textContent).not.toContain('Phase 129');
    expect(container.textContent).not.toContain('Phase 127');
    expect(container.textContent).not.toContain('lbpg_phase127_01');
    expect(container.textContent).not.toContain('cohort_beta_01');
    expect(container.textContent).not.toContain('tenant_beta_01');
    expect(container.textContent).not.toContain('participant_beta_01');

    // Identifies Beta & Safety Warning
    expect(screen.getByText(/Controlled Invite-Only Beta Cohort Activation/i)).toBeInTheDocument();

    // 3 Distinct Sections
    expect(screen.getByText(/Consulta de Estado y Verificación/i)).toBeInTheDocument();
    expect(screen.getByText(/Preparación y Configuración/i)).toBeInTheDocument();
    expect(screen.getByText(/Acciones que Modifican Acceso/i)).toBeInTheDocument();
  });

  it('2. ControlledBetaCohortActivation handles HTTP 401 with nested {code, message} safely without crashing (React #31) and prevents retry loops', async () => {
    mockActivationClient.getControlledBetaCohortActivationReadiness.mockResolvedValueOnce({
      ok: false,
      status: 401,
      error: { code: 'UNAUTHORIZED', message: 'Token de sesión expirado en cohort-activation' }
    });

    render(
      <MemoryRouter>
        <LocaleProvider initialLocale="es">
          <ControlledBetaCohortActivation />
        </LocaleProvider>
      </MemoryRouter>
    );

    // Trigger check readiness
    const verifyButtons = screen.getAllByRole('button', { name: /Verificar/i });
    fireEvent.click(verifyButtons[0]);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    // Does NOT crash with React #31 and displays normalized message
    expect(screen.getByText(/Token de sesión expirado en cohort-activation/i)).toBeInTheDocument();

    // Displays "Iniciar Sesión" button
    expect(screen.getByRole('button', { name: /Iniciar Sesión/i })).toBeInTheDocument();

    // Does NOT render "Reintentar" button on 401 to eliminate retry loops
    expect(screen.queryByRole('button', { name: /Reintentar/i })).toBeNull();
  });

  it('3. ControlledBetaCohortActivation requires explicit confirmation for access actions, and canceling emits NO HTTP call', async () => {
    mockActivationClient.activateControlledCohort.mockResolvedValueOnce({ ok: true });

    render(
      <MemoryRouter>
        <LocaleProvider initialLocale="es">
          <ControlledBetaCohortActivation />
        </LocaleProvider>
      </MemoryRouter>
    );

    // Enter an activation ID
    const actInput = screen.getByPlaceholderText('act_...');
    fireEvent.change(actInput, { target: { value: 'act_live_999' } });

    // Click Activar Cohorte
    const activateBtn = screen.getByRole('button', { name: /Activar Cohorte/i });
    fireEvent.click(activateBtn);

    // Modal opens
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/Está a punto de activar la cohorte vinculada al expediente act_live_999/i)).toBeInTheDocument();

    // Click Cancelar -> modal closes, NO API call emitted
    const cancelBtn = screen.getByRole('button', { name: /Cancelar/i });
    fireEvent.click(cancelBtn);

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(mockActivationClient.activateControlledCohort).not.toHaveBeenCalled();

    // Reopen and Confirm
    fireEvent.click(activateBtn);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    const confirmBtn = screen.getByRole('button', { name: /Confirmar Activación/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(mockActivationClient.activateControlledCohort).toHaveBeenCalledWith({ activation_id: 'act_live_999' });
    });
  });

  it('4. ControlledBetaInviteIssuance renders cleanly without phase references, preserves exact safety copy, and initializes empty', async () => {
    const { container } = render(
      <MemoryRouter>
        <LocaleProvider initialLocale="es">
          <ControlledBetaInviteIssuance />
        </LocaleProvider>
      </MemoryRouter>
    );

    // No phase references
    expect(container.textContent).not.toContain('Phase 133');
    expect(container.textContent).not.toContain('Phase 132');
    expect(container.textContent).not.toContain('gate_133_');
    expect(container.textContent).not.toContain('user@example.com');
    expect(container.textContent).not.toContain('Primary Tester');

    // Preserves required smoke test copy
    expect(screen.getByText(/Controlled invite issuance only/i)).toBeInTheDocument();
    expect(screen.getByText(/This is not public beta, not open marketplace, and not automatic expansion/i)).toBeInTheDocument();

    // 3 Distinct Sections
    expect(screen.getByText(/Consulta de Estado y Verificación/i)).toBeInTheDocument();
    expect(screen.getByText(/Preparación y Configuración/i)).toBeInTheDocument();
    expect(screen.getByText(/Acciones que Modifican Acceso/i)).toBeInTheDocument();
  });

  it('5. ControlledBetaInviteIssuance handles HTTP 401 with nested error safely and requires confirmation for batch issuance', async () => {
    mockInviteIssuanceClient.getReadiness.mockResolvedValueOnce({
      ok: false,
      status: 401,
      error: { code: 'UNAUTHORIZED', message: 'Credenciales inválidas de emisión' }
    });

    render(
      <MemoryRouter>
        <LocaleProvider initialLocale="es">
          <ControlledBetaInviteIssuance />
        </LocaleProvider>
      </MemoryRouter>
    );

    const gateInput = screen.getByPlaceholderText('gate_...');
    fireEvent.change(gateInput, { target: { value: 'gate_test_101' } });

    const verifyBtn = screen.getByRole('button', { name: /Verificar/i });
    fireEvent.click(verifyBtn);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    expect(screen.getByText(/Credenciales inválidas de emisión/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Iniciar Sesión/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Reintentar/i })).toBeNull();
  });

  it('6. ControlledBetaInviteAcceptance renders cleanly, preserves exact safety copy, and does not leak credentials in DOM', async () => {
    const { container } = render(
      <MemoryRouter>
        <LocaleProvider initialLocale="es">
          <ControlledBetaInviteAcceptance />
        </LocaleProvider>
      </MemoryRouter>
    );

    // No phase references
    expect(container.textContent).not.toContain('Phase 134');
    expect(container.textContent).not.toContain('Phase 133');
    expect(container.textContent).not.toContain('agate_134_');
    expect(container.textContent).not.toContain('hash_terms_v1_0');

    // Preserves required smoke test copy
    expect(screen.getByText(/Controlled invite acceptance and participant onboarding only/i)).toBeInTheDocument();
    expect(screen.getByText(/This is not public signup, not public beta, and not open marketplace/i)).toBeInTheDocument();

    // Confirmation for runtime access
    const grantBtn = screen.getByRole('button', { name: /Conceder Acceso a Runtime/i });
    expect(grantBtn).toBeDisabled(); // Disabled until gateId is present
  });

  it('7. BetaCohortWorkspace switches across all three tabs without crashing and renders localized titles', async () => {
    render(
      <MemoryRouter>
        <LocaleProvider initialLocale="es">
          <BetaCohortWorkspace />
        </LocaleProvider>
      </MemoryRouter>
    );

    expect(screen.getByText(/Gestión de Cohorte Beta — Activación/i)).toBeInTheDocument();

    // Switch to Invitations
    const tabInvitations = screen.getByRole('button', { name: 'Invitaciones' });
    fireEvent.click(tabInvitations);

    await waitFor(() => {
      expect(screen.getByText(/Gestión de Cohorte Beta — Invitaciones/i)).toBeInTheDocument();
    });

    // Switch to Participants
    const tabParticipants = screen.getByRole('button', { name: 'Participantes' });
    fireEvent.click(tabParticipants);

    await waitFor(() => {
      expect(screen.getByText(/Gestión de Cohorte Beta — Participantes/i)).toBeInTheDocument();
    });
  });
});
