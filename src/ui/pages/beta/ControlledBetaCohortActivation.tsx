import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getControlledBetaCohortActivationReadiness,
  createControlledCohortActivation,
  bindActivationToGate,
  bindActivationToCohort,
  bindActivationToTenant,
  addActivationParticipant,
  removeActivationParticipant,
  issueActivationInvite,
  revokeActivationInvite,
  defineActivationScope,
  defineSessionLimits,
  activateControlledCohort,
  pauseControlledCohort,
  resumeControlledCohort,
  terminateControlledCohort,
  evaluateParticipantActivationAccess,
  recordActivationMonitoringEvent,
  recordActivationSupportEvent,
  recordActivationIncidentEvent,
  triggerActivationKillSwitch,
  clearActivationKillSwitch,
  recordActivationFinding,
  resolveActivationFinding,
  getControlledActivationEvidencePack,
  getControlledActivationAuditTimeline
} from '../../api/controlledBetaCohortActivationClient';
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
  PlayIcon,
  PauseIcon,
  StopIcon,
  BoltIcon
} from '@heroicons/react/24/outline';

const UI_WARNING =
  'First Controlled Invite-Only Beta Cohort Activation. This does not enable FULL_PUBLIC, open marketplace access, payment execution, refund execution, payout execution, provider external submission, tax/accounting submission, or uncontrolled source mutation.';

interface ConfirmModalState {
  isOpen: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  isDanger?: boolean;
  action: () => Promise<void> | void;
}

