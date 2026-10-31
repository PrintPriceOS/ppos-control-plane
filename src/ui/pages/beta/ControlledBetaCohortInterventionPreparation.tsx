import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { cohortInterventionPreparationClient } from '../../api/controlledBetaCohortInterventionPreparationClient';
import { normalizeUiError } from '../../utils/errorUtils';
import { runtimeActivityReviewClient } from '../../api/controlledBetaRuntimeActivityReviewClient';
import {
  CohortInterventionPreparation,
  CohortInterventionPreparationItem,
  CohortInterventionPreparationEvidence
} from '../../types/controlledBetaCohortInterventionPreparation';
import { RuntimeActivityReview } from '../../types/controlledBetaRuntimeActivityReview';
import { useLocale } from '../../i18n';
import { TenantSelector } from '../../components/TenantSelector';
import { TechnicalDetailsCollapsible } from '../../components/TechnicalDetailsCollapsible';
import {
  ShieldCheckIcon,
  ExclamationTriangleIcon,
  ClipboardDocumentCheckIcon,
  CheckCircleIcon,
  ArrowRightIcon,
  XCircleIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline';

export function ControlledBetaCohortInterventionPreparation() {
  const { t } = useLocale();
  const navigate = useNavigate();

  // Tenant Filter
  const [tenantId, setTenantId] = useState('');

  const [preparations, setPreparations] = useState<CohortInterventionPreparation[]>([]);
  const [selectedPrepId, setSelectedPrepId] = useState<string>('');
  const [selectedPrep, setSelectedPrep] = useState<CohortInterventionPreparation | null>(null);
  const [checklistItems, setChecklistItems] = useState<CohortInterventionPreparationItem[]>([]);
  const [evidencePack, setEvidencePack] = useState<CohortInterventionPreparationEvidence | null>(null);

  // Finalized reviews to choose from
  const [finalizedReviews, setFinalizedReviews] = useState<RuntimeActivityReview[]>([]);
  const [sourceReviewId, setSourceReviewId] = useState<string>('');

  // Rejection / Supersede inputs
  const [rejectReason, setRejectReason] = useState<string>('');
  const [supersedeReason, setSupersedeReason] = useState<string>('');
  const [targetSupersedeId, setTargetSupersedeId] = useState<string>('');

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [fetchStatus, setFetchStatus] = useState<number | null>(null);

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

  // Stale async response tracking
  const prepSeqRef = useRef(0);
  const reviewSeqRef = useRef(0);

  const fetchPrepsList = useCallback(async () => {
    const seq = ++prepSeqRef.current;
    setLoading(true);
    setFetchError(null);
    setFetchStatus(null);
    try {
      const res = await cohortInterventionPreparationClient.listPreparations();
      if (seq !== prepSeqRef.current) return;
      if (res.ok) {
        setPreparations(res.preparations || []);
      } else {
        const status = (res as any)?.status || 500;
        setFetchStatus(status);
        const fallback = status === 401
          ? 'Sesión ausente o expirada. Por favor, inicie sesión.'
          : status === 403
          ? 'No tiene permisos suficientes para consultar propuestas de intervención.'
          : 'Error al listar propuestas de intervención';
        setFetchError(normalizeUiError((res as any)?.error, fallback));
      }
    } catch (err: any) {
      if (seq !== prepSeqRef.current) return;
      setFetchStatus(err?.status || 500);
      setFetchError(normalizeUiError(err, 'Error de conexión al listar propuestas'));
    } finally {
      if (seq === prepSeqRef.current) setLoading(false);
    }
  }, []);

  const fetchFinalizedReviewsList = useCallback(async () => {
    const seq = ++reviewSeqRef.current;
    try {
      const res = await runtimeActivityReviewClient.listReviews();
      if (seq !== reviewSeqRef.current) return;
      if (res.ok) {
        const filtered = (res.reviews || []).filter(r => r.review_status === 'FINALIZED');
        setFinalizedReviews(filtered);
        // Do NOT auto-select to avoid enabling critical actions automatically
      }
    } catch (err: any) {
      console.error('Error fetching reviews:', err);
    }
  }, []);

  const handleTenantChange = (newTenantId: string) => {
    setTenantId(newTenantId);
    // Discard child selections if incompatible with new parent tenant
    if (sourceReviewId) {
      const currentReview = finalizedReviews.find(r => r.review_id === sourceReviewId);
      if (currentReview && currentReview.tenant_id && currentReview.tenant_id !== newTenantId) {
        setSourceReviewId('');
      }
    }
    if (selectedPrep && selectedPrep.tenant_id && selectedPrep.tenant_id !== newTenantId) {
      setSelectedPrepId('');
      setSelectedPrep(null);
      setChecklistItems([]);
      setEvidencePack(null);
    }
  };

  // Filter entities by tenant to prevent data contamination across tenants
  const filteredFinalizedReviews = useMemo(() => {
    if (!tenantId) return finalizedReviews;
    return finalizedReviews.filter(r => !r.tenant_id || r.tenant_id === tenantId);
  }, [finalizedReviews, tenantId]);

  const filteredPreparations = useMemo(() => {
    if (!tenantId) return preparations;
    return preparations.filter(p => !p.tenant_id || p.tenant_id === tenantId);
  }, [preparations, tenantId]);

  const loadPrepDetails = useCallback(async (prepId: string) => {
    if (!prepId) return;
    setLoading(true);
    try {
      const res = await cohortInterventionPreparationClient.getPreparation(prepId);
      if (res.ok) {
        setSelectedPrep(res.preparation);
        setChecklistItems((res as any).checklist || (res as any).items || []);

        if (res.preparation?.preparation_status === 'FINALIZED') {
          const evRes = await cohortInterventionPreparationClient.getEvidencePack(prepId);
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
      console.error('Error loading prep details:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleCreatePrep = async () => {
    if (!sourceReviewId) {
      setErrorMsg('Seleccione una revisión previa finalizada.');
      return;
    }
    setLoading(true);
    setMessage('');
    setErrorMsg('');
    try {
      const res = await cohortInterventionPreparationClient.createPreparationFromReview(sourceReviewId);
      if (res.ok) {
        setMessage(`Propuesta de intervención creada: ${res.preparation.preparation_id}`);
        await fetchPrepsList();
        setSelectedPrepId(res.preparation.preparation_id);
      } else {
        setErrorMsg(normalizeUiError((res as any)?.error, 'Error creando la propuesta de intervención'));
      }
    } catch (err: any) {
      setErrorMsg(normalizeUiError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleToggleItemStatus = async (itemId: string, currentStatus: string) => {
    if (!selectedPrepId) return;
    const newStatus = currentStatus === 'COMPLETED' ? 'PENDING' : 'COMPLETED';
    setLoading(true);
    setMessage('');
    setErrorMsg('');
    try {
      const res = await cohortInterventionPreparationClient.updateItemStatus(selectedPrepId, itemId, newStatus);
      if (res.ok) {
        await loadPrepDetails(selectedPrepId);
      } else {
        setErrorMsg(normalizeUiError((res as any)?.error, 'Error actualizando la tarea de verificación'));
      }
    } catch (err: any) {
      setErrorMsg(normalizeUiError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleApproveRole = async (role: string) => {
    if (!selectedPrepId) return;
    setLoading(true);
    setMessage('');
    setErrorMsg('');
    try {
      const res = await cohortInterventionPreparationClient.approveRole(selectedPrepId, role);
      if (res.ok) {
        setMessage(`Aprobación registrada para el rol ${role}.`);
        await loadPrepDetails(selectedPrepId);
      } else {
        setErrorMsg(normalizeUiError((res as any)?.error, 'Error registrando la aprobación de rol'));
      }
    } catch (err: any) {
      setErrorMsg(normalizeUiError(err));
    } finally {
      setLoading(false);
    }
  };

  const confirmFinalize = () => {
    if (!selectedPrepId) return;
    setConfirmModal({
      isOpen: true,
      title: 'Finalizar y Sellar Paquete de Intervención',
      description: `Esta acción sellará criptográficamente la propuesta ${selectedPrepId}. No se ejecutarán cambios en producción de forma directa; el paquete quedará listo para la fase de aprobación de gobernanza.`,
      action: async () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        setLoading(true);
        setMessage('');
        setErrorMsg('');
        try {
          const res = await cohortInterventionPreparationClient.finalizePreparation(selectedPrepId);
          if (res.ok) {
            setMessage('Propuesta de intervención sellada y finalizada correctamente.');
            await loadPrepDetails(selectedPrepId);
            await fetchPrepsList();
          } else {
            setErrorMsg(normalizeUiError((res as any)?.reason || (res as any)?.error, 'Requisitos pendientes'));
          }
        } catch (err: any) {
          setErrorMsg(normalizeUiError(err));
        } finally {
          setLoading(false);
        }
      }
    });
  };

  const confirmReject = () => {
    if (!selectedPrepId || !rejectReason.trim()) return;
    setConfirmModal({
      isOpen: true,
      title: 'Rechazar Paquete de Intervención',
      description: `Se marcará la propuesta ${selectedPrepId} como RECHAZADA. Motivo: "${rejectReason}". Consecuencia: El paquete no podrá enviarse a aprobación.`,
      action: async () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        setLoading(true);
        setMessage('');
        setErrorMsg('');
        try {
          const res = await cohortInterventionPreparationClient.rejectPreparation(selectedPrepId, rejectReason);
          if (res.ok) {
            setMessage(`Propuesta ${selectedPrepId} rechazada.`);
            setRejectReason('');
            await loadPrepDetails(selectedPrepId);
            await fetchPrepsList();
          } else {
            setErrorMsg(normalizeUiError((res as any)?.error, 'Error al rechazar la propuesta'));
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
    if (!selectedPrepId || !targetSupersedeId || !supersedeReason.trim()) return;
    setConfirmModal({
      isOpen: true,
      title: 'Sustituir Propuesta de Intervención',
      description: `La propuesta ${selectedPrepId} quedará marcada como SUPERSEDED por el expediente ${targetSupersedeId}. Motivo: "${supersedeReason}".`,
      action: async () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        setLoading(true);
        setMessage('');
        setErrorMsg('');
        try {
          const res = await cohortInterventionPreparationClient.supersedePreparation(selectedPrepId, targetSupersedeId, supersedeReason);
          if (res.ok) {
            setMessage(`Propuesta ${selectedPrepId} marcada como sustituida.`);
            setSupersedeReason('');
            setTargetSupersedeId('');
            await loadPrepDetails(selectedPrepId);
            await fetchPrepsList();
          } else {
            setErrorMsg(normalizeUiError((res as any)?.error, 'Error al sustituir la propuesta'));
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
    fetchPrepsList();
    fetchFinalizedReviewsList();
  }, [fetchPrepsList, fetchFinalizedReviewsList]);

  useEffect(() => {
    if (selectedPrepId) {
      loadPrepDetails(selectedPrepId);
    }
  }, [selectedPrepId, loadPrepDetails]);

  // Candidates to supersede current preparation
  const supersedeCandidates = useMemo(() => {
    if (!selectedPrep) return [];
    return preparations.filter(
      p => p.preparation_id !== selectedPrep.preparation_id &&
           p.preparation_status !== 'SUPERSEDED' &&
           p.preparation_status !== 'REJECTED'
    );
  }, [preparations, selectedPrep]);

  return (
    <div className="space-y-6">
      {/* WARNING BANNER */}
      <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded flex items-start gap-3">
        <ExclamationTriangleIcon className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <h4 className="text-xs font-black uppercase tracking-wider text-amber-500">
            {t('beta.governance.title') || 'Preparación de Intervenciones Gobernadas'}
          </h4>
          <p className="text-xs text-slate-700 dark:text-zinc-300 leading-relaxed">
            {t('beta.runtime.safetyWarning') || 'Esta interfaz prepara paquetes formales de propuesta de intervención. No ejecuta mutaciones operativas, cambios de facturación ni revocaciones inmediatas.'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: Tenant filter, Create and Select (1/3 width) */}
        <div className="space-y-6">
          {/* Tenant Filter Context */}
          <div className="ppos-card p-5 border ppos-border rounded space-y-3">
            <TenantSelector
              id="prep-tenant-selector"
              selectedTenantId={tenantId}
              onSelectTenant={handleTenantChange}
              allowEmpty
              emptyLabel="Todos los Tenants"
              label="Filtrar por Tenant"
              helperText="Selecciona un tenant para acotar las revisiones y propuestas disponibles."
            />
          </div>

          {/* Create Proposal from Review */}
          <div className="ppos-card p-5 border ppos-border rounded space-y-3">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-2">
              <ClipboardDocumentCheckIcon className="w-4 h-4 text-blue-500" />
              Construir desde Revisión Finalizada
            </h3>
            {filteredFinalizedReviews.length > 0 ? (
              <div className="space-y-3">
                <div>
                  <label className="text-[10px] font-bold text-zinc-500 uppercase block mb-1">
                    Revisión Finalizada de Origen
                  </label>
                  <select
                    id="source-review-selector"
                    aria-label="Revisión Finalizada de Origen"
                    value={sourceReviewId}
                    onChange={e => setSourceReviewId(e.target.value)}
                    className="w-full ppos-input text-xs px-2.5 py-1.5 border ppos-border rounded"
                  >
                    <option value="">-- Seleccionar Revisión --</option>
                    {filteredFinalizedReviews.map(r => (
                      <option key={r.review_id} value={r.review_id}>
                        {r.review_id.slice(0, 16)}... ({r.cohort_id}) - Riesgo: {r.risk_level || 'N/A'}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={handleCreatePrep}
                  disabled={loading || !sourceReviewId}
                  className="w-full px-3 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded transition-colors"
                >
                  Generar Paquete de Propuesta
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-zinc-500 leading-relaxed">
                  {tenantId
                    ? 'No se encontraron revisiones finalizadas para el tenant seleccionado.'
                    : (t('beta.governance.noFinalizedReviews') || 'No se encontraron revisiones de salud finalizadas. Se requiere una revisión de actividad antes de preparar una intervención.')}
                </p>
                <button
                  type="button"
                  onClick={() => navigate('/admin/beta/runtime?tab=health')}
                  className="w-full px-3 py-1.5 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
                >
                  {t('beta.governance.goToHealthReviews') || 'Ir a Revisiones de Salud'}
                </button>
              </div>
            )}
          </div>

          {/* Select Existing Preparation */}
          <div className="ppos-card p-5 border ppos-border rounded space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">
                Seleccionar Propuesta Activa
              </h3>
              <button
                type="button"
                onClick={fetchPrepsList}
                title="Actualizar propuestas"
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
              >
                <ArrowPathIcon className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {fetchError ? (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded space-y-2">
                <p className="text-xs text-red-500 font-medium">{fetchError}</p>
                {fetchStatus === 401 ? (
                  <button
                    type="button"
                    onClick={() => navigate('/login')}
                    className="px-2.5 py-1 text-[11px] font-bold bg-amber-600 text-white rounded hover:bg-amber-700 transition-colors"
                  >
                    Iniciar Sesión
                  </button>
                ) : fetchStatus === 403 ? (
                  <span className="text-[11px] text-zinc-500 font-medium">Permisos insuficientes</span>
                ) : (
                  <button
                    type="button"
                    onClick={fetchPrepsList}
                    className="px-2.5 py-1 text-[11px] font-bold bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
                  >
                    Reintentar
                  </button>
                )}
              </div>
            ) : filteredPreparations.length === 0 ? (
              <div className="text-xs text-zinc-500 py-3 text-center border border-dashed ppos-border rounded">
                {tenantId
                  ? 'No hay propuestas de intervención registradas para el tenant seleccionado.'
                  : 'No se encontraron propuestas de intervención registradas.'}
              </div>
            ) : (
              <div className="space-y-2">
                <label htmlFor="prep-proposal-selector" className="text-[10px] font-bold text-zinc-500 uppercase block">Seleccionar Propuesta</label>
                <select
                  id="prep-proposal-selector"
                  aria-label="Seleccionar Propuesta de Intervención"
                  value={selectedPrepId}
                  onChange={e => setSelectedPrepId(e.target.value)}
                  className="w-full ppos-input text-xs px-2.5 py-2 border ppos-border rounded"
                >
                  <option value="">-- Seleccionar Propuesta --</option>
                  {filteredPreparations.map(p => (
                    <option key={p.preparation_id} value={p.preparation_id}>
                      {p.preparation_id.slice(0, 16)}... ({p.preparation_type || 'MANUAL'}) - {p.preparation_status}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Right column: Details / Actions (2/3 width) */}
        <div className="lg:col-span-2 space-y-6">
          {selectedPrep ? (
            <div className="ppos-card p-6 border ppos-border rounded space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b ppos-border">
                <div>
                  <h3 className="text-base font-black text-slate-900 dark:text-white">
                    Detalle de Propuesta: {selectedPrep.preparation_id}
                  </h3>
                  <span className="text-[10px] font-mono text-zinc-500 uppercase">
                    Origen: {selectedPrep.source_review_id} | Cohorte: {selectedPrep.cohort_id} | Tenant: {selectedPrep.tenant_id}
                  </span>
                </div>
                <span className={`px-2.5 py-1 rounded text-xs font-black uppercase self-start sm:self-auto ${
                  selectedPrep.preparation_status === 'FINALIZED'
                    ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                    : selectedPrep.preparation_status === 'REJECTED' || selectedPrep.preparation_status === 'SUPERSEDED'
                    ? 'bg-red-500/10 text-red-500 border border-red-500/20'
                    : 'bg-zinc-500/10 text-zinc-400 border border-zinc-500/20'
                }`}>
                  {selectedPrep.preparation_status}
                </span>
              </div>

              {/* Action buttons */}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={confirmFinalize}
                  disabled={loading || selectedPrep.preparation_status === 'FINALIZED' || selectedPrep.preparation_status === 'REJECTED' || selectedPrep.preparation_status === 'SUPERSEDED'}
                  className="px-4 py-2 text-xs font-bold bg-pink-600 hover:bg-pink-700 disabled:opacity-50 text-white rounded transition-colors"
                >
                  Finalizar y Sellar Paquete
                </button>
                {selectedPrep.preparation_status === 'FINALIZED' && (
                  <button
                    type="button"
                    onClick={() => navigate('/admin/beta/governance?tab=approvals')}
                    className="px-4 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors flex items-center gap-1.5"
                  >
                    <span>Proceder a Aprobación</span>
                    <ArrowRightIcon className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Intervention Summary Card */}
              <div className="p-4 ppos-surface-muted border ppos-border rounded space-y-2">
                <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                  Resumen de la Intervención Propuesta
                </h4>
                <p className="text-xs text-slate-700 dark:text-zinc-300 leading-relaxed">
                  {selectedPrep.intervention_summary_json?.summary || 'Propuesta de intervención preventiva de cohorte beta.'}
                </p>
                <div className="text-[11px] font-mono text-zinc-500 pt-1">
                  Decisión sugerida: <strong className="text-blue-500">{selectedPrep.recommended_decision_from_phase137}</strong>
                </div>
              </div>

              {/* Checklist Items */}
              <div>
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white mb-3">
                  Tareas de Verificación Previa ({checklistItems.length})
                </h4>
                <div className="space-y-2">
                  {checklistItems.map(item => (
                    <div
                      key={item.item_id}
                      className="flex items-center justify-between p-3 border ppos-border rounded ppos-surface gap-3"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {item.item_status === 'COMPLETED' ? (
                          <CheckCircleIcon className="w-4 h-4 text-emerald-500 shrink-0" />
                        ) : (
                          <XCircleIcon className="w-4 h-4 text-zinc-400 shrink-0" />
                        )}
                        <div className="truncate">
                          <span className="text-xs font-bold text-slate-800 dark:text-zinc-200 block truncate">
                            {item.title || (item as any).action_key || item.item_id}
                          </span>
                          <span className="text-[10px] text-zinc-400 truncate block">
                            {item.description || (item as any).label || ''}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleToggleItemStatus(item.item_id, item.item_status)}
                        disabled={selectedPrep.preparation_status === 'FINALIZED'}
                        className={`px-2.5 py-1 text-[11px] font-bold rounded border transition-colors shrink-0 ${
                          item.item_status === 'COMPLETED'
                            ? 'border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10'
                            : 'border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                        }`}
                      >
                        {item.item_status === 'COMPLETED' ? 'Completado' : 'Marcar Hecho'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Approvals Section */}
              <div>
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white mb-3">
                  Aprobaciones de Rol Requeridas
                </h4>
                <div className="space-y-2">
                  {selectedPrep.required_approvals_json?.map((app, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-3 border ppos-border rounded ppos-surface"
                    >
                      <div className="text-xs text-slate-800 dark:text-zinc-200">
                        Rol: <strong className="font-mono">{app.role}</strong>
                        {app.approved && <span className="text-emerald-500 ml-2 font-bold">(Aprobado por {app.approved_by})</span>}
                      </div>
                      {!app.approved && (
                        <button
                          type="button"
                          onClick={() => handleApproveRole(app.role)}
                          disabled={selectedPrep.preparation_status === 'FINALIZED'}
                          className="px-2.5 py-1 text-[11px] font-bold bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded transition-colors"
                        >
                          Aprobar Rol
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Safety Attestation Proof */}
              <div className="p-4 bg-emerald-500/5 border border-emerald-500/20 rounded space-y-2">
                <h4 className="text-xs font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                  <ShieldCheckIcon className="w-4 h-4" />
                  Prueba de Atestación de No-Ejecución
                </h4>
                <ul className="text-xs text-zinc-600 dark:text-zinc-400 space-y-1 list-disc pl-5">
                  <li>Planificación sin ejecución reconocida: <strong>{String(selectedPrep.non_execution_attestation_json?.non_execution_acknowledged ?? false)}</strong></li>
                  <li>Contexto acotado verificado: <strong>{String(selectedPrep.non_execution_attestation_json?.readiness_only_attested ?? false)}</strong></li>
                  <li>Atestado por: <strong>{selectedPrep.non_execution_attestation_json?.attested_by}</strong></li>
                </ul>
              </div>

              {/* Supersede Section */}
              {selectedPrep.preparation_status !== 'SUPERSEDED' && selectedPrep.preparation_status !== 'REJECTED' && (
                <div className="pt-4 border-t ppos-border space-y-3">
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase">Sustituir esta Propuesta</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-bold text-zinc-500 uppercase block mb-1">
                        Propuesta Reemplazante
                      </label>
                      <select
                        value={targetSupersedeId}
                        onChange={e => setTargetSupersedeId(e.target.value)}
                        className="w-full ppos-input text-xs px-2.5 py-1.5 border ppos-border rounded font-mono"
                      >
                        <option value="">-- Seleccionar Propuesta Destino --</option>
                        {supersedeCandidates.map(c => (
                          <option key={c.preparation_id} value={c.preparation_id}>
                            {c.preparation_id.slice(0, 16)}... ({c.preparation_type}) - {c.preparation_status}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-zinc-500 uppercase block mb-1">Motivo Justificado</label>
                      <input
                        value={supersedeReason}
                        onChange={e => setSupersedeReason(e.target.value)}
                        placeholder="Ej: Sustituido por propuesta con alcance ampliado"
                        className="w-full ppos-input text-xs px-2.5 py-1.5 border ppos-border rounded"
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={confirmSupersede}
                    disabled={loading || !targetSupersedeId || !supersedeReason.trim()}
                    className="px-3 py-1.5 text-xs font-bold bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded transition-colors"
                  >
                    Aplicar Sustitución
                  </button>
                </div>
              )}

              {/* Reject Action */}
              {selectedPrep.preparation_status !== 'REJECTED' && selectedPrep.preparation_status !== 'FINALIZED' && selectedPrep.preparation_status !== 'SUPERSEDED' && (
                <div className="pt-4 border-t ppos-border space-y-3">
                  <h4 className="text-xs font-bold text-red-500 uppercase">Rechazar esta Propuesta</h4>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      value={rejectReason}
                      onChange={e => setRejectReason(e.target.value)}
                      placeholder="Motivo del rechazo..."
                      className="w-full ppos-input text-xs px-2.5 py-1.5 border ppos-border rounded"
                    />
                    <button
                      type="button"
                      onClick={confirmReject}
                      disabled={loading || !rejectReason.trim()}
                      className="px-4 py-1.5 text-xs font-bold bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded shrink-0 transition-colors"
                    >
                      Rechazar
                    </button>
                  </div>
                </div>
              )}

              {/* Technical Details Collapsible */}
              <TechnicalDetailsCollapsible
                title="Detalles Técnicos del Paquete de Intervención"
                items={[
                  { label: 'Preparation ID', value: selectedPrep.preparation_id, copyable: true },
                  { label: 'Review de Origen', value: selectedPrep.source_review_id, copyable: true },
                  { label: 'Tenant ID', value: selectedPrep.tenant_id, copyable: true },
                  { label: 'Cohorte ID', value: selectedPrep.cohort_id, copyable: true },
                  { label: 'Tipo de Propuesta', value: selectedPrep.preparation_type },
                  { label: 'Nivel de Riesgo', value: selectedPrep.risk_level },
                  { label: 'Preparado por', value: selectedPrep.prepared_by },
                  { label: 'Source Review Evidence Hash', value: selectedPrep.source_review_evidence_pack_hash, copyable: true },
                  { label: 'Preparation Evidence Hash', value: evidencePack?.evidence_pack_hash, copyable: true }
                ]}
                jsonPayload={evidencePack || selectedPrep}
              />
            </div>
          ) : (
            <div className="ppos-card border border-dashed ppos-border p-10 rounded text-center flex flex-col items-center justify-center space-y-3">
              <span className="text-sm font-bold text-slate-800 dark:text-zinc-200">
                {t('beta.governance.noFinalizedReviews') || 'No se encontraron revisiones de salud finalizadas.'}
              </span>
              <p className="text-xs text-zinc-500 max-w-md">
                {t('beta.governance.preparationHint') || 'Para preparar una propuesta de intervención gobernada se requiere una revisión de actividad finalizada.'}
              </p>
              <button
                type="button"
                onClick={() => navigate('/admin/beta/runtime?tab=health')}
                className="px-4 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
              >
                {t('beta.governance.goToHealthReviews') || 'Ir a Revisiones de Salud de Cohorte'}
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
            <h4 className="text-sm font-black uppercase text-slate-900 dark:text-white">
              {confirmModal.title}
            </h4>
            <p className="text-xs text-slate-600 dark:text-zinc-300 leading-relaxed">
              {confirmModal.description}
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                className="px-3 py-1.5 text-xs font-bold border ppos-border hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmModal.action}
                className="px-3 py-1.5 text-xs font-bold bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
              >
                Confirmar Acción
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ControlledBetaCohortInterventionPreparation;
