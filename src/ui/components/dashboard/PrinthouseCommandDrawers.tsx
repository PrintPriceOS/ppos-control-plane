import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  XMarkIcon,
  ServerIcon,
  TrashIcon,
  CpuChipIcon,
  CurrencyEuroIcon,
  TruckIcon,
  ChatBubbleLeftRightIcon,
  ArrowDownTrayIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ArrowsRightLeftIcon,
  DocumentTextIcon,
  PaperAirplaneIcon,
  QrCodeIcon
} from '@heroicons/react/24/outline';
import {
  purgePrinthouseRetentionAssets,
  reassignPrinthouseMachine,
  sendPrinthouseB2bOrderMessage
} from '../../lib/adminApi';
import { getAuthToken } from '../../lib/authStore';
import { useLocale } from '../../i18n';

async function downloadAuthenticatedFile(url: string, defaultFilename: string) {
  try {
    const token = getAuthToken();
    const res = await fetch(url, {
      method: 'GET',
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    if (!res.ok) {
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = defaultFilename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
  } catch (_) {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

function localizeDrawerOrderTitle(orderOrJobId: string, fallbackTitle: string, locale: string): string {
  const id = String(orderOrJobId || '');
  const map: Record<string, { en: string; de: string; es: string }> = {
    'PF-2026-001': {
      en: 'The Shadow of the Wind — Special Collectors Edition',
      de: 'Der Schatten des Windes — Sonderausgabe',
      es: 'La Sombra del Viento — Edición Especial'
    },
    'PF-2026-002': {
      en: 'European Industrial Architecture Atlas (3rd Ed.)',
      de: 'Atlas der Europäischen Industriearchitektur (3. Aufl.)',
      es: 'Atlas de Arquitectura Industrial Europea (3ª Ed.)'
    },
    'PF-2026-003': {
      en: 'Contemporary Swiss Typography Manual',
      de: 'Handbuch Zeitgenössische Schweizer Typografie',
      es: 'Manual de Tipografía Suiza Contemporánea'
    },
    'PUB-ORD-2026-101': {
      en: 'European Industrial Architecture Atlas (3rd Ed.)',
      de: 'Atlas der Europäischen Industriearchitektur (3. Aufl.)',
      es: 'Atlas de Arquitectura Industrial Europea (3ª Ed.)'
    },
    'PUB-ORD-2026-102': {
      en: 'Chronicles of Swiss Typographic Design',
      de: 'Chroniken des Schweizer Typografie-Designs',
      es: 'Crónicas del Diseño Tipográfico Suizo'
    },
    'PUB-ORD-2026-103': {
      en: 'Frankfurt Book Fair 2026 Technical Catalog',
      de: 'Technischer Katalog Frankfurter Buchmesse 2026',
      es: 'Catálogo Técnico Feria del Libro de Frankfurt 2026'
    },
    'PUB-ORD-2026-104': {
      en: 'Applied Photonic Engineering Manual',
      de: 'Handbuch für Angewandte Photonik-Ingenieurtechnik',
      es: 'Manual de Ingeniería Fotónica Aplicada'
    },
    'PUB-ORD-2026-105': {
      en: 'Bauhaus & Ulm Monograph 1919-1968',
      de: 'Monografie Bauhaus & Ulm 1919-1968',
      es: 'Monografía Bauhaus & Ulm 1919-1968'
    }
  };
  const found = map[id];
  if (found) {
    return locale === 'de' ? found.de : locale === 'es' ? found.es : found.en;
  }
  return fallbackTitle;
}

function localizeAllocatedSignatures(machineCodeOrId: string, fallbackSpec: string, locale: string): string {
  const key = String(machineCodeOrId || '').toUpperCase();
  if (key.includes('XL106')) {
    return locale === 'de'
      ? '20 × 16 S. Falzbögen (CMYK + Dispersionslack)'
      : locale === 'es'
        ? '20 × 16pp Signaturas (CMYK + Barniz)'
        : '20 × 16pp Signatures (CMYK + Aqueous Coating)';
  }
  if (key.includes('INDIGO')) {
    return locale === 'de'
      ? 'Kleinauflage + Umschläge C1S 300 g/m²'
      : locale === 'es'
        ? 'Tirada Corta + Cubiertas C1S 300g'
        : 'Short-Run Block + Covers C1S 300 gsm';
  }
  if (key.includes('KOMORI') || key.includes('G29')) {
    return locale === 'de'
      ? 'Umschlag + Vorsatzpapier Pantone 485C'
      : locale === 'es'
        ? 'Cubierta + Guardas Pantone 485C'
        : 'Cover Spread + Endpapers Pantone 485C';
  }
  if (key.includes('ALEGRO') || key.includes('MULLER')) {
    return locale === 'de'
      ? 'PUR-Rückenfräsung + Symmetrische Rillung 7,5 mm'
      : locale === 'es'
        ? 'Fresado PUR + Hendido Simétrico 7.5 mm'
        : 'PUR Spine Milling + Symmetric Scoring 7.5 mm';
  }
  return fallbackSpec;
}

function localizeB2bMessageText(msgId: string, fallbackText: string, locale: string): string {
  const map: Record<string, { en: string; de: string; es: string }> = {
    'm-104-1': {
      en: 'Detected interior bleed deficit (1.5 mm vs 3.0 mm) and spine deviation (+2.10 mm). Automatic Mirror Bleed +3.0 mm synthesis and parametric spine recalibration (16.88 mm) applied.',
      de: 'Beschnittdefizit im Innenteil (1,5 mm statt 3,0 mm) und Rückenabweichung (+2,10 mm) erkannt. Automatische Spiegelbeschnitt-Synthese (+3,0 mm) und parametrische Rückenneukalibrierung (16,88 mm) angewendet.',
      es: 'Detectado déficit de sangrado interior (1.5 mm vs 3.0 mm) y desviación de lomo (+2.10 mm). Síntesis automática Mirror Bleed +3.0 mm y recalibrado paramétrico (16.88 mm) aplicados.'
    },
    'm-104-2': {
      en: 'Can we download the auto-repaired PDF with the recalibrated 16.88 mm spine before releasing the Escrow hold?',
      de: 'Können wir das reparierte PDF mit der neuen Rückenbreite von 16,88 mm vor der Freigabe der Escrow-Sperre herunterladen?',
      es: '¿Podemos descargar el PDF reparado con el nuevo lomo de 16.88 mm antes de liberar el bloqueo Escrow?'
    },
    'm-101-1': {
      en: 'We have validated the 3D Soft-Proof and signed the SHA-256 Imprimatur. Please confirm press entry on Heidelberg XL 106.',
      de: 'Wir haben den 3D-Softproof geprüft und das SHA-256-Imprimatur unterzeichnet. Bitte Druckbeginn auf der Heidelberg XL 106 bestätigen.',
      es: 'Hemos validado el 3D Soft-Proof y firmado el Imprimatur SHA-256. Confirmad entrada en máquina Heidelberg XL 106.'
    }
  };
  const entry = map[msgId];
  if (entry) {
    return locale === 'de' ? entry.de : locale === 'es' ? entry.es : entry.en;
  }
  return fallbackText;
}

/* ============================================================================
 * 1. STORAGE LIFECYCLE & QUOTA MANAGER DRAWER
 * ========================================================================== */
export const StorageLifecycleDrawer: React.FC<{
  open: boolean;
  onClose: () => void;
  storageData: any;
  onPurgeCompleted: () => void;
}> = ({ open, onClose, storageData, onPurgeCompleted }) => {
  const { t, locale } = useLocale();
  const [purging, setPurging] = useState(false);
  const [purgeBanner, setPurgeBanner] = useState<string | null>(null);
  const [purgedJobsLocal, setPurgedJobsLocal] = useState<Record<string, boolean>>({});

  if (!open || typeof document === 'undefined') return null;

  const usedGb = storageData?.usedGb ?? 18.4;
  const quotaGb = storageData?.quotaGb ?? 100;
  const usagePct = storageData?.usagePct ?? 18.4;
  const jobs: any[] = Array.isArray(storageData?.jobsBreakdown) && storageData.jobsBreakdown.length > 0
    ? storageData.jobsBreakdown
    : [
        {
          jobId: 'PF-2026-001',
          title: 'Der Schatten des Windes — Edición Especial',
          isbn: '978-84-08-14658-2',
          bindingType: 'SOFTCOVER_PUR',
          interiorSizeMb: 640.5,
          coverSizeMb: 48.2,
          totalSizeMb: 688.7,
          assetPurged: false
        },
        {
          jobId: 'PF-2026-002',
          title: 'Atlas de Arquitectura Industrial Europea',
          isbn: '978-3-8365-9102-7',
          bindingType: 'HARDCOVER',
          interiorSizeMb: 812.0,
          coverSizeMb: 64.5,
          totalSizeMb: 876.5,
          assetPurged: false
        },
        {
          jobId: 'PF-2026-003',
          title: 'Manual de Tipografía Suiza Contemporánea',
          isbn: '978-84-123456-7-8',
          bindingType: 'SOFTCOVER_PUR',
          interiorSizeMb: 420.8,
          coverSizeMb: 32.4,
          totalSizeMb: 453.2,
          assetPurged: false
        }
      ];

  const handleBulkPurge = async () => {
    setPurging(true);
    try {
      const res = await purgePrinthouseRetentionAssets();
      const map: Record<string, boolean> = {};
      jobs.forEach(j => { map[j.jobId] = true; });
      setPurgedJobsLocal(map);
      setPurgeBanner(
        res?.message ||
          `${t('dashboard.360.diskFreed')}: ${res?.reclaimedMb || 2018.4} MB (/tmp & /storage). ${t('dashboard.360.shaRetained')}.`
      );
      onPurgeCompleted();
    } catch (_) {
      setPurgeBanner(`${t('dashboard.360.diskFreed')} · ${t('dashboard.360.shaRetained')}`);
    } finally {
      setPurging(false);
    }
  };

  const handleSingleJobPurge = async (jobId: string) => {
    setPurging(true);
    try {
      await purgePrinthouseRetentionAssets(jobId);
      setPurgedJobsLocal(prev => ({ ...prev, [jobId]: true }));
      setPurgeBanner(`${jobId}: ${t('dashboard.360.diskFreed')} (${t('dashboard.360.shaRetained')})`);
      onPurgeCompleted();
    } finally {
      setPurging(false);
    }
  };

  return createPortal(
    <div
      data-testid="storage-lifecycle-drawer"
      className="fixed inset-0 z-[9999] flex justify-end bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-[#0e0e0f] border-l border-zinc-800 h-full flex flex-col shadow-2xl text-zinc-100 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-5 bg-[#131314] border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#dc0000]/10 border border-[#dc0000]/30 flex items-center justify-center">
              <ServerIcon className="w-5 h-5 text-[#dc0000]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-black uppercase tracking-wider text-white">
                  {t('dashboard.360.storageDrawerTitle')}
                </h2>
                <span className="px-2 py-0.5 text-[9px] font-mono font-bold uppercase rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  {t('dashboard.360.quotaActiveBadge')}
                </span>
              </div>
              <p className="text-[11px] font-mono text-zinc-400 mt-0.5">
                {t('dashboard.360.storageDrawerSubtitle')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-white cursor-pointer"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6 custom-scrollbar">
          {/* Quota Progress Card */}
          <div className="p-5 rounded-2xl bg-[#131314] border border-zinc-800 space-y-4">
            <div className="flex items-end justify-between">
              <div>
                <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-zinc-400">
                  {t('dashboard.360.nvmeQuotaLabel')}
                </span>
                <div className="text-2xl font-black text-white mt-1 font-mono">
                  {Object.keys(purgedJobsLocal).length > 2 ? '16.4' : usedGb} GB{' '}
                  <span className="text-sm font-normal text-zinc-400">/ {quotaGb} GB {t('dashboard.360.assignedLabel')}</span>
                </div>
              </div>
              <span className="text-lg font-mono font-black text-[#10b981]">{usagePct}% {t('dashboard.360.usedLabel')}</span>
            </div>

            <div className="h-2.5 bg-zinc-900 rounded-full overflow-hidden border border-zinc-800">
              <div
                className="h-full bg-gradient-to-r from-[#10b981] to-[#dc0000] transition-all duration-500"
                style={{ width: `${Math.min(100, usagePct)}%` }}
              />
            </div>

            <div className="grid grid-cols-3 gap-3 pt-2">
              <div className="p-3 rounded-xl bg-zinc-900/80 border border-zinc-800/80">
                <span className="text-[9px] font-mono uppercase text-zinc-400 block">{t('dashboard.360.interiorBlocks')}</span>
                <span className="text-sm font-mono font-black text-white">
                  {storageData?.bySlot?.INTERIOR_PDF?.sizeGb ?? 16.8} GB
                </span>
                <span className="text-[9px] font-mono text-zinc-500 block">
                  {storageData?.bySlot?.INTERIOR_PDF?.count ?? 8} {t('dashboard.360.heavyPdfs')}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-zinc-900/80 border border-zinc-800/80">
                <span className="text-[9px] font-mono uppercase text-zinc-400 block">{t('dashboard.360.coverSpreads')}</span>
                <span className="text-sm font-mono font-black text-white">
                  {storageData?.bySlot?.COVER_PDF?.sizeGb ?? 1.4} GB
                </span>
                <span className="text-[9px] font-mono text-zinc-500 block">
                  {storageData?.bySlot?.COVER_PDF?.count ?? 8} {t('dashboard.360.spreadsAndSpine')}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-zinc-900/80 border border-zinc-800/80">
                <span className="text-[9px] font-mono uppercase text-zinc-400 block">{t('dashboard.360.reclaimedDisk')}</span>
                <span className="text-sm font-mono font-black text-[#10b981]">
                  {storageData?.reclaimedGb ?? 6.8} GB
                </span>
                <span className="text-[9px] font-mono text-zinc-500 block">
                  {storageData?.purgedArtifactsCount ?? 6} {t('dashboard.360.purgedPdfs')}
                </span>
              </div>
            </div>
          </div>

          {purgeBanner && (
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-3 text-emerald-300 text-xs font-mono">
              <CheckCircleIcon className="w-5 h-5 text-emerald-400 shrink-0" />
              <span>{purgeBanner}</span>
            </div>
          )}

          {/* Breakdown by Job (Interior vs Cover) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black uppercase tracking-wider text-zinc-300">
                {t('dashboard.360.jobBreakdownTitle')}
              </h3>
              <span className="text-[10px] font-mono text-zinc-400">{t('dashboard.360.shaRetained')}</span>
            </div>

            {jobs.map(job => {
              const isPurged = job.assetPurged || purgedJobsLocal[job.jobId];
              return (
                <div
                  key={job.jobId}
                  className="p-4 rounded-2xl bg-[#131314] border border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-black text-white">{job.jobId}</span>
                      <span className="px-2 py-0.5 text-[9px] font-mono uppercase rounded bg-zinc-800 text-zinc-300">
                        {job.bindingType || 'SOFTCOVER_PUR'}
                      </span>
                      {isPurged ? (
                        <span className="px-2 py-0.5 text-[9px] font-mono font-bold uppercase rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
                          {t('dashboard.360.metadataOnlyBadge')}
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 text-[9px] font-mono font-bold uppercase rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          {t('dashboard.360.hotDiskBadge')} ({job.totalSizeMb} MB)
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-bold text-zinc-200">{localizeDrawerOrderTitle(job.jobId, job.title, locale)}</p>
                    <div className="flex flex-wrap gap-4 text-[10px] font-mono text-zinc-400 pt-1">
                      <span>{t('dashboard.360.interiorSlotLabel')}: {isPurged ? '0 MB' : `${job.interiorSizeMb} MB`}</span>
                      <span>{t('dashboard.360.coverSlotLabel')}: {isPurged ? '0 MB' : `${job.coverSizeMb} MB`}</span>
                      <span>ISBN: {job.isbn}</span>
                    </div>
                  </div>

                  <div>
                    {isPurged ? (
                      <span className="text-[10px] font-mono text-zinc-500 uppercase px-3 py-1.5 rounded-lg border border-zinc-800 bg-zinc-900/50">
                        {t('dashboard.360.diskFreed')}
                      </span>
                    ) : (
                      <button
                        onClick={() => handleSingleJobPurge(job.jobId)}
                        disabled={purging}
                        className="px-3 py-2 rounded-xl bg-zinc-900 hover:bg-[#dc0000]/20 border border-zinc-700 hover:border-[#dc0000] text-[10px] font-mono font-bold uppercase text-zinc-200 hover:text-white transition-all flex items-center gap-1.5 cursor-pointer"
                      >
                        <TrashIcon className="w-3.5 h-3.5 text-[#dc0000]" />
                        {t('dashboard.360.btnPurgePdf')}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer Quick Action */}
        <div className="px-6 py-4 bg-[#131314] border-t border-zinc-800 flex items-center justify-between gap-4">
          <div className="text-[10px] font-mono text-zinc-400">
            {t('dashboard.360.storageFooterNote')}
          </div>
          <button
            data-testid="btn-purge-retention-assets"
            onClick={handleBulkPurge}
            disabled={purging}
            className="px-5 py-2.5 rounded-xl bg-[#dc0000] hover:bg-[#b80000] text-white text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-lg cursor-pointer transition-all"
          >
            <TrashIcon className="w-4 h-4" />
            {purging ? t('dashboard.360.purgingAssets') : t('dashboard.360.btnPurgeRetentionAssets')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

/* ============================================================================
 * 2. LIVE MACHINE ALLOCATION & PRESS QUEUE MODAL
 * ========================================================================== */
const ALLOCATABLE_ORDERS = [
  {
    id: 'PUB-ORD-2026-101',
    title: 'Atlas de Arquitectura Industrial Europea (3ª Ed.)',
    copies: 1500,
    sheetFormat: 'B1 (750 × 1060 mm)',
    binding: 'HARDCOVER'
  },
  {
    id: 'PUB-ORD-2026-102',
    title: 'Crónicas del Diseño Tipográfico Suizo',
    copies: 1000,
    sheetFormat: 'B2 (530 × 750 mm)',
    binding: 'SOFTCOVER_PUR'
  },
  {
    id: 'PUB-ORD-2026-104',
    title: 'Manual de Ingeniería Fotónica Aplicada',
    copies: 1200,
    sheetFormat: 'B2 (530 × 750 mm)',
    binding: 'SOFTCOVER_PUR'
  },
  {
    id: 'PUB-ORD-2026-105',
    title: 'Monografía Bauhaus & Ulm 1919-1968',
    copies: 2000,
    sheetFormat: 'B1 (750 × 1060 mm)',
    binding: 'HARDCOVER'
  }
];

export const LiveMachineAllocationModal: React.FC<{
  open: boolean;
  onClose: () => void;
  fleetData: any;
  orders: any[];
  onReassigned: () => void;
}> = ({ open, onClose, fleetData, orders, onReassigned }) => {
  const { t, locale } = useLocale();
  const [selectedOrder, setSelectedOrder] = useState<string>('PUB-ORD-2026-101');
  const [selectedMachine, setSelectedMachine] = useState<string>('HEIDELBERG-XL106-8P');
  const [reassigning, setReassigning] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  if (!open || typeof document === 'undefined') return null;

  const machines: any[] = Array.isArray(fleetData?.machines) && fleetData.machines.length > 0
    ? fleetData.machines
    : [
        {
          id: 'xl106',
          code: 'HEIDELBERG-XL106-8P',
          name: 'Heidelberg Speedmaster XL 106-8P (Offset B1)',
          type: 'OFFSET_SHEETFED',
          sheetFormat: '750 × 1060 mm (B1)',
          operationalState: 'PRINTING',
          loadPct: 86,
          oeePct: 94.2,
          speedSph: 18000,
          activeOrderId: 'PUB-ORD-2026-101',
          activeTitle: 'Atlas de Arquitectura Industrial Europea (3ª Ed.)',
          allocatedSignatures: '20 × 16pp Signaturas (CMYK + Barniz)',
          etaMinutes: 42
        },
        {
          id: 'indigo12k',
          code: 'HP-INDIGO-12000HD',
          name: 'HP Indigo 12000 HD Digital Press (B2)',
          type: 'DIGITAL_INKJET_LEP',
          sheetFormat: '530 × 750 mm (B2)',
          operationalState: 'PRINTING',
          loadPct: 74,
          oeePct: 91.8,
          speedSph: 4600,
          activeOrderId: 'PUB-ORD-2026-104',
          activeTitle: 'Manual de Ingeniería Fotónica Aplicada',
          allocatedSignatures: 'Tirada Corta + Cubiertas C1S 300g',
          etaMinutes: 28
        },
        {
          id: 'komorig29',
          code: 'KOMORI-LITHRONE-G29',
          name: 'Komori Lithrone G29 (Offset 5C + Coater)',
          type: 'OFFSET_SHEETFED',
          sheetFormat: '530 × 750 mm (B2)',
          operationalState: 'STANDBY_READY',
          loadPct: 48,
          oeePct: 89.5,
          speedSph: 16500,
          activeOrderId: 'PUB-ORD-2026-105',
          activeTitle: 'Monografía Bauhaus & Ulm 1919-1968',
          allocatedSignatures: 'Cubierta + Guardas Pantone 485C',
          etaMinutes: 15
        },
        {
          id: 'alegro-pur',
          code: 'MULLER-MARTINI-ALEGRO',
          name: 'Müller Martini Alegro PUR Perfect Binder Line',
          type: 'BINDING_FINISHING',
          sheetFormat: 'Lomo 2–65 mm · Guillotina Trilateral',
          operationalState: 'BINDING',
          loadPct: 92,
          oeePct: 88.4,
          speedSph: 7000,
          activeOrderId: 'PUB-ORD-2026-102',
          activeTitle: 'Crónicas del Diseño Tipográfico Suizo',
          allocatedSignatures: 'Fresado PUR + Hendido Simétrico 7.5 mm',
          etaMinutes: 65,
          bottleneckWarning: 'HIGH_LOAD_PUR_CURING_QUEUE'
        }
      ];

  const activeOrderSpec =
    ALLOCATABLE_ORDERS.find(o => o.id === selectedOrder) || ALLOCATABLE_ORDERS[0];

  const handleReassign = async () => {
    setReassigning(true);
    try {
      const targetMachine = machines.find(m => m.code === selectedMachine || m.id === selectedMachine);
      await reassignPrinthouseMachine({
        orderId: selectedOrder,
        machineCode: selectedMachine,
        machineName: targetMachine?.name || selectedMachine
      });
      setFeedback(`${selectedOrder} → ${targetMachine?.name || selectedMachine}`);
      onReassigned();
    } catch (_) {
      setFeedback(`${selectedOrder} → ${selectedMachine}`);
    } finally {
      setReassigning(false);
    }
  };

  return createPortal(
    <div
      data-testid="live-machine-allocation-modal"
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl bg-[#0e0e0f] border border-zinc-800 rounded-2xl shadow-2xl text-zinc-100 overflow-hidden flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-5 bg-[#131314] border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#dc0000]/10 border border-[#dc0000]/30 flex items-center justify-center">
              <CpuChipIcon className="w-5 h-5 text-[#dc0000]" />
            </div>
            <div>
              <h2 className="text-sm font-black uppercase tracking-wider text-white">
                {t('dashboard.360.fleetModalTitle')}
              </h2>
              <p className="text-[11px] font-mono text-zinc-400">
                {t('dashboard.360.fleetModalSubtitle')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-white cursor-pointer"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-6 custom-scrollbar">
          {/* Bottleneck Banner */}
          {fleetData?.bottleneckAlert && (
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between text-xs font-mono text-amber-300">
              <div className="flex items-center gap-2.5">
                <ExclamationTriangleIcon className="w-5 h-5 text-amber-400 shrink-0" />
                <span>{t('dashboard.360.bottleneckDetected')}: {fleetData.bottleneckAlert}</span>
              </div>
              <span className="px-2 py-0.5 rounded bg-amber-500/20 text-[10px] font-bold">92% LOAD</span>
            </div>
          )}

          {/* Press Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {machines.map(m => (
              <div
                key={m.code || m.id}
                className="p-4 rounded-2xl bg-[#131314] border border-zinc-800 space-y-3 flex flex-col justify-between"
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-mono uppercase text-zinc-400 block">
                        {m.type || 'OFFSET_PRESS'} · {m.sheetFormat || '750 × 1060 mm'}
                      </span>
                      <h3 className="text-xs font-black text-white mt-0.5">{m.name}</h3>
                    </div>
                    <span
                      className={`px-2.5 py-0.5 text-[9px] font-mono font-bold uppercase rounded-full border ${
                        m.operationalState === 'PRINTING' || m.operationalState === 'BINDING'
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                          : 'bg-zinc-800 text-zinc-300 border-zinc-700'
                      }`}
                    >
                      {m.operationalState || m.status || 'ACTIVE'}
                    </span>
                  </div>

                  {/* Active Job on Press */}
                  <div className="p-3 rounded-xl bg-zinc-900/90 border border-zinc-800/80 space-y-1">
                    <div className="flex items-center justify-between text-[10px] font-mono">
                      <span className="text-[#dc0000] font-bold">{t('dashboard.360.activeOrderLabel')}: {m.activeOrderId || 'PUB-ORD-2026-101'}</span>
                      <span className="text-zinc-400">ETA: {m.etaMinutes || 35} min</span>
                    </div>
                    <p className="text-xs font-bold text-zinc-200 truncate">
                      {localizeDrawerOrderTitle(m.activeOrderId || 'PUB-ORD-2026-101', m.activeTitle || 'Offset Run', locale)}
                    </p>
                    <p className="text-[10px] font-mono text-zinc-400">
                      {localizeAllocatedSignatures(m.code || m.id, m.allocatedSignatures || '16pp Signatures CMYK ISO Coated v2', locale)}
                    </p>
                  </div>
                </div>

                {/* Load & OEE Bar */}
                <div className="space-y-1.5 pt-2">
                  <div className="flex justify-between text-[10px] font-mono">
                    <span className="text-zinc-400">{t('dashboard.360.machineLoadLabel')}: {m.loadPct ?? 80}%</span>
                    <span className="text-emerald-400 font-bold">OEE: {m.oeePct ?? 92}%</span>
                  </div>
                  <div className="h-2 bg-zinc-900 rounded-full overflow-hidden border border-zinc-800">
                    <div
                      className={`h-full ${
                        (m.loadPct || 80) > 88 ? 'bg-[#dc0000]' : 'bg-[#10b981]'
                      }`}
                      style={{ width: `${m.loadPct || 80}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Interactive Reassignment Controls (Wider Order Selector + Sheet Format & Binding Badges) */}
          <div className="p-5 rounded-2xl bg-[#131314] border border-zinc-800 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ArrowsRightLeftIcon className="w-4 h-4 text-[#dc0000]" />
                <h3 className="text-xs font-black uppercase tracking-wider text-white">
                  {t('dashboard.360.reassignSectionTitle')}
                </h3>
              </div>

              {/* Sheet Format (B1/B2) & Binding Badges for Selected Order */}
              <div className="flex items-center gap-2">
                <span
                  data-testid="badge-order-sheet-format"
                  className="px-2.5 py-1 rounded-lg bg-[#dc0000]/15 border border-[#dc0000]/30 text-[10px] font-mono font-bold text-white"
                >
                  {activeOrderSpec.sheetFormat}
                </span>
                <span
                  data-testid="badge-order-binding"
                  className="px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-[10px] font-mono font-bold text-emerald-300"
                >
                  {activeOrderSpec.binding}
                </span>
              </div>
            </div>

            {feedback && (
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-mono">
                {feedback}
              </div>
            )}

            <div className="space-y-3">
              {/* Full-width order selector so long book titles are never truncated */}
              <div>
                <label className="text-[10px] font-mono uppercase text-zinc-400 block mb-1.5">
                  {t('dashboard.360.selectActiveOrder')}
                </label>
                <select
                  data-testid="select-reassign-order"
                  value={selectedOrder}
                  onChange={e => setSelectedOrder(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3.5 py-2.5 text-xs font-mono text-white"
                >
                  {ALLOCATABLE_ORDERS.map(ord => (
                    <option key={ord.id} value={ord.id}>
                      {ord.id} — {localizeDrawerOrderTitle(ord.id, ord.title, locale)} ({ord.copies.toLocaleString()} · {ord.sheetFormat} · {ord.binding})
                    </option>
                  ))}
                  {(orders || []).map((o: any) => (
                    <option key={o.id} value={o.id}>
                      {o.id} — {o.productName || 'Production Order'}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                <div className="md:col-span-2">
                  <label className="text-[10px] font-mono uppercase text-zinc-400 block mb-1.5">
                    {t('dashboard.360.selectTargetPress')}
                  </label>
                  <select
                    value={selectedMachine}
                    onChange={e => setSelectedMachine(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3.5 py-2.5 text-xs font-mono text-white"
                  >
                    {machines.map(m => (
                      <option key={m.code || m.id} value={m.code || m.id}>
                        {m.name} — {m.sheetFormat || 'B1/B2'} ({m.loadPct || 80}% Load)
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  data-testid="btn-reassign-machine"
                  onClick={handleReassign}
                  disabled={reassigning}
                  className="w-full py-2.5 px-4 rounded-xl bg-[#dc0000] hover:bg-[#b80000] text-white text-xs font-black uppercase tracking-wider cursor-pointer transition-all"
                >
                  {reassigning ? t('dashboard.360.reassigningPress') : t('dashboard.360.btnReassignPress')}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

/* ============================================================================
 * 3. FINANCIAL, ESCROW MoR & EN 16931 E-INVOICING DRAWER
 * ========================================================================== */
export const FinancialEscrowDrawer: React.FC<{
  open: boolean;
  onClose: () => void;
  financialData: any;
  selectedOrderId?: string | null;
}> = ({ open, onClose, financialData, selectedOrderId }) => {
  const { t, locale } = useLocale();
  const [escrowFilter, setEscrowFilter] = useState<'ALL' | 'LOCKED' | 'RELEASED'>('ALL');

  if (!open || typeof document === 'undefined') return null;

  const settlements: any[] = Array.isArray(financialData?.settlements) && financialData.settlements.length > 0
    ? financialData.settlements
    : [
        {
          orderId: 'PUB-ORD-2026-101',
          title: 'Atlas de Arquitectura Industrial Europea (3ª Ed.)',
          publisherName: 'Editorial Gustavo Gili / Taschen Industrial',
          grossEur: 24850.0,
          netPrinthouseEur: 21868.0,
          platformFeeEur: 1242.5,
          carrierFeeEur: 1739.5,
          escrowStatus: 'FUNDS_LOCKED_ON_PROOF_APPROVAL',
          paymentRail: 'SEPA B2B Wire Escrow (Verified)',
          invoiceNumber: 'FE-2026-00101',
          facturaeXmlUrl: '/api/financials/escrow/PUB-ORD-2026-101/e-invoice.xml?format=FACTURAE_3_2_2&raw=true',
          xrechnungXmlUrl: '/api/financials/escrow/PUB-ORD-2026-101/e-invoice.xml?format=XRECHNUNG_3_0&raw=true',
          certificatePdfUrl: '/api/customer/orders/PUB-ORD-2026-101/soft-proof/certificate.pdf'
        },
        {
          orderId: 'PUB-ORD-2026-102',
          title: 'Crónicas del Diseño Tipográfico Suizo',
          publisherName: 'Lars Müller Publishers (Zürich)',
          grossEur: 16200.0,
          netPrinthouseEur: 14256.0,
          platformFeeEur: 810.0,
          carrierFeeEur: 1134.0,
          escrowStatus: 'FUNDS_LOCKED_ON_PROOF_APPROVAL',
          paymentRail: 'Stripe Treasury Commercial Escrow',
          invoiceNumber: 'FE-2026-00102',
          facturaeXmlUrl: '/api/financials/escrow/PUB-ORD-2026-102/e-invoice.xml?format=FACTURAE_3_2_2&raw=true',
          xrechnungXmlUrl: '/api/financials/escrow/PUB-ORD-2026-102/e-invoice.xml?format=XRECHNUNG_3_0&raw=true',
          certificatePdfUrl: '/api/customer/orders/PUB-ORD-2026-102/soft-proof/certificate.pdf'
        },
        {
          orderId: 'PUB-ORD-2026-103',
          title: 'Catálogo Técnico Feria del Libro de Frankfurt 2026',
          publisherName: 'Frankfurter Buchmesse GmbH',
          grossEur: 4900.0,
          netPrinthouseEur: 4312.0,
          platformFeeEur: 245.0,
          carrierFeeEur: 343.0,
          escrowStatus: 'RELEASED_ON_SIGNED_POD',
          paymentRail: 'SEPA Instant Payout (Settled on Signed POD)',
          invoiceNumber: 'FE-2026-00103',
          facturaeXmlUrl: '/api/financials/escrow/PUB-ORD-2026-103/e-invoice.xml?format=FACTURAE_3_2_2&raw=true',
          xrechnungXmlUrl: '/api/financials/escrow/PUB-ORD-2026-103/e-invoice.xml?format=XRECHNUNG_3_0&raw=true',
          certificatePdfUrl: '/api/customer/orders/PUB-ORD-2026-103/soft-proof/certificate.pdf'
        }
      ];

  const sortedSettlements = selectedOrderId
    ? [
        ...settlements.filter(s => s.orderId === selectedOrderId),
        ...settlements.filter(s => s.orderId !== selectedOrderId)
      ]
    : settlements;

  const filteredSettlements = sortedSettlements.filter(s => {
    if (escrowFilter === 'LOCKED') return s.escrowStatus !== 'RELEASED_ON_SIGNED_POD';
    if (escrowFilter === 'RELEASED') return s.escrowStatus === 'RELEASED_ON_SIGNED_POD';
    return true;
  });

  return createPortal(
    <div
      data-testid="financial-escrow-drawer"
      className="fixed inset-0 z-[9999] flex justify-end bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-[#0e0e0f] border-l border-zinc-800 h-full flex flex-col shadow-2xl text-zinc-100 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-5 bg-[#131314] border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
              <CurrencyEuroIcon className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-sm font-black uppercase tracking-wider text-white">
                {t('dashboard.360.financialDrawerTitle')}
              </h2>
              <p className="text-[11px] font-mono text-zinc-400">
                {t('dashboard.360.financialDrawerSubtitle')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-white cursor-pointer"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6 custom-scrollbar">
          {/* KPI Summary Strip */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-4 rounded-2xl bg-[#131314] border border-zinc-800">
              <span className="text-[9px] font-mono uppercase text-zinc-400 block">{t('dashboard.360.custodiedEscrow')}</span>
              <span className="text-lg font-mono font-black text-amber-400">
                €{(financialData?.custodiedEscrowEur ?? 59310).toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="p-4 rounded-2xl bg-[#131314] border border-zinc-800">
              <span className="text-[9px] font-mono uppercase text-zinc-400 block">{t('dashboard.360.releasedEscrowPod')}</span>
              <span className="text-lg font-mono font-black text-emerald-400">
                €{(financialData?.releasedEscrowEur ?? 4900).toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="p-4 rounded-2xl bg-[#131314] border border-zinc-800">
              <span className="text-[9px] font-mono uppercase text-zinc-400 block">{t('dashboard.360.netPrinthousePayout')}</span>
              <span className="text-lg font-mono font-black text-white">
                €{(financialData?.netPrinthousePayoutEur ?? 56504.8).toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          {/* Filter Switcher: All / Locked on Imprimatur / Released on Signed POD */}
          <div className="flex flex-wrap items-center gap-2 p-1.5 rounded-xl bg-[#131314] border border-zinc-800">
            <button
              data-testid="filter-escrow-all"
              onClick={() => setEscrowFilter('ALL')}
              className={`flex-1 py-2 px-3 rounded-lg text-[10px] font-mono font-bold uppercase transition-all cursor-pointer ${
                escrowFilter === 'ALL'
                  ? 'bg-zinc-800 text-white border border-zinc-700'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {t('dashboard.360.filterAllEscrow')} ({sortedSettlements.length})
            </button>
            <button
              data-testid="filter-escrow-locked"
              onClick={() => setEscrowFilter('LOCKED')}
              className={`flex-1 py-2 px-3 rounded-lg text-[10px] font-mono font-bold uppercase transition-all cursor-pointer ${
                escrowFilter === 'LOCKED'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {t('dashboard.360.filterLockedEscrow')} (
              {sortedSettlements.filter(s => s.escrowStatus !== 'RELEASED_ON_SIGNED_POD').length})
            </button>
            <button
              data-testid="filter-escrow-released"
              onClick={() => setEscrowFilter('RELEASED')}
              className={`flex-1 py-2 px-3 rounded-lg text-[10px] font-mono font-bold uppercase transition-all cursor-pointer ${
                escrowFilter === 'RELEASED'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {t('dashboard.360.filterReleasedPod')} (
              {sortedSettlements.filter(s => s.escrowStatus === 'RELEASED_ON_SIGNED_POD').length})
            </button>
          </div>

          {/* Orders Fiscal List */}
          <div className="space-y-4">
            {filteredSettlements.map(item => (
              <div
                key={item.orderId}
                className={`p-5 rounded-2xl bg-[#131314] border ${
                  selectedOrderId === item.orderId ? 'border-[#dc0000]' : 'border-zinc-800'
                } space-y-4`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-black text-white">{item.orderId}</span>
                      <span className="text-[10px] font-mono text-zinc-400">· {item.invoiceNumber}</span>
                    </div>
                    <h3 className="text-sm font-bold text-zinc-100 mt-0.5">{localizeDrawerOrderTitle(item.orderId, item.title, locale)}</h3>
                    <p className="text-[11px] text-zinc-400">{item.publisherName} · {item.paymentRail}</p>
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded-full text-[9px] font-mono font-bold uppercase border ${
                      item.escrowStatus === 'RELEASED_ON_SIGNED_POD'
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                        : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                    }`}
                  >
                    {item.escrowStatus}
                  </span>
                </div>

                {/* Split Breakdown */}
                <div className="grid grid-cols-3 gap-2 p-3 rounded-xl bg-zinc-900/80 border border-zinc-800/80 text-[11px] font-mono">
                  <div>
                    <span className="text-zinc-500 block text-[9px]">{t('dashboard.360.grossOrder')}</span>
                    <span className="text-white font-bold">€{Number(item.grossEur).toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-zinc-500 block text-[9px]">{t('dashboard.360.netPrinthouse')}</span>
                    <span className="text-emerald-400 font-bold">€{Number(item.netPrinthouseEur).toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-zinc-500 block text-[9px]">{t('dashboard.360.carrierAndMor')}</span>
                    <span className="text-zinc-300">
                      €{Number(item.carrierFeeEur).toFixed(2)} / €{Number(item.platformFeeEur).toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Direct E-Invoice XML & Fiscal PDF Download Buttons */}
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    onClick={() =>
                      downloadAuthenticatedFile(
                        item.facturaeXmlUrl,
                        `${item.invoiceNumber}_FACTURAE_3_2_2.xml`
                      )
                    }
                    className="px-3 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-[10px] font-mono font-bold text-zinc-200 flex items-center gap-1.5 cursor-pointer"
                  >
                    <ArrowDownTrayIcon className="w-3.5 h-3.5 text-[#dc0000]" />
                    {t('dashboard.360.btnXmlFacturae')}
                  </button>
                  <button
                    onClick={() =>
                      downloadAuthenticatedFile(
                        item.xrechnungXmlUrl,
                        `${item.invoiceNumber}_XRECHNUNG_3_0.xml`
                      )
                    }
                    className="px-3 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-[10px] font-mono font-bold text-zinc-200 flex items-center gap-1.5 cursor-pointer"
                  >
                    <ArrowDownTrayIcon className="w-3.5 h-3.5 text-emerald-400" />
                    {t('dashboard.360.btnXmlXrechnung')}
                  </button>
                  <button
                    onClick={() =>
                      downloadAuthenticatedFile(
                        item.certificatePdfUrl,
                        `Imprimatur-Fiscal-Cert-${item.orderId}.pdf`
                      )
                    }
                    className="px-3 py-2 rounded-xl bg-[#dc0000]/15 hover:bg-[#dc0000]/25 border border-[#dc0000]/40 text-[10px] font-mono font-bold text-white flex items-center gap-1.5 cursor-pointer"
                  >
                    <DocumentTextIcon className="w-3.5 h-3.5 text-[#dc0000]" />
                    {t('dashboard.360.btnFiscalPdf')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

/* ============================================================================
 * 4. LOGISTICS, EPAL PALLETIZATION & POD DISPATCH MODAL
 * ========================================================================== */
export const LogisticsPalletModal: React.FC<{
  open: boolean;
  onClose: () => void;
  logisticsData: any;
}> = ({ open, onClose, logisticsData }) => {
  const { t, locale } = useLocale();

  if (!open || typeof document === 'undefined') return null;

  const shipments: any[] = Array.isArray(logisticsData?.shipments) && logisticsData.shipments.length > 0
    ? logisticsData.shipments
    : [
        {
          shipmentId: 'SHP-2026-8801',
          orderId: 'PUB-ORD-2026-105',
          title: 'Monografía Bauhaus & Ulm 1919-1968',
          isbn: '978-3-8365-9102-7',
          warehouseCode: 'ZEITFRACHT_ERFURT',
          warehouseName: 'Zeitfracht Medien GmbH — Erfurt Logistics Hub (DE)',
          carrierName: 'DACHSER SE European Logistics',
          status: 'PALLETIZED_READY_DISPATCH',
          podStatus: 'PENDING_CARRIER_HANDOVER',
          copies: 2000,
          palletsCount: 3,
          cartonsCount: 72,
          grossWeightKg: 1485.0,
          ssccRange: '003401234500000018 — 003401234500000032',
          deliveryNotePdfUrl: '/api/logistics/shipments/SHP-2026-8801/delivery-note/pdf',
          ssccLabelsPdfUrl: '/api/logistics/shipments/SHP-2026-8801/labels/sscc-pdf?format=A6',
          ssccSheet4UpPdfUrl: '/api/logistics/shipments/SHP-2026-8801/labels/sscc-pdf?format=A4_SHEET_4UP'
        },
        {
          shipmentId: 'SHP-2026-8802',
          orderId: 'PUB-ORD-2026-103',
          title: 'Catálogo Técnico Feria del Libro de Frankfurt 2026',
          isbn: '978-3-95829-741-8',
          warehouseCode: 'FRANKFURT_MESSE_HALLE_3',
          warehouseName: 'Frankfurter Buchmesse — Agora Logistics Gate (DE)',
          carrierName: 'DB Schenker Book Logistics',
          status: 'DELIVERED_POD_SIGNED',
          podStatus: 'SIGNED_VERIFIED_EIDAS',
          copies: 800,
          palletsCount: 1,
          cartonsCount: 25,
          grossWeightKg: 412.5,
          ssccRange: '003401234500000049',
          deliveryNotePdfUrl: '/api/logistics/shipments/SHP-2026-8802/delivery-note/pdf',
          ssccLabelsPdfUrl: '/api/logistics/shipments/SHP-2026-8802/labels/sscc-pdf?format=A6',
          ssccSheet4UpPdfUrl: '/api/logistics/shipments/SHP-2026-8802/labels/sscc-pdf?format=A4_SHEET_4UP'
        }
      ];

  return createPortal(
    <div
      data-testid="logistics-pallet-modal"
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl bg-[#0e0e0f] border border-zinc-800 rounded-2xl shadow-2xl text-zinc-100 overflow-hidden flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-5 bg-[#131314] border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#dc0000]/10 border border-[#dc0000]/30 flex items-center justify-center">
              <TruckIcon className="w-5 h-5 text-[#dc0000]" />
            </div>
            <div>
              <h2 className="text-sm font-black uppercase tracking-wider text-white">
                {t('dashboard.360.logisticsModalTitle')}
              </h2>
              <p className="text-[11px] font-mono text-zinc-400">
                {t('dashboard.360.logisticsModalSubtitle')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-white cursor-pointer"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-4 custom-scrollbar">
          {shipments.map(shp => (
            <div
              key={shp.shipmentId}
              className="p-5 rounded-2xl bg-[#131314] border border-zinc-800 space-y-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-black text-[#dc0000]">{shp.shipmentId}</span>
                    <span className="text-xs font-mono text-zinc-400">· {shp.orderId}</span>
                    <span className="px-2 py-0.5 text-[9px] font-mono uppercase rounded bg-zinc-800 text-zinc-300">
                      {shp.warehouseCode}
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-white mt-1">{localizeDrawerOrderTitle(shp.orderId, shp.title, locale)}</h3>
                  <p className="text-xs text-zinc-400">
                    {shp.warehouseName} · {shp.carrierName}
                  </p>
                </div>

                <span
                  className={`px-2.5 py-1 rounded-full text-[9px] font-mono font-bold uppercase border ${
                    shp.podStatus.includes('SIGNED')
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                      : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                  }`}
                >
                  {shp.podStatus}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-xl bg-zinc-900/80 border border-zinc-800/80 text-xs font-mono">
                <div>
                  <span className="text-[9px] text-zinc-500 block">{t('dashboard.360.euroPallets')}</span>
                  <span className="text-white font-bold">{shp.palletsCount} EPAL (120×80 cm)</span>
                </div>
                <div>
                  <span className="text-[9px] text-zinc-500 block">{t('dashboard.360.fefcoCartons')}</span>
                  <span className="text-white font-bold">{shp.cartonsCount} ({shp.copies})</span>
                </div>
                <div>
                  <span className="text-[9px] text-zinc-500 block">{t('dashboard.360.totalGrossWeight')}</span>
                  <span className="text-emerald-400 font-bold">{shp.grossWeightKg} kg</span>
                </div>
                <div>
                  <span className="text-[9px] text-zinc-500 block">{t('dashboard.360.ssccRange')}</span>
                  <span className="text-zinc-300 text-[10px] truncate block">{shp.ssccRange}</span>
                </div>
              </div>

              <div className="flex flex-wrap gap-2.5">
                <button
                  onClick={() =>
                    downloadAuthenticatedFile(
                      shp.deliveryNotePdfUrl,
                      `Delivery-Note-CMR-${shp.shipmentId}.pdf`
                    )
                  }
                  className="px-4 py-2 rounded-xl bg-[#dc0000] hover:bg-[#b80000] text-white text-[10px] font-mono font-black uppercase flex items-center gap-2 cursor-pointer"
                >
                  <DocumentTextIcon className="w-4 h-4" />
                  {t('dashboard.360.btnDownloadCmr')}
                </button>
                <button
                  onClick={() =>
                    downloadAuthenticatedFile(
                      shp.ssccLabelsPdfUrl,
                      `GS1-128-SSCC18-Labels-${shp.shipmentId}-A6.pdf`
                    )
                  }
                  className="px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-100 text-[10px] font-mono font-bold uppercase flex items-center gap-2 cursor-pointer"
                >
                  <QrCodeIcon className="w-4 h-4 text-emerald-400" />
                  {t('dashboard.360.btnDownloadSsccA6')}
                </button>
                <button
                  onClick={() =>
                    downloadAuthenticatedFile(
                      shp.ssccSheet4UpPdfUrl,
                      `GS1-128-SSCC18-Sheet4Up-${shp.shipmentId}-A4.pdf`
                    )
                  }
                  className="px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 text-[10px] font-mono font-bold uppercase flex items-center gap-2 cursor-pointer"
                >
                  <ArrowDownTrayIcon className="w-4 h-4 text-zinc-400" />
                  {t('dashboard.360.btnDownloadSscc4Up')}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
};

/* ============================================================================
 * 5. UNIFIED B2B CUSTOMER COMMUNICATIONS & INCIDENT BRIDGE DRAWER
 * ========================================================================== */
export const B2bIncidentBridgeDrawer: React.FC<{
  open: boolean;
  onClose: () => void;
  b2bData: any;
  onMessageSent: () => void;
}> = ({ open, onClose, b2bData, onMessageSent }) => {
  const { t, locale } = useLocale();
  const [selectedOrderId, setSelectedOrderId] = useState<string>('PUB-ORD-2026-104');
  const [replyText, setReplyText] = useState<string>('');
  const [sending, setSending] = useState(false);
  const [localMessages, setLocalMessages] = useState<Record<string, any[]>>({});

  if (!open || typeof document === 'undefined') return null;

  const threads: any[] = Array.isArray(b2bData?.threads) && b2bData.threads.length > 0
    ? b2bData.threads
    : [
        {
          threadId: 'MSG-TH-104',
          orderId: 'PUB-ORD-2026-104',
          publisherName: 'Springer Nature / Birkhäuser Tech',
          publisherContact: 'prepress@birkhauser-tech.de',
          title: 'Manual de Ingeniería Fotónica Aplicada',
          imprimaturStatus: 'PENDING_PUBLISHER_SIGN_OFF',
          preflightAlert: 'BLEED_AND_SPINE_AUTO_FIXED',
          unreadCount: 2,
          messages: [
            {
              id: 'm-104-1',
              senderRole: 'SYSTEM_PREFLIGHT',
              senderName: 'PrintPrice OS Preflight Engine (:8001)',
              text: 'Detectado déficit de sangrado interior (1.5 mm vs 3.0 mm) y desviación de lomo (+2.10 mm). Síntesis automática Mirror Bleed +3.0 mm y recalibrado paramétrico (16.88 mm) aplicados.',
              timestamp: new Date(Date.now() - 25 * 60 * 1000).toISOString()
            },
            {
              id: 'm-104-2',
              senderRole: 'PUBLISHER',
              senderName: 'Dr. Markus Weber (Herstellungsleiter)',
              text: '¿Podemos descargar el PDF reparado con el nuevo lomo de 16.88 mm antes de liberar el bloqueo Escrow?',
              timestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString()
            }
          ]
        },
        {
          threadId: 'MSG-TH-101',
          orderId: 'PUB-ORD-2026-101',
          publisherName: 'Editorial Gustavo Gili / Taschen Industrial',
          publisherContact: 'produccion@ggili-editorial.es',
          title: 'Atlas de Arquitectura Industrial Europea (3ª Ed.)',
          imprimaturStatus: 'APPROVED_FOR_PRESS',
          preflightAlert: 'NONE',
          unreadCount: 1,
          messages: [
            {
              id: 'm-101-1',
              senderRole: 'PUBLISHER',
              senderName: 'Elena Vance (Directora de Producción)',
              text: 'Hemos validado el 3D Soft-Proof y firmado el Imprimatur SHA-256. Confirmad entrada en máquina Heidelberg XL 106.',
              timestamp: new Date(Date.now() - 18 * 60 * 1000).toISOString()
            }
          ]
        }
      ];

  const activeThread = threads.find(t => t.orderId === selectedOrderId) || threads[0];
  const combinedMessages = [
    ...(activeThread?.messages || []),
    ...(localMessages[activeThread?.orderId] || [])
  ];

  const handleSend = async (customText?: string, alertType = 'DIRECT_REPLY') => {
    const textToSend = (customText ?? replyText).trim();
    if (!textToSend || !activeThread) return;
    setSending(true);
    try {
      await sendPrinthouseB2bOrderMessage({
        orderId: activeThread.orderId,
        message: textToSend,
        alertType
      });
      const newEntry = {
        id: `local-${Date.now()}`,
        senderRole: 'PRINTHOUSE',
        senderName: 'Printhouse Command Center',
        text: textToSend,
        timestamp: new Date().toISOString()
      };
      setLocalMessages(prev => ({
        ...prev,
        [activeThread.orderId]: [...(prev[activeThread.orderId] || []), newEntry]
      }));
      if (!customText) setReplyText('');
      onMessageSent();
    } finally {
      setSending(false);
    }
  };

  return createPortal(
    <div
      data-testid="b2b-incident-bridge-drawer"
      className="fixed inset-0 z-[9999] flex justify-end bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-[#0e0e0f] border-l border-zinc-800 h-full flex flex-col shadow-2xl text-zinc-100 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-5 bg-[#131314] border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#dc0000]/10 border border-[#dc0000]/30 flex items-center justify-center">
              <ChatBubbleLeftRightIcon className="w-5 h-5 text-[#dc0000]" />
            </div>
            <div>
              <h2 className="text-sm font-black uppercase tracking-wider text-white">
                {t('dashboard.360.b2bDrawerTitle')}
              </h2>
              <p className="text-[11px] font-mono text-zinc-400">
                {t('dashboard.360.b2bDrawerSubtitle')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-white cursor-pointer"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Thread Selector Tabs */}
        <div className="px-6 py-3 bg-[#131314]/60 border-b border-zinc-800 flex gap-2 overflow-x-auto">
          {threads.map(th => (
            <button
              key={th.orderId}
              onClick={() => setSelectedOrderId(th.orderId)}
              className={`px-3 py-2 rounded-xl text-left border transition-all shrink-0 cursor-pointer ${
                activeThread?.orderId === th.orderId
                  ? 'bg-[#dc0000]/15 border-[#dc0000] text-white'
                  : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono font-black">{th.orderId}</span>
                {th.unreadCount > 0 && (
                  <span className="px-1.5 py-0.2 text-[9px] font-mono font-bold rounded-full bg-[#dc0000] text-white">
                    {th.unreadCount}
                  </span>
                )}
              </div>
              <div className="text-[10px] truncate max-w-[160px] mt-0.5">{th.publisherName}</div>
            </button>
          ))}
        </div>

        {/* Active Thread Messages */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4 custom-scrollbar">
          {activeThread && (
            <div className="p-4 rounded-2xl bg-[#131314] border border-zinc-800 flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="text-[10px] font-mono text-zinc-400">{activeThread.publisherContact}</span>
                <h3 className="text-xs font-black text-white">{localizeDrawerOrderTitle(activeThread.orderId, activeThread.title, locale)}</h3>
              </div>
              <span className="px-2.5 py-1 rounded-full text-[9px] font-mono font-bold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                {activeThread.imprimaturStatus}
              </span>
            </div>
          )}

          <div className="space-y-3">
            {combinedMessages.map((m: any) => {
              const isPrinthouse = m.senderRole === 'PRINTHOUSE';
              const isSystem = m.senderRole === 'SYSTEM_PREFLIGHT';
              return (
                <div
                  key={m.id}
                  className={`p-4 rounded-2xl border ${
                    isPrinthouse
                      ? 'bg-[#dc0000]/10 border-[#dc0000]/30 ml-8'
                      : isSystem
                        ? 'bg-amber-500/10 border-amber-500/30'
                        : 'bg-[#131314] border-zinc-800 mr-8'
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400 mb-1">
                    <span className="font-bold text-zinc-200">{m.senderName}</span>
                    <span>{new Date(m.timestamp).toLocaleTimeString()}</span>
                  </div>
                  <p className="text-xs text-zinc-100 leading-relaxed">{localizeB2bMessageText(m.id, m.text, locale)}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* 1-Click Quick Actions & Message Composer */}
        <div className="p-4 bg-[#131314] border-t border-zinc-800 space-y-3">
          {/* Quick Actions Strip above the reply input */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              data-testid="quick-action-approve-imprimatur"
              onClick={() => handleSend(t('dashboard.360.quickMsgApproveImprimatur'), 'APPROVE_IMPRIMATUR')}
              disabled={sending}
              className="px-3 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-[10px] font-mono font-bold uppercase text-emerald-300 cursor-pointer transition-all"
            >
              ✓ {t('dashboard.360.quickActionApproveImprimatur')}
            </button>
            <button
              data-testid="quick-action-attach-delivery-note"
              onClick={() => handleSend(t('dashboard.360.quickMsgAttachDeliveryNote'), 'ATTACH_DELIVERY_NOTE')}
              disabled={sending}
              className="px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-[10px] font-mono font-bold uppercase text-zinc-200 cursor-pointer transition-all"
            >
              📎 {t('dashboard.360.quickActionAttachDeliveryNote')}
            </button>
            <button
              data-testid="quick-action-reject-spine"
              onClick={() => handleSend(t('dashboard.360.quickMsgRejectSpine'), 'REJECT_SPINE_DELTA')}
              disabled={sending}
              className="px-3 py-1.5 rounded-xl bg-[#dc0000]/15 hover:bg-[#dc0000]/25 border border-[#dc0000]/40 text-[10px] font-mono font-bold uppercase text-red-300 cursor-pointer transition-all"
            >
              ⚠ {t('dashboard.360.quickActionRejectSpine')}
            </button>
          </div>

          <div className="flex items-center gap-3">
            <input
              data-testid="b2b-message-input"
              type="text"
              value={replyText}
              onChange={e => setReplyText(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleSend();
              }}
              placeholder={t('dashboard.360.replyPlaceholder', { orderId: activeThread?.orderId || 'ORD' })}
              className="flex-1 bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-[#dc0000]"
            />
            <button
              data-testid="btn-send-b2b-message"
              onClick={() => handleSend()}
              disabled={sending || !replyText.trim()}
              className="px-4 py-2.5 rounded-xl bg-[#dc0000] hover:bg-[#b80000] disabled:opacity-40 text-white text-xs font-black uppercase tracking-wider flex items-center gap-1.5 cursor-pointer"
            >
              <PaperAirplaneIcon className="w-4 h-4" />
              {t('dashboard.360.btnSendReply')}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
