import React, { useState, useCallback, useEffect } from 'react';
import { runtimeActivityObservationClient } from '../../api/controlledBetaRuntimeActivityObservationClient';
import {
  RuntimeActivityObservationGate,
  RuntimeActivityEvent,
  RuntimeActivityBlockedAttempt,
  RuntimeActivityAnomalySignal,
  RuntimeActivityHealthSignal,
  ParticipantUsageSummary,
  CohortUsageSummary
} from '../../types/controlledBetaRuntimeActivityObservation';
import { useLocale } from '../../i18n';
import { TenantSelector } from '../../components/TenantSelector';
import { TechnicalDetailsCollapsible } from '../../components/TechnicalDetailsCollapsible';
import {
  EyeIcon,
  ExclamationTriangleIcon,
  ShieldCheckIcon,
  BellAlertIcon,
  SignalIcon,
  CheckCircleIcon
} from '@heroicons/react/24/outline';

export function ControlledBetaRuntimeActivityObservation() {
  const { t } = useLocale();

  const [observationGateId, setObservationGateId] = useState('');
  const [sessionGateId, setSessionGateId] = useState('');
  const [runtimeSessionId, setRuntimeSessionId] = useState('');
  const [participantId, setParticipantId] = useState('');
  const [tenantId, setTenantId] = useState('tenant_beta_01');
  const [cohortId, setCohortId] = useState('cohort_beta_01');

  // Event ingestion / blocked attempts inputs
  const [eventType, setEventType] = useState('API_REQUEST');
  const [eventStatus, setEventStatus] = useState('ALLOWED');
  const [featureKey, setFeatureKey] = useState('feature:analytics');
  const [actionKey, setActionKey] = useState('read');
  const [blockedReason, setBlockedReason] = useState('DAILY_LIMIT_EXCEEDED');

  // Anomaly & Health inputs
  const [anomalyKey, setAnomalyKey] = useState('RATE_LIMIT_VIOLATION');
  const [healthKey, setHealthKey] = useState('INGESTION_LAG_HIGH');

  // Finding inputs
  const [findingSeverity, setFindingSeverity] = useState('BLOCKER');
  const [findingKey, setFindingKey] = useState('UNAUTHORIZED_ATTEMPTS_SPIKE');
  const [findingId, setFindingId] = useState('');

  // Loaded state
  const [gate, setGate] = useState<RuntimeActivityObservationGate | null>(null);
  const [readiness, setReadiness] = useState<any>(null);
  const [events, setEvents] = useState<RuntimeActivityEvent[]>([]);
  const [featureUsage, setFeatureUsage] = useState<any[]>([]);
  const [dailyCounters, setDailyCounters] = useState<any[]>([]);
  const [blockedAttempts, setBlockedAttempts] = useState<RuntimeActivityBlockedAttempt[]>([]);
  const [anomalySignals, setAnomalySignals] = useState<RuntimeActivityAnomalySignal[]>([]);
  const [healthSignals, setHealthSignals] = useState<RuntimeActivityHealthSignal[]>([]);
  const [participantSummary, setParticipantSummary] = useState<ParticipantUsageSummary | null>(null);
  const [cohortSummary, setCohortSummary] = useState<CohortUsageSummary | null>(null);
  const [evidencePack, setEvidencePack] = useState<any>(null);
  const [auditLog, setAuditLog] = useState<any[]>([]);
  const [dashboard, setDashboard] = useState<any>(null);

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const refreshState = useCallback(async (currentGateId = observationGateId) => {
    if (!currentGateId) return;
    try {
      const r = await runtimeActivityObservationClient.getReadiness(currentGateId);
      setReadiness(r);

      const audRes = await runtimeActivityObservationClient.getAuditTimeline(currentGateId);
      if (audRes.ok) setAuditLog(audRes.timeline);

      const evRes = await runtimeActivityObservationClient.getEvidencePack(currentGateId);
      if (evRes.ok) setEvidencePack(evRes.evidencePack);

      const dashRes = await runtimeActivityObservationClient.getDashboard();
      if (dashRes.ok) setDashboard(dashRes.dashboard);

      if (participantId) {
        const ps = await runtimeActivityObservationClient.getParticipantSummary(currentGateId, participantId);
        if (ps.ok) setParticipantSummary(ps.participantSummary);
      }
      if (cohortId) {
        const cs = await runtimeActivityObservationClient.getCohortSummary(cohortId, tenantId);
        if (cs.ok) setCohortSummary(cs.cohortSummary);
      }
    } catch (e) {
      console.error(e);
    }
  }, [observationGateId, participantId, cohortId, tenantId]);

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
    const res = await runAction('Crear Gate de Observación', () =>
      runtimeActivityObservationClient.createGate({
        observation_gate_id: observationGateId || undefined,
        session_gate_id: sessionGateId,
        runtime_session_id: runtimeSessionId,
        participant_id: participantId,
        tenant_id: tenantId,
        cohort_id: cohortId
      })
    );
    if (res?.ok && res.gate) {
      setGate(res.gate);
      setObservationGateId(res.gate.observation_gate_id);
      await refreshState(res.gate.observation_gate_id);
    }
  };

  const handleIngestEvent = () => {
    return runAction('Registrar Evento de Actividad', () =>
      runtimeActivityObservationClient.ingestEvent(observationGateId, {
        runtimeSessionId,
        eventType,
        status: eventStatus,
        featureKey,
        actionKey,
        metadata: { client: 'admin-dashboard' }
      })
    );
  };

  const handleRecordBlockedAttempt = () => {
    return runAction('Registrar Intento Bloqueado', () =>
      runtimeActivityObservationClient.recordBlockedAttempt(observationGateId, {
        runtimeSessionId,
        featureKey,
        actionKey,
        blockedReason,
        severity: 'HIGH'
      })
    );
  };

  const handleRecordAnomaly = () => {
    return runAction('Registrar Anomalía Operativa', () =>
      runtimeActivityObservationClient.recordAnomalySignal(observationGateId, {
        runtimeSessionId,
        participantId,
        tenantId,
        cohortId,
        anomalyKey,
        severity: 'HIGH'
      })
    );
  };

  const handleRecordHealth = () => {
    return runAction('Registrar Señal de Salud', () =>
      runtimeActivityObservationClient.recordHealthSignal(observationGateId, {
        runtimeSessionId,
        participantId,
        tenantId,
        cohortId,
        signalKey: healthKey,
        status: 'WARNING',
        severity: 'MEDIUM'
      })
    );
  };

  const handleRunGuardrails = () => {
    return runAction('Verificar Protecciones', () =>
      runtimeActivityObservationClient.runGuardrails(observationGateId)
    );
  };

  const handleCreateFinding = () => {
    return runAction('Crear Hallazgo', () =>
      runtimeActivityObservationClient.createFinding(observationGateId, {
        severity: findingSeverity,
        findingKey,
        details: { source: 'dashboard' }
      })
    );
  };

  const handleResolveFinding = () => {
    return runAction('Resolver Hallazgo', () =>
      runtimeActivityObservationClient.resolveFinding(observationGateId, findingId)
    );
  };

  useEffect(() => {
    if (observationGateId) {
      refreshState();
    }
  }, [observationGateId, refreshState]);

  return (
    <div className="space-y-6">
      {/* Warning Banner */}
      <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded flex items-start gap-3">
        <ExclamationTriangleIcon className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <h4 className="text-xs font-black uppercase tracking-wider text-amber-500">
            {t('beta.runtime.activityReview') || 'Observación de Actividad del Entorno Beta'}
          </h4>
          <p className="text-xs text-slate-700 dark:text-zinc-300 leading-relaxed">
            {t('beta.runtime.safetyWarning') || 'Módulo de telemetría y supervisión de actividad acotada. No ejecuta cobros, modificaciones de tarifas ni cambios en producción.'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Gate setup and Event ingestion (2/3 width) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Observation Gate Setup */}
          <div className="ppos-card p-5 border ppos-border rounded">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white mb-3 flex items-center gap-2">
              <EyeIcon className="w-4 h-4 text-blue-500" />
              Configuración de Observación de Actividad
            </h3>
            {/* Tenant Selection */}
            <div className="mb-4">
              <TenantSelector
                id="observation-tenant-selector"
                selectedTenantId={tenantId}
                onSelectTenant={(tid) => setTenantId(tid)}
                allowEmpty={false}
                label="Tenant de Observación"
                helperText="Seleccione el tenant auditado para vincular los gates de telemetría y eventos observados."
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              <div>
                <label className="text-[10px] font-bold text-zinc-500 uppercase block mb-1">
                  ID de Gate de Observación (Opcional)
                </label>
                <input
                  value={observationGateId}
                  onChange={e => setObservationGateId(e.target.value)}
                  placeholder="obs_... (dejar vacío para crear nuevo)"
                  className="w-full ppos-input text-xs px-2.5 py-1.5 border ppos-border rounded font-mono"
                />
                <span className="text-[10px] text-zinc-400 block mt-0.5">
                  Identificador del gate o clave única autogenerada por el backend.
                </span>
              </div>
              <div>
                <label className="text-[10px] font-bold text-zinc-500 uppercase block mb-1">
                  ID de Gate de Sesión Previo
                </label>
                <input
                  value={sessionGateId}
                  onChange={e => setSessionGateId(e.target.value)}
                  placeholder="sg_..."
                  className="w-full ppos-input text-xs px-2.5 py-1.5 border ppos-border rounded font-mono"
                />
                <span className="text-[10px] text-zinc-400 block mt-0.5">
                  Gate de sesión autorizado emitido en el paso anterior.
                </span>
              </div>
              <div>
                <label className="text-[10px] font-bold text-zinc-500 uppercase block mb-1">
                  ID de Sesión Activa
                </label>
                <input
                  value={runtimeSessionId}
                  onChange={e => setRuntimeSessionId(e.target.value)}
                  placeholder="sess_..."
                  className="w-full ppos-input text-xs px-2.5 py-1.5 border ppos-border rounded font-mono"
                />
                <span className="text-[10px] text-zinc-400 block mt-0.5">
                  ID de sesión en ejecución cuyos eventos serán capturados.
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
            </div>
            <div className="flex gap-2 pt-2 border-t ppos-border">
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
                onClick={handleRunGuardrails}
                disabled={loading || !observationGateId}
                className="px-3 py-1.5 text-xs font-bold bg-pink-600 hover:bg-pink-700 disabled:opacity-50 text-white rounded transition-colors"
              >
                Ejecutar Protecciones
              </button>
            </div>
          </div>

          {/* Event Ingestion */}
          <div className="ppos-card p-5 border ppos-border rounded">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white mb-3 flex items-center gap-2">
              <SignalIcon className="w-4 h-4 text-emerald-500" />
              Ingesta y Registro de Eventos
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
              <div>
                <label className="text-[10px] font-bold text-zinc-500 uppercase block mb-1">Tipo de Evento</label>
                <input
                  value={eventType}
                  onChange={e => setEventType(e.target.value)}
                  className="w-full ppos-input text-xs px-2.5 py-1.5 border ppos-border rounded font-mono"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-zinc-500 uppercase block mb-1">Estado</label>
                <input
                  value={eventStatus}
                  onChange={e => setEventStatus(e.target.value)}
                  className="w-full ppos-input text-xs px-2.5 py-1.5 border ppos-border rounded font-mono"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-zinc-500 uppercase block mb-1">Característica</label>
                <input
                  value={featureKey}
                  onChange={e => setFeatureKey(e.target.value)}
                  className="w-full ppos-input text-xs px-2.5 py-1.5 border ppos-border rounded font-mono"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-zinc-500 uppercase block mb-1">Acción</label>
                <input
                  value={actionKey}
                  onChange={e => setActionKey(e.target.value)}
                  className="w-full ppos-input text-xs px-2.5 py-1.5 border ppos-border rounded font-mono"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={handleIngestEvent}
              disabled={loading || !observationGateId}
              className="px-3 py-1.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded transition-colors"
            >
              Registrar Evento
            </button>
          </div>

          {/* Signals & Findings */}
          <div className="ppos-card p-5 border ppos-border rounded">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white mb-3 flex items-center gap-2">
              <BellAlertIcon className="w-4 h-4 text-amber-500" />
              Supervisión de Señales y Hallazgos
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-zinc-500 uppercase block">Motivo de Bloqueo</label>
                <input
                  value={blockedReason}
                  onChange={e => setBlockedReason(e.target.value)}
                  className="w-full ppos-input text-xs px-2.5 py-1.5 border ppos-border rounded font-mono"
                />
                <button
                  type="button"
                  onClick={handleRecordBlockedAttempt}
                  disabled={loading || !observationGateId}
                  className="w-full px-2.5 py-1.5 text-xs font-bold bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded"
                >
                  Registrar Bloqueo
                </button>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-zinc-500 uppercase block">Clave de Anomalía</label>
                <input
                  value={anomalyKey}
                  onChange={e => setAnomalyKey(e.target.value)}
                  className="w-full ppos-input text-xs px-2.5 py-1.5 border ppos-border rounded font-mono"
                />
                <button
                  type="button"
                  onClick={handleRecordAnomaly}
                  disabled={loading || !observationGateId}
                  className="w-full px-2.5 py-1.5 text-xs font-bold bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded"
                >
                  Registrar Anomalía
                </button>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-zinc-500 uppercase block">Clave de Salud</label>
                <input
                  value={healthKey}
                  onChange={e => setHealthKey(e.target.value)}
                  className="w-full ppos-input text-xs px-2.5 py-1.5 border ppos-border rounded font-mono"
                />
                <button
                  type="button"
                  onClick={handleRecordHealth}
                  disabled={loading || !observationGateId}
                  className="w-full px-2.5 py-1.5 text-xs font-bold bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded"
                >
                  Registrar Alerta
                </button>
              </div>
            </div>

            <div className="pt-3 border-t ppos-border grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-zinc-500 uppercase block">Clave de Hallazgo</label>
                <input
                  value={findingKey}
                  onChange={e => setFindingKey(e.target.value)}
                  className="w-full ppos-input text-xs px-2.5 py-1.5 border ppos-border rounded font-mono"
                />
                <button
                  type="button"
                  onClick={handleCreateFinding}
                  disabled={loading || !observationGateId}
                  className="px-3 py-1.5 text-xs font-bold bg-zinc-700 hover:bg-zinc-800 disabled:opacity-50 text-white rounded"
                >
                  Abrir Hallazgo
                </button>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-zinc-500 uppercase block">ID de Hallazgo a Resolver</label>
                <input
                  value={findingId}
                  onChange={e => setFindingId(e.target.value)}
                  placeholder="ID de Hallazgo"
                  className="w-full ppos-input text-xs px-2.5 py-1.5 border ppos-border rounded font-mono"
                />
                <button
                  type="button"
                  onClick={handleResolveFinding}
                  disabled={loading || !findingId}
                  className="px-3 py-1.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded"
                >
                  Resolver Hallazgo
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Status & Feedback (1/3 width) */}
        <div className="space-y-6">
          {(message || errorMsg) && (
            <div className="ppos-card p-4 border ppos-border rounded">
              {message && <div className="text-xs font-semibold text-emerald-500 mb-1">{message}</div>}
              {errorMsg && <div className="text-xs font-semibold text-red-500">{errorMsg}</div>}
            </div>
          )}

          {readiness && (
            <div className="ppos-card p-5 border ppos-border rounded">
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">
                  Estado de Observación
                </h3>
                <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                  readiness.ok ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'
                }`}>
                  {readiness.readiness_status}
                </span>
              </div>
              {readiness.blocked_reasons?.length > 0 && (
                <div className="text-xs text-red-500 bg-red-500/10 p-2 rounded border border-red-500/20">
                  Bloqueos: {readiness.blocked_reasons.join(', ')}
                </div>
              )}
            </div>
          )}

          {/* Technical Details Collapsible */}
          <TechnicalDetailsCollapsible
            title="Detalles Técnicos y Telemetría de Observación"
            data={{
              observation_gate_id: observationGateId,
              session_gate_id: sessionGateId,
              runtime_session_id: runtimeSessionId,
              participant_id: participantId,
              tenant_id: tenantId,
              cohort_id: cohortId,
              gate: gate,
              readiness: readiness,
              evidence_pack: evidencePack,
              participant_summary: participantSummary,
              cohort_summary: cohortSummary,
              events_count: events.length,
              blocked_attempts_count: blockedAttempts.length,
              anomalies_count: anomalySignals.length,
              health_signals_count: healthSignals.length,
              audit_log: auditLog
            }}
            fields={[
              { label: 'Observation Gate ID', value: observationGateId, copyable: true },
              { label: 'Session Gate ID', value: sessionGateId, copyable: true },
              { label: 'Runtime Session ID', value: runtimeSessionId, copyable: true },
              { label: 'Participant ID', value: participantId, copyable: true },
              { label: 'Tenant ID', value: tenantId, copyable: true }
            ]}
            missingBackendNotes={[
              'GET /api/admin/beta/participants?tenant_id=:id (Listado de participantes)',
              'GET /api/admin/beta/cohorts?tenant_id=:id (Listado de cohortes)',
              'GET /api/admin/beta/runtime-sessions/gates?tenant_id=:id (Listado de gates de sesión)',
              'GET /api/admin/beta/observation-gates?tenant_id=:id (Listado de gates de observación)'
            ]}
          />
        </div>
      </div>
    </div>
  );
}

export default ControlledBetaRuntimeActivityObservation;
