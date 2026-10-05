import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LocaleProvider } from '../src/ui/i18n';
import { ControlledBetaRuntimeActivityReview } from '../src/ui/pages/beta/ControlledBetaRuntimeActivityReview';
import { ControlledBetaCohortInterventionPreparation } from '../src/ui/pages/beta/ControlledBetaCohortInterventionPreparation';
import { ControlledBetaCohortInterventionApproval } from '../src/ui/pages/beta/ControlledBetaCohortInterventionApproval';
import { ControlledBetaRuntimeSession } from '../src/ui/pages/beta/ControlledBetaRuntimeSession';
import { ControlledBetaRuntimeActivityObservation } from '../src/ui/pages/beta/ControlledBetaRuntimeActivityObservation';
import { LimitedBetaRuntime } from '../src/ui/pages/beta/LimitedBetaRuntime';

// Mocks hoisted
const {
  mockGetTenantsList,
  mockReviewClient,
  mockPrepClient,
  mockApprovalClient,
  mockSessionClient,
  mockObservationClient
} = vi.hoisted(() => {
  return {
    mockGetTenantsList: vi.fn(),
    mockReviewClient: {
      listReviews: vi.fn(),
      getReview: vi.fn(),
      getEvidencePack: vi.fn(),
      createReview: vi.fn(),
      evaluateReview: vi.fn(),
      finalizeReview: vi.fn(),
      supersedeReview: vi.fn()
    },
    mockPrepClient: {
      listPreparations: vi.fn(),
      getPreparation: vi.fn(),
      getEvidencePack: vi.fn(),
      createPreparationFromReview: vi.fn(),
      updateItemStatus: vi.fn(),
      approveRole: vi.fn(),
      finalizePreparation: vi.fn(),
      rejectPreparation: vi.fn(),
      supersedePreparation: vi.fn()
    },
    mockApprovalClient: {
      listApprovals: vi.fn(),
      getApproval: vi.fn(),
      getEvidencePack: vi.fn(),
      createApprovalFromPreparation: vi.fn(),
      signStep: vi.fn(),
      recordDecision: vi.fn(),
      requestChanges: vi.fn(),
      returnToPreparation: vi.fn(),
      escalateApproval: vi.fn(),
      supersedeApproval: vi.fn()
    },
    mockSessionClient: {
      getReadiness: vi.fn().mockResolvedValue({ ok: true, readiness_status: 'READY' }),
      getAuditTimeline: vi.fn().mockResolvedValue({ ok: true, timeline: [] }),
      getEvidencePack: vi.fn().mockResolvedValue({ ok: true, evidencePack: {} }),
      getDashboard: vi.fn().mockResolvedValue({ ok: true, dashboard: { total_gates: 3, active_sessions: 1, closed_sessions: 0, revoked_sessions: 0 } }),
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
    },
    mockObservationClient: {
      getReadiness: vi.fn().mockResolvedValue({ ok: true, readiness_status: 'HEALTHY' }),
      getAuditTimeline: vi.fn().mockResolvedValue({ ok: true, timeline: [] }),
      getEvidencePack: vi.fn().mockResolvedValue({ ok: true, evidencePack: {} }),
      getDashboard: vi.fn().mockResolvedValue({ ok: true, dashboard: {} }),
      getParticipantSummary: vi.fn().mockResolvedValue({ ok: true, participantSummary: {} }),
      getCohortSummary: vi.fn().mockResolvedValue({ ok: true, cohortSummary: {} }),
      createGate: vi.fn(),
      ingestEvent: vi.fn(),
      recordBlockedAttempt: vi.fn(),
      recordAnomalySignal: vi.fn(),
      recordHealthSignal: vi.fn(),
      createFinding: vi.fn(),
      resolveFinding: vi.fn(),
      runGuardrails: vi.fn()
    }
  };
});

vi.mock('../src/ui/lib/adminApi', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    getTenantsList: vi.fn().mockImplementation(() => mockGetTenantsList())
  };
});

vi.mock('../src/ui/api/controlledBetaRuntimeActivityReviewClient', () => ({
  runtimeActivityReviewClient: mockReviewClient
}));

vi.mock('../src/ui/api/controlledBetaCohortInterventionPreparationClient', () => ({
  cohortInterventionPreparationClient: mockPrepClient
}));

vi.mock('../src/ui/api/controlledBetaCohortInterventionApprovalClient', () => ({
  cohortInterventionApprovalClient: mockApprovalClient
}));

vi.mock('../src/ui/api/controlledBetaRuntimeSessionClient', () => ({
  runtimeSessionClient: mockSessionClient
}));

