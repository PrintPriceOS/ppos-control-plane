import React, { useState, useCallback, useEffect } from 'react';
import { runtimeSessionClient } from '../../api/controlledBetaRuntimeSessionClient';
import { RuntimeSessionGate, RuntimeSession, RuntimeSessionLimits, RuntimeSessionReadiness } from '../../types/controlledBetaRuntimeSession';
import { useLocale } from '../../i18n';
import { TenantSelector } from '../../components/TenantSelector';
import { TechnicalDetailsCollapsible } from '../../components/TechnicalDetailsCollapsible';
import {
  ShieldCheckIcon,
  ExclamationTriangleIcon,
  LockClosedIcon,
  KeyIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  CommandLineIcon
} from '@heroicons/react/24/outline';

export function ControlledBetaRuntimeSession() {
  const { t } = useLocale();

  const [gateId, setGateId] = useState('');
  const [acceptanceGateId, setAcceptanceGateId] = useState('');
  const [participantId, setParticipantId] = useState('');
  const [tenantId, setTenantId] = useState('tenant_beta_01');
  const [cohortId, setCohortId] = useState('cohort_beta_01');

  // Limit fields
  const [maxSessions, setMaxSessions] = useState(1);
  const [maxConcurrentSessions, setMaxConcurrentSessions] = useState(1);
  const [sessionTtl, setSessionTtl] = useState(60);
  const [dailyActionLimit, setDailyActionLimit] = useState(100);
  const [allowedFeatures, setAllowedFeatures] = useState('feature:read,feature:write');

  // Evaluate features & heartbeats
  const [activeSessionId, setActiveSessionId] = useState('');
  const [evalFeatureKey, setEvalFeatureKey] = useState('feature:read');
  const [evalResult, setEvalResult] = useState<any>(null);

  // Actions reason
  const [reason, setReason] = useState('Acción de gobernanza administrativa');

  // State
  const [gate, setGate] = useState<RuntimeSessionGate | null>(null);
  const [readiness, setReadiness] = useState<RuntimeSessionReadiness | null>(null);
  const [auditLog, setAuditLog] = useState<any[]>([]);
  const [evidencePack, setEvidencePack] = useState<any | null>(null);
  const [dashboard, setDashboard] = useState<any | null>(null);

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Confirmation modal state
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    action: () => void;
  }>({
    isOpen: false,
    title: '',
    description: '',
    action: () => {}
  });

  const refreshState = useCallback(async (currentGateId = gateId) => {
    if (!currentGateId) return;
    try {
      const readRes = await runtimeSessionClient.getReadiness(currentGateId);
      setReadiness(readRes);

      const audRes = await runtimeSessionClient.getAuditTimeline(currentGateId);
      if (audRes.ok) setAuditLog(audRes.timeline);

      const evRes = await runtimeSessionClient.getEvidencePack(currentGateId);
      if (evRes.ok) setEvidencePack(evRes.evidencePack);

      const dashRes = await runtimeSessionClient.getDashboard();
      if (dashRes.ok) setDashboard(dashRes.dashboard);
    } catch (e) {
      console.error(e);
    }
  }, [gateId]);

  const runAction = async (actionLabel: string, actionFn: () => Promise<any>) => {
    setLoading(true);
    setMessage('');
    setErrorMsg('');
    try {
      const res = await actionFn();
      if (res.ok) {
        setMessage(`${actionLabel}: ${t('common.done') || 'Operación completada correctamente.'}`);
      } else {
        setErrorMsg(`${actionLabel} falló: ${res.error || res.reason || 'Error no especificado'}`);
      }
      await refreshState();
      return res;
    } catch (e: any) {
      setErrorMsg(`${actionLabel} error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateGate = async () => {
    const res = await runAction('Crear Gate de Sesión', () => runtimeSessionClient.createGate({
      session_gate_id: gateId || undefined,
      acceptance_gate_id: acceptanceGateId,
      participant_id: participantId,
      tenant_id: tenantId,
      cohort_id: cohortId
    }));
    if (res?.ok && res.gate) {
      setGate(res.gate);
      setGateId(res.gate.session_gate_id);
      await refreshState(res.gate.session_gate_id);
    }
  };

  const handleBindAcceptance = () => {
    return runAction('Vincular Aceptación de Incorporación', () => runtimeSessionClient.bindAcceptance(gateId, acceptanceGateId));
  };

  const handleSetLimits = () => {
    return runAction('Establecer Límites de Sesión', () => runtimeSessionClient.setSessionLimits(gateId, {
      participantId,
      max_sessions: maxSessions,
      max_concurrent_sessions: maxConcurrentSessions,
      session_ttl_minutes: sessionTtl,
      daily_action_limit: dailyActionLimit,
      feature_scope_json: { allowed: allowedFeatures.split(',').map(f => f.trim()) }
    }));
  };

  const handleRunGuardrails = () => {
    return runAction('Verificar Mecanismos de Protección', () => runtimeSessionClient.runGuardrails(gateId));
  };

  const handleSubmit = () => {
    return runAction('Enviar Gate para Aprobación', () => runtimeSessionClient.submitForApproval(gateId));
  };

  const handleApprove = () => {
    return runAction('Aprobar Gate de Sesión', () => runtimeSessionClient.approve(gateId));
  };

  const confirmReject = () => {
    setConfirmModal({
      isOpen: true,
      title: 'Rechazar Gate de Sesión',
      description: `Esta acción rechazará el gate ${gateId}. El participante no podrá inicializar sesiones con este pase. Motivo: "${reason}".`,
      action: () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        runAction('Rechazar Gate', () => runtimeSessionClient.reject(gateId, reason));
      }
    });
  };

  const confirmBlock = () => {
    setConfirmModal({
      isOpen: true,
      title: 'Bloquear Gate de Sesión',
      description: `Esta acción bloqueará de forma preventiva el gate ${gateId}. Motivo: "${reason}".`,
      action: () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        runAction('Bloquear Gate', () => runtimeSessionClient.block(gateId, reason));
      }
    });
  };

  const handleCreateSession = async () => {
    const res = await runAction('Crear Sesión Controlada', () => runtimeSessionClient.createSession(gateId));
    if (res?.ok && res.session) {
      setActiveSessionId(res.session.runtime_session_id);
      setMessage(`Sesión creada con éxito. Token criptográfico protegido.`);
    }
  };

  const handleEvaluateAccess = async () => {
    setLoading(true);
    try {
      const res = await runtimeSessionClient.evaluateFeatureAccess(activeSessionId, { featureKey: evalFeatureKey });
      setEvalResult(res);
      if (res.ok) {
        setMessage('Acceso a característica CONCEDIDO');
      } else {
        setErrorMsg(`Acceso DENEGADO: ${res.access_reason}`);
      }
    } catch (e: any) {
      setErrorMsg(`Error en evaluación: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSendHeartbeat = () => {
    return runAction('Enviar Latido de Conexión', () => runtimeSessionClient.sendHeartbeat(activeSessionId, { ui: true }));
  };

  const handleSendEvent = () => {
    return runAction('Registrar Evento de Sesión', () => runtimeSessionClient.sendEvent(activeSessionId, {
      eventType: 'ACTION_PERFORMED',
      status: 'SUCCESS',
      featureKey: evalFeatureKey,
      details: { page: 'runtime-sessions' }
    }));
  };

  const handleCloseSession = () => {
    return runAction('Cerrar Sesión Activa', () => runtimeSessionClient.closeSession(activeSessionId, reason));
  };

  const confirmRevokeSession = () => {
    setConfirmModal({
      isOpen: true,
      title: 'Revocar Sesión Activa',
      description: `Se invalidará de inmediato la sesión ${activeSessionId}. El participante deberá solicitar un nuevo pase para reingresar.`,
      action: () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        runAction('Revocar Sesión', () => runtimeSessionClient.revokeSession(activeSessionId, reason));
      }
    });
  };

  const confirmRevokeParticipant = () => {
    setConfirmModal({
      isOpen: true,
      title: 'Revocar Todas las Sesiones del Participante',
      description: `Se cancelarán todas las sesiones asociadas al participante ${participantId || 'actual'}. Motivo: "${reason}".`,
      action: () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        runAction('Revocar Participante', () => runtimeSessionClient.revokeParticipantSessions(participantId, reason));
      }
    });
  };

  const handleExpireSessions = () => {
    return runAction('Expirar Sesiones por Tiempo Límite (TTL)', () => runtimeSessionClient.expireSessions());
  };

  useEffect(() => {
    if (gateId) {
      refreshState();
    }
  }, [gateId, refreshState]);

  return (
    <div className="space-y-6">
      {/* Warning Banner */}
      <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded flex items-start gap-3">
        <ExclamationTriangleIcon className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <h4 className="text-xs font-black uppercase tracking-wider text-amber-500">
            {t('beta.sessions.title') || 'Sesiones de Ejecución Beta Controladas'}
          </h4>
          <p className="text-xs text-slate-700 dark:text-zinc-300 leading-relaxed">
            {t('beta.runtime.safetyWarning') || 'Este módulo gestiona sesiones bajo límites estrictos de concurrencia y tiempo de vida (TTL). No habilita acceso a pagos, órdenes comerciales abiertas ni marketplace digital sin control.'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Forms & Controls (2/3 width) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Gate Context Setup */}
          <div className="ppos-card p-5 border ppos-border rounded">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white mb-3 flex items-center gap-2">
              <KeyIcon className="w-4 h-4 text-blue-500" />
              Configuración del Gate de Sesión
            </h3>
            {/* Tenant Selection */}
            <div className="mb-4">
              <TenantSelector
                id="session-tenant-selector"
                selectedTenantId={tenantId}
                onSelectTenant={(tid) => setTenantId(tid)}
                allowEmpty={false}
                label="Tenant de la Sesión"
                helperText="Seleccione el tenant para asociar los gates de sesión y participantes autorizados."
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              <div>
                <label className="text-[10px] font-bold text-zinc-500 uppercase block mb-1">
                  ID de Gate de Sesión (Opcional para autogenerar)
                </label>
                <input
                  value={gateId}
                  onChange={e => setGateId(e.target.value)}
                  placeholder="sg_... (dejar vacío para crear nuevo)"
                  className="w-full ppos-input text-xs px-2.5 py-1.5 border ppos-border rounded font-mono"
                />
                <span className="text-[10px] text-zinc-400 block mt-0.5">
                  Identificador del gate o clave única autogenerada por el servidor.
                </span>
              </div>
              <div>
                <label className="text-[10px] font-bold text-zinc-500 uppercase block mb-1">
                  ID de Gate de Aceptación Previo
                </label>
                <input
                  value={acceptanceGateId}
                  onChange={e => setAcceptanceGateId(e.target.value)}
                  placeholder="agate_..."
                  className="w-full ppos-input text-xs px-2.5 py-1.5 border ppos-border rounded font-mono"
                />
                <span className="text-[10px] text-zinc-400 block mt-0.5">
                  Requiere gate de aceptación de participante sellado previamente.
                </span>
              </div>
              <div>
                <label className="text-[10px] font-bold text-zinc-500 uppercase block mb-1">
                  ID de Participante
                </label>
                <input
                  value={participantId}
                  onChange={e => setParticipantId(e.target.value)}
                  placeholder="part_..."
                  className="w-full ppos-input text-xs px-2.5 py-1.5 border ppos-border rounded font-mono"
                />
                <span className="text-[10px] text-amber-600 dark:text-amber-400 block mt-0.5">
                  * Entrada manual validada (Carencia backend: GET /api/admin/beta/participants no implementado).
                </span>
              </div>
              <div>
                <label className="text-[10px] font-bold text-zinc-500 uppercase block mb-1">
                  ID de Cohorte
                </label>
                <input
                  value={cohortId}
                  onChange={e => setCohortId(e.target.value)}
                  placeholder="cohort_..."
                  className="w-full ppos-input text-xs px-2.5 py-1.5 border ppos-border rounded font-mono"
                />
                <span className="text-[10px] text-amber-600 dark:text-amber-400 block mt-0.5">
                  * Entrada manual validada (Carencia backend: GET /api/admin/beta/cohorts no implementado).
                </span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 pt-2 border-t ppos-border">
              <button
                type="button"
                onClick={handleCreateGate}
                disabled={loading}
                className="px-3 py-1.5 text-xs font-bold bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded transition-colors"
              >
                Crear Gate
              </button>
              <button
                type="button"
                onClick={handleBindAcceptance}
                disabled={loading || !gateId}
                className="px-3 py-1.5 text-xs font-bold ppos-surface-muted hover:bg-zinc-200 dark:hover:bg-zinc-800 disabled:opacity-50 text-slate-800 dark:text-zinc-200 border ppos-border rounded transition-colors"
              >
                Vincular Aceptación
              </button>
              <button
                type="button"
                onClick={handleRunGuardrails}
                disabled={loading || !gateId}
                className="px-3 py-1.5 text-xs font-bold bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded transition-colors"
              >
                Ejecutar Protecciones
              </button>
            </div>
          </div>

          {/* Session Limits Definition */}
          <div className="ppos-card p-5 border ppos-border rounded">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white mb-3 flex items-center gap-2">
              <ClockIcon className="w-4 h-4 text-emerald-500" />
              Límites Operativos de Sesión
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
              <div>
                <label className="text-[10px] font-bold text-zinc-500 uppercase block mb-1">Sesiones Máx.</label>
                <input
                  type="number"
                  value={maxSessions}
                  onChange={e => setMaxSessions(Number(e.target.value))}
                  className="w-full ppos-input text-xs px-2.5 py-1.5 border ppos-border rounded font-mono"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-zinc-500 uppercase block mb-1">Concurrentes</label>
                <input
                  type="number"
                  value={maxConcurrentSessions}
                  onChange={e => setMaxConcurrentSessions(Number(e.target.value))}
                  className="w-full ppos-input text-xs px-2.5 py-1.5 border ppos-border rounded font-mono"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-zinc-500 uppercase block mb-1">TTL (Minutos)</label>
                <input
                  type="number"
                  value={sessionTtl}
                  onChange={e => setSessionTtl(Number(e.target.value))}
                  className="w-full ppos-input text-xs px-2.5 py-1.5 border ppos-border rounded font-mono"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-zinc-500 uppercase block mb-1">Acciones/Día</label>
                <input
                  type="number"
                  value={dailyActionLimit}
                  onChange={e => setDailyActionLimit(Number(e.target.value))}
                  className="w-full ppos-input text-xs px-2.5 py-1.5 border ppos-border rounded font-mono"
                />
              </div>
            </div>
            <div className="mb-3">
              <label className="text-[10px] font-bold text-zinc-500 uppercase block mb-1">Características Permitidas (separadas por comas)</label>
              <input
                value={allowedFeatures}
                onChange={e => setAllowedFeatures(e.target.value)}
                className="w-full ppos-input text-xs px-2.5 py-1.5 border ppos-border rounded font-mono"
              />
            </div>
            <button
              type="button"
              onClick={handleSetLimits}
              disabled={loading || !gateId}
              className="px-3 py-1.5 text-xs font-bold bg-pink-600 hover:bg-pink-700 disabled:opacity-50 text-white rounded transition-colors"
            >
              Aplicar Límites
            </button>
          </div>

          {/* Workflow & Active Sessions */}
          <div className="ppos-card p-5 border ppos-border rounded">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white mb-3 flex items-center gap-2">
              <CommandLineIcon className="w-4 h-4 text-purple-500" />
              Gobernanza y Creación de Sesión
            </h3>
            <div className="mb-3">
              <label className="text-[10px] font-bold text-zinc-500 uppercase block mb-1">Motivo / Notas de Auditoría</label>
              <input
                value={reason}
                onChange={e => setReason(e.target.value)}
                className="w-full ppos-input text-xs px-2.5 py-1.5 border ppos-border rounded"
              />
            </div>
            <div className="flex flex-wrap gap-2 mb-4">
              <button
                type="button"
                onClick={handleSubmit}
                disabled={loading || !gateId}
                className="px-3 py-1.5 text-xs font-bold ppos-surface-muted hover:bg-zinc-200 dark:hover:bg-zinc-800 disabled:opacity-50 text-slate-800 dark:text-zinc-200 border ppos-border rounded"
              >
                Enviar a Aprobación
              </button>
              <button
                type="button"
                onClick={handleApprove}
                disabled={loading || !gateId}
                className="px-3 py-1.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded"
              >
                Aprobar Gate
              </button>
              <button
                type="button"
                onClick={confirmReject}
                disabled={loading || !gateId}
                className="px-3 py-1.5 text-xs font-bold bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded"
              >
                Rechazar Gate
              </button>
              <button
                type="button"
                onClick={confirmBlock}
                disabled={loading || !gateId}
                className="px-3 py-1.5 text-xs font-bold bg-zinc-800 hover:bg-black disabled:opacity-50 text-white rounded"
              >
                Bloquear Gate
              </button>
              <button
                type="button"
                onClick={handleCreateSession}
                disabled={loading || !gateId}
                className="px-3 py-1.5 text-xs font-black uppercase tracking-wider bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded"
              >
                Crear Sesión
              </button>
            </div>

            <div className="pt-3 border-t ppos-border">
              <h4 className="text-xs font-bold text-slate-800 dark:text-zinc-200 uppercase mb-2">Control de Sesión Activa</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                <input
                  value={activeSessionId}
                  onChange={e => setActiveSessionId(e.target.value)}
                  placeholder="ID de Sesión Activa (sess_...)"
                  className="w-full ppos-input text-xs px-2.5 py-1.5 border ppos-border rounded font-mono"
                />
                <input
                  value={evalFeatureKey}
                  onChange={e => setEvalFeatureKey(e.target.value)}
                  placeholder="Clave de Característica"
                  className="w-full ppos-input text-xs px-2.5 py-1.5 border ppos-border rounded font-mono"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleEvaluateAccess}
                  disabled={loading || !activeSessionId}
                  className="px-2.5 py-1.5 text-xs font-bold bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded"
                >
                  Evaluar Acceso
                </button>
                <button
                  type="button"
                  onClick={handleSendHeartbeat}
                  disabled={loading || !activeSessionId}
                  className="px-2.5 py-1.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded"
                >
                  Enviar Latido
                </button>
                <button
                  type="button"
                  onClick={handleCloseSession}
                  disabled={loading || !activeSessionId}
                  className="px-2.5 py-1.5 text-xs font-bold bg-zinc-600 hover:bg-zinc-700 disabled:opacity-50 text-white rounded"
                >
                  Cerrar Sesión
                </button>
                <button
                  type="button"
                  onClick={confirmRevokeSession}
                  disabled={loading || !activeSessionId}
                  className="px-2.5 py-1.5 text-xs font-bold bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded"
                >
                  Revocar Sesión
                </button>
                <button
                  type="button"
                  onClick={confirmRevokeParticipant}
                  disabled={loading || !participantId}
                  className="px-2.5 py-1.5 text-xs font-bold bg-red-800 hover:bg-red-900 disabled:opacity-50 text-white rounded"
                >
                  Revocar Participante
                </button>
                <button
                  type="button"
                  onClick={handleExpireSessions}
                  disabled={loading}
                  className="px-2.5 py-1.5 text-xs font-bold ppos-surface-muted hover:bg-zinc-200 dark:hover:bg-zinc-800 disabled:opacity-50 text-slate-800 dark:text-zinc-200 border ppos-border rounded"
                >
                  Limpiar TTL
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Metrics & Feedback (1/3 width) */}
        <div className="space-y-6">
          {/* Dashboard Metrics */}
          {dashboard && (
            <div className="ppos-card p-5 border ppos-border rounded">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white mb-3">
                Métricas del Entorno de Sesiones
              </h3>
              <div className="grid grid-cols-2 gap-3 text-center">
                <div className="p-3 ppos-surface-muted border ppos-border rounded">
                  <div className="text-[10px] font-bold text-zinc-500 uppercase">Total Gates</div>
                  <div className="text-lg font-mono font-black text-slate-900 dark:text-white mt-1">{dashboard.total_gates || 0}</div>
                </div>
                <div className="p-3 ppos-surface-muted border ppos-border rounded">
                  <div className="text-[10px] font-bold text-zinc-500 uppercase">Sesiones Activas</div>
                  <div className="text-lg font-mono font-black text-emerald-500 mt-1">{dashboard.active_sessions || 0}</div>
                </div>
                <div className="p-3 ppos-surface-muted border ppos-border rounded">
                  <div className="text-[10px] font-bold text-zinc-500 uppercase">Cerradas</div>
                  <div className="text-lg font-mono font-black text-zinc-500 mt-1">{dashboard.closed_sessions || 0}</div>
                </div>
                <div className="p-3 ppos-surface-muted border ppos-border rounded">
                  <div className="text-[10px] font-bold text-zinc-500 uppercase">Revocadas</div>
                  <div className="text-lg font-mono font-black text-red-500 mt-1">{dashboard.revoked_sessions || 0}</div>
                </div>
              </div>
            </div>
          )}

          {/* Feedback messages */}
          {(message || errorMsg) && (
            <div className="ppos-card p-4 border ppos-border rounded">
              {message && <div className="text-xs font-semibold text-emerald-500 mb-1">{message}</div>}
              {errorMsg && <div className="text-xs font-semibold text-red-500">{errorMsg}</div>}
            </div>
          )}

          {/* Technical Details Collapsible */}
          <TechnicalDetailsCollapsible
            title="Detalles Técnicos de Sesión y Diagnóstico"
            data={{
              gate_id: gateId,
              tenant_id: tenantId,
              cohort_id: cohortId,
              participant_id: participantId,
              acceptance_gate_id: acceptanceGateId,
              active_session_id: activeSessionId,
              gate: gate,
              readiness: readiness,
              evidence_pack: evidencePack,
              eval_result: evalResult,
              audit_log: auditLog
            }}
            fields={[
              { label: 'Gate ID', value: gateId, copyable: true },
              { label: 'Active Session ID', value: activeSessionId, copyable: true },
              { label: 'Acceptance Gate ID', value: acceptanceGateId, copyable: true },
              { label: 'Participant ID', value: participantId, copyable: true },
              { label: 'Tenant ID', value: tenantId, copyable: true }
            ]}
            missingBackendNotes={[
              'GET /api/admin/beta/participants?tenant_id=:id (Listado de participantes)',
              'GET /api/admin/beta/cohorts?tenant_id=:id (Listado de cohortes)',
              'GET /api/admin/beta/runtime-sessions/gates?tenant_id=:id (Listado de gates de sesión)'
            ]}
          />
        </div>
      </div>

      {/* Confirmation Modal */}
      {confirmModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="ppos-card p-6 border ppos-border rounded max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-red-500">
              <ExclamationTriangleIcon className="w-6 h-6 shrink-0" />
              <h3 className="text-base font-black uppercase tracking-wider">{confirmModal.title}</h3>
            </div>
            <p className="text-xs text-slate-700 dark:text-zinc-300 leading-relaxed">
              {confirmModal.description}
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                className="px-4 py-2 text-xs font-bold ppos-surface-muted hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded text-slate-700 dark:text-zinc-300 transition-colors"
              >
                {t('common.cancel') || 'Cancelar'}
              </button>
              <button
                type="button"
                onClick={confirmModal.action}
                className="px-4 py-2 text-xs font-black uppercase tracking-wider bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
              >
                {t('common.confirm') || 'Confirmar Acción'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ControlledBetaRuntimeSession;
