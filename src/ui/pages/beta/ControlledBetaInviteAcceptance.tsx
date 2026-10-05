import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { inviteAcceptanceClient } from '../../api/controlledBetaInviteAcceptanceClient';
import {
  InviteAcceptanceGate,
  InviteAcceptanceClaim,
  OnboardingParticipant,
  TermsAcceptance,
  SessionLimits,
  AccessPolicy,
  InviteAcceptanceReadiness
} from '../../types/controlledBetaInviteAcceptance';
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
  UserIcon,
  KeyIcon,
  LockClosedIcon,
  NoSymbolIcon
} from '@heroicons/react/24/outline';

interface ConfirmModalState {
  isOpen: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  isDanger?: boolean;
  action: () => Promise<void> | void;
}

export function ControlledBetaInviteAcceptance() {
  const { t } = useLocale();
  const navigate = useNavigate();

  // Context & Entity IDs (unpreloaded for production safety)
  const [gateId, setGateId] = useState('');
  const [inviteRecordId, setInviteRecordId] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [cohortId, setCohortId] = useState('');
  
  // Claim fields
  const [claimCode, setClaimCode] = useState('');
  const [claimToken, setClaimToken] = useState('');

  // Identity fields
  const [externalRef, setExternalRef] = useState('');
  const [email, setEmail] = useState('');
  const [label, setLabel] = useState('');

  // Terms fields
  const [termsVersion, setTermsVersion] = useState('');
  const [termsHash, setTermsHash] = useState('');
  const [acceptedBy, setAcceptedBy] = useState('');

  // Session Limits fields
  const [maxSessions, setMaxSessions] = useState<number | ''>('');
  const [maxConcurrentSessions, setMaxConcurrentSessions] = useState<number | ''>('');
  const [sessionTtl, setSessionTtl] = useState<number | ''>('');
  const [dailyActionLimit, setDailyActionLimit] = useState<number | ''>('');

  // Access Policy fields
  const [allowedFeatures, setAllowedFeatures] = useState('');
  const [deniedFeatures, setDeniedFeatures] = useState('');

  // Reason
  const [reason, setReason] = useState('');

  // State
  const [gate, setGate] = useState<InviteAcceptanceGate | null>(null);
  const [readiness, setReadiness] = useState<InviteAcceptanceReadiness | null>(null);
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
      const readRes = await inviteAcceptanceClient.getReadiness(currentGateId);
      if (readRes && (readRes as any).ok === false) {
        setFetchStatus((readRes as any).status || 500);
        setFetchError(normalizeUiError((readRes as any).error, 'Error al consultar estado de onboarding.'));
        return;
      }
      setReadiness(readRes);
      
      const audRes = await inviteAcceptanceClient.getAuditTimeline(currentGateId);
      if (audRes.ok) setAuditLog(audRes.timeline || []);

      const evRes = await inviteAcceptanceClient.getEvidencePack(currentGateId);
      if (evRes.ok) setEvidencePack(evRes.evidencePack || null);

      const dashRes = await inviteAcceptanceClient.getDashboard();
      if (dashRes.ok) setDashboard(dashRes.dashboard || null);
    } catch (e: any) {
      setFetchStatus(500);
      setFetchError(normalizeUiError(e, 'Error al actualizar estado de onboarding.'));
    }
  }, [gateId]);

  const runAction = async (actionLabel: string, actionFn: () => Promise<any>) => {
    setLoading(true);
    setMessage('');
    setFetchError('');
    setFetchStatus(null);
    setLastAction(() => () => runAction(actionLabel, actionFn));
    try {
      const res = await actionFn();
      if (res && res.ok) {
        setMessage(`${actionLabel}: ${t('common.completed') || 'Operación completada con éxito.'}`);
      } else {
        const status = res?.status || 500;
        setFetchStatus(status);
        const fallback = status === 401
          ? (t('beta.cohort.loginRequired') || 'Sesión ausente o expirada. Por favor, inicie sesión.')
          : status === 403
          ? 'No tiene permisos suficientes para realizar esta acción.'
          : `${actionLabel} falló`;
        setFetchError(normalizeUiError(res?.error || res?.reason, fallback));
      }
      await refreshState();
      return res;
    } catch (e: any) {
      setFetchStatus(500);
      setFetchError(normalizeUiError(e, `Error de conexión en ${actionLabel}`));
      return null;
    } finally {
      setLoading(false);
    }
  };

  const handleCreateGate = async () => {
    if (!tenantId.trim() || !cohortId.trim() || !inviteRecordId.trim()) {
      setFetchError('Tenant ID, Cohort ID e Invite Record ID son obligatorios.');
      return;
    }
    const res = await runAction('Crear Gate de Onboarding', () => inviteAcceptanceClient.createGate({
      acceptance_gate_id: gateId || undefined,
      invite_record_id: inviteRecordId,
      tenant_id: tenantId,
      cohort_id: cohortId
    }));
    if (res?.ok && res.gate) {
      setGate(res.gate);
      setGateId(res.gate.acceptance_gate_id);
      await refreshState(res.gate.acceptance_gate_id);
    }
  };

  const handleClaimInvite = () => {
    if (!gateId.trim() || !claimCode.trim() || !claimToken.trim()) {
      setFetchError('Gate ID, Código y Token son obligatorios.');
      return;
    }
    return runAction('Verificar Canje de Invitación', () => inviteAcceptanceClient.claimInvite(gateId, {
      code: claimCode,
      token: claimToken
    }));
  };

  const handleBindIdentity = () => {
    if (!gateId.trim() || !email.trim() || !label.trim()) {
      setFetchError('Correo y Etiqueta son obligatorios.');
      return;
    }
    return runAction('Vincular Identidad de Participante', () => inviteAcceptanceClient.bindIdentity(gateId, {
      externalRef,
      email,
      label
    }));
  };

  const handleAcceptTerms = () => {
    if (!gate?.participant_id) {
      setFetchError('No se pueden aceptar términos: Identidad de participante aún no vinculada.');
      return;
    }
    if (!termsVersion.trim() || !termsHash.trim()) {
      setFetchError('Versión y Hash de Términos son obligatorios.');
      return;
    }
    return runAction('Registrar Aceptación de Términos', () => inviteAcceptanceClient.acceptTerms(gateId, {
      participantId: gate.participant_id!,
      termsVersion,
      termsHash,
      acceptedBy: acceptedBy || 'super_admin',
      method: 'CLICKWRAP'
    }));
  };

  const handleSetSessionLimits = () => {
    if (!gate?.participant_id) {
      setFetchError('No se pueden fijar límites: Identidad de participante no vinculada.');
      return;
    }
    return runAction('Definir Límites de Sesión', () => inviteAcceptanceClient.setSessionLimits(gateId, {
      participantId: gate.participant_id!,
      max_sessions: Number(maxSessions) || 1,
      max_concurrent_sessions: Number(maxConcurrentSessions) || 1,
      session_ttl_minutes: Number(sessionTtl) || 60,
      daily_action_limit: Number(dailyActionLimit) || 100
    }));
  };

  const handleSetAccessPolicy = () => {
    if (!gate?.participant_id) {
      setFetchError('No se puede fijar política: Identidad de participante no vinculada.');
      return;
    }
    const allowed = allowedFeatures.split(',').map(s => s.trim()).filter(Boolean);
    const denied = deniedFeatures.split(',').map(s => s.trim()).filter(Boolean);
    return runAction('Definir Política de Acceso', () => inviteAcceptanceClient.setAccessPolicy(gateId, {
      participantId: gate.participant_id!,
      policy_status: 'DEFINED',
      allowed_features_json: allowed,
      denied_features_json: denied
    }));
  };

  const handleRunGuardrails = () => {
    if (!gateId.trim()) return;
    return runAction('Ejecutar Guardrails', () => inviteAcceptanceClient.runGuardrails(gateId));
  };

  const handleSubmit = () => {
    if (!gateId.trim()) return;
    return runAction('Enviar Onboarding a Aprobación', () => inviteAcceptanceClient.submitForApproval(gateId));
  };

  // Governed Access Actions requiring explicit confirmation
  const requestApprove = () => {
    if (!gateId.trim()) return;
    setConfirmModal({
      isOpen: true,
      title: 'Aprobar Onboarding de Participante',
      description: `Se aprobará el expediente de onboarding del participante en el Gate ${gateId}. Cumplidas las salvaguardas, podrá concederse el acceso a runtime.`,
      confirmLabel: 'Aprobar Onboarding',
      action: async () => {
        setConfirmModal(null);
        await runAction('Aprobar Onboarding', () => inviteAcceptanceClient.approve(gateId));
      }
    });
  };

  const requestReject = () => {
    if (!gateId.trim()) return;
    setConfirmModal({
      isOpen: true,
      title: 'Rechazar Onboarding de Participante',
      description: `El onboarding del participante en ${gateId} será rechazado. Motivo: "${reason || 'No especificado'}".`,
      confirmLabel: 'Rechazar Onboarding',
      isDanger: true,
      action: async () => {
        setConfirmModal(null);
        await runAction('Rechazar Onboarding', () => inviteAcceptanceClient.reject(gateId, reason));
      }
    });
  };

  const requestBlock = () => {
    if (!gateId.trim()) return;
    setConfirmModal({
      isOpen: true,
      title: 'Bloquear Onboarding de Participante',
      description: `El expediente ${gateId} quedará bloqueado por motivos de seguridad o discrepancia de identidad.`,
      confirmLabel: 'Bloquear Onboarding',
      isDanger: true,
      action: async () => {
        setConfirmModal(null);
        await runAction('Bloquear Onboarding', () => inviteAcceptanceClient.block(gateId, reason || 'Bloqueado por SUPER_ADMIN'));
      }
    });
  };

  const requestGrantRuntimeAccess = () => {
    if (!gateId.trim() || readiness?.readiness_status !== 'READY') return;
    setConfirmModal({
      isOpen: true,
      title: 'Conceder Acceso a Runtime Acotado',
      description: `Se concederá acceso activo en tiempo de ejecución al participante vinculado a ${gateId}. El participante podrá interactuar con el entorno Beta dentro de las restricciones autorizadas.`,
      confirmLabel: 'Conceder Acceso a Runtime',
      action: async () => {
        setConfirmModal(null);
        await runAction('Conceder Acceso en Runtime', () => inviteAcceptanceClient.grantRuntimeAccess(gateId));
      }
    });
  };

  const requestRevoke = () => {
    if (!gateId.trim()) return;
    setConfirmModal({
      isOpen: true,
      title: 'Revocar Acceso de Participante',
      description: `Se revocará de inmediato todo acceso a runtime para el participante del expediente ${gateId}. Las sesiones activas expirarán al instante. Motivo: "${reason || 'Revocación administrativa'}".`,
      confirmLabel: 'Revocar Acceso',
      isDanger: true,
      action: async () => {
        setConfirmModal(null);
        await runAction('Revocar Acceso a Runtime', () => inviteAcceptanceClient.revoke(gateId, reason));
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
            ⚠️ Controlled invite acceptance and participant onboarding only.
          </h4>
          <p className="text-xs text-slate-700 dark:text-zinc-300 leading-relaxed">
            This is not public signup, not public beta, and not open marketplace. Runtime access is strictly confined to the approved scope.
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
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-5">
          <div className="border-b border-slate-200 dark:border-slate-800 pb-3">
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <ShieldCheckIcon className="w-5 h-5 text-blue-500" />
              {t('beta.cohort.sectionStatus') || 'Consulta de Estado y Verificación'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
              Verificación de checklist de onboarding, métricas globales y línea temporal.
            </p>
          </div>

          <div className="space-y-3">
            <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300">
              {t('beta.cohort.gateId') || 'Gate ID'}
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={gateId}
                onChange={e => setGateId(e.target.value)}
                placeholder="gate_..."
                className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={() => refreshState(gateId)}
                disabled={loading || !gateId.trim()}
                className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded text-xs font-semibold shadow-sm transition-colors shrink-0 flex items-center gap-1.5"
              >
                <ArrowPathIcon className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                {t('beta.cohort.verifyReadiness') || 'Verificar'}
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

              {readiness.checks && (
                <div className="pt-2 border-t border-slate-200 dark:border-slate-700 space-y-1">
                  {Object.entries(readiness.checks).map(([k, passed]) => (
                    <div key={k} className="flex justify-between items-center text-[11px]">
                      <span className="text-slate-600 dark:text-zinc-400">{k}</span>
                      <span className={`font-bold ${passed ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                        {passed ? '✓ OK' : '✗ PENDIENTE'}
                      </span>
                    </div>
                  ))}
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
            title="Diagnóstico & Payload de Onboarding"
            data={{ gate, readiness, auditEventsCount: auditLog.length }}
            missingEndpointNotice={{
              missingEntity: 'Acceptance Gates',
              requiredEndpointProposal: 'GET /api/admin/beta/invite-acceptance/gates',
              fieldNotice: 'La vinculación se realiza mediante entrada manual asistida de identificadores al no disponer de endpoint de listado en el backend.'
            }}
          />
        </div>

        {/* Panel 2: Preparación y Configuración */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-5">
          <div className="border-b border-slate-200 dark:border-slate-800 pb-3">
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <UserIcon className="w-5 h-5 text-indigo-500" />
              {t('beta.cohort.sectionPrep') || 'Preparación y Configuración'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
              Canje, identidad, términos y política de acceso del participante.
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
              Contexto de Gate
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
                <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400 mb-1">Invite Record ID</label>
                <input
                  type="text"
                  value={inviteRecordId}
                  onChange={e => setInviteRecordId(e.target.value)}
                  placeholder="inv_..."
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-900 dark:text-white"
                />
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={handleCreateGate}
                disabled={loading || !tenantId.trim() || !cohortId.trim() || !inviteRecordId.trim()}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded text-xs font-medium"
              >
                Crear Gate
              </button>
              <button
                type="button"
                onClick={handleRunGuardrails}
                disabled={loading || !gateId.trim()}
                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded text-xs font-medium"
              >
                Guardrails
              </button>
            </div>
          </div>

          {/* Claim & Verification */}
          <div className="space-y-2 pt-3 border-t border-slate-200 dark:border-slate-800">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
              Canje y Verificación de Invitación
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400 mb-1">Código de Invitación</label>
                <input
                  type="password"
                  value={claimCode}
                  onChange={e => setClaimCode(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400 mb-1">Token de Verificación</label>
                <input
                  type="password"
                  value={claimToken}
                  onChange={e => setClaimToken(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-900 dark:text-white"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={handleClaimInvite}
              disabled={loading || !gateId.trim() || !claimCode.trim() || !claimToken.trim()}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded text-xs font-medium"
            >
              Verificar Canje
            </button>
          </div>

          {/* Identity Binding */}
          <div className="space-y-2 pt-3 border-t border-slate-200 dark:border-slate-800">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
              Identidad de Participante
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400 mb-1">Referencia Ext.</label>
                <input
                  type="text"
                  value={externalRef}
                  onChange={e => setExternalRef(e.target.value)}
                  placeholder="ext_..."
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400 mb-1">Correo</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="correo@ejemplo.com"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400 mb-1">Etiqueta</label>
                <input
                  type="text"
                  value={label}
                  onChange={e => setLabel(e.target.value)}
                  placeholder="Nombre de probador"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-900 dark:text-white"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={handleBindIdentity}
              disabled={loading || !gateId.trim() || !email.trim() || !label.trim()}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded text-xs font-medium"
            >
              Vincular Identidad
            </button>
          </div>

          {/* Terms Acceptance */}
          <div className="space-y-2 pt-3 border-t border-slate-200 dark:border-slate-800">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
              Aceptación de Términos y Consentimiento
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400 mb-1">Versión Términos</label>
                <input
                  type="text"
                  value={termsVersion}
                  onChange={e => setTermsVersion(e.target.value)}
                  placeholder="v1.0-beta"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400 mb-1">Hash de Términos</label>
                <input
                  type="text"
                  value={termsHash}
                  onChange={e => setTermsHash(e.target.value)}
                  placeholder="hash_..."
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400 mb-1">Aceptado Por</label>
                <input
                  type="text"
                  value={acceptedBy}
                  onChange={e => setAcceptedBy(e.target.value)}
                  placeholder="Identificador del firmante"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-900 dark:text-white"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={handleAcceptTerms}
              disabled={loading || !gateId.trim() || !termsVersion.trim() || !termsHash.trim()}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded text-xs font-medium"
            >
              Registrar Aceptación de Términos
            </button>
          </div>

          {/* Limits & Access Policy */}
          <div className="space-y-2 pt-3 border-t border-slate-200 dark:border-slate-800">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
              Límites y Política de Acceso
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div>
                <label className="block text-[10px] text-slate-500">Máx. Sesiones</label>
                <input
                  type="number"
                  value={maxSessions}
                  onChange={e => setMaxSessions(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="1"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-xs text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-500">Concurrentes</label>
                <input
                  type="number"
                  value={maxConcurrentSessions}
                  onChange={e => setMaxConcurrentSessions(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="1"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-xs text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-500">TTL (Min)</label>
                <input
                  type="number"
                  value={sessionTtl}
                  onChange={e => setSessionTtl(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="60"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-xs text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-500">Límite Diario</label>
                <input
                  type="number"
                  value={dailyActionLimit}
                  onChange={e => setDailyActionLimit(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="100"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-xs text-slate-900 dark:text-white"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400 mb-1">Permitidas (comas)</label>
                <input
                  type="text"
                  value={allowedFeatures}
                  onChange={e => setAllowedFeatures(e.target.value)}
                  placeholder="feature:read,feature:write"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400 mb-1">Denegadas (comas)</label>
                <input
                  type="text"
                  value={deniedFeatures}
                  onChange={e => setDeniedFeatures(e.target.value)}
                  placeholder="feature:admin"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-900 dark:text-white"
                />
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={handleSetSessionLimits}
                disabled={loading || !gateId.trim()}
                className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 disabled:opacity-50 text-slate-700 dark:text-zinc-300 rounded text-xs font-medium"
              >
                Fijar Límites
              </button>
              <button
                type="button"
                onClick={handleSetAccessPolicy}
                disabled={loading || !gateId.trim()}
                className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 disabled:opacity-50 text-slate-700 dark:text-zinc-300 rounded text-xs font-medium"
              >
                Fijar Política
              </button>
            </div>
          </div>
        </div>

        {/* Panel 3: Acciones que Modifican Acceso (Gobernanza Crítica) */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-5">
          <div className="border-b border-slate-200 dark:border-slate-800 pb-3">
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <KeyIcon className="w-5 h-5 text-amber-500" />
              {t('beta.cohort.sectionGovernance') || 'Acciones que Modifican Acceso'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
              Aprobación formal de onboarding, concesión de runtime y revocaciones.
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

          {/* Onboarding Review & Approval */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
              Aprobación de Onboarding
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleSubmit}
                disabled={loading || !gateId.trim()}
                className="p-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded text-xs font-semibold shadow-sm"
              >
                Enviar a Revisión
              </button>
              <button
                type="button"
                onClick={requestApprove}
                disabled={loading || !gateId.trim()}
                className="p-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded text-xs font-semibold shadow-sm"
              >
                Aprobar Onboarding
              </button>
              <button
                type="button"
                onClick={requestReject}
                disabled={loading || !gateId.trim()}
                className="p-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded text-xs font-semibold shadow-sm"
              >
                Rechazar
              </button>
              <button
                type="button"
                onClick={requestBlock}
                disabled={loading || !gateId.trim()}
                className="p-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded text-xs font-semibold shadow-sm"
              >
                Bloquear
              </button>
            </div>
          </div>

          {/* Grant Runtime Access */}
          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
              Concesión de Acceso en Tiempo de Ejecución
            </h3>
            <button
              type="button"
              onClick={requestGrantRuntimeAccess}
              disabled={loading || !gateId.trim() || readiness?.readiness_status !== 'READY'}
              className="w-full py-2.5 px-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded text-xs font-bold shadow-sm transition-colors flex items-center justify-center gap-1.5"
            >
              <LockClosedIcon className="w-4 h-4" />
              Conceder Acceso a Runtime
            </button>
          </div>

          {/* Revocation Controls */}
          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400 flex items-center gap-1">
              <NoSymbolIcon className="w-4 h-4" />
              Revocación de Acceso
            </h3>
            <button
              type="button"
              onClick={requestRevoke}
              disabled={loading || !gateId.trim()}
              className="w-full py-2.5 px-3 bg-rose-800 hover:bg-rose-900 disabled:opacity-50 text-white rounded text-xs font-bold transition-colors"
            >
              Revocar Acceso a Runtime del Participante
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

export default ControlledBetaInviteAcceptance;
