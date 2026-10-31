import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { inviteIssuanceClient } from '../../api/controlledBetaInviteIssuanceClient';
import { InviteIssuanceGate, InviteIssuanceBatch, InviteRecord, InviteIssuanceReadiness } from '../../types/controlledBetaInviteIssuance';
import { normalizeUiError } from '../../utils/errorUtils';
import { useLocale } from '../../i18n';
import { TenantSelector } from '../../components/TenantSelector';
import { TechnicalDetailsCollapsible } from '../../components/TechnicalDetailsCollapsible';
import {
  ShieldCheckIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  XCircleIcon,
  ArrowPathIcon,
  EnvelopeIcon,
  NoSymbolIcon,
  CheckBadgeIcon
} from '@heroicons/react/24/outline';

interface ConfirmModalState {
  isOpen: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  isDanger?: boolean;
  action: () => Promise<void> | void;
}

export function ControlledBetaInviteIssuance() {
  const { t } = useLocale();
  const navigate = useNavigate();

  // Context & Entity IDs (unpreloaded for production safety)
  const [gateId, setGateId] = useState('');
  const [batchId, setBatchId] = useState('');
  const [inviteId, setInviteId] = useState('');
  
  // Creation/Form fields
  const [preparationId, setPreparationId] = useState('');
  const [evidencePackId, setEvidencePackId] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [cohortId, setCohortId] = useState('');
  const [maxInvitesAllowed, setMaxInvitesAllowed] = useState<number | ''>('');
  const [maxInvitesToIssue, setMaxInvitesToIssue] = useState<number | ''>('');
  const [candidateParticipantId, setCandidateParticipantId] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [recipientLabel, setRecipientLabel] = useState('');
  const [reason, setReason] = useState('');

  // Status & Record states
  const [gate, setGate] = useState<InviteIssuanceGate | null>(null);
  const [batch, setBatch] = useState<InviteIssuanceBatch | null>(null);
  const [readiness, setReadiness] = useState<InviteIssuanceReadiness | null>(null);
  const [auditLog, setAuditLog] = useState<any[]>([]);
  const [evidencePack, setEvidencePack] = useState<any | null>(null);
  const [dashboard, setDashboard] = useState<any | null>(null);

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [fetchError, setFetchError] = useState('');
  const [fetchStatus, setFetchStatus] = useState<number | null>(null);
  const [lastAction, setLastAction] = useState<(() => Promise<any>) | null>(null);

  // Confirmation modal
  const [confirmModal, setConfirmModal] = useState<ConfirmModalState | null>(null);

  const refreshState = useCallback(async (currentGateId = gateId) => {
    if (!currentGateId.trim()) return;
    try {
      const readRes = await inviteIssuanceClient.getReadiness(currentGateId);
      if (readRes && (readRes as any).ok === false) {
        setFetchStatus((readRes as any).status || 500);
        setFetchError(normalizeUiError((readRes as any).error, 'Error al consultar estado de emisión.'));
        return;
      }
      setReadiness(readRes);
      
      const audRes = await inviteIssuanceClient.getAuditTimeline(currentGateId);
      if (audRes.ok) setAuditLog(audRes.timeline || []);

      const evRes = await inviteIssuanceClient.getEvidencePack(currentGateId);
      if (evRes.ok) setEvidencePack(evRes.evidencePack || null);

      const dashRes = await inviteIssuanceClient.getDashboard();
      if (dashRes.ok) setDashboard(dashRes.dashboard || null);
    } catch (e: any) {
      setFetchStatus(500);
      setFetchError(normalizeUiError(e, 'Error al actualizar estado de emisión.'));
    }
  }, [gateId]);

  const runAction = async (label: string, actionFn: () => Promise<any>) => {
    setLoading(true);
    setMessage('');
    setFetchError('');
    setFetchStatus(null);
    setLastAction(() => () => runAction(label, actionFn));
    try {
      const res = await actionFn();
      if (res && res.ok) {
        setMessage(`${label}: ${t('common.completed') || 'Operación completada con éxito.'}`);
      } else {
        const status = res?.status || 500;
        setFetchStatus(status);
        const fallback = status === 401
          ? (t('beta.cohort.loginRequired') || 'Sesión ausente o expirada. Por favor, inicie sesión.')
          : status === 403
          ? 'No tiene permisos suficientes para realizar esta acción.'
          : `${label} falló`;
        setFetchError(normalizeUiError(res?.error || res?.reason, fallback));
      }
      await refreshState();
      return res;
    } catch (e: any) {
      setFetchStatus(500);
      setFetchError(normalizeUiError(e, `Error de conexión en ${label}`));
      return null;
    } finally {
      setLoading(false);
    }
  };

  const handleCreateGate = async () => {
    if (!tenantId.trim() || !cohortId.trim()) {
      setFetchError('Tenant ID y Cohort ID son requeridos para crear el Gate.');
      return;
    }
    const res = await runAction('Crear Gate de Emisión', () => inviteIssuanceClient.createGate({
      issuance_gate_id: gateId || undefined,
      preparation_id: preparationId,
      phase132_evidence_pack_id: evidencePackId,
      tenant_id: tenantId,
      cohort_id: cohortId,
      max_invites_allowed: Number(maxInvitesAllowed) || 0,
      max_invites_to_issue: Number(maxInvitesToIssue) || 0
    }));
    if (res?.ok && res.gate) {
      setGate(res.gate);
      setGateId(res.gate.issuance_gate_id);
      await refreshState(res.gate.issuance_gate_id);
    }
  };

  const handleBindPrep = () => {
    if (!gateId.trim() || !preparationId.trim() || !evidencePackId.trim()) return;
    return runAction('Vincular Preparación', () => inviteIssuanceClient.bindPreparation(gateId, preparationId, evidencePackId));
  };

  const handleCreateBatch = async () => {
    if (!gateId.trim()) return;
    const res = await runAction('Crear Lote de Emisión', () => inviteIssuanceClient.createBatch(gateId, {
      issuance_batch_id: batchId || undefined,
      preparation_id: preparationId,
      tenant_id: tenantId,
      cohort_id: cohortId,
      requested_invite_count: Number(maxInvitesToIssue) || 0
    }));
    if (res?.ok && res.batch) {
      setBatch(res.batch);
      setBatchId(res.batch.issuance_batch_id);
    }
  };

  const handleAddRecipient = () => {
    if (!batchId.trim() || !candidateParticipantId.trim() || !recipientEmail.trim()) {
      setFetchError('Batch ID, Candidate ID y Correo son obligatorios.');
      return;
    }
    return runAction('Agregar Destinatario', () => inviteIssuanceClient.addRecipient(batchId, {
      candidate_participant_id: candidateParticipantId,
      recipient_email: recipientEmail,
      recipient_label: recipientLabel,
      tenant_id: tenantId,
      cohort_id: cohortId
    }));
  };

  const handleValidateBatch = () => {
    if (!batchId.trim()) return;
    return runAction('Validar Lote', () => inviteIssuanceClient.validateBatch(batchId));
  };

  const handleRunGuardrails = () => {
    if (!gateId.trim()) return;
    return runAction('Ejecutar Guardrails', () => inviteIssuanceClient.runGuardrails(gateId));
  };

  const handleSubmit = () => {
    if (!gateId.trim()) return;
    return runAction('Enviar para Aprobación', () => inviteIssuanceClient.submitForApproval(gateId));
  };

  // Governed Access Actions requiring explicit confirmation
  const requestApprove = () => {
    if (!gateId.trim()) return;
    setConfirmModal({
      isOpen: true,
      title: 'Aprobar Gate de Emisión',
      description: `Está a punto de aprobar formalmente el Gate ${gateId}. Esto permitirá la posterior emisión efectiva de invitaciones en lote.`,
      confirmLabel: 'Aprobar Gate',
      action: async () => {
        setConfirmModal(null);
        await runAction('Aprobar Gate', () => inviteIssuanceClient.approve(gateId));
      }
    });
  };

  const requestReject = () => {
    if (!gateId.trim()) return;
    setConfirmModal({
      isOpen: true,
      title: 'Rechazar Gate de Emisión',
      description: `El Gate ${gateId} será rechazado. Motivo: "${reason || 'No especificado'}".`,
      confirmLabel: 'Rechazar Gate',
      isDanger: true,
      action: async () => {
        setConfirmModal(null);
        await runAction('Rechazar Gate', () => inviteIssuanceClient.reject(gateId, reason));
      }
    });
  };

  const requestBlock = () => {
    if (!gateId.trim()) return;
    setConfirmModal({
      isOpen: true,
      title: 'Bloquear Gate de Emisión',
      description: `El Gate ${gateId} quedará bloqueado preventivamente. Motivo: "${reason || 'Seguridad operativa'}".`,
      confirmLabel: 'Bloquear Gate',
      isDanger: true,
      action: async () => {
        setConfirmModal(null);
        await runAction('Bloquear Gate', () => inviteIssuanceClient.block(gateId, reason));
      }
    });
  };

  const requestIssueBatch = () => {
    if (!batchId.trim() || readiness?.readiness_status !== 'READY') return;
    setConfirmModal({
      isOpen: true,
      title: 'Emitir Lote de Invitaciones',
      description: `Se emitirán invitaciones formales para todos los destinatarios válidos del lote ${batchId}. Esta acción no se puede deshacer de forma automática.`,
      confirmLabel: 'Emitir Invitaciones',
      action: async () => {
        setConfirmModal(null);
        await runAction('Emitir Lote Aprobado', () => inviteIssuanceClient.issueBatch(batchId));
      }
    });
  };

  const requestRevokeInvite = () => {
    if (!inviteId.trim()) return;
    setConfirmModal({
      isOpen: true,
      title: 'Revocar Invitación Específica',
      description: `La invitación ${inviteId} será invalidada de inmediato. El destinatario no podrá canjearla. Motivo: "${reason || 'Revocación administrativa'}".`,
      confirmLabel: 'Revocar Invitación',
      isDanger: true,
      action: async () => {
        setConfirmModal(null);
        await runAction('Revocar Invitación', () => inviteIssuanceClient.revokeInvite(inviteId, reason));
      }
    });
  };

  const requestRevokeBatch = () => {
    if (!batchId.trim()) return;
    setConfirmModal({
      isOpen: true,
      title: 'Revocar Lote Completo de Invitaciones',
      description: `Todas las invitaciones emitidas en el lote ${batchId} serán revocadas de forma masiva. Motivo: "${reason || 'Revocación por rotación de seguridad'}".`,
      confirmLabel: 'Revocar Lote Completo',
      isDanger: true,
      action: async () => {
        setConfirmModal(null);
        await runAction('Revocar Lote Completo', () => inviteIssuanceClient.revokeBatch(batchId, reason));
      }
    });
  };

  useEffect(() => {
    if (gateId) {
      refreshState();
    }
  }, [gateId, refreshState]);

  return (
    <div className="space-y-6">
      {/* Required Safety Warning Banner */}
      <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-start gap-3">
        <ExclamationTriangleIcon className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <h4 className="text-xs font-black uppercase tracking-wider text-amber-600 dark:text-amber-400">
            ⚠️ {t('beta.cohort.inviteSafetyTitle') || 'Controlled invite issuance only.'}
          </h4>
          <p className="text-xs text-slate-700 dark:text-zinc-300 leading-relaxed">
            {t('beta.cohort.inviteSafetyDesc') || 'This is not public beta, not open marketplace, and not automatic expansion. Execution of invite issuance is gated under strict approved preparation and hard limits.'}
          </p>
        </div>
      </div>

      {/* HTTP Error Banner (401 / 403 / 500) */}
      {fetchError && (
        <div
          role="alert"
          className={`p-4 rounded-lg border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
            fetchStatus === 401
              ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200'
              : fetchStatus === 403
              ? 'bg-purple-50 dark:bg-purple-950/40 border-purple-300 dark:border-purple-800 text-purple-900 dark:text-purple-200'
              : 'bg-red-50 dark:bg-red-950/40 border-red-300 dark:border-red-800 text-red-900 dark:text-red-200'
          }`}
        >
          <div className="flex items-start gap-3">
            <XCircleIcon className="w-5 h-5 shrink-0 mt-0.5" />
            <div className="text-sm font-medium">{fetchError}</div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {fetchStatus === 401 ? (
              <button
                type="button"
                onClick={() => navigate('/login')}
                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded text-xs font-semibold shadow-sm transition-colors"
              >
                {t('beta.cohort.loginBtn') || 'Iniciar Sesión'}
              </button>
            ) : fetchStatus !== 403 && lastAction ? (
              <button
                type="button"
                onClick={() => lastAction()}
                disabled={loading}
                className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-semibold shadow-sm transition-colors inline-flex items-center gap-1.5"
              >
                <ArrowPathIcon className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                {t('beta.cohort.retryBtn') || 'Reintentar'}
              </button>
            ) : null}
          </div>
        </div>
      )}

      {/* Success Notification */}
      {message && !fetchError && (
        <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 rounded-lg text-sm flex items-center gap-2">
          <CheckCircleIcon className="w-4 h-4 text-emerald-500 shrink-0" />
          <span>{message}</span>
        </div>
      )}

      {/* 3-Section Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Panel 1: Consulta de Estado y Verificación */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-5 min-w-0">
          <div className="border-b border-slate-200 dark:border-slate-800 pb-3">
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <ShieldCheckIcon className="w-5 h-5 text-blue-500 shrink-0" />
              <span className="truncate">{t('beta.cohort.sectionStatus') || 'Consulta de Estado y Verificación'}</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
              Supervisión de readiness, métricas globales de emisión y línea temporal de auditoría.
            </p>
          </div>

          <div className="space-y-3">
            <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300">
              {t('beta.cohort.gateId') || 'Gate ID'}
            </label>
            <div className="flex flex-col sm:flex-row lg:flex-col 2xl:flex-row gap-2 min-w-0">
              <input
                type="text"
                value={gateId}
                onChange={e => setGateId(e.target.value)}
                placeholder="gate_..."
                className="w-full flex-1 min-w-0 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={() => refreshState(gateId)}
                disabled={loading || !gateId.trim()}
                className="w-full sm:w-auto lg:w-full 2xl:w-auto px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded text-xs font-semibold shadow-sm transition-colors flex items-center justify-center gap-1.5 whitespace-normal text-center min-w-0 shrink-0"
              >
                <ArrowPathIcon className={`w-3.5 h-3.5 shrink-0 ${loading ? 'animate-spin' : ''}`} />
                <span>{t('beta.cohort.verifyReadiness') || 'Verificar'}</span>
              </button>
            </div>
          </div>

          {/* Readiness Status Checklist */}
          {readiness ? (
            <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded border border-slate-200 dark:border-slate-700 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-slate-700 dark:text-zinc-300">Readiness Status</span>
                <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                  readiness.readiness_status === 'READY'
                    ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                    : 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
                }`}>
                  {readiness.readiness_status}
                </span>
              </div>
              {readiness.blocked_reasons && readiness.blocked_reasons.length > 0 && (
                <div className="text-[11px] text-red-600 dark:text-red-400">
                  Bloqueos: {readiness.blocked_reasons.join(', ')}
                </div>
              )}
            </div>
          ) : (
            <div className="text-xs text-slate-500 dark:text-zinc-400 italic">
              {t('beta.cohort.noData') || 'Sin datos de verificación cargados.'}
            </div>
          )}

          {/* Dashboard Metrics */}
          {dashboard ? (
            <div className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                {t('beta.cohort.sectionMetrics') || 'Métricas del Panel'}
              </h3>
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="p-2 bg-slate-50 dark:bg-slate-800/60 rounded border border-slate-200 dark:border-slate-700">
                  <div className="text-[10px] text-slate-500 uppercase">Total Gates</div>
                  <div className="text-sm font-bold text-slate-900 dark:text-white">{dashboard.total_gates ?? 0}</div>
                </div>
                <div className="p-2 bg-slate-50 dark:bg-slate-800/60 rounded border border-slate-200 dark:border-slate-700">
                  <div className="text-[10px] text-emerald-600 uppercase">Ready</div>
                  <div className="text-sm font-bold text-emerald-600">{dashboard.ready_gates ?? 0}</div>
                </div>
                <div className="p-2 bg-slate-50 dark:bg-slate-800/60 rounded border border-slate-200 dark:border-slate-700">
                  <div className="text-[10px] text-blue-600 uppercase">Approved</div>
                  <div className="text-sm font-bold text-blue-600">{dashboard.approved_gates ?? 0}</div>
                </div>
                <div className="p-2 bg-slate-50 dark:bg-slate-800/60 rounded border border-slate-200 dark:border-slate-700">
                  <div className="text-[10px] text-rose-600 uppercase">Blocked</div>
                  <div className="text-sm font-bold text-rose-600">{dashboard.blocked_gates ?? 0}</div>
                </div>
              </div>
            </div>
          ) : null}

          {/* Collapsible Technical Diagnostics */}
          <TechnicalDetailsCollapsible
            title="Diagnóstico & Payload de Emisión"
            data={{ gate, batch, readiness, auditEventsCount: auditLog.length }}
            missingEndpointNotice={{
              missingEntity: 'Issuance Gates & Batches',
              requiredEndpointProposal: 'GET /api/admin/beta/invite-issuance/gates',
              fieldNotice: 'La vinculación se realiza mediante entrada manual asistida de identificadores únicos al no disponer de endpoint de listado en el backend.'
            }}
          />
        </div>

        {/* Panel 2: Preparación y Configuración */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-5 min-w-0">
          <div className="border-b border-slate-200 dark:border-slate-800 pb-3">
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <EnvelopeIcon className="w-5 h-5 text-indigo-500" />
              {t('beta.cohort.sectionPrep') || 'Preparación y Configuración'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
              Configuración de Gate, destinatarios candidatos y validación de lote.
            </p>
          </div>

          {/* Tenant Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1.5">
              {t('tenant.label') || 'Tenant Autorizado'}
            </label>
            <TenantSelector
              selectedTenantId={tenantId}
              onSelectTenant={id => setTenantId(id)}
              disabled={loading}
            />
          </div>

          {/* Gate Context Setup */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
              Contexto de Gate y Expediente
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400 mb-1">Cohort ID</label>
                <input
                  type="text"
                  value={cohortId}
                  onChange={e => setCohortId(e.target.value)}
                  placeholder="cohort_..."
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400 mb-1">Preparation ID</label>
                <input
                  type="text"
                  value={preparationId}
                  onChange={e => setPreparationId(e.target.value)}
                  placeholder="prep_..."
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400 mb-1">Evidence Pack ID</label>
                <input
                  type="text"
                  value={evidencePackId}
                  onChange={e => setEvidencePackId(e.target.value)}
                  placeholder="ev_..."
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-900 dark:text-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-1">
                <div>
                  <label className="block text-[10px] text-slate-500">Límite Máx.</label>
                  <input
                    type="number"
                    value={maxInvitesAllowed}
                    onChange={e => setMaxInvitesAllowed(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="0"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-xs text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-500">A Emitir</label>
                  <input
                    type="number"
                    value={maxInvitesToIssue}
                    onChange={e => setMaxInvitesToIssue(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="0"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-xs text-slate-900 dark:text-white"
                  />
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={handleCreateGate}
                disabled={loading || !tenantId.trim() || !cohortId.trim()}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded text-xs font-medium"
              >
                Crear Gate
              </button>
              <button
                type="button"
                onClick={handleBindPrep}
                disabled={loading || !gateId.trim() || !preparationId.trim()}
                className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 disabled:opacity-50 text-slate-700 dark:text-zinc-300 rounded text-xs font-medium"
              >
                Vincular Prep
              </button>
              <button
                type="button"
                onClick={handleRunGuardrails}
                disabled={loading || !gateId.trim()}
                className="px-2.5 py-1.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded text-xs font-medium"
              >
                Ejecutar Guardrails
              </button>
            </div>
          </div>

          {/* Batch & Recipients Setup */}
          <div className="space-y-2 pt-3 border-t border-slate-200 dark:border-slate-800">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
              Lote y Destinatarios
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400 mb-1">Batch ID</label>
                <input
                  type="text"
                  value={batchId}
                  onChange={e => setBatchId(e.target.value)}
                  placeholder="batch_..."
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400 mb-1">Candidate Participant ID</label>
                <input
                  type="text"
                  value={candidateParticipantId}
                  onChange={e => setCandidateParticipantId(e.target.value)}
                  placeholder="cand_part_..."
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400 mb-1">Correo Electrónico</label>
                <input
                  type="email"
                  value={recipientEmail}
                  onChange={e => setRecipientEmail(e.target.value)}
                  placeholder="destinatario@dominio.com"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400 mb-1">Etiqueta</label>
                <input
                  type="text"
                  value={recipientLabel}
                  onChange={e => setRecipientLabel(e.target.value)}
                  placeholder="Probador Principal"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-900 dark:text-white"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={handleCreateBatch}
                disabled={loading || !gateId.trim()}
                className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded text-xs font-medium"
              >
                Crear Lote
              </button>
              <button
                type="button"
                onClick={handleAddRecipient}
                disabled={loading || !batchId.trim() || !candidateParticipantId.trim() || !recipientEmail.trim()}
                className="px-2.5 py-1.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white rounded text-xs font-medium"
              >
                Agregar Destinatario
              </button>
              <button
                type="button"
                onClick={handleValidateBatch}
                disabled={loading || !batchId.trim()}
                className="px-2.5 py-1.5 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white rounded text-xs font-medium"
              >
                Validar Lote
              </button>
            </div>
          </div>
        </div>

        {/* Panel 3: Acciones que Modifican Acceso (Gobernanza Crítica) */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-5 min-w-0">
          <div className="border-b border-slate-200 dark:border-slate-800 pb-3">
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <CheckBadgeIcon className="w-5 h-5 text-amber-500 shrink-0" />
              <span className="truncate">{t('beta.cohort.sectionGovernance') || 'Acciones que Modifican Acceso'}</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
              Aprobación de gates, emisión efectiva y revocación de credenciales.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">
              {t('beta.cohort.reasonNotes') || 'Motivo / Justificación'}
            </label>
            <input
              type="text"
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Justificación formal de auditoría..."
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-900 dark:text-white"
            />
          </div>

          {/* Gate Review & Approval */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
              Flujo de Aprobación
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleSubmit}
                disabled={loading || !gateId.trim()}
                className="p-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded text-xs font-semibold shadow-sm"
              >
                Enviar Revisión
              </button>
              <button
                type="button"
                onClick={requestApprove}
                disabled={loading || !gateId.trim()}
                className="p-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded text-xs font-semibold shadow-sm"
              >
                Aprobar Gate
              </button>
              <button
                type="button"
                onClick={requestReject}
                disabled={loading || !gateId.trim()}
                className="p-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded text-xs font-semibold shadow-sm"
              >
                Rechazar Gate
              </button>
              <button
                type="button"
                onClick={requestBlock}
                disabled={loading || !gateId.trim()}
                className="p-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded text-xs font-semibold shadow-sm"
              >
                Bloquear Gate
              </button>
            </div>
          </div>

          {/* Issue Batch */}
          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
              Emisión de Invitaciones en Lote
            </h3>
            <button
              type="button"
              onClick={requestIssueBatch}
              disabled={loading || !batchId.trim() || readiness?.readiness_status !== 'READY'}
              className="w-full py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white rounded text-xs font-bold shadow-sm transition-colors flex items-center justify-center gap-1.5"
            >
              <EnvelopeIcon className="w-4 h-4" />
              Emitir Lote Aprobado
            </button>
          </div>

          {/* Revocation Controls */}
          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400 flex items-center gap-1">
              <NoSymbolIcon className="w-4 h-4 shrink-0" />
              <span>{t('beta.cohort.revocationControls') || 'Controles de Revocación'}</span>
            </h3>
            <div className="flex flex-col sm:flex-row gap-2 min-w-0">
              <input
                type="text"
                value={inviteId}
                onChange={e => setInviteId(e.target.value)}
                placeholder="ID de Invitación (inv_...)"
                className="w-full flex-1 min-w-0 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-900 dark:text-white"
              />
              <button
                type="button"
                onClick={requestRevokeInvite}
                disabled={loading || !inviteId.trim()}
                className="w-full sm:w-auto px-3 py-1.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded text-xs font-semibold shrink-0"
              >
                {t('beta.cohort.revokeBtn') || 'Revocar'}
              </button>
            </div>
            <button
              type="button"
              onClick={requestRevokeBatch}
              disabled={loading || !batchId.trim()}
              className="w-full py-2 px-3 bg-rose-800 hover:bg-rose-900 disabled:opacity-50 text-white rounded text-xs font-semibold transition-colors"
            >
              Revocar Lote Completo
            </button>
          </div>
        </div>

      </div>

      {/* Confirmation Modal (Canceling emits NO HTTP request) */}
      {confirmModal && confirmModal.isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm"
        >
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className={`p-2 rounded-full shrink-0 ${confirmModal.isDanger ? 'bg-red-100 dark:bg-red-950/50 text-red-600' : 'bg-blue-100 dark:bg-blue-950/50 text-blue-600'}`}>
                <ExclamationTriangleIcon className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {confirmModal.title}
                </h3>
                <p className="text-xs text-slate-600 dark:text-zinc-400 leading-relaxed">
                  {confirmModal.description}
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-zinc-300 rounded text-xs font-semibold transition-colors"
              >
                {t('beta.cohort.cancelAction') || 'Cancelar'}
              </button>
              <button
                type="button"
                onClick={() => confirmModal.action()}
                className={`px-4 py-2 text-white rounded text-xs font-semibold shadow-sm transition-colors ${
                  confirmModal.isDanger ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {confirmModal.confirmLabel || (t('beta.cohort.confirmAction') || 'Confirmar Acción')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ControlledBetaInviteIssuance;
