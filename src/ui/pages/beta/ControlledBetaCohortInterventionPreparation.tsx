import React, { useState, useEffect, useCallback } from 'react';
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
import {
  ShieldCheckIcon,
  ExclamationTriangleIcon,
  ClipboardDocumentCheckIcon,
  CheckCircleIcon,
  ArrowRightIcon,
  XCircleIcon
} from '@heroicons/react/24/outline';

export function ControlledBetaCohortInterventionPreparation() {
  const { t } = useLocale();
  const navigate = useNavigate();

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

  const fetchPrepsList = useCallback(async () => {
    try {
      const res = await cohortInterventionPreparationClient.listPreparations();
      if (res.ok) {
        setPreparations(res.preparations);
      }
    } catch (err: any) {
      console.error('Error fetching preparations:', err);
    }
  }, []);

  const fetchFinalizedReviewsList = useCallback(async () => {
    try {
      const res = await runtimeActivityReviewClient.listReviews();
      if (res.ok) {
        const filtered = res.reviews.filter(r => r.review_status === 'FINALIZED');
        setFinalizedReviews(filtered);
        if (filtered.length > 0 && !sourceReviewId) {
          setSourceReviewId(filtered[0].review_id);
        }
      }
    } catch (err: any) {
      console.error('Error fetching reviews:', err);
    }
  }, [sourceReviewId]);

  const loadPrepDetails = useCallback(async (prepId: string) => {
    if (!prepId) return;
    setLoading(true);
    try {
      const res = await cohortInterventionPreparationClient.getPreparation(prepId);
      if (res.ok) {
        setSelectedPrep(res.preparation);
        setChecklistItems(res.checklist);

        if (res.preparation.preparation_status === 'FINALIZED') {
          const evRes = await cohortInterventionPreparationClient.getEvidencePack(prepId);
          if (evRes.ok) {
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
      setErrorMsg('Se requiere una revisión previa finalizada.');
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
        setErrorMsg('Error creando la propuesta de intervención');
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
      const res = await cohortInterventionPreparationClient.updateChecklistItem(selectedPrepId, itemId, newStatus);
      if (res.ok) {
        await loadPrepDetails(selectedPrepId);
      } else {
        setErrorMsg('Error actualizando la tarea de verificación');
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
      const res = await cohortInterventionPreparationClient.approvePreparationRole(selectedPrepId, role, 'current-admin');
      if (res.ok) {
        setMessage(`Aprobación registrada para el rol ${role}.`);
        await loadPrepDetails(selectedPrepId);
      } else {
        setErrorMsg('Error registrando la aprobación de rol');
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
          const res = await cohortInterventionPreparationClient.finalizePreparation(selectedPrepId, {
            attestedBy: 'super-admin'
          });
          if (res.ok) {
            setMessage('Propuesta de intervención sellada y finalizada correctamente.');
            await loadPrepDetails(selectedPrepId);
            await fetchPrepsList();
          } else {
            setErrorMsg(`Bloqueo al finalizar: ${res.reason || 'Requisitos pendientes'}`);
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
      description: `Se marcará la propuesta ${selectedPrepId} como RECHAZADA. Motivo: "${rejectReason}".`,
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
            setErrorMsg('Error al rechazar la propuesta');
          }
        } catch (err: any) {
          setErrorMsg(normalizeUiError(err));
        } finally {
          setLoading(false);
        }
      }
    });
  };

  const handleSupersede = async () => {
    if (!selectedPrepId || !targetSupersedeId || !supersedeReason.trim()) return;
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
        setErrorMsg('Error al sustituir la propuesta');
      }
    } catch (err: any) {
      setErrorMsg(normalizeUiError(err));
    } finally {
      setLoading(false);
    }
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
        {/* Left column: Create and Select (1/3 width) */}
        <div className="space-y-6">
          <div className="ppos-card p-5 border ppos-border rounded">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white mb-3 flex items-center gap-2">
              <ClipboardDocumentCheckIcon className="w-4 h-4 text-blue-500" />
              Construir desde Revisión Finalizada
            </h3>
            {finalizedReviews.length > 0 ? (
              <div className="space-y-3">
                <div>
                  <label className="text-[10px] font-bold text-zinc-500 uppercase block mb-1">Revisión Finalizada de Origen</label>
                  <select
                    value={sourceReviewId}
                    onChange={e => setSourceReviewId(e.target.value)}
                    className="w-full ppos-input text-xs px-2.5 py-1.5 border ppos-border rounded"
                  >
                    {finalizedReviews.map(r => (
                      <option key={r.review_id} value={r.review_id}>
                        {r.review_id} ({r.cohort_id}) - Riesgo: {r.risk_level}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={handleCreatePrep}
                  disabled={loading}
                  className="w-full px-3 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded transition-colors"
                >
                  Generar Paquete de Propuesta
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-zinc-500 leading-relaxed">
                  {t('beta.governance.noFinalizedReviews') || 'No se encontraron revisiones de salud finalizadas. Se requiere una revisión de actividad antes de preparar una intervención.'}
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

          <div className="ppos-card p-5 border ppos-border rounded">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white mb-3">
              Seleccionar Propuesta Activa
            </h3>
            <select
              value={selectedPrepId}
              onChange={e => setSelectedPrepId(e.target.value)}
              className="w-full ppos-input text-xs px-2.5 py-2 border ppos-border rounded"
            >
              <option value="">-- Seleccionar Propuesta --</option>
              {preparations.map(p => (
                <option key={p.preparation_id} value={p.preparation_id}>
                  {p.preparation_id} ({p.preparation_type}) - {p.preparation_status}
                </option>
              ))}
            </select>
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
                    Cohorte: {selectedPrep.cohort_id} | Tipo: {selectedPrep.preparation_type}
                  </span>
                </div>
                <span className={`px-2.5 py-1 rounded text-xs font-black uppercase self-start sm:self-auto ${
                  selectedPrep.preparation_status === 'FINALIZED'
                    ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                    : selectedPrep.preparation_status === 'REJECTED'
                      ? 'bg-red-500/10 text-red-500 border border-red-500/20'
                      : 'bg-zinc-500/10 text-zinc-400 border border-zinc-500/20'
                }`}>
                  {selectedPrep.preparation_status}
                </span>
              </div>

              {/* Action Button */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={confirmFinalize}
                  disabled={loading || selectedPrep.preparation_status === 'FINALIZED' || selectedPrep.preparation_status === 'REJECTED' || selectedPrep.preparation_status === 'SUPERSEDED'}
                  className="px-4 py-2 text-xs font-bold bg-pink-600 hover:bg-pink-700 disabled:opacity-50 text-white rounded transition-colors"
                >
                  Finalizar y Sellar Paquete
                </button>
              </div>

              {/* Summary Card */}
              <div className="p-4 ppos-surface-muted border ppos-border rounded space-y-1.5 text-xs">
                <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase mb-2">
                  Resumen de la Intervención
                </h4>
                <div>Tipo: <strong className="text-blue-500">{selectedPrep.preparation_type}</strong></div>
                <div>Revisión de Origen: <strong className="font-mono">{selectedPrep.source_review_id}</strong></div>
                <div className="text-zinc-600 dark:text-zinc-400 pt-1">
                  Descripción: <em>{selectedPrep.intervention_summary_json?.summary}</em>
                </div>
              </div>

              {/* Checklist Items */}
              <div>
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white mb-3">
                  Tareas de Verificación ({checklistItems.length})
                </h4>
                <div className="space-y-2">
                  {checklistItems.map(item => (
                    <div
                      key={item.item_id}
                      className="flex items-center justify-between p-3 border ppos-border rounded ppos-surface"
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={item.item_status === 'COMPLETED'}
                          disabled={selectedPrep.preparation_status === 'FINALIZED'}
                          onChange={() => handleToggleItemStatus(item.item_id, item.item_status)}
                          className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                        />
                        <span className={`text-xs ${
                          item.item_status === 'COMPLETED' ? 'line-through text-zinc-400' : 'text-slate-800 dark:text-zinc-200'
                        }`}>
                          {item.description}
                        </span>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                        item.item_status === 'COMPLETED' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'
                      }`}>
                        {item.item_status}
                      </span>
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

              {/* Reject Action */}
              {selectedPrep.preparation_status !== 'REJECTED' && selectedPrep.preparation_status !== 'FINALIZED' && (
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

export default ControlledBetaCohortInterventionPreparation;
