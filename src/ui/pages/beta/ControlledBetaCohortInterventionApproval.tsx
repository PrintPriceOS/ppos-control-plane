import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { cohortInterventionApprovalClient } from '../../api/controlledBetaCohortInterventionApprovalClient';
import { normalizeUiError } from '../../utils/errorUtils';
import { cohortInterventionPreparationClient } from '../../api/controlledBetaCohortInterventionPreparationClient';
import {
  CohortInterventionApproval,
  CohortInterventionApprovalStep,
  CohortInterventionApprovalEvidence
} from '../../types/controlledBetaCohortInterventionApproval';
import { CohortInterventionPreparation } from '../../types/controlledBetaCohortInterventionPreparation';
import { useLocale } from '../../i18n';
import { TenantSelector } from '../../components/TenantSelector';
import { TechnicalDetailsCollapsible } from '../../components/TechnicalDetailsCollapsible';
import {
  ShieldCheckIcon,
  ExclamationTriangleIcon,
  CheckBadgeIcon,
  CheckCircleIcon,
  XCircleIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline';

export function ControlledBetaCohortInterventionApproval() {
  const { t } = useLocale();
  const navigate = useNavigate();

  // Tenant scoping
  const [tenantId, setTenantId] = useState<string>('');

  const [approvals, setApprovals] = useState<CohortInterventionApproval[]>([]);
  const [selectedApprovalId, setSelectedApprovalId] = useState<string>('');
  const [selectedApproval, setSelectedApproval] = useState<CohortInterventionApproval | null>(null);
  const [steps, setSteps] = useState<CohortInterventionApprovalStep[]>([]);
  const [evidencePack, setEvidencePack] = useState<CohortInterventionApprovalEvidence | null>(null);

  // Finalized preparations to choose from
  const [finalizedPreps, setFinalizedPreps] = useState<CohortInterventionPreparation[]>([]);
  const [sourcePrepId, setSourcePrepId] = useState<string>('');

  // Form states
  const [decision, setDecision] = useState<string>('APPROVE_FOR_FUTURE_EXECUTION');
  const [rationale, setRationale] = useState<string>('');
  const [changesReason, setChangesReason] = useState<string>('');
  const [returnReason, setReturnReason] = useState<string>('');
  const [escalateReason, setEscalateReason] = useState<string>('');
  const [supersedeReason, setSupersedeReason] = useState<string>('');
  const [targetSupersedeId, setTargetSupersedeId] = useState<string>('');

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Stale async response tracking
  const approvalSeqRef = useRef(0);
  const prepSeqRef = useRef(0);

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

  const fetchApprovalsList = useCallback(async () => {
    const seq = ++approvalSeqRef.current;
    setLoading(true);
    setFetchError(null);
    try {
      const res = await cohortInterventionApprovalClient.listApprovals();
      if (seq !== approvalSeqRef.current) return;
      if (res.ok) {
        setApprovals(res.approvals || []);
      } else {
        setFetchError((res as any)?.error || 'Error al listar expedientes de aprobación');
      }
    } catch (err: any) {
      if (seq !== approvalSeqRef.current) return;
      setFetchError(err?.message || String(err));
    } finally {
      if (seq === approvalSeqRef.current) setLoading(false);
    }
  }, []);

  const fetchFinalizedPrepsList = useCallback(async () => {
    const seq = ++prepSeqRef.current;
    try {
      const res = await cohortInterventionPreparationClient.listPreparations();
      if (seq !== prepSeqRef.current) return;
      if (res.ok) {
        const filtered = (res.preparations || []).filter(p => p.preparation_status === 'FINALIZED');
        setFinalizedPreps(filtered);
        // Do NOT auto-select to avoid enabling critical actions automatically
      }
    } catch (err: any) {
      console.error('Error fetching preparations:', err);
    }
  }, []);

  const handleTenantChange = (newTenantId: string) => {
    setTenantId(newTenantId);
    // Discard child selections if incompatible with new parent tenant
    if (sourcePrepId) {
      const currentPrep = finalizedPreps.find(p => p.preparation_id === sourcePrepId);
      if (currentPrep && currentPrep.tenant_id && currentPrep.tenant_id !== newTenantId) {
        setSourcePrepId('');
      }
    }
    if (selectedApproval && selectedApproval.tenant_id && selectedApproval.tenant_id !== newTenantId) {
      setSelectedApprovalId('');
      setSelectedApproval(null);
      setSteps([]);
      setEvidencePack(null);
    }
  };

  // Filter entities by tenant to prevent data contamination across tenants
  const filteredFinalizedPreps = useMemo(() => {
    if (!tenantId) return finalizedPreps;
    return finalizedPreps.filter(p => !p.tenant_id || p.tenant_id === tenantId);
  }, [finalizedPreps, tenantId]);

  const filteredApprovals = useMemo(() => {
    if (!tenantId) return approvals;
    return approvals.filter(a => !a.tenant_id || a.tenant_id === tenantId);
  }, [approvals, tenantId]);

  const loadApprovalDetails = useCallback(async (approvalId: string) => {
    if (!approvalId) return;
    setLoading(true);
    try {
      const res = await cohortInterventionApprovalClient.getApproval(approvalId);
      if (res.ok) {
        setSelectedApproval(res.approval);
        setSteps(res.steps || []);

        if (res.approval?.approval_status === 'FINALIZED') {
          const evRes = await cohortInterventionApprovalClient.getEvidencePack(approvalId);
          if (evRes?.ok) {
            setEvidencePack(evRes.evidencePack);
          } else {
            setEvidencePack(null);
          }
        } else {
          setEvidencePack(null);
        }
      }
    } catch (err: any) {
      console.error('Error loading approval details:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleCreateApproval = async () => {
    if (!sourcePrepId) {
      setErrorMsg('Seleccione una propuesta finalizada de origen.');
      return;
    }
    setLoading(true);
    setMessage('');
    setErrorMsg('');
    try {
      const res = await cohortInterventionApprovalClient.createApprovalFromPreparation(sourcePrepId);
      if (res.ok) {
        setMessage(`Expediente de aprobación generado: ${res.approval.approval_id}`);
        await fetchApprovalsList();
        setSelectedApprovalId(res.approval.approval_id);
      } else {
        setErrorMsg('Error creando el expediente de aprobación');
      }
    } catch (err: any) {
      setErrorMsg(normalizeUiError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleSignStep = async (role: string) => {
    if (!selectedApprovalId) return;
    setLoading(true);
    setMessage('');
    setErrorMsg('');
    try {
      const res = await cohortInterventionApprovalClient.signStep(selectedApprovalId, role);
      if (res.ok) {
        setMessage(`Firma de rol ${role} registrada con éxito.`);
        await loadApprovalDetails(selectedApprovalId);
      } else {
        setErrorMsg('Error al registrar la firma');
      }
    } catch (err: any) {
      setErrorMsg(normalizeUiError(err));
    } finally {
      setLoading(false);
    }
  };

  const confirmRecordDecision = () => {
    if (!selectedApprovalId || !rationale.trim()) return;
    setConfirmModal({
      isOpen: true,
      title: 'Registrar Decisión de Gobernanza',
      description: `Se registrará formalmente la decisión "${decision}" para el expediente ${selectedApprovalId}. Justificación: "${rationale}". Esta acción no ejecuta mutaciones industriales directas.`,
      action: async () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        setLoading(true);
        setMessage('');
        setErrorMsg('');
        try {
          const res = await cohortInterventionApprovalClient.recordDecision(selectedApprovalId, decision, rationale);
          if (res.ok) {
            setMessage('Decisión registrada con éxito en el expediente.');
            await loadApprovalDetails(selectedApprovalId);
            await fetchApprovalsList();
          } else {
            setErrorMsg('Error registrando la decisión');
          }
        } catch (err: any) {
          setErrorMsg(normalizeUiError(err));
        } finally {
          setLoading(false);
        }
      }
    });
  };

  const confirmRequestChanges = () => {
    if (!selectedApprovalId || !changesReason.trim()) return;
    setConfirmModal({
      isOpen: true,
      title: 'Solicitar Modificaciones a la Propuesta',
      description: `Se solicitarán formalmente cambios en el expediente ${selectedApprovalId}. Motivo: "${changesReason}".`,
      action: async () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        setLoading(true);
        setMessage('');
        setErrorMsg('');
        try {
          const res = await cohortInterventionApprovalClient.requestChanges(selectedApprovalId, changesReason);
          if (res.ok) {
            setMessage('Solicitud de modificaciones enviada.');
            setChangesReason('');
            await loadApprovalDetails(selectedApprovalId);
            await fetchApprovalsList();
          } else {
            setErrorMsg('Error al solicitar cambios');
          }
        } catch (err: any) {
          setErrorMsg(normalizeUiError(err));
        } finally {
          setLoading(false);
        }
      }
    });
  };

  const confirmReturnToPrep = () => {
    if (!selectedApprovalId || !returnReason.trim()) return;
    setConfirmModal({
      isOpen: true,
      title: 'Retornar a Fase de Preparación',
      description: `El expediente ${selectedApprovalId} será devuelto a la etapa de preparación para ajustes de checklist o re-evaluación. Motivo: "${returnReason}".`,
      action: async () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        setLoading(true);
        setMessage('');
        setErrorMsg('');
        try {
          const res = await cohortInterventionApprovalClient.returnToPreparation(selectedApprovalId, returnReason);
          if (res.ok) {
            setMessage('Expediente retornado a fase de preparación.');
            setReturnReason('');
            await loadApprovalDetails(selectedApprovalId);
            await fetchApprovalsList();
          } else {
            setErrorMsg('Error al retornar el expediente');
          }
        } catch (err: any) {
          setErrorMsg(normalizeUiError(err));
        } finally {
          setLoading(false);
        }
      }
    });
  };

  const confirmEscalate = () => {
    if (!selectedApprovalId || !escalateReason.trim()) return;
    setConfirmModal({
      isOpen: true,
      title: 'Escalar Expediente para Revisión Adicional',
      description: `Se escalará el expediente ${selectedApprovalId} para dictamen adicional de seguridad y arquitectura. Motivo: "${escalateReason}".`,
      action: async () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        setLoading(true);
        setMessage('');
        setErrorMsg('');
        try {
          const res = await cohortInterventionApprovalClient.escalateApproval(selectedApprovalId, escalateReason);
          if (res.ok) {
            setMessage('Expediente escalado para revisión adicional.');
            setEscalateReason('');
            await loadApprovalDetails(selectedApprovalId);
            await fetchApprovalsList();
          } else {
            setErrorMsg('Error al escalar el expediente');
          }
        } catch (err: any) {
          setErrorMsg(normalizeUiError(err));
        } finally {
          setLoading(false);
        }
      }
    });
  };

  const confirmSupersede = () => {
    if (!selectedApprovalId || !targetSupersedeId || !supersedeReason.trim()) return;
    setConfirmModal({
      isOpen: true,
      title: 'Sustituir Expediente de Aprobación',
      description: `El expediente ${selectedApprovalId} será marcado como sustituido por ${targetSupersedeId}. Motivo: "${supersedeReason}". Esta acción es irreversible.`,
      action: async () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        setLoading(true);
        setMessage('');
        setErrorMsg('');
        try {
          const res = await cohortInterventionApprovalClient.supersedeApproval(selectedApprovalId, targetSupersedeId, supersedeReason);
          if (res.ok) {
            setMessage(`Expediente ${selectedApprovalId} marcado como sustituido.`);
            setSupersedeReason('');
            setTargetSupersedeId('');
            await loadApprovalDetails(selectedApprovalId);
            await fetchApprovalsList();
          } else {
            setErrorMsg('Error al sustituir el expediente');
          }
        } catch (err: any) {
          setErrorMsg(normalizeUiError(err));
        } finally {
          setLoading(false);
        }
      }
    });
  };

  useEffect(() => {
    fetchApprovalsList();
    fetchFinalizedPrepsList();
  }, [fetchApprovalsList, fetchFinalizedPrepsList]);

  useEffect(() => {
    if (selectedApprovalId) {
      loadApprovalDetails(selectedApprovalId);
    }
  }, [selectedApprovalId, loadApprovalDetails]);

  // Candidates to supersede current approval
  const supersedeCandidates = useMemo(() => {
    if (!selectedApproval) return [];
    return approvals.filter(
      a => a.approval_id !== selectedApproval.approval_id &&
           a.approval_status !== 'SUPERSEDED' &&
           a.approval_status !== 'REJECTED'
    );
  }, [approvals, selectedApproval]);

  return (
    <div className="space-y-6">
      {/* WARNING BANNER */}
      <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded flex items-start gap-3">
        <ExclamationTriangleIcon className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <h4 className="text-xs font-black uppercase tracking-wider text-amber-500">
            {t('beta.governance.approvalNotExecution') || 'La aprobación no constituye ejecución inmediata'}
          </h4>
          <p className="text-xs text-slate-700 dark:text-zinc-300 leading-relaxed">
            {t('beta.runtime.safetyWarning') || 'La aprobación de gobernanza no ejecuta de forma autónoma la intervención. El acceso al cohorte, las pasarelas de pago y las integraciones con proveedores externos se mantienen sin cambios.'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: Tenant filter, Create and Select (1/3 width) */}
        <div className="space-y-6">
          {/* Tenant Filter Context */}
          <div className="ppos-card p-5 border ppos-border rounded space-y-3">
            <TenantSelector
              id="approval-tenant-selector"
              selectedTenantId={tenantId}
              onSelectTenant={handleTenantChange}
              allowEmpty
              emptyLabel="Todos los Tenants"
              label="Filtrar por Tenant"
              helperText="Selecciona un tenant para acotar las propuestas y expedientes de aprobación."
            />
          </div>

          {/* Create Approval from Preparation */}
          <div className="ppos-card p-5 border ppos-border rounded space-y-3">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-2">
              <CheckBadgeIcon className="w-4 h-4 text-blue-500" />
              Crear desde Propuesta Finalizada
            </h3>
            {filteredFinalizedPreps.length > 0 ? (
              <div className="space-y-3">
                <div>
                  <label className="text-[10px] font-bold text-zinc-500 uppercase block mb-1">Propuesta Finalizada de Origen</label>
                  <select
                    value={sourcePrepId}
                    onChange={e => setSourcePrepId(e.target.value)}
                    className="w-full ppos-input text-xs px-2.5 py-1.5 border ppos-border rounded"
                  >
                    <option value="">-- Seleccionar Propuesta Finalizada --</option>
                    {filteredFinalizedPreps.map(p => (
                      <option key={p.preparation_id} value={p.preparation_id}>
                        {p.preparation_id} ({p.preparation_type})
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={handleCreateApproval}
                  disabled={loading || !sourcePrepId}
                  className="w-full px-3 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded transition-colors"
                >
                  Generar Expediente de Aprobación
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-zinc-500 leading-relaxed">
                  No se encontraron paquetes de intervención preparados {tenantId ? 'para este tenant' : ''}. Se requiere preparar y finalizar una propuesta antes de solicitar aprobación.
                </p>
                <button
                  type="button"
                  onClick={() => navigate('/admin/beta/governance?tab=interventions')}
                  className="w-full px-3 py-1.5 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
                >
                  Ir a Preparación de Intervenciones
                </button>
              </div>
            )}
          </div>

          {/* Approval Selector */}
          <div className="ppos-card p-5 border ppos-border rounded space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">
                Expedientes de Aprobación
              </h3>
              <button
                type="button"
                onClick={fetchApprovalsList}
                disabled={loading}
                className="text-zinc-500 hover:text-blue-500 transition-colors p-1"
                title="Recargar lista"
              >
                <ArrowPathIcon className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {fetchError ? (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded space-y-2">
                <p className="text-xs text-red-500 font-medium">{fetchError}</p>
                <button
                  type="button"
                  onClick={fetchApprovalsList}
                  className="px-2.5 py-1 text-[11px] font-bold bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
                >
                  Reintentar
                </button>
              </div>
            ) : filteredApprovals.length === 0 ? (
              <div className="text-xs text-zinc-500 py-3 text-center border border-dashed ppos-border rounded">
                No hay expedientes registrados {tenantId ? 'para este tenant' : ''}.
              </div>
            ) : (
              <div className="space-y-2">
                <label htmlFor="approval-expediente-selector" className="text-[10px] font-bold text-zinc-500 uppercase block">Seleccionar Expediente</label>
                <select
                  id="approval-expediente-selector"
                  aria-label="Seleccionar Expediente de Aprobación"
                  value={selectedApprovalId}
                  onChange={e => setSelectedApprovalId(e.target.value)}
                  className="w-full ppos-input text-xs px-2.5 py-2 border ppos-border rounded"
                >
                  <option value="">-- Seleccionar Aprobación --</option>
                  {filteredApprovals.map(a => (
                    <option key={a.approval_id} value={a.approval_id}>
                      {a.approval_id} — {a.approval_status} {a.risk_level ? `[Riesgo: ${a.risk_level}]` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Right column: Details / Actions (2/3 width) */}
        <div className="lg:col-span-2 space-y-6">
          {selectedApproval ? (
            <div className="ppos-card p-6 border ppos-border rounded space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b ppos-border">
                <div>
                  <h3 className="text-base font-black text-slate-900 dark:text-white">
                    Expediente de Aprobación
                  </h3>
                  <div className="text-xs text-zinc-500 flex items-center gap-2 mt-0.5">
                    <span>Tenant: <strong className="text-slate-800 dark:text-zinc-200">{selectedApproval.tenant_id || 'Global / Multi-tenant'}</strong></span>
                    <span>•</span>
                    <span>Cohorte: <strong className="text-slate-800 dark:text-zinc-200">{selectedApproval.cohort_id || 'N/A'}</strong></span>
                  </div>
                </div>
                <span className={`px-2.5 py-1 rounded text-xs font-black uppercase self-start sm:self-auto ${
                  selectedApproval.approval_status === 'FINALIZED'
                    ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                    : selectedApproval.approval_status === 'REJECTED'
                      ? 'bg-red-500/10 text-red-500 border border-red-500/20'
                      : 'bg-zinc-500/10 text-zinc-400 border border-zinc-500/20'
                }`}>
                  {selectedApproval.approval_status}
                </span>
              </div>

              {/* Policy Rules */}
              <div className="p-4 ppos-surface-muted border ppos-border rounded space-y-1.5 text-xs">
                <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase mb-2">
                  Política de Gobernanza Aplicable
                </h4>
                <div>Nombre: <strong>{selectedApproval.approval_policy_json?.policy_name}</strong></div>
                <div>Roles Requeridos: <strong className="font-mono">{selectedApproval.approval_policy_json?.required_roles?.join(', ')}</strong></div>
                <div>Riesgo Evaluado: <strong className="font-mono">{selectedApproval.risk_level}</strong> | Confianza: <strong className="font-mono">{selectedApproval.confidence_level}</strong></div>
              </div>

              {/* Steps/Signatures */}
              <div>
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white mb-3">
                  Firmas de Conformidad por Rol
                </h4>
                <div className="space-y-2">
                  {steps.map(step => (
                    <div
                      key={step.step_id}
                      className="flex items-center justify-between p-3 border ppos-border rounded ppos-surface"
                    >
                      <div className="text-xs text-slate-800 dark:text-zinc-200">
                        Rol: <strong className="font-mono">{step.role}</strong>
                        {step.status === 'SIGNED' ? (
                          <span className="text-emerald-500 ml-2 font-bold flex-inline items-center gap-1">
                            <CheckCircleIcon className="w-3.5 h-3.5 inline mr-1" />
                            Firmado por {step.approver_id}
                          </span>
                        ) : (
                          <span className="text-amber-500 ml-2 font-medium">(Pendiente)</span>
                        )}
                      </div>
                      {step.status !== 'SIGNED' && (
                        <button
                          type="button"
                          onClick={() => handleSignStep(step.role)}
                          disabled={selectedApproval.approval_status === 'FINALIZED'}
                          className="px-2.5 py-1 text-[11px] font-bold bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded transition-colors"
                        >
                          Firmar Rol
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Set Decision Form */}
              {selectedApproval.approval_status !== 'FINALIZED' && (
                <div className="p-4 ppos-card border ppos-border rounded space-y-3">
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">
                    Registrar Decisión Formal
                  </h4>
                  <div className="space-y-3">
                    <div>
                      <label className="text-[10px] font-bold text-zinc-500 uppercase block mb-1">Decisión</label>
                      <select
                        value={decision}
                        onChange={e => setDecision(e.target.value)}
                        className="w-full ppos-input text-xs px-2.5 py-1.5 border ppos-border rounded font-mono"
                      >
                        <option value="APPROVE_FOR_FUTURE_EXECUTION">APROBAR_PARA_FUTURA_EJECUCION</option>
                        <option value="REJECT_INTERVENTION">RECHAZAR_INTERVENCION</option>
                        <option value="REQUEST_CHANGES">SOLICITAR_MODIFICACIONES</option>
                        <option value="RETURN_TO_PREPARATION">RETORNAR_A_PREPARACION</option>
                        <option value="ESCALATE_FOR_MANUAL_REVIEW">ESCALAR_A_REVISION_MANUAL</option>
                        <option value="REQUIRE_ADDITIONAL_EVIDENCE">REQUERIR_EVIDENCIAS_ADICIONALES</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-zinc-500 uppercase block mb-1">Justificación y Fundamento</label>
                      <textarea
                        value={rationale}
                        onChange={e => setRationale(e.target.value)}
                        placeholder="Explicación detallada del fundamento de gobernanza..."
                        className="w-full ppos-input text-xs px-2.5 py-1.5 border ppos-border rounded h-16"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={confirmRecordDecision}
                      disabled={loading || !rationale.trim()}
                      className="px-4 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded transition-colors"
                    >
                      Registrar Decisión
                    </button>
                  </div>
                </div>
              )}

              {/* Recorded Decision Display */}
              {selectedApproval.approval_decision && (
                <div className="p-4 bg-emerald-500/5 border border-emerald-500/20 rounded space-y-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                  <h4 className="text-xs font-black uppercase tracking-wider">Decisión Registrada</h4>
                  <div>Decisión: <strong className="font-mono">{selectedApproval.approval_decision}</strong></div>
                  {selectedApproval.rejected_reason && (
                    <div>Justificación: <em>{selectedApproval.rejected_reason}</em></div>
                  )}
                </div>
              )}

              {/* Safety Attestation Proof */}
              <div className="p-4 bg-red-500/5 border border-red-500/20 rounded space-y-2">
                <h4 className="text-xs font-black uppercase tracking-wider text-red-600 dark:text-red-400 flex items-center gap-1.5">
                  <ShieldCheckIcon className="w-4 h-4" />
                  Prueba de No-Ejecución durante Aprobación
                </h4>
                <ul className="text-xs text-zinc-600 dark:text-zinc-400 space-y-1 list-disc pl-5">
                  <li>Mutación operativa ejecutada: <strong>{String(selectedApproval.non_execution_attestation_json?.approval_executed_intervention ?? false)}</strong></li>
                  <li>Acceso de cohorte alterado: <strong>{String(selectedApproval.non_execution_attestation_json?.cohort_access_mutated ?? false)}</strong></li>
                  <li>Límites de participante alterados: <strong>{String(selectedApproval.non_execution_attestation_json?.participant_access_mutated ?? false)}</strong></li>
                  <li>Cola de trabajo creada: <strong>{String(selectedApproval.non_execution_attestation_json?.execution_job_created ?? false)}</strong></li>
                </ul>
              </div>

              {/* Workflow Actions */}
              {selectedApproval.approval_status !== 'FINALIZED' && (
                <div className="pt-4 border-t ppos-border space-y-3">
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase">Acciones Secundarias de Flujo</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div className="space-y-1">
                      <input
                        value={changesReason}
                        onChange={e => setChangesReason(e.target.value)}
                        placeholder="Motivo de cambios..."
                        className="w-full ppos-input text-xs px-2 py-1 border ppos-border rounded"
                      />
                      <button
                        type="button"
                        onClick={confirmRequestChanges}
                        disabled={!changesReason.trim()}
                        className="w-full px-2.5 py-1 text-xs font-bold bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded"
                      >
                        Solicitar Cambios
                      </button>
                    </div>
                    <div className="space-y-1">
                      <input
                        value={returnReason}
                        onChange={e => setReturnReason(e.target.value)}
                        placeholder="Motivo de retorno..."
                        className="w-full ppos-input text-xs px-2 py-1 border ppos-border rounded"
                      />
                      <button
                        type="button"
                        onClick={confirmReturnToPrep}
                        disabled={!returnReason.trim()}
                        className="w-full px-2.5 py-1 text-xs font-bold bg-zinc-600 hover:bg-zinc-700 disabled:opacity-50 text-white rounded"
                      >
                        Retornar a Prep
                      </button>
                    </div>
                    <div className="space-y-1">
                      <input
                        value={escalateReason}
                        onChange={e => setEscalateReason(e.target.value)}
                        placeholder="Motivo de escalado..."
                        className="w-full ppos-input text-xs px-2 py-1 border ppos-border rounded"
                      />
                      <button
                        type="button"
                        onClick={confirmEscalate}
                        disabled={!escalateReason.trim()}
                        className="w-full px-2.5 py-1 text-xs font-bold bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded"
                      >
                        Escalar
                      </button>
                    </div>
                  </div>

                  {/* Supersede Section */}
                  <div className="pt-3 border-t ppos-border">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase block mb-1">
                      Sustituir por Otro Expediente de Aprobación
                    </label>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <select
                        value={targetSupersedeId}
                        onChange={e => setTargetSupersedeId(e.target.value)}
                        className="w-full sm:w-1/2 ppos-input text-xs px-2 py-1 border ppos-border rounded"
                      >
                        <option value="">-- Seleccionar Expediente Sustituto --</option>
                        {supersedeCandidates.map(c => (
                          <option key={c.approval_id} value={c.approval_id}>
                            {c.approval_id} ({c.approval_status})
                          </option>
                        ))}
                      </select>
                      <input
                        value={supersedeReason}
                        onChange={e => setSupersedeReason(e.target.value)}
                        placeholder="Motivo de sustitución..."
                        className="w-full sm:w-1/2 ppos-input text-xs px-2 py-1 border ppos-border rounded"
                      />
                      <button
                        type="button"
                        onClick={confirmSupersede}
                        disabled={!targetSupersedeId || !supersedeReason.trim()}
                        className="px-3 py-1 text-xs font-bold bg-zinc-800 hover:bg-black text-white rounded disabled:opacity-50 shrink-0"
                      >
                        Sustituir
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Technical Details Collapsible */}
              <TechnicalDetailsCollapsible
                title="Detalles Técnicos y Evidencia Criptográfica"
                data={{
                  approval_id: selectedApproval.approval_id,
                  tenant_id: selectedApproval.tenant_id,
                  cohort_id: selectedApproval.cohort_id,
                  source_preparation_id: selectedApproval.source_preparation_id,
                  source_review_id: selectedApproval.source_review_id,
                  preparation_type: selectedApproval.preparation_type,
                  approval_status: selectedApproval.approval_status,
                  risk_level: selectedApproval.risk_level,
                  confidence_level: selectedApproval.confidence_level,
                  hashes: {
                    source_preparation_hash: selectedApproval.source_preparation_hash,
                    source_preparation_evidence_pack_hash: selectedApproval.source_preparation_evidence_pack_hash,
                    source_review_evidence_pack_hash: selectedApproval.source_review_evidence_pack_hash,
                    approval_result_hash: selectedApproval.approval_result_hash
                  },
                  non_execution_attestation: selectedApproval.non_execution_attestation_json,
                  evidence_pack: evidencePack
                }}
                fields={[
                  { label: 'Approval ID', value: selectedApproval.approval_id, copyable: true },
                  { label: 'Source Prep ID', value: selectedApproval.source_preparation_id, copyable: true },
                  { label: 'Source Review ID', value: selectedApproval.source_review_id, copyable: true },
                  { label: 'Prep Hash', value: selectedApproval.source_preparation_hash, copyable: true },
                  { label: 'Prep Evidence Hash', value: selectedApproval.source_preparation_evidence_pack_hash, copyable: true },
                  { label: 'Review Evidence Hash', value: selectedApproval.source_review_evidence_pack_hash, copyable: true },
                  { label: 'Result Hash', value: selectedApproval.approval_result_hash, copyable: true }
                ]}
              />
            </div>
          ) : (
            <div className="ppos-card border border-dashed ppos-border p-10 rounded text-center flex flex-col items-center justify-center space-y-3">
              <span className="text-sm font-bold text-slate-800 dark:text-zinc-200">
                Seleccione un expediente de aprobación o cree uno nuevo desde una propuesta.
              </span>
              <p className="text-xs text-zinc-500 max-w-md">
                Para solicitar aprobación se requiere preparar y sellar previamente una propuesta de intervención de cohorte.
              </p>
              <button
                type="button"
                onClick={() => navigate('/admin/beta/governance?tab=interventions')}
                className="px-4 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
              >
                Ir a Preparación de Intervenciones
              </button>
            </div>
          )}

          {(message || errorMsg) && (
            <div className="ppos-card p-4 border ppos-border rounded">
              {message && <div className="text-xs font-semibold text-emerald-500 mb-1">{message}</div>}
              {errorMsg && <div className="text-xs font-semibold text-red-500">{errorMsg}</div>}
            </div>
          )}
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
                {t('common.confirm') || 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ControlledBetaCohortInterventionApproval;

