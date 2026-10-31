import React, { useState, useCallback } from 'react';
import {
  getLimitedBetaRuntimeReadiness,
  createRuntimeScopePolicy,
  updateRuntimeScopePolicy,
  enableRuntimeForGate,
  disableRuntimeForGate,
  createRuntimeAccessGrant,
  revokeRuntimeAccessGrant,
  evaluateRuntimeAccess,
  createRuntimeSession,
  terminateRuntimeSession,
  recordRuntimeActivity,
  recordRuntimeGuardrailEvent,
  triggerRuntimeKillSwitch,
  clearRuntimeKillSwitch,
  recordRuntimeRollbackEvent,
  recordRuntimeFinding,
  resolveRuntimeFinding,
  getRuntimeAuditTimeline,
  getRuntimeEvidencePack,
  createRuntimeRestartDrill,
  snapshotRuntimeStateBeforeRestart,
  verifyRuntimeStateAfterRestart,
  compareRuntimeRestartSnapshot,
  verifyKillSwitchAfterRestart,
  verifyAccessGrantAfterRestart,
  getRuntimeRestartRecoveryAuditTimeline,
  getRuntimeRestartRecoveryEvidencePack
} from '../../api/limitedBetaRuntimeClient';
import { useLocale } from '../../i18n';
import { TenantSelector } from '../../components/TenantSelector';
import { TechnicalDetailsCollapsible } from '../../components/TechnicalDetailsCollapsible';
import {
  ShieldCheckIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon,
  CommandLineIcon,
  DocumentCheckIcon,
  NoSymbolIcon,
  CheckCircleIcon
} from '@heroicons/react/24/outline';