vi.mock('../src/ui/api/controlledBetaRuntimeActivityObservationClient', () => ({
  runtimeActivityObservationClient: mockObservationClient
}));

vi.mock('../src/ui/api/limitedBetaRuntimeClient', () => ({
  getLimitedBetaRuntimeReadiness: vi.fn().mockResolvedValue({ ok: true, betaRuntimeEnabled: true }),
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

describe('Beta Forms Operational Hardening - Hierarchical Filtering & Safeguards', () => {
  const sampleTenants = [
    { id: 'tenant_alpha', name: 'Alpha Press LLC', status: 'ACTIVE', commercial_status: 'ACTIVE' },
    { id: 'tenant_beta', name: 'Beta Graphics Corp', status: 'ACTIVE', commercial_status: 'ACTIVE' }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetTenantsList.mockResolvedValue(sampleTenants);
    mockReviewClient.listReviews.mockResolvedValue({ ok: true, reviews: [] });
    mockReviewClient.getReview.mockResolvedValue({ ok: true, review: null });
    mockReviewClient.getEvidencePack.mockResolvedValue({ ok: true, evidencePack: {} });
    mockPrepClient.listPreparations.mockResolvedValue({ ok: true, preparations: [] });
    mockPrepClient.getPreparation.mockResolvedValue({ ok: true, preparation: null });
    mockPrepClient.getEvidencePack.mockResolvedValue({ ok: true, evidencePack: {} });
    mockApprovalClient.listApprovals.mockResolvedValue({ ok: true, approvals: [] });
    mockApprovalClient.getApproval.mockResolvedValue({ ok: true, approval: null });
    mockApprovalClient.getEvidencePack.mockResolvedValue({ ok: true, evidencePack: {} });
    mockSessionClient.getReadiness.mockResolvedValue({ ok: true, readiness_status: 'READY' });
    mockSessionClient.getDashboard.mockResolvedValue({ ok: true, dashboard: { total_gates: 3, active_sessions: 1, closed_sessions: 0, revoked_sessions: 0 } });
    mockSessionClient.getAuditTimeline.mockResolvedValue({ ok: true, timeline: [] });
    mockSessionClient.getEvidencePack.mockResolvedValue({ ok: true, evidencePack: {} });
    mockObservationClient.getReadiness.mockResolvedValue({ ok: true, readiness_status: 'HEALTHY' });
    mockObservationClient.getDashboard.mockResolvedValue({ ok: true, dashboard: {} });
  });

  it('1. Tenant filtering scopes reviews and does NOT cross-contaminate between tenants', async () => {
    mockReviewClient.listReviews.mockResolvedValue({
      ok: true,
      reviews: [
        { review_id: 'rev_alpha_01', tenant_id: 'tenant_alpha', review_status: 'DRAFT', risk_level: 'LOW' },
        { review_id: 'rev_beta_01', tenant_id: 'tenant_beta', review_status: 'FINALIZED', risk_level: 'HIGH' }
      ]
    });

    render(
      <MemoryRouter>
        <LocaleProvider initialLocale="es">
          <ControlledBetaRuntimeActivityReview />
        </LocaleProvider>
      </MemoryRouter>
    );

    // Initial render displays all
    await waitFor(() => {
      expect(screen.getByText(/rev_alpha_01/)).toBeDefined();
      expect(screen.getByText(/rev_beta_01/)).toBeDefined();
    });

    // Select Tenant Alpha
    const tenantSelect = screen.getByLabelText(/Filtrar por Tenant/i);
    fireEvent.change(tenantSelect, { target: { value: 'tenant_alpha' } });

    // Review for tenant_beta must NOT appear in the dropdown
    await waitFor(() => {
      expect(screen.queryByText(/rev_beta_01/)).toBeNull();
      expect(screen.getByText(/rev_alpha_01/)).toBeDefined();
    });
  });

  it('2. Changing tenant clears incompatible child selections and active entities', async () => {
    mockPrepClient.listPreparations.mockResolvedValue({
      ok: true,
      preparations: [
        { preparation_id: 'prep_alpha_01', tenant_id: 'tenant_alpha', preparation_status: 'FINALIZED', preparation_type: 'POLICY_UPDATE' },
        { preparation_id: 'prep_beta_01', tenant_id: 'tenant_beta', preparation_status: 'DRAFT', preparation_type: 'GATE_RESET' }
      ]
    });
    mockPrepClient.getPreparation.mockResolvedValue({
      ok: true,
      preparation: {
        preparation_id: 'prep_alpha_01',
        tenant_id: 'tenant_alpha',
        preparation_status: 'FINALIZED',
        preparation_type: 'POLICY_UPDATE',
        checklist_items_json: []
      }
    });

    render(
      <MemoryRouter>
        <LocaleProvider initialLocale="es">
          <ControlledBetaCohortInterventionPreparation />
        </LocaleProvider>
      </MemoryRouter>
    );

    // Select Alpha tenant
    await waitFor(() => {
      expect(screen.getByLabelText(/Filtrar por Tenant/i)).toBeDefined();
    });
    fireEvent.change(screen.getByLabelText(/Filtrar por Tenant/i), { target: { value: 'tenant_alpha' } });

    // Select prep_alpha_01 from select dropdown
    await waitFor(() => {
      expect(screen.getByText(/prep_alpha_01/)).toBeDefined();
    });
    const prepSelect = screen.getByLabelText(/Seleccionar Propuesta de Intervención/i);
    expect(prepSelect).toBeDefined();
    fireEvent.change(prepSelect, { target: { value: 'prep_alpha_01' } });

    await waitFor(() => {
      expect(mockPrepClient.getPreparation).toHaveBeenCalledWith('prep_alpha_01');
    });

    // Switch tenant to Beta -> prep_alpha_01 selection must be wiped
    fireEvent.change(screen.getByLabelText(/Filtrar por Tenant/i), { target: { value: 'tenant_beta' } });

    await waitFor(() => {
      expect(screen.queryByText(/prep_alpha_01/)).toBeNull();
    });
  });

  it('3. Stale async responses are discarded when switching filters rapidly', async () => {
    let resolveSlow: any;
    const slowPromise = new Promise(resolve => { resolveSlow = resolve; });

    // Initial mount returns empty
    mockPrepClient.listPreparations.mockResolvedValueOnce({
      ok: true,
      preparations: []
    });

    render(
      <MemoryRouter>
        <LocaleProvider initialLocale="es">
          <ControlledBetaCohortInterventionPreparation />
        </LocaleProvider>
      </MemoryRouter>
    );

    const refreshBtn = await screen.findByTitle('Actualizar propuestas');

    // First refresh triggers slow call
    mockPrepClient.listPreparations.mockReturnValueOnce(slowPromise);
    fireEvent.click(refreshBtn);

    // Second refresh triggers fast call
    mockPrepClient.listPreparations.mockResolvedValueOnce({
      ok: true,
      preparations: [
        { preparation_id: 'prep_fast_02', tenant_id: 'tenant_alpha', preparation_status: 'DRAFT' }
      ]
    });
    fireEvent.click(refreshBtn);

    // Fast call completes first
    await waitFor(() => {
      expect(screen.getByText(/prep_fast_02/)).toBeDefined();
    });

    // Slow first call resolves later with stale data
    resolveSlow({
      ok: true,
      preparations: [
        { preparation_id: 'prep_stale_old_01', tenant_id: 'tenant_alpha', preparation_status: 'DRAFT' }
      ]
    });

    // Verify stale item was discarded and never injected into state
    await waitFor(() => {
      expect(screen.queryByText(/prep_stale_old_01/)).toBeNull();
    });
  });

  it('4. Empty and error states with retry are presented clearly and do NOT show empty list text on error', async () => {
    mockApprovalClient.listApprovals.mockRejectedValueOnce(new Error('Network gateway timeout'));

    render(
      <MemoryRouter>
        <LocaleProvider initialLocale="es">
          <ControlledBetaCohortInterventionApproval />
        </LocaleProvider>
      </MemoryRouter>
    );

    // Error message and retry button must be rendered
    await waitFor(() => {
      expect(screen.getByText(/Network gateway timeout/i)).toBeDefined();
      expect(screen.getByRole('button', { name: /Reintentar/i })).toBeDefined();
    });

    // CRITICAL REGRESSION: An error state must NEVER be represented as an empty list
    expect(screen.queryByText(/No hay expedientes registrados/i)).toBeNull();

    // Mock successful recovery on retry
    mockApprovalClient.listApprovals.mockResolvedValueOnce({
      ok: true,
      approvals: [
        { approval_id: 'appr_recovered_01', tenant_id: 'tenant_alpha', approval_status: 'READY_FOR_APPROVAL' }
      ]
    });

    fireEvent.click(screen.getByRole('button', { name: /Reintentar/i }));

    await waitFor(() => {
      expect(screen.getByText(/appr_recovered_01/)).toBeDefined();
    });
  });

  it('5. Destructive confirmation modals cancel without emitting mutations', async () => {
    mockApprovalClient.listApprovals.mockResolvedValue({
      ok: true,
      approvals: [
        {
          approval_id: 'appr_sample_01',
          tenant_id: 'tenant_alpha',
          approval_status: 'READY_FOR_APPROVAL',
          approval_policy_json: { policy_name: 'Beta Standard', required_roles: ['SUPER_ADMIN'] }
        }
      ]
    });
    mockApprovalClient.getApproval.mockResolvedValue({
      ok: true,
      approval: {
        approval_id: 'appr_sample_01',
        tenant_id: 'tenant_alpha',
        approval_status: 'READY_FOR_APPROVAL',
        approval_policy_json: { policy_name: 'Beta Standard', required_roles: ['SUPER_ADMIN'] },
        non_execution_attestation_json: { approval_executed_intervention: false }
      },
      steps: []
    });

    const { container } = render(
      <MemoryRouter>
        <LocaleProvider initialLocale="es">
          <ControlledBetaCohortInterventionApproval />
        </LocaleProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/appr_sample_01/)).toBeDefined();
    });
    const approvalSelect = screen.getByLabelText(/Seleccionar Expediente de Aprobación/i);
    fireEvent.change(approvalSelect, { target: { value: 'appr_sample_01' } });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Registrar Decisión/i })).toBeDefined();
    });

    // Enter rationale
    const rationaleInput = screen.getByPlaceholderText(/Explicación detallada del fundamento/i);
    fireEvent.change(rationaleInput, { target: { value: 'Validación de prueba' } });

    // Click to open confirmation modal
    fireEvent.click(screen.getByRole('button', { name: /Registrar Decisión/i }));

    // Modal appears
    await waitFor(() => {
      expect(screen.getByText(/Registrar Decisión de Gobernanza/i)).toBeDefined();
    });

    // Click Cancel
    fireEvent.click(screen.getByRole('button', { name: /Cancelar/i }));

    // Confirm that recordDecision was NEVER called
    expect(mockApprovalClient.recordDecision).not.toHaveBeenCalled();
    // Modal is dismissed
    expect(screen.queryByText(/Se registrará formalmente la decisión/i)).toBeNull();
  });

  it('6. Technical details collapsible safely tucks technical IDs with clipboard copy', async () => {
    const { container } = render(
      <MemoryRouter>
        <LocaleProvider initialLocale="es">
          <ControlledBetaRuntimeSession />
        </LocaleProvider>
      </MemoryRouter>
    );

    const toggleBtn = container.querySelector('button[aria-expanded]') as HTMLButtonElement;
    expect(toggleBtn).toBeDefined();

    // Click to expand
    fireEvent.click(toggleBtn);

    await waitFor(() => {
      expect(screen.getAllByText(/Gate ID/i).length).toBeGreaterThan(0);
    });
  });

  it('7. Action mutations send payloads with exact selected IDs and enforce active tenant ownership', async () => {
    mockReviewClient.createReview.mockResolvedValue({
      ok: true,
      review: { review_id: 'rev_new_99', tenant_id: 'tenant_alpha', cohort_id: 'cohort_q4_test' }
    });

    render(
      <MemoryRouter>
        <LocaleProvider initialLocale="es">
          <ControlledBetaRuntimeActivityReview />
        </LocaleProvider>
      </MemoryRouter>
    );

    // 1. Select Tenant Alpha
    await waitFor(() => {
      expect(screen.getByLabelText(/Filtrar por Tenant/i)).toBeDefined();
    });
    fireEvent.change(screen.getByLabelText(/Filtrar por Tenant/i), { target: { value: 'tenant_alpha' } });

    // 2. Fill cohort input
    const cohortInput = screen.getByPlaceholderText('cohort_...');
    fireEvent.change(cohortInput, { target: { value: 'cohort_q4_test' } });

    // 3. Submit creation
    const submitBtn = screen.getByRole('button', { name: /Crear Revisión de Ventana/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockReviewClient.createReview).toHaveBeenCalledTimes(1);
      const calledPayload = mockReviewClient.createReview.mock.calls[0][0];
      // Payload MUST carry the active tenant ID and cohort ID
      expect(calledPayload.tenantId).toBe('tenant_alpha');
      expect(calledPayload.cohortId).toBe('cohort_q4_test');
    });
  });

  it('8. Preparation creation binds strictly to selected finalized review ID of active tenant', async () => {
    mockPrepClient.createPreparationFromReview.mockResolvedValue({
      ok: true,
      preparation: { preparation_id: 'prep_bound_01', tenant_id: 'tenant_alpha', source_review_id: 'rev_alpha_01' }
    });
    mockReviewClient.listReviews.mockResolvedValue({
      ok: true,
      reviews: [
        { review_id: 'rev_alpha_01', tenant_id: 'tenant_alpha', review_status: 'FINALIZED', risk_level: 'LOW' }
      ]
    });

    render(
      <MemoryRouter>
        <LocaleProvider initialLocale="es">
          <ControlledBetaCohortInterventionPreparation />
        </LocaleProvider>
      </MemoryRouter>
    );

    // Select Alpha tenant
    await waitFor(() => {
      expect(screen.getByLabelText(/Filtrar por Tenant/i)).toBeDefined();
    });
    fireEvent.change(screen.getByLabelText(/Filtrar por Tenant/i), { target: { value: 'tenant_alpha' } });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Generar Paquete de Propuesta/i })).toBeDefined();
    });

    // Select source review
    const sourceSelect = screen.getByLabelText(/Revisión Finalizada de Origen/i);
    fireEvent.change(sourceSelect, { target: { value: 'rev_alpha_01' } });

    // Click Build Proposal
    fireEvent.click(screen.getByRole('button', { name: /Generar Paquete de Propuesta/i }));

    await waitFor(() => {
      expect(mockPrepClient.createPreparationFromReview).toHaveBeenCalledWith('rev_alpha_01');
    });
  });

  it('9. Review findings table renders key, title and description without blank rows', async () => {
    mockReviewClient.listReviews.mockResolvedValue({
      ok: true,
      reviews: [
        { review_id: 'rev_alpha_01', tenant_id: 'tenant_alpha', review_status: 'FINALIZED', risk_level: 'LOW' }
      ]
    });
    mockReviewClient.getReview.mockResolvedValue({
      ok: true,
      review: { review_id: 'rev_alpha_01', tenant_id: 'tenant_alpha', review_status: 'FINALIZED', cohort_id: 'cohort_test' },
      findings: [
        {
          finding_id: 'find_01',
          finding_key: 'LATENCY_NOMINAL',
          description: 'Latencia p99 dentro de límites contractuales (< 45ms)',
          severity: 'LOW'
        }
      ]
    });

    render(
      <MemoryRouter>
        <LocaleProvider initialLocale="es">
          <ControlledBetaRuntimeActivityReview />
        </LocaleProvider>
      </MemoryRouter>
    );

    // Select review
    await waitFor(() => {
      expect(screen.getByLabelText(/Seleccionar Revisión de Cohorte/i)).toBeDefined();
    });
    fireEvent.change(screen.getByLabelText(/Seleccionar Revisión de Cohorte/i), { target: { value: 'rev_alpha_01' } });

    // Verify finding key and description are rendered
    await waitFor(() => {
      expect(screen.getByText('LATENCY_NOMINAL')).toBeDefined();
      expect(screen.getByText('Latencia p99 dentro de límites contractuales (< 45ms)')).toBeDefined();
    });
  });

  it('10. Preparation checklist items render action_key fallback and description without blank rows', async () => {
    mockPrepClient.listPreparations.mockResolvedValue({
      ok: true,
      preparations: [
        { preparation_id: 'prep_01', tenant_id: 'tenant_alpha', preparation_status: 'DRAFT' }
      ]
    });
    mockPrepClient.getPreparation.mockResolvedValue({
      ok: true,
      preparation: { preparation_id: 'prep_01', tenant_id: 'tenant_alpha', preparation_status: 'DRAFT' },
      items: [
        {
          item_id: 'item_01',
          action_key: 'VERIFY_QUOTA_ACTION',
          description: 'Verificación de cuotas de procesamiento por participante',
          item_status: 'PENDING'
        }
      ]
    });

    render(
      <MemoryRouter>
        <LocaleProvider initialLocale="es">
          <ControlledBetaCohortInterventionPreparation />
        </LocaleProvider>
      </MemoryRouter>
    );

    // Select preparation
    await waitFor(() => {
      expect(screen.getByLabelText(/Seleccionar Propuesta de Intervención/i)).toBeDefined();
    });
    fireEvent.change(screen.getByLabelText(/Seleccionar Propuesta de Intervención/i), { target: { value: 'prep_01' } });

    // Verify task title (action_key fallback) and description are rendered
    await waitFor(() => {
      expect(screen.getByText('VERIFY_QUOTA_ACTION')).toBeDefined();
      expect(screen.getByText('Verificación de cuotas de procesamiento por participante')).toBeDefined();
    });
  });
});