export function ControlledBetaCohortActivation() {
  const { t } = useLocale();
  const navigate = useNavigate();

  // Context & Entity IDs (unpreloaded for production safety)
  const [activationId, setActivationId] = useState('');
  const [gateId, setGateId] = useState('');
  const [cohortId, setCohortId] = useState('');
  const [tenantId, setTenantId] = useState('');

  // Preparation inputs
  const [participantId, setParticipantId] = useState('');
  const [inviteId, setInviteId] = useState('');
  const [findingId, setFindingId] = useState('');
  const [allowedFeatures, setAllowedFeatures] = useState('');
  const [maxParticipants, setMaxParticipants] = useState<number | ''>('');
  const [maxSessions, setMaxSessions] = useState<number | ''>('');
  const [maxTotalSessions, setMaxTotalSessions] = useState<number | ''>('');
  const [maxDuration, setMaxDuration] = useState<number | ''>('');
  const [maxActions, setMaxActions] = useState<number | ''>('');

  // Diagnostics & Operations inputs
  const [featureKey, setFeatureKey] = useState('');
  const [eventType, setEventType] = useState('');
  const [ticketDetails, setTicketDetails] = useState('');
  const [incidentType, setIncidentType] = useState('');
  const [incidentSeverity, setIncidentSeverity] = useState('HIGH');
  const [incidentSummary, setIncidentSummary] = useState('');
  const [killSwitchReason, setKillSwitchReason] = useState('');
  const [findingSeverity, setFindingSeverity] = useState('HIGH');
  const [findingSummary, setFindingSummary] = useState('');

  // Status & Async handling
  const [result, setResult] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [fetchError, setFetchError] = useState('');
  const [fetchStatus, setFetchStatus] = useState<number | null>(null);
  const [lastAction, setLastAction] = useState<(() => Promise<any>) | null>(null);

  // Explicit confirmation modal (canceling emits no HTTP request)
  const [confirmModal, setConfirmModal] = useState<ConfirmModalState | null>(null);

  const run = useCallback(async (label: string, fn: () => Promise<any>) => {
    setLoading(true);
    setMessage('');
    setFetchError('');
    setFetchStatus(null);
    setLastAction(() => () => run(label, fn));
    try {
      const r = await fn();
      if (r && r.ok === false) {
        const status = r.status || 500;
        setFetchStatus(status);
        const fallback = status === 401
          ? (t('beta.cohort.loginRequired') || 'Sesión ausente o expirada. Por favor, inicie sesión.')
          : status === 403
          ? 'No tiene permisos suficientes para realizar esta acción.'
          : `Error en ${label}`;
        setFetchError(normalizeUiError(r.error, fallback));
        return null;
      }
      setResult(r as Record<string, any>);
      setMessage(`${label}: ${t('common.completed') || 'Operación completada con éxito.'}`);
      return r;
    } catch (e: unknown) {
      setFetchStatus(500);
      setFetchError(normalizeUiError(e, `Error de conexión en ${label}`));
      return null;
    } finally {
      setLoading(false);
    }
  }, [t]);

  // Context creation & Readiness check
  const handleCreateActivation = useCallback(async () => {
    if (!gateId.trim() || !cohortId.trim()) {
      setFetchError('Gate ID y Cohort ID son requeridos para inicializar el contexto.');
      return;
    }
    const r = await run('Crear Contexto de Activación', () =>
      createControlledCohortActivation({
        gate_id: gateId,
        cohort_id: cohortId,
        tenant_id: tenantId || undefined
      })
    );
    if (r && r.activation) {
      const a = r.activation as Record<string, unknown>;
      if (a.activation_id) setActivationId(String(a.activation_id));
    }
  }, [run, gateId, cohortId, tenantId]);

  const handleCheckReadiness = useCallback(() => {
    return run('Verificar Preparación', () =>
      getControlledBetaCohortActivationReadiness({ activation_id: activationId || undefined })
    );
  }, [run, activationId]);

  const handleBindGate = useCallback(() => {
    if (!activationId.trim() || !gateId.trim()) return;
    return run('Vincular Gate', () => bindActivationToGate({ activation_id: activationId, gate_id: gateId }));
  }, [run, activationId, gateId]);

  const handleBindCohort = useCallback(() => {
    if (!activationId.trim() || !cohortId.trim()) return;
    return run('Vincular Cohorte', () => bindActivationToCohort({ activation_id: activationId, cohort_id: cohortId }));
  }, [run, activationId, cohortId]);

  const handleBindTenant = useCallback(() => {
    if (!activationId.trim() || !tenantId.trim()) return;
    return run('Vincular Tenant', () => bindActivationToTenant({ activation_id: activationId, tenant_id: tenantId }));
  }, [run, activationId, tenantId]);

  const handleAddParticipant = useCallback(() => {
    if (!activationId.trim() || !participantId.trim()) return;
    return run('Registrar Participante', () =>
      addActivationParticipant({
        activation_id: activationId,
        participant_id: participantId,
        approved: true,
        terms_accepted: true,
        role_boundary_defined: true
      })
    );
  }, [run, activationId, participantId]);

  const handleRemoveParticipant = useCallback(() => {
    if (!participantId.trim()) return;
    return run('Eliminar Participante', () => removeActivationParticipant({ participant_id: participantId }));
  }, [run, participantId]);

  const handleIssueInvite = useCallback(async () => {
    if (!activationId.trim() || !participantId.trim()) return;
    const r = await run('Emitir Invitación', () =>
      issueActivationInvite({
        activation_id: activationId,
        participant_id: participantId
      })
    );
    if (r && r.invite) {
      const i = r.invite as Record<string, unknown>;
      if (i.invite_id) setInviteId(String(i.invite_id));
    }
  }, [run, activationId, participantId]);

  const handleRevokeInvite = useCallback(() => {
    if (!inviteId.trim()) return;
    return run('Revocar Invitación', () => revokeActivationInvite({ invite_id: inviteId }));
  }, [run, inviteId]);

  const handleDefineScope = useCallback(() => {
    if (!activationId.trim()) return;
    let featuresArr: string[] = [];
    try {
      if (allowedFeatures.trim()) featuresArr = JSON.parse(allowedFeatures);
    } catch {
      featuresArr = allowedFeatures.split(',').map(s => s.trim()).filter(Boolean);
    }
    return run('Definir Alcance de Características', () =>
      defineActivationScope({
        activation_id: activationId,
        allowed_features_json: featuresArr
      })
    );
  }, [run, activationId, allowedFeatures]);

  const handleDefineLimits = useCallback(() => {
    if (!activationId.trim()) return;
    return run('Definir Límites de Sesión', () =>
      defineSessionLimits({
        activation_id: activationId,
        max_participants: Number(maxParticipants) || 0,
        max_sessions_per_participant: Number(maxSessions) || 0,
        max_total_active_sessions: Number(maxTotalSessions) || 0,
        max_runtime_minutes_per_session: Number(maxDuration) || 0,
        max_actions_per_hour: Number(maxActions) || 0
      })
    );
  }, [run, activationId, maxParticipants, maxSessions, maxTotalSessions, maxDuration, maxActions]);

  const handleEvaluateAccess = useCallback(() => {
    if (!activationId.trim() || !participantId.trim() || !featureKey.trim()) return;
    return run('Evaluar Acceso de Participante', () =>
      evaluateParticipantActivationAccess({
        activation_id: activationId,
        participant_id: participantId,
        feature_key: featureKey
      })
    );
  }, [run, activationId, participantId, featureKey]);

  const handleRecordMonitoring = useCallback(() => {
    if (!activationId.trim() || !eventType.trim()) return;
    return run('Registrar Evento de Telemetría', () =>
      recordActivationMonitoringEvent({
        activation_id: activationId,
        event_type: eventType,
        details: { description: 'Registro manual de telemetría de activación' }
      })
    );
  }, [run, activationId, eventType]);

  const handleRecordSupport = useCallback(() => {
    if (!activationId.trim() || !ticketDetails.trim()) return;
    return run('Registrar Evento de Soporte', () =>
      recordActivationSupportEvent({
        activation_id: activationId,
        ticket_details: ticketDetails
      })
    );
  }, [run, activationId, ticketDetails]);

  const handleRecordIncident = useCallback(() => {
    if (!activationId.trim() || !incidentType.trim() || !incidentSummary.trim()) return;
    return run('Registrar Incidente', () =>
      recordActivationIncidentEvent({
        activation_id: activationId,
        incident_type: incidentType,
        severity: incidentSeverity,
        summary: incidentSummary
      })
    );
  }, [run, activationId, incidentType, incidentSeverity, incidentSummary]);

  const handleRecordFinding = useCallback(async () => {
    if (!activationId.trim() || !findingSummary.trim()) return;
    const r = await run('Registrar Hallazgo', () =>
      recordActivationFinding({
        activation_id: activationId,
        severity: findingSeverity,
        summary: findingSummary,
        blocks_runtime: true
      })
    );
    if (r && r.finding) {
      const f = r.finding as Record<string, unknown>;
      if (f.finding_id) setFindingId(String(f.finding_id));
    }
  }, [run, activationId, findingSeverity, findingSummary]);

  const handleResolveFinding = useCallback(() => {
    if (!findingId.trim()) return;
    return run('Resolver Hallazgo', () => resolveActivationFinding({ finding_id: findingId }));
  }, [run, findingId]);

  const handleGetEvidencePack = useCallback(() => {
    if (!activationId.trim()) return;
    return run('Generar Paquete de Evidencia', () => getControlledActivationEvidencePack({ activation_id: activationId }));
  }, [run, activationId]);

  const handleGetAuditTimeline = useCallback(() => {
    if (!activationId.trim()) return;
    return run('Consultar Línea Temporal de Auditoría', () => getControlledActivationAuditTimeline({ activation_id: activationId }));
  }, [run, activationId]);

  // Governed Access Actions requiring explicit confirmation
  const requestActivateCohort = () => {
    if (!activationId.trim()) return;
    setConfirmModal({
      isOpen: true,
      title: 'Activar Cohorte Controlada',
      description: `Está a punto de activar la cohorte vinculada al expediente ${activationId}. Esta acción habilitará el acceso en tiempo de ejecución acotado a los participantes aprobados.`,
      confirmLabel: 'Confirmar Activación',
      action: async () => {
        setConfirmModal(null);
        await run('Activar Cohorte', () => activateControlledCohort({ activation_id: activationId }));
      }
    });
  };

  const requestPauseCohort = () => {
    if (!activationId.trim()) return;
    setConfirmModal({
      isOpen: true,
      title: 'Pausar Cohorte Controlada',
      description: `Se suspenderá temporalmente el acceso en tiempo de ejecución para la cohorte ${activationId}. Las sesiones existentes serán pausadas.`,
      confirmLabel: 'Pausar Cohorte',
      isDanger: true,
      action: async () => {
        setConfirmModal(null);
        await run('Pausar Cohorte', () => pauseControlledCohort({ activation_id: activationId }));
      }
    });
  };

  const requestResumeCohort = () => {
    if (!activationId.trim()) return;
    setConfirmModal({
      isOpen: true,
      title: 'Reanudar Cohorte Controlada',
      description: `Se restablecerá el acceso en tiempo de ejecución para la cohorte ${activationId}.`,
      confirmLabel: 'Reanudar Cohorte',
      action: async () => {
        setConfirmModal(null);
        await run('Reanudar Cohorte', () => resumeControlledCohort({ activation_id: activationId }));
      }
    });
  };

  const requestTerminateCohort = () => {
    if (!activationId.trim()) return;
    setConfirmModal({
      isOpen: true,
      title: 'Terminar Cohorte Controlada',
      description: `La cohorte ${activationId} quedará terminada permanentemente. Se revocarán todas las credenciales de ejecución activa de forma irreversible.`,
      confirmLabel: 'Terminar Permanentemente',
      isDanger: true,
      action: async () => {
        setConfirmModal(null);
        await run('Terminar Cohorte', () => terminateControlledCohort({ activation_id: activationId }));
      }
    });
  };

  const requestTriggerKillSwitch = () => {
    if (!activationId.trim() || !killSwitchReason.trim()) return;
    setConfirmModal({
      isOpen: true,
      title: 'Disparar Kill Switch de Emergencia',
      description: `Se forzará la desconexión total inmediata de la cohorte ${activationId}. Motivo: "${killSwitchReason}".`,
      confirmLabel: 'Activar Kill Switch',
      isDanger: true,
      action: async () => {
        setConfirmModal(null);
        await run('Disparar Kill Switch', () =>
          triggerActivationKillSwitch({ activation_id: activationId, reason: killSwitchReason })
        );
      }
    });
  };

  const requestClearKillSwitch = () => {
    if (!activationId.trim()) return;
    setConfirmModal({
      isOpen: true,
      title: 'Restablecer Kill Switch',
      description: `Se limpiará el estado de parada de emergencia para la cohorte ${activationId}.`,
      confirmLabel: 'Restablecer',
      action: async () => {
        setConfirmModal(null);
        await run('Limpiar Kill Switch', () => clearActivationKillSwitch({ activation_id: activationId }));
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Safety Warning Banner */}
      <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-start gap-3">
        <ExclamationTriangleIcon className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <h4 className="text-xs font-black uppercase tracking-wider text-amber-600 dark:text-amber-400">
            {t('beta.cohort.activationSafetyNotice') || 'Entorno Beta Controlado — Activación por Invitación'}
          </h4>
          <p className="text-xs text-slate-700 dark:text-zinc-300 leading-relaxed">
            {UI_WARNING}
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
              Verificación de preparación, salvaguardas y paquete de evidencias.
            </p>
          </div>

          <div className="space-y-3">
            <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300">
              {t('beta.cohort.activationId') || 'Identificador de Activación'}
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={activationId}
                onChange={e => setActivationId(e.target.value)}
                placeholder="act_..."
                className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={handleCheckReadiness}
                disabled={loading}
                className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded text-xs font-semibold shadow-sm transition-colors shrink-0 flex items-center gap-1.5"
              >
                <ArrowPathIcon className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                {t('beta.cohort.verifyReadiness') || 'Verificar'}
              </button>
            </div>
          </div>

          {/* Readiness Indicators */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
              {t('beta.cohort.readinessStatus') || 'Estado de Preparación'}
            </h3>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded border border-slate-200 dark:border-slate-700">
                <span className="block text-[10px] text-slate-500 dark:text-zinc-400 uppercase font-semibold">Readiness</span>
                <span className="font-bold text-slate-900 dark:text-white">
                  {result?.readiness_status || result?.readinessStatus || (t('beta.cohort.noData') || 'Sin datos')}
                </span>
              </div>
              <div className="p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded border border-slate-200 dark:border-slate-700">
                <span className="block text-[10px] text-slate-500 dark:text-zinc-400 uppercase font-semibold">Persistence</span>
                <span className="font-bold text-slate-900 dark:text-white">
                  {result?.persistenceStatus || result?.persistence_status || (t('beta.cohort.noData') || 'Sin datos')}
                </span>
              </div>
              <div className="p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded border border-slate-200 dark:border-slate-700">
                <span className="block text-[10px] text-slate-500 dark:text-zinc-400 uppercase font-semibold">Runtime Truth</span>
                <span className="font-bold text-slate-900 dark:text-white">
                  {result?.runtimeTruthStatus || result?.runtime_truth_status || (t('beta.cohort.noData') || 'Sin datos')}
                </span>
              </div>
              <div className="p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded border border-slate-200 dark:border-slate-700">
                <span className="block text-[10px] text-slate-500 dark:text-zinc-400 uppercase font-semibold">Runtime Scope</span>
                <span className={`font-bold ${result?.betaRuntimeEnabled ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-zinc-400'}`}>
                  {result ? (result?.betaRuntimeEnabled ? 'SCOPED_ONLY' : 'NOT_ENABLED') : (t('beta.cohort.noData') || 'Sin datos')}
                </span>
              </div>
            </div>
          </div>

          {/* Audit Actions */}
          <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex flex-col gap-2">
            <button
              type="button"
              onClick={handleGetAuditTimeline}
              disabled={loading || !activationId.trim()}
              className="w-full py-2 px-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 disabled:opacity-50 text-slate-800 dark:text-zinc-200 rounded text-xs font-semibold transition-colors"
            >
              Consultar Línea Temporal de Auditoría
            </button>
            <button
              type="button"
              onClick={handleGetEvidencePack}
              disabled={loading || !activationId.trim()}
              className="w-full py-2 px-3 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white rounded text-xs font-semibold transition-colors"
            >
              Generar Paquete de Evidencia
            </button>
          </div>

          {/* Collapsible Technical Details */}
          <TechnicalDetailsCollapsible
            title="Diagnóstico & Payload de Activación"
            data={result}
            missingEndpointNotice={{
              missingEntity: 'Activations & Gates',
              requiredEndpointProposal: 'GET /api/admin/beta/cohort-activation/readiness?activation_id=...',
              fieldNotice: 'La vinculación se realiza mediante entrada manual asistida de identificadores al no disponer de endpoint de listado en el backend.'
            }}
          />
        </div>

        {/* Panel 2: Preparación y Configuración */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-5">
          <div className="border-b border-slate-200 dark:border-slate-800 pb-3">
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <ArrowPathIcon className="w-5 h-5 text-indigo-500" />
              {t('beta.cohort.sectionPrep') || 'Preparación y Configuración'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
              Vinculación de contexto, participantes, alcances y límites de sesión.
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

          {/* Gate & Cohort Bindings */}
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400 mb-1">Gate ID</label>
                <input
                  type="text"
                  value={gateId}
                  onChange={e => setGateId(e.target.value)}
                  placeholder="gate_..."
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-900 dark:text-white"
                />
              </div>
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
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleCreateActivation}
                disabled={loading || !gateId.trim() || !cohortId.trim()}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded text-xs font-medium transition-colors"
              >
                Crear Contexto
              </button>
              <button
                type="button"
                onClick={handleBindGate}
                disabled={loading || !activationId.trim() || !gateId.trim()}
                className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 disabled:opacity-50 text-slate-700 dark:text-zinc-300 rounded text-xs font-medium"
              >
                Vincular Gate
              </button>
              <button
                type="button"
                onClick={handleBindCohort}
                disabled={loading || !activationId.trim() || !cohortId.trim()}
                className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 disabled:opacity-50 text-slate-700 dark:text-zinc-300 rounded text-xs font-medium"
              >
                Vincular Cohorte
              </button>
              <button
                type="button"
                onClick={handleBindTenant}
                disabled={loading || !activationId.trim() || !tenantId.trim()}
                className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 disabled:opacity-50 text-slate-700 dark:text-zinc-300 rounded text-xs font-medium"
              >
                Vincular Tenant
              </button>
            </div>
          </div>

          {/* Participant & Invites Setup */}
          <div className="space-y-3 pt-3 border-t border-slate-200 dark:border-slate-800">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
              Gobernanza de Participantes e Invitaciones
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400 mb-1">Participant ID</label>
                <input
                  type="text"
                  value={participantId}
                  onChange={e => setParticipantId(e.target.value)}
                  placeholder="part_..."
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400 mb-1">Invite ID</label>
                <input
                  type="text"
                  value={inviteId}
                  onChange={e => setInviteId(e.target.value)}
                  placeholder="inv_..."
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-900 dark:text-white"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleAddParticipant}
                disabled={loading || !activationId.trim() || !participantId.trim()}
                className="px-2.5 py-1.5 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white rounded text-xs font-medium"
              >
                Registrar Participante
              </button>
              <button
                type="button"
                onClick={handleRemoveParticipant}
                disabled={loading || !participantId.trim()}
                className="px-2.5 py-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded text-xs font-medium"
              >
                Eliminar
              </button>
              <button
                type="button"
                onClick={handleIssueInvite}
                disabled={loading || !activationId.trim() || !participantId.trim()}
                className="px-2.5 py-1.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded text-xs font-medium"
              >
                Emitir Invitación
              </button>
              <button
                type="button"
                onClick={handleRevokeInvite}
                disabled={loading || !inviteId.trim()}
                className="px-2.5 py-1.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded text-xs font-medium"
              >
                Revocar
              </button>
            </div>
          </div>

          {/* Scopes & Limits */}
          <div className="space-y-3 pt-3 border-t border-slate-200 dark:border-slate-800">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
              Límites y Alcances Permitidos
            </h3>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400 mb-1">
                Características Permitidas (JSON o lista separada por comas)
              </label>
              <input
                type="text"
                value={allowedFeatures}
                onChange={e => setAllowedFeatures(e.target.value)}
                placeholder='["CUSTOMER_PORTAL_VIEW_ONLY"]'
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-900 dark:text-white"
              />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <div>
                <label className="block text-[11px] text-slate-500">Máx. Participantes</label>
                <input
                  type="number"
                  value={maxParticipants}
                  onChange={e => setMaxParticipants(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="0"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-xs text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500">Sesiones/Part.</label>
                <input
                  type="number"
                  value={maxSessions}
                  onChange={e => setMaxSessions(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="0"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-xs text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500">Total Sesiones</label>
                <input
                  type="number"
                  value={maxTotalSessions}
                  onChange={e => setMaxTotalSessions(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="0"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-xs text-slate-900 dark:text-white"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleDefineScope}
                disabled={loading || !activationId.trim()}
                className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 disabled:opacity-50 text-slate-700 dark:text-zinc-300 rounded text-xs font-medium"
              >
                Fijar Alcance
              </button>
              <button
                type="button"
                onClick={handleDefineLimits}
                disabled={loading || !activationId.trim()}
                className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 disabled:opacity-50 text-slate-700 dark:text-zinc-300 rounded text-xs font-medium"
              >
                Fijar Límites
              </button>
            </div>
          </div>
        </div>

        {/* Panel 3: Acciones que Modifican Acceso (Gobernanza Crítica) */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-5">
          <div className="border-b border-slate-200 dark:border-slate-800 pb-3">
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <BoltIcon className="w-5 h-5 text-amber-500" />
              {t('beta.cohort.sectionGovernance') || 'Acciones que Modifican Acceso'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
              Operaciones de gobernanza estricta. Requieren confirmación explícita.
            </p>
          </div>

          {/* Cohort Lifecycle Actions */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
              Ciclo de Vida de la Cohorte
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={requestActivateCohort}
                disabled={loading || !activationId.trim()}
                className="p-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded text-xs font-bold shadow-sm transition-colors flex items-center justify-center gap-1.5"
              >
                <PlayIcon className="w-4 h-4" />
                Activar Cohorte
              </button>
              <button
                type="button"
                onClick={requestPauseCohort}
                disabled={loading || !activationId.trim()}
                className="p-2.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded text-xs font-bold shadow-sm transition-colors flex items-center justify-center gap-1.5"
              >
                <PauseIcon className="w-4 h-4" />
                Pausar Cohorte
              </button>
              <button
                type="button"
                onClick={requestResumeCohort}
                disabled={loading || !activationId.trim()}
                className="p-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded text-xs font-bold shadow-sm transition-colors flex items-center justify-center gap-1.5"
              >
                <PlayIcon className="w-4 h-4" />
                Reanudar Cohorte
              </button>
              <button
                type="button"
                onClick={requestTerminateCohort}
                disabled={loading || !activationId.trim()}
                className="p-2.5 bg-rose-700 hover:bg-rose-800 disabled:opacity-50 text-white rounded text-xs font-bold shadow-sm transition-colors flex items-center justify-center gap-1.5"
              >
                <StopIcon className="w-4 h-4" />
                Terminar Cohorte
              </button>
            </div>
          </div>

          {/* Emergency Kill Switch */}
          <div className="space-y-3 pt-3 border-t border-slate-200 dark:border-slate-800">
            <h3 className="text-xs font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
              <ExclamationTriangleIcon className="w-4 h-4" />
              Kill Switch de Emergencia
            </h3>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400 mb-1">
                Justificación de Suspensión de Emergencia
              </label>
              <input
                type="text"
                value={killSwitchReason}
                onChange={e => setKillSwitchReason(e.target.value)}
                placeholder="Motivo formal de suspensión inmediata..."
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-900 dark:text-white"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={requestTriggerKillSwitch}
                disabled={loading || !activationId.trim() || !killSwitchReason.trim()}
                className="flex-1 py-2 px-3 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded text-xs font-bold shadow-sm transition-colors"
              >
                Disparar Kill Switch
              </button>
              <button
                type="button"
                onClick={requestClearKillSwitch}
                disabled={loading || !activationId.trim()}
                className="py-2 px-3 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 disabled:opacity-50 text-slate-800 dark:text-zinc-200 rounded text-xs font-semibold"
              >
                Restablecer
              </button>
            </div>
          </div>

          {/* Scoped Finding Registry */}
          <div className="space-y-3 pt-3 border-t border-slate-200 dark:border-slate-800">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
              Registro de Hallazgos Bloqueantes
            </h3>
            <div>
              <input
                type="text"
                value={findingSummary}
                onChange={e => setFindingSummary(e.target.value)}
                placeholder="Descripción del hallazgo de gobernanza..."
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-900 dark:text-white mb-2"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleRecordFinding}
                  disabled={loading || !activationId.trim() || !findingSummary.trim()}
                  className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 disabled:opacity-50 text-white rounded text-xs font-medium"
                >
                  Registrar Hallazgo
                </button>
                <input
                  type="text"
                  value={findingId}
                  onChange={e => setFindingId(e.target.value)}
                  placeholder="ID hallazgo"
                  className="w-24 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-xs text-slate-900 dark:text-white"
                />
                <button
                  type="button"
                  onClick={handleResolveFinding}
                  disabled={loading || !findingId.trim()}
                  className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded text-xs font-medium"
                >
                  Resolver
                </button>
              </div>
            </div>
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

export default ControlledBetaCohortActivation;