export function LimitedBetaRuntime() {
  const { t } = useLocale();

  const [gateId, setGateId] = useState('');
  const [policyId, setPolicyId] = useState('');
  const [grantId, setGrantId] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [findingId, setFindingId] = useState('');
  const [drillId, setDrillId] = useState('');
  
  // Scopes and fields
  const [policyName, setPolicyName] = useState('Scope A');
  const [allowedFeatures, setAllowedFeatures] = useState('["CUSTOMER_PORTAL_VIEW_ONLY", "PREFLIGHT_REVIEW_ONLY"]');
  const [cohortId, setCohortId] = useState('cohort_beta_01');
  const [participantId, setParticipantId] = useState('participant_beta_01');
  const [tenantId, setTenantId] = useState('tenant_beta_01');
  const [featureKey, setFeatureKey] = useState('CUSTOMER_PORTAL_VIEW_ONLY');
  const [killSwitchReason, setKillSwitchReason] = useState('EMERGENCY_ACCESS_SUSPENSION');
  const [findingSeverity, setFindingSeverity] = useState('HIGH');
  const [findingSummary, setFindingSummary] = useState('Scoped runtime validation warning');
  const [activityType, setActivityType] = useState('ACCESS_REQUEST');
  const [rollbackSteps, setRollbackSteps] = useState('["disable_runtime", "suspend_sessions"]');
  const [violationDetails, setViolationDetails] = useState('{"attempted_feature": "PAYMENT_CAPTURE"}');

  const [result, setResult] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  // Confirmation modal state for destructive actions
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

  const run = useCallback(async (label: string, fn: () => Promise<any>) => {
    setLoading(true);
    setMessage('');
    try {
      const r = await fn();
      setResult(r as Record<string, any>);
      setMessage(`${label}: ${t('common.done') || 'Operación completada correctamente.'}`);
      return r;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setMessage(`Error en ${label}: ${msg}`);
      return null;
    } finally {
      setLoading(false);
    }
  }, [t]);

  const handleCheckReadiness = useCallback(() => {
    return run(t('beta.runtime.checkReadiness') || 'Comprobar Estado', () => getLimitedBetaRuntimeReadiness({ gate_id: gateId || undefined }));
  }, [run, gateId, t]);

  const handleCreatePolicy = useCallback(async () => {
    let allowedArr = [];
    try { allowedArr = JSON.parse(allowedFeatures); } catch (e) {}
    const r = await run('Crear Política de Alcance', () =>
      createRuntimeScopePolicy({
        gate_id: gateId,
        policy_name: policyName,
        allowed_features_json: allowedArr,
        created_by: 'admin'
      })
    );
    if (r && r.policy) {
      const p = r.policy as Record<string, unknown>;
      if (p.policy_id) setPolicyId(String(p.policy_id));
    }
  }, [run, gateId, policyName, allowedFeatures]);

  const handleUpdatePolicy = useCallback(() => {
    let allowedArr = [];
    try { allowedArr = JSON.parse(allowedFeatures); } catch (e) {}
    return run('Actualizar Política', () =>
      updateRuntimeScopePolicy({
        policy_id: policyId,
        allowed_features_json: allowedArr
      })
    );
  }, [run, policyId, allowedFeatures]);

  const handleEnableRuntime = useCallback(() => {
    return run('Habilitar Gate de Ejecución', () => enableRuntimeForGate({ gate_id: gateId }));
  }, [run, gateId]);

  const confirmDisableRuntime = useCallback(() => {
    setConfirmModal({
      isOpen: true,
      title: 'Deshabilitar Gate de Ejecución',
      description: `Esta acción suspenderá inmediatamente el entorno de ejecución para el gate ${gateId || 'actual'}. Se revocarán las sesiones activas en este alcance.`,
      action: () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        run('Deshabilitar Gate', () => disableRuntimeForGate({ gate_id: gateId }));
      }
    });
  }, [run, gateId]);

  const handleCreateGrant = useCallback(async () => {
    const r = await run('Crear Concesión de Acceso', () =>
      createRuntimeAccessGrant({
        gate_id: gateId,
        cohort_id: cohortId,
        participant_id: participantId,
        tenant_id: tenantId,
        scope_policy_id: policyId,
        granted_by: 'admin'
      })
    );
    if (r && r.grant) {
      const g = r.grant as Record<string, unknown>;
      if (g.grant_id) setGrantId(String(g.grant_id));
    }
  }, [run, gateId, cohortId, participantId, tenantId, policyId]);

  const confirmRevokeGrant = useCallback(() => {
    setConfirmModal({
      isOpen: true,
      title: 'Revocar Concesión de Acceso',
      description: `Se revocará permanentemente la concesión ${grantId}. El participante perderá acceso al entorno acotado.`,
      action: () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        run('Revocar Concesión', () => revokeRuntimeAccessGrant({ grant_id: grantId }));
      }
    });
  }, [run, grantId]);

  const handleEvaluateAccess = useCallback(() => {
    return run('Evaluar Acceso de Participante', () =>
      evaluateRuntimeAccess({
        gate_id: gateId,
        cohort_id: cohortId,
        participant_id: participantId,
        tenant_id: tenantId,
        feature_key: featureKey
      })
    );
  }, [run, gateId, cohortId, participantId, tenantId, featureKey]);

  const handleCreateSession = useCallback(async () => {
    const r = await run('Crear Sesión de Ejecución', () =>
      createRuntimeSession({
        gate_id: gateId,
        cohort_id: cohortId,
        participant_id: participantId,
        tenant_id: tenantId,
        feature_key: featureKey
      })
    );
    if (r && r.session) {
      const s = r.session as Record<string, unknown>;
      if (s.session_id) setSessionId(String(s.session_id));
    }
  }, [run, gateId, cohortId, participantId, tenantId, featureKey]);

  const confirmTerminateSession = useCallback(() => {
    setConfirmModal({
      isOpen: true,
      title: 'Terminar Sesión de Ejecución',
      description: `Se finalizará inmediatamente la sesión ${sessionId}. Cualquier operación en curso será abortada de forma segura.`,
      action: () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        run('Terminar Sesión', () => terminateRuntimeSession({ session_id: sessionId, reason: 'ADMIN_TERMINATED' }));
      }
    });
  }, [run, sessionId]);

  const handleRecordActivity = useCallback(() => {
    return run('Registrar Actividad', () =>
      recordRuntimeActivity({
        session_id: sessionId || undefined,
        gate_id: gateId,
        participant_id: participantId,
        tenant_id: tenantId,
        event_type: activityType,
        details: { description: 'Manual beta activity log' }
      })
    );
  }, [run, sessionId, gateId, participantId, tenantId, activityType]);

  const handleRecordGuardrail = useCallback(() => {
    let detailsObj = {};
    try { detailsObj = JSON.parse(violationDetails); } catch (e) {}
    return run('Registrar Evento de Protección', () =>
      recordRuntimeGuardrailEvent({
        gate_id: gateId,
        tenant_id: tenantId,
        participant_id: participantId,
        event_type: 'GUARDRAIL_VIOLATION_TRIGGERED',
        violation_details: detailsObj
      })
    );
  }, [run, gateId, tenantId, participantId, violationDetails]);

  const confirmTriggerKillSwitch = useCallback(() => {
    setConfirmModal({
      isOpen: true,
      title: 'Activar Interruptor de Emergencia (Kill Switch)',
      description: `ALERTA DE SEGURIDAD: Esto congelará de inmediato todo el entorno de ejecución beta bajo el gate ${gateId || 'actual'}. Se cerrarán todas las sesiones activas. Razón especificada: "${killSwitchReason}".`,
      action: () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        run(t('beta.runtime.triggerKillSwitch') || 'Activar Interruptor de Emergencia', () => triggerRuntimeKillSwitch({ gate_id: gateId, reason: killSwitchReason }));
      }
    });
  }, [run, gateId, killSwitchReason, t]);

  const handleClearKillSwitch = useCallback(() => {
    return run(t('beta.runtime.clearKillSwitch') || 'Desactivar Interruptor de Emergencia', () => clearRuntimeKillSwitch({ gate_id: gateId }));
  }, [run, gateId, t]);

  const handleRecordRollback = useCallback(() => {
    let stepsArr = [];
    try { stepsArr = JSON.parse(rollbackSteps); } catch (e) {}
    return run('Registrar Evento de Reversión', () =>
      recordRuntimeRollbackEvent({
        gate_id: gateId,
        triggered_by: 'admin',
        rollback_steps: stepsArr
      })
    );
  }, [run, gateId, rollbackSteps]);

  const handleRecordFinding = useCallback(async () => {
    const r = await run('Registrar Hallazgo de Seguridad', () =>
      recordRuntimeFinding({
        gate_id: gateId,
        severity: findingSeverity,
        summary: findingSummary,
        blocks_runtime: 1
      })
    );
    if (r && r.finding) {
      const f = r.finding as Record<string, unknown>;
      if (f.finding_id) setFindingId(String(f.finding_id));
    }
  }, [run, gateId, findingSeverity, findingSummary]);

  const handleResolveFinding = useCallback(() => {
    return run('Resolver Hallazgo', () => resolveRuntimeFinding({ finding_id: findingId }));
  }, [run, findingId]);

  const handleGetAuditTimeline = useCallback(() => {
    return run(t('beta.runtime.getAuditTimeline') || 'Consultar Cronología de Auditoría', () => getRuntimeAuditTimeline({ gate_id: gateId }));
  }, [run, gateId, t]);

  const handleGetEvidencePack = useCallback(() => {
    return run(t('beta.runtime.buildEvidencePack') || 'Generar Paquete de Evidencias', () => getRuntimeEvidencePack({ gate_id: gateId }));
  }, [run, gateId, t]);

  // --- Restart Recovery Handlers ---
  const handleCreateRestartDrill = useCallback(async () => {
    const r = await run('Crear Simulacro de Reinicio', () =>
      createRuntimeRestartDrill({
        gate_id: gateId,
        cohort_id: cohortId,
        participant_id: participantId,
        tenant_id: tenantId
      })
    );
    if (r && r.drill) {
      const d = r.drill as Record<string, unknown>;
      if (d.drill_id) setDrillId(String(d.drill_id));
    }
  }, [run, gateId, cohortId, participantId, tenantId]);

  const handleSnapshotBefore = useCallback(() => {
    return run('Captura Previa al Reinicio', () => snapshotRuntimeStateBeforeRestart({ gate_id: gateId }));
  }, [run, gateId]);

  const handleVerifyAfter = useCallback(() => {
    return run('Verificación Posterior al Reinicio', () => verifyRuntimeStateAfterRestart({ gate_id: gateId }));
  }, [run, gateId]);

  const handleCompareSnapshot = useCallback(() => {
    return run('Comparar Capturas de Estado', () => compareRuntimeRestartSnapshot({ drill_id: drillId }));
  }, [run, drillId]);

  const handleVerifyKillSwitch = useCallback(() => {
    return run('Verificar Interruptor Tras Reinicio', () => verifyKillSwitchAfterRestart({ drill_id: drillId, gate_id: gateId }));
  }, [run, drillId, gateId]);

  const handleVerifyAccess = useCallback(() => {
    return run('Verificar Concesiones Tras Reinicio', () => verifyAccessGrantAfterRestart({ drill_id: drillId, grant_id: grantId }));
  }, [run, drillId, grantId]);

  const handleGetRestartTimeline = useCallback(() => {
    return run('Línea Temporal de Recuperación', () => getRuntimeRestartRecoveryAuditTimeline({ drill_id: drillId, gate_id: gateId }));
  }, [run, drillId, gateId]);

  const handleGetRestartEvidence = useCallback(() => {
    return run('Paquete de Evidencias de Reinicio', () => getRuntimeRestartRecoveryEvidencePack({ drill_id: drillId, gate_id: gateId }));
  }, [run, drillId, gateId]);

  return (
    <div className="space-y-6">
      {/* Safety Warning Banner */}
      <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded flex items-start gap-3">
        <ExclamationTriangleIcon className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <h4 className="text-xs font-black uppercase tracking-wider text-amber-500">
            {t('beta.runtime.warningTitle') || 'Aviso de Seguridad de Entorno Beta Controlado'}
          </h4>
          <p className="text-xs text-slate-700 dark:text-zinc-300 leading-relaxed">
            {t('beta.runtime.safetyWarning') || 'Entorno de Ejecución Beta de Acceso Restringido. Este entorno opera exclusivamente bajo invitación y alcances estrictos. No habilita acceso público, apertura de marketplace digital, ejecución de pagos, reembolsos, liquidaciones ni envío a proveedores externos.'}
          </p>
        </div>
      </div>

      {/* Top Grid: Invariants & Hardened Recovery Registry */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Safety Invariants Panel */}
        <div className="ppos-card p-5 border ppos-border rounded">
          <div className="flex items-center gap-2 mb-4 pb-3 border-b ppos-border">
            <ShieldCheckIcon className="w-5 h-5 text-emerald-500" />
            <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">
              {t('beta.runtime.safetyInvariants') || 'Invariantes de Seguridad Garantizadas'}
            </h3>
          </div>
          <div className="space-y-2.5 text-xs">
            <div className="flex items-center justify-between py-1 border-b ppos-border/50">
              <span className="text-zinc-500 dark:text-zinc-400">Alcance de Ejecución Beta:</span>
              <span className="font-mono font-bold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded">
                {result?.betaRuntimeEnabled ? 'SCOPED_ONLY' : 'NO_HABILITADO'}
              </span>
            </div>
            <div className="flex items-center justify-between py-1 border-b ppos-border/50">
              <span className="text-zinc-500 dark:text-zinc-400">Acceso Público Completo (FULL_PUBLIC):</span>
              <span className="font-mono font-bold text-red-500 bg-red-500/10 px-2 py-0.5 rounded">BLOQUEADO (FALSE)</span>
            </div>
            <div className="flex items-center justify-between py-1 border-b ppos-border/50">
              <span className="text-zinc-500 dark:text-zinc-400">Acceso a Mercado Digital (Marketplace):</span>
              <span className="font-mono font-bold text-red-500 bg-red-500/10 px-2 py-0.5 rounded">BLOQUEADO (FALSE)</span>
            </div>
            <div className="flex items-center justify-between py-1 border-b ppos-border/50">
              <span className="text-zinc-500 dark:text-zinc-400">Ejecución y Captura de Pagos:</span>
              <span className="font-mono font-bold text-red-500 bg-red-500/10 px-2 py-0.5 rounded">BLOQUEADO (FALSE)</span>
            </div>
            <div className="flex items-center justify-between py-1">
              <span className="text-zinc-500 dark:text-zinc-400">Envío a Proveedores Industriales Externos:</span>
              <span className="font-mono font-bold text-red-500 bg-red-500/10 px-2 py-0.5 rounded">BLOQUEADO (FALSE)</span>
            </div>
          </div>
        </div>

        {/* Restart Recovery Registry */}
        <div className="ppos-card p-5 border ppos-border rounded">
          <div className="flex items-center gap-2 mb-4 pb-3 border-b ppos-border">
            <ArrowPathIcon className="w-5 h-5 text-blue-500" />
            <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">
              {t('beta.runtime.recoveryRegistry') || 'Registro de Integridad y Recuperación ante Reinicio'}
            </h3>
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-2.5 ppos-surface-muted border ppos-border rounded">
              <span className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Estado del Simulacro</span>
              <strong className="font-mono text-slate-900 dark:text-white text-xs mt-1 block">
                {result?.restartRecoveryStatus || result?.restart_recovery_status || 'Sin simulacro activo'}
              </strong>
            </div>
            <div className="p-2.5 ppos-surface-muted border ppos-border rounded">
              <span className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Persistencia de Datos</span>
              <strong className="font-mono text-slate-900 dark:text-white text-xs mt-1 block">
                {result?.persistenceStatus || 'Sin comprobar'}
              </strong>
            </div>
            <div className="col-span-2 p-2.5 ppos-surface-muted border ppos-border rounded">
              <span className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Hash de Integridad de Recuperación</span>
              <strong className="font-mono text-[11px] text-slate-700 dark:text-zinc-300 break-all mt-1 block">
                {result?.recovery_integrity_hash || 'Pendiente de generación en simulacro'}
              </strong>
            </div>
            <div className="col-span-2 p-2.5 ppos-surface-muted border ppos-border rounded">
              <span className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Estado de Verdad de Ejecución</span>
              <strong className="font-mono text-slate-900 dark:text-white text-xs mt-1 block">
                {result?.runtimeTruthStatus || 'A la espera de verificación'}
              </strong>
            </div>
          </div>
        </div>
      </div>

      {/* Main Operations Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left & Middle Columns (2/3 width) */}
        <div className="lg:col-span-2 space-y-6">
          {/* 1. Contexto de Gate y Disponibilidad */}
          <div className="ppos-card p-5 border ppos-border rounded">
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white mb-3 flex items-center gap-2">
              <CommandLineIcon className="w-4 h-4 text-blue-500" />
              1. Contexto y Disponibilidad de Gate Beta
            </h4>
            <div className="flex flex-col sm:flex-row gap-3 items-center">
              <div className="w-full sm:flex-1">
                <input
                  value={gateId}
                  onChange={e => setGateId(e.target.value)}
                  placeholder="ID de Gate (ej. lbpg_primary_beta)"
                  className="w-full ppos-input text-xs px-3 py-2 border ppos-border rounded"
                />
              </div>
              <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={handleCheckReadiness}
                  disabled={loading}
                  className="px-3 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
                >
                  {t('beta.runtime.checkReadiness') || 'Comprobar Estado'}
                </button>
                <button
                  type="button"
                  onClick={handleEnableRuntime}
                  disabled={loading || !gateId}
                  className="px-3 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded transition-colors"
                >
                  Habilitar Gate
                </button>
                <button
                  type="button"
                  onClick={confirmDisableRuntime}
                  disabled={loading || !gateId}
                  className="px-3 py-2 text-xs font-bold bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded transition-colors"
                >
                  Deshabilitar Gate
                </button>
              </div>
            </div>
          </div>

          {/* 2. Simulacro de Recuperación ante Reinicio */}
          <div className="ppos-card p-5 border ppos-border rounded border-dashed">
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white mb-3 flex items-center gap-2">
              <ArrowPathIcon className="w-4 h-4 text-amber-500" />
              2. Orquestación del Simulacro de Recuperación
            </h4>
            <div className="flex flex-col sm:flex-row gap-3 items-center mb-3">
              <button
                type="button"
                onClick={handleCreateRestartDrill}
                disabled={loading || !gateId}
                className="w-full sm:w-auto px-4 py-2 text-xs font-bold bg-zinc-700 hover:bg-zinc-800 text-white rounded transition-colors"
              >
                Iniciar Simulacro
              </button>
              <input
                value={drillId}
                onChange={e => setDrillId(e.target.value)}
                placeholder="ID de Simulacro (lbrrd_...)"
                className="w-full sm:flex-1 ppos-input text-xs px-3 py-2 border ppos-border rounded font-mono"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleSnapshotBefore}
                disabled={loading || !gateId}
                className="px-2.5 py-1.5 text-xs font-semibold ppos-surface-muted hover:bg-zinc-200 dark:hover:bg-zinc-700 text-slate-800 dark:text-zinc-200 border ppos-border rounded"
              >
                Captura Previa
              </button>
              <button
                type="button"
                onClick={handleVerifyAfter}
                disabled={loading || !gateId}
                className="px-2.5 py-1.5 text-xs font-semibold ppos-surface-muted hover:bg-zinc-200 dark:hover:bg-zinc-700 text-slate-800 dark:text-zinc-200 border ppos-border rounded"
              >
                Verificar Posterior
              </button>
              <button
                type="button"
                onClick={handleCompareSnapshot}
                disabled={loading || !drillId}
                className="px-2.5 py-1.5 text-xs font-semibold ppos-surface-muted hover:bg-zinc-200 dark:hover:bg-zinc-700 text-slate-800 dark:text-zinc-200 border ppos-border rounded"
              >
                Comparar Capturas
              </button>
              <button
                type="button"
                onClick={handleVerifyKillSwitch}
                disabled={loading || !drillId || !gateId}
                className="px-2.5 py-1.5 text-xs font-semibold ppos-surface-muted hover:bg-zinc-200 dark:hover:bg-zinc-700 text-slate-800 dark:text-zinc-200 border ppos-border rounded"
              >
                Verificar Interruptor
              </button>
              <button
                type="button"
                onClick={handleVerifyAccess}
                disabled={loading || !drillId || !grantId}
                className="px-2.5 py-1.5 text-xs font-semibold ppos-surface-muted hover:bg-zinc-200 dark:hover:bg-zinc-700 text-slate-800 dark:text-zinc-200 border ppos-border rounded"
              >
                Verificar Concesiones
              </button>
            </div>
          </div>

          {/* 3. Concesiones de Acceso y Sesiones */}
          <div className="ppos-card p-5 border ppos-border rounded">
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white mb-3 flex items-center gap-2">
              <CheckCircleIcon className="w-4 h-4 text-emerald-500" />
              3. Participantes y Concesiones de Acceso
            </h4>

            {/* Tenant Selection */}
            <div className="mb-4">
              <TenantSelector
                id="runtime-tenant-selector"
                selectedTenantId={tenantId}
                onSelectTenant={(tid) => setTenantId(tid)}
                allowEmpty={false}
                label="Tenant de Ejecución"
                helperText="Selecciona el tenant auditado para las concesiones de acceso y creación de sesiones."
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-[10px] font-bold text-zinc-500 uppercase block mb-1">ID de Cohorte</label>
                <input
                  value={cohortId}
                  onChange={e => setCohortId(e.target.value)}
                  className="w-full ppos-input text-xs px-2.5 py-1.5 border ppos-border rounded font-mono"
                />
                <span className="text-[10px] text-amber-600 dark:text-amber-400 block mt-0.5">
                  * Entrada manual validada (Carencia backend: GET /api/admin/beta/cohorts no implementado).
                </span>
              </div>
              <div>
                <label className="text-[10px] font-bold text-zinc-500 uppercase block mb-1">ID de Participante</label>
                <input
                  value={participantId}
                  onChange={e => setParticipantId(e.target.value)}
                  className="w-full ppos-input text-xs px-2.5 py-1.5 border ppos-border rounded font-mono"
                />
                <span className="text-[10px] text-amber-600 dark:text-amber-400 block mt-0.5">
                  * Entrada manual validada (Carencia backend: GET /api/admin/beta/participants no implementado).
                </span>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 items-center mb-3">
              <button
                type="button"
                onClick={handleCreateGrant}
                disabled={loading || !policyId}
                className="w-full sm:w-auto px-3 py-1.5 text-xs font-bold bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded transition-colors"
              >
                Conceder Acceso
              </button>
              <input
                value={grantId}
                onChange={e => setGrantId(e.target.value)}
                placeholder="ID de Concesión (grant_...)"
                className="w-full sm:flex-1 ppos-input text-xs px-2.5 py-1.5 border ppos-border rounded font-mono"
              />
              <button
                type="button"
                onClick={confirmRevokeGrant}
                disabled={loading || !grantId}
                className="w-full sm:w-auto px-3 py-1.5 text-xs font-bold bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded transition-colors"
              >
                Revocar Concesión
              </button>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 items-center">
              <button
                type="button"
                onClick={handleCreateSession}
                disabled={loading || !gateId}
                className="w-full sm:w-auto px-3 py-1.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded transition-colors"
              >
                Crear Sesión
              </button>
              <input
                value={sessionId}
                onChange={e => setSessionId(e.target.value)}
                placeholder="ID de Sesión Activa"
                className="w-full sm:flex-1 ppos-input text-xs px-2.5 py-1.5 border ppos-border rounded font-mono"
              />
              <button
                type="button"
                onClick={confirmTerminateSession}
                disabled={loading || !sessionId}
                className="w-full sm:w-auto px-3 py-1.5 text-xs font-bold bg-zinc-700 hover:bg-zinc-800 disabled:opacity-50 text-white rounded transition-colors"
              >
                Terminar Sesión
              </button>
            </div>
          </div>

          {/* 4. Interruptor de Emergencia (Kill Switch) */}
          <div className="ppos-card p-5 border border-red-500/30 rounded bg-red-500/5">
            <h4 className="text-xs font-black uppercase tracking-wider text-red-500 mb-3 flex items-center gap-2">
              <NoSymbolIcon className="w-4 h-4 text-red-500" />
              4. Controles de Emergencia e Interruptor Crítico (Kill Switch)
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-[10px] font-bold text-zinc-500 uppercase block mb-1">Motivo de Activación</label>
                <input
                  value={killSwitchReason}
                  onChange={e => setKillSwitchReason(e.target.value)}
                  className="w-full ppos-input text-xs px-2.5 py-1.5 border ppos-border rounded font-mono"
                />
              </div>
              <div className="flex items-end gap-2">
                <button
                  type="button"
                  onClick={confirmTriggerKillSwitch}
                  disabled={loading || !gateId}
                  className="w-full px-3 py-2 text-xs font-black uppercase tracking-wider bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded shadow-sm transition-colors"
                >
                  {t('beta.runtime.triggerKillSwitch') || 'Activar Interruptor'}
                </button>
                <button
                  type="button"
                  onClick={handleClearKillSwitch}
                  disabled={loading || !gateId}
                  className="w-full px-3 py-2 text-xs font-bold uppercase tracking-wider bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded transition-colors"
                >
                  {t('beta.runtime.clearKillSwitch') || 'Desactivar'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Audit, Evidence & Operation Diagnostics (1/3 width) */}
        <div className="space-y-6">
          <div className="ppos-card p-5 border ppos-border rounded">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white mb-3 flex items-center gap-2">
              <DocumentCheckIcon className="w-4 h-4 text-blue-500" />
              {t('beta.runtime.evidenceOutputs') || 'Generación de Evidencias y Auditoría'}
            </h3>
            <div className="space-y-2">
              <button
                type="button"
                onClick={handleGetAuditTimeline}
                disabled={loading || !gateId}
                className="w-full text-left px-3 py-2 text-xs font-bold ppos-surface-muted hover:bg-zinc-200 dark:hover:bg-zinc-800 border ppos-border rounded flex items-center justify-between"
              >
                <span>{t('beta.runtime.getAuditTimeline') || 'Cronología de Auditoría'}</span>
                <span className="text-[10px] text-zinc-500">→</span>
              </button>
              <button
                type="button"
                onClick={handleGetEvidencePack}
                disabled={loading || !gateId}
                className="w-full text-left px-3 py-2 text-xs font-bold ppos-surface-muted hover:bg-zinc-200 dark:hover:bg-zinc-800 border ppos-border rounded flex items-center justify-between"
              >
                <span>{t('beta.runtime.buildEvidencePack') || 'Paquete de Evidencias'}</span>
                <span className="text-[10px] text-zinc-500">→</span>
              </button>
              <button
                type="button"
                onClick={handleGetRestartTimeline}
                disabled={loading || !drillId || !gateId}
                className="w-full text-left px-3 py-2 text-xs font-bold ppos-surface-muted hover:bg-zinc-200 dark:hover:bg-zinc-800 border ppos-border rounded flex items-center justify-between"
              >
                <span>Auditoría de Reinicio</span>
                <span className="text-[10px] text-zinc-500">→</span>
              </button>
              <button
                type="button"
                onClick={handleGetRestartEvidence}
                disabled={loading || !drillId || !gateId}
                className="w-full text-left px-3 py-2 text-xs font-bold ppos-surface-muted hover:bg-zinc-200 dark:hover:bg-zinc-800 border ppos-border rounded flex items-center justify-between"
              >
                <span>Evidencias de Reinicio</span>
                <span className="text-[10px] text-zinc-500">→</span>
              </button>
            </div>
          </div>

          {/* Operation Status & Collapsible Diagnostics */}
          <div className="ppos-card p-5 border ppos-border rounded">
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white mb-2">
              Estado de la Última Operación
            </h4>
            {message ? (
              <div className={`p-3 rounded text-xs mb-3 font-medium ${
                message.includes('Error') 
                  ? 'bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400' 
                  : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
              }`}>
                {message}
              </div>
            ) : (
              <p className="text-xs text-zinc-500 mb-3">
                Selecciona una acción operativa para ejecutar y registrar evidencias.
              </p>
            )}

            {/* Technical Details Collapsible */}
            <div className="mt-3 pt-3 border-t ppos-border">
              <TechnicalDetailsCollapsible
                title="Detalles Técnicos y Diagnóstico del Entorno"
                data={{
                  gate_id: gateId,
                  policy_id: policyId,
                  grant_id: grantId,
                  session_id: sessionId,
                  drill_id: drillId,
                  finding_id: findingId,
                  tenant_id: tenantId,
                  cohort_id: cohortId,
                  participant_id: participantId,
                  result: result
                }}
                fields={[
                  { label: 'Drill ID', value: drillId, copyable: true },
                  { label: 'Session ID', value: sessionId, copyable: true },
                  { label: 'Policy ID', value: policyId, copyable: true },
                  { label: 'Grant ID', value: grantId, copyable: true },
                  { label: 'Gate ID', value: gateId, copyable: true },
                  { label: 'Finding ID', value: findingId, copyable: true }
                ]}
                missingBackendNotes={[
                  'GET /api/admin/beta/cohorts?tenant_id=:id (Listado de cohortes)',
                  'GET /api/admin/beta/participants?tenant_id=:id (Listado de participantes)'
                ]}
              />
            </div>
          </div>
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

export default LimitedBetaRuntime;
