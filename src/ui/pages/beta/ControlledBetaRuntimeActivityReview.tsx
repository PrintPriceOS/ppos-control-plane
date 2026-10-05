import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { runtimeActivityReviewClient } from '../../api/controlledBetaRuntimeActivityReviewClient';
import { normalizeUiError } from '../../utils/errorUtils';
import {
  RuntimeActivityReview,
  RuntimeActivityReviewDecision,
  RuntimeActivityReviewFinding,
  RuntimeActivityReviewEvidence
} from '../../types/controlledBetaRuntimeActivityReview';
import { useLocale } from '../../i18n';
import { TenantSelector } from '../../components/TenantSelector';
import { TechnicalDetailsCollapsible } from '../../components/TechnicalDetailsCollapsible';
import {
  ExclamationTriangleIcon,
  ShieldCheckIcon,
  DocumentMagnifyingGlassIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline';

export function ControlledBetaRuntimeActivityReview() {
  const { t } = useLocale();
  const navigate = useNavigate();

  const [reviews, setReviews] = useState<RuntimeActivityReview[]>([]);
  const [selectedReviewId, setSelectedReviewId] = useState<string>('');
  const [selectedReview, setSelectedReview] = useState<RuntimeActivityReview | null>(null);
  const [decision, setDecision] = useState<RuntimeActivityReviewDecision | null>(null);
  const [findings, setFindings] = useState<RuntimeActivityReviewFinding[]>([]);
  const [evidencePack, setEvidencePack] = useState<RuntimeActivityReviewEvidence | null>(null);

  // Form states for creation
  const [tenantId, setTenantId] = useState('');
  const [cohortId, setCohortId] = useState('cohort_beta_01');
  const [windowStart, setWindowStart] = useState(new Date(Date.now() - 86400000 * 7).toISOString().substring(0, 16));
  const [windowEnd, setWindowEnd] = useState(new Date().toISOString().substring(0, 16));

  // Supersede reason
  const [supersedeReason, setSupersedeReason] = useState('');
  const [targetSupersedeId, setTargetSupersedeId] = useState('');

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [reviewFetchError, setReviewFetchError] = useState<string | null>(null);

  // Confirmation modal state for critical/destructive actions
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

  // Discard stale async responses
  const reviewSeqRef = useRef(0);

  const fetchReviewsList = useCallback(async () => {
    const seq = ++reviewSeqRef.current;
    setLoading(true);
    setReviewFetchError(null);
    try {
      const res = await runtimeActivityReviewClient.listReviews();
      if (seq !== reviewSeqRef.current) return;
      if (res.ok) {
        setReviews(res.reviews || []);
      } else {
        setReviewFetchError((res as any)?.error || 'Error al listar revisiones');
      }
    } catch (err: any) {
      if (seq !== reviewSeqRef.current) return;
      setReviewFetchError(err?.message || String(err));
    } finally {
      if (seq === reviewSeqRef.current) {
        setLoading(false);
      }
    }
  }, []);

  const handleTenantChange = (newTenantId: string) => {
    setTenantId(newTenantId);
    // Changing parent tenant clears incompatible child review selection
    if (selectedReview && selectedReview.tenant_id && selectedReview.tenant_id !== newTenantId) {
      setSelectedReviewId('');
      setSelectedReview(null);
      setDecision(null);
      setFindings([]);
      setEvidencePack(null);
    }
  };

  // Filter reviews by selected tenant without mixing other tenants' data
  const filteredReviews = useMemo(() => {
    if (!tenantId) return reviews;
    return reviews.filter(r => !r.tenant_id || r.tenant_id === tenantId);
  }, [reviews, tenantId]);

  const loadReviewDetails = useCallback(async (reviewId: string) => {
    if (!reviewId) return;
    setLoading(true);
    try {
      const res = await runtimeActivityReviewClient.getReview(reviewId);
      if (res.ok) {
        setSelectedReview(res.review);
        setDecision(res.decision || null);
        setFindings(res.findings || []);

        if (res.review.review_status === 'FINALIZED') {
          const evRes = await runtimeActivityReviewClient.getEvidencePack(reviewId);
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
      console.error('Error loading review details:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleCreateReview = async () => {
    if (!tenantId) {
      setErrorMsg('Seleccione un tenant autorizado antes de crear la revisión.');
      return;
    }
    setLoading(true);
    setMessage('');
    setErrorMsg('');
    try {
      const res = await runtimeActivityReviewClient.createReview({
        tenantId,
        cohortId,
        windowStart: new Date(windowStart).toISOString(),
        windowEnd: new Date(windowEnd).toISOString()
      });
      if (res.ok) {
        setMessage(`Revisión de salud creada con éxito: ${res.review.review_id}`);
        await fetchReviewsList();
        setSelectedReviewId(res.review.review_id);
      } else {
        setErrorMsg('Error creando la revisión de salud');
      }
    } catch (err: any) {
      setErrorMsg(normalizeUiError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleEvaluate = async () => {
    if (!selectedReviewId) return;
    setLoading(true);
    setMessage('');
    setErrorMsg('');
    try {
      const res = await runtimeActivityReviewClient.evaluateReview(selectedReviewId);
      if (res.ok) {
        setMessage('Evaluación de salud completada con éxito.');
        await loadReviewDetails(selectedReviewId);
      } else {
        setErrorMsg('Error al evaluar la salud del cohorte');
      }
    } catch (err: any) {
      setErrorMsg(normalizeUiError(err));
    } finally {
      setLoading(false);
    }
  };

  const confirmFinalize = () => {
    if (!selectedReviewId) return;
    setConfirmModal({
      isOpen: true,
      title: 'Finalizar y Sellar Revisión de Salud',
      description: `Se bloqueará criptográficamente la revisión ${selectedReviewId}. Esta acción es definitiva y permitirá habilitar propuestas de intervención downstream.`,
      action: async () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        setLoading(true);
        setMessage('');
        setErrorMsg('');
        try {
          const res = await runtimeActivityReviewClient.finalizeReview(selectedReviewId);
          if (res.ok) {
            setMessage('Revisión finalizada y protegida criptográficamente.');
            await loadReviewDetails(selectedReviewId);
            await fetchReviewsList();
          } else {
            setErrorMsg('Error al finalizar la revisión');
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
    if (!selectedReviewId || !targetSupersedeId) return;
    if (!supersedeReason.trim()) {
      setErrorMsg('El motivo de sustitución es obligatorio.');
      return;
    }
    setConfirmModal({
      isOpen: true,
      title: 'Sustituir Revisión de Salud',
      description: `La revisión ${selectedReviewId} quedará marcada como SUPERSEDED por el expediente ${targetSupersedeId}. Consecuencia: No podrá ser utilizada como fuente de nuevas intervenciones. Motivo: "${supersedeReason}".`,
      action: async () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        setLoading(true);
        setMessage('');
        setErrorMsg('');
        try {
          const res = await runtimeActivityReviewClient.supersedeReview(selectedReviewId, {
            supersededByReviewId: targetSupersedeId,
            reason: supersedeReason
          });
          if (res.ok) {
            setMessage(`Revisión ${selectedReviewId} sustituida correctamente.`);
            setSupersedeReason('');
            setTargetSupersedeId('');
            await loadReviewDetails(selectedReviewId);
            await fetchReviewsList();
          } else {
            setErrorMsg('Error al sustituir la revisión');
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
    fetchReviewsList();
  }, [fetchReviewsList]);

  useEffect(() => {
    if (selectedReviewId) {
      loadReviewDetails(selectedReviewId);
    }
  }, [selectedReviewId, loadReviewDetails]);

  // Candidate reviews to supersede current review (excluding self and already superseded ones)
  const supersedeCandidates = useMemo(() => {
    if (!selectedReview) return [];
    return reviews.filter(r => r.review_id !== selectedReview.review_id && r.review_status !== 'SUPERSEDED');
  }, [reviews, selectedReview]);

  return (
    <div className="space-y-6">
      {/* Warning Header */}
      <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded flex items-start gap-3">
        <ExclamationTriangleIcon className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <h4 className="text-xs font-black uppercase tracking-wider text-amber-500">
            {t('beta.health.title') || 'Revisión de Salud de Cohorte y Recomendaciones'}
          </h4>
          <p className="text-xs text-slate-700 dark:text-zinc-300 leading-relaxed">
            {t('beta.runtime.safetyWarning') || 'Esta revisión analítica no altera automáticamente el acceso del cohorte, la facturación ni la ejecución de órdenes.'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left pane: Review selector and creation (1/3 width) */}
        <div className="space-y-6">
          {/* Creation card with Tenant Selector */}
          <div className="ppos-card p-5 border ppos-border rounded space-y-4">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-2">
              <DocumentMagnifyingGlassIcon className="w-4 h-4 text-blue-500" />
              Nueva Captura de Revisión
            </h3>

            <TenantSelector
              id="review-tenant-selector"
              selectedTenantId={tenantId}
              onSelectTenant={handleTenantChange}
              label="Filtrar por Tenant"
              allowEmpty
              emptyLabel="Todos los Tenants"
              helperText="El tenant seleccionado filtra los datos y previene mezclar organizaciones."
            />

            <div className="space-y-3">
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
                <span className="text-[9px] text-zinc-400 mt-0.5 block">
                  Identificador de cohorte en pruebas (requerido por el runtime).
                </span>
              </div>

              <div>
                <label className="text-[10px] font-bold text-zinc-500 uppercase block mb-1">Inicio de Ventana</label>
                <input
                  type="datetime-local"
                  value={windowStart}
                  onChange={e => setWindowStart(e.target.value)}
                  className="w-full ppos-input text-xs px-2.5 py-1.5 border ppos-border rounded font-mono"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-zinc-500 uppercase block mb-1">Fin de Ventana</label>
                <input
                  type="datetime-local"
                  value={windowEnd}
                  onChange={e => setWindowEnd(e.target.value)}
                  className="w-full ppos-input text-xs px-2.5 py-1.5 border ppos-border rounded font-mono"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={handleCreateReview}
              disabled={loading || !tenantId}
              className="w-full px-3 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded transition-colors"
            >
              Crear Revisión de Ventana
            </button>
          </div>

          {/* Review Selection Card */}
          <div className="ppos-card p-5 border ppos-border rounded space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">
                Seleccionar Revisión de Cohorte
              </h3>
              <button
                type="button"
                onClick={fetchReviewsList}
                disabled={loading}
                title="Actualizar listado"
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
              >
                <ArrowPathIcon className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {reviewFetchError && (
              <div className="p-2 text-[11px] text-red-500 bg-red-500/10 border border-red-500/20 rounded flex items-center justify-between">
                <span>{reviewFetchError}</span>
                <button
                  type="button"
                  onClick={fetchReviewsList}
                  className="underline uppercase text-[10px] font-bold ml-2"
                >
                  Reintentar
                </button>
              </div>
            )}

            <select
              value={selectedReviewId}
              onChange={e => setSelectedReviewId(e.target.value)}
              className="w-full ppos-input text-xs px-2.5 py-2 border ppos-border rounded"
            >
              <option value="">-- Seleccionar Revisión --</option>
              {filteredReviews.map(r => (
                <option key={r.review_id} value={r.review_id}>
                  {r.review_id.slice(0, 16)}... [{r.review_status}] ({r.cohort_id || 'Sin cohorte'}) - Riesgo: {r.risk_level || 'N/A'}
                </option>
              ))}
            </select>

            {!loading && filteredReviews.length === 0 && (
              <p className="text-[11px] text-zinc-400 italic">
                {tenantId
                  ? 'No hay revisiones asociadas al tenant seleccionado.'
                  : 'No se encontraron revisiones de cohorte registradas.'}
              </p>
            )}
          </div>
        </div>

        {/* Right pane: Details and Actions (2/3 width) */}
        <div className="lg:col-span-2 space-y-6">
          {selectedReview ? (
            <div className="ppos-card p-6 border ppos-border rounded space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b ppos-border">
                <div>
                  <h3 className="text-base font-black text-slate-900 dark:text-white">
                    Detalle de Revisión: {selectedReview.review_id}
                  </h3>
                  <span className="text-[10px] font-mono text-zinc-500 uppercase">
                    Cohorte: {selectedReview.cohort_id} | Tenant: {selectedReview.tenant_id}
                  </span>
                </div>
                <span className={`px-2.5 py-1 rounded text-xs font-black uppercase self-start sm:self-auto ${
                  selectedReview.review_status === 'FINALIZED'
                    ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                    : selectedReview.review_status === 'SUPERSEDED'
                    ? 'bg-red-500/10 text-red-500 border border-red-500/20'
                    : 'bg-zinc-500/10 text-zinc-400 border border-zinc-500/20'
                }`}>
                  {selectedReview.review_status}
                </span>
              </div>

              {/* Status and Action Buttons */}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleEvaluate}
                  disabled={loading || selectedReview.review_status === 'FINALIZED' || selectedReview.review_status === 'SUPERSEDED'}
                  className="px-4 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded transition-colors"
                >
                  Evaluar Salud
                </button>
                <button
                  type="button"
                  onClick={confirmFinalize}
                  disabled={loading || selectedReview.review_status === 'FINALIZED' || selectedReview.review_status === 'SUPERSEDED'}
                  className="px-4 py-2 text-xs font-bold bg-pink-600 hover:bg-pink-700 disabled:opacity-50 text-white rounded transition-colors"
                >
                  Finalizar y Bloquear Revisión
                </button>
              </div>

              {/* Recommendations Card */}
              {decision && (
                <div className="p-4 ppos-surface-muted border ppos-border rounded space-y-2">
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                    Recomendación de Decisión Operativa
                  </h4>
                  <div className="text-xs">
                    Recomendación: <strong className="text-blue-500 font-mono">{decision.recommended_decision}</strong>
                  </div>
                  <div className="text-xs text-zinc-600 dark:text-zinc-400">
                    Estado de Ejecución: <strong className="text-slate-900 dark:text-white">{decision.decision_execution_status}</strong>
                  </div>
                  {decision.execution_blocked_reason && (
                    <div className="text-xs text-amber-500">
                      Motivo de bloqueo: <em>{decision.execution_blocked_reason}</em>
                    </div>
                  )}
                </div>
              )}

              {/* Non-Mutation Attestation Display */}
              <div className="p-4 bg-emerald-500/5 border border-emerald-500/20 rounded space-y-2">
                <h4 className="text-xs font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                  <ShieldCheckIcon className="w-4 h-4" />
                  Prueba de No-Mutación de Estado
                </h4>
                <ul className="text-xs text-zinc-600 dark:text-zinc-400 space-y-1 list-disc pl-5">
                  <li>Estado de acceso a cohorte alterado: <strong>{String(selectedReview.non_mutation_attestation_json?.cohort_access_mutated ?? false)}</strong></li>
                  <li>Límites del participante alterados: <strong>{String(selectedReview.non_mutation_attestation_json?.participant_access_mutated ?? false)}</strong></li>
                  <li>Cobros o pagos comerciales ejecutados: <strong>{String(selectedReview.non_mutation_attestation_json?.payment_execution_triggered ?? false)}</strong></li>
                  <li>Envíos a proveedores externos ejecutados: <strong>{String(selectedReview.non_mutation_attestation_json?.provider_submission_triggered ?? false)}</strong></li>
                </ul>
              </div>

              {/* Findings */}
              <div>
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white mb-2">
                  Hallazgos Registrados ({findings.length})
                </h4>
                {findings.length > 0 ? (
                  <div className="border ppos-border rounded overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="ppos-surface-muted text-zinc-500 uppercase text-[10px]">
                        <tr>
                          <th className="p-2.5 text-left">Clave de Hallazgo</th>
                          <th className="p-2.5 text-right">Severidad</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y ppos-border font-mono">
                        {findings.map(f => (
                          <tr key={f.finding_id}>
                            <td className="p-2.5 text-slate-800 dark:text-zinc-200">{f.finding_key}</td>
                            <td className="p-2.5 text-right">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                f.severity === 'HIGH' || f.severity === 'CRITICAL' ? 'bg-red-500/10 text-red-500' : 'bg-amber-500/10 text-amber-500'
                              }`}>
                                {f.severity}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-xs text-zinc-500">
                    No se han registrado hallazgos en esta ventana de revisión.
                  </p>
                )}
              </div>

              {/* Supersede Review with dynamic Candidate Selector */}
              {selectedReview.review_status !== 'SUPERSEDED' && (
                <div className="pt-4 border-t ppos-border space-y-3">
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase">Sustituir esta Revisión</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-bold text-zinc-500 uppercase block mb-1">
                        Revisión Reemplazante
                      </label>
                      <select
                        value={targetSupersedeId}
                        onChange={e => setTargetSupersedeId(e.target.value)}
                        className="w-full ppos-input text-xs px-2.5 py-1.5 border ppos-border rounded font-mono"
                      >
                        <option value="">-- Seleccionar Revisión Destino --</option>
                        {supersedeCandidates.map(c => (
                          <option key={c.review_id} value={c.review_id}>
                            {c.review_id.slice(0, 16)}... ({c.cohort_id}) - {c.review_status}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-zinc-500 uppercase block mb-1">Motivo Justificado</label>
                      <input
                        value={supersedeReason}
                        onChange={e => setSupersedeReason(e.target.value)}
                        placeholder="Ej: Capturas actualizadas con registros más recientes"
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

              {/* Technical Details Collapsible */}
              <TechnicalDetailsCollapsible
                title="Detalles Técnicos y Diagnóstico de Revisión"
                items={[
                  { label: 'Review ID', value: selectedReview.review_id, copyable: true },
                  { label: 'Tenant ID', value: selectedReview.tenant_id, copyable: true },
                  { label: 'Cohorte ID', value: selectedReview.cohort_id, copyable: true },
                  { label: 'Inicio Ventana', value: selectedReview.review_window_start },
                  { label: 'Fin Ventana', value: selectedReview.review_window_end },
                  { label: 'Nivel de Riesgo', value: selectedReview.risk_level },
                  { label: 'Nivel de Confianza', value: selectedReview.confidence_level },
                  { label: 'Snapshot Hash', value: evidencePack?.input_snapshot_hash, copyable: true },
                  { label: 'Evidence Pack Hash', value: evidencePack?.evidence_pack_hash, copyable: true }
                ]}
                jsonPayload={evidencePack || selectedReview}
                missingEndpointNotice={{
                  missingEntity: 'Cohorte Beta',
                  requiredEndpointProposal: 'GET /api/admin/beta/cohorts?tenant_id=:tenantId',
                  fieldNotice: 'El identificador de cohorte se introduce manualmente de forma validada porque el backend no expone un endpoint de listado de cohortes por tenant.'
                }}
              />
            </div>
          ) : (
            <div className="ppos-card border border-dashed ppos-border p-10 rounded text-center flex flex-col items-center justify-center space-y-3">
              <span className="text-sm font-bold text-slate-800 dark:text-zinc-200">
                {t('beta.health.noReviews') || 'No se han generado revisiones de actividad todavía.'}
              </span>
              <p className="text-xs text-zinc-500 max-w-md">
                {t('beta.health.actionableHint') || 'Para evaluar la salud del cohorte se requiere un registro previo de observación de actividad con invariantes de seguridad preservadas.'}
              </p>
              <button
                type="button"
                onClick={() => navigate('/admin/beta/runtime?tab=activity')}
                className="px-4 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
              >
                {t('beta.health.goToActivity') || 'Ir a Observación de Actividad'}
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

export default ControlledBetaRuntimeActivityReview;
