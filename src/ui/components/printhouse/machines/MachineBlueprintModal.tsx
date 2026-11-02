import React, { useState, useRef } from 'react';
import {
  XMarkIcon,
  SunIcon,
  MoonIcon,
  ClipboardDocumentCheckIcon,
  ClipboardDocumentIcon,
  SparklesIcon,
  CpuChipIcon,
  Square2StackIcon,
} from '@heroicons/react/24/outline';
import { useLocale } from '../../../i18n';
import {
  MachineResolutionInput,
  resolveMachineSchematic,
} from './resolveMachineSchematic';

export interface MachineBlueprintModalProps {
  isOpen: boolean;
  onClose: () => void;
  machine: MachineResolutionInput | null;
}

interface HotspotItem {
  id: 'feeder' | 'units' | 'dryer' | 'delivery' | 'clamps';
  xPct: number;
  yPct: number;
  titleKey: string;
  descKey: string;
}

const HOTSPOTS: HotspotItem[] = [
  {
    id: 'feeder',
    xPct: 82,
    yPct: 48,
    titleKey: 'machines.blueprint.hotspotFeederTitle',
    descKey: 'machines.blueprint.hotspotFeederDesc',
  },
  {
    id: 'units',
    xPct: 52,
    yPct: 45,
    titleKey: 'machines.blueprint.hotspotUnitsTitle',
    descKey: 'machines.blueprint.hotspotUnitsDesc',
  },
  {
    id: 'dryer',
    xPct: 28,
    yPct: 52,
    titleKey: 'machines.blueprint.hotspotDryerTitle',
    descKey: 'machines.blueprint.hotspotDryerDesc',
  },
  {
    id: 'delivery',
    xPct: 14,
    yPct: 55,
    titleKey: 'machines.blueprint.hotspotDeliveryTitle',
    descKey: 'machines.blueprint.hotspotDeliveryDesc',
  },
  {
    id: 'clamps',
    xPct: 46,
    yPct: 36,
    titleKey: 'machines.blueprint.hotspotClampsTitle',
    descKey: 'machines.blueprint.hotspotClampsDesc',
  },
];

export const MachineBlueprintModal: React.FC<MachineBlueprintModalProps> = ({
  isOpen,
  onClose,
  machine,
}) => {
  const { t } = useLocale();
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [wireframeOnly, setWireframeOnly] = useState<boolean>(false);
  const [activeHotspot, setActiveHotspot] = useState<HotspotItem>(HOTSPOTS[1]);
  const [copiedSvg, setCopiedSvg] = useState<boolean>(false);
  const svgContainerRef = useRef<HTMLDivElement>(null);

  if (!isOpen || !machine) return null;

  const resolved = resolveMachineSchematic(machine);
  const { Component } = resolved;

  const tierLabel =
    resolved.tier === 1
      ? t('machines.blueprint.tier1Badge')
      : resolved.tier === 2
      ? t('machines.blueprint.tier2Badge')
      : t('machines.blueprint.tier3Badge');

  const handleCopySvgMarkup = async () => {
    const svgEl = svgContainerRef.current?.querySelector('svg');
    if (!svgEl) return;
    const rawSvg = svgEl.outerHTML;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(rawSvg);
      }
    } catch (_) {
      // Fallback for non-HTTPS test environments
    }
    setCopiedSvg(true);
    setTimeout(() => setCopiedSvg(false), 2200);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4"
      data-testid="machine-blueprint-modal"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-5xl bg-white dark:bg-[#131314] border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Interactive Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#0e0e11]">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center justify-center text-[#dc0000] shrink-0">
              <CpuChipIcon className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-black text-zinc-900 dark:text-zinc-100 uppercase tracking-wider">
                  {machine.machineName || machine.machine_name || resolved.resolvedModel}
                </h3>
                <span className="px-2 py-0.5 rounded-md bg-red-500/15 border border-red-500/30 text-[10px] font-mono font-bold text-[#dc0000] dark:text-red-400">
                  {tierLabel}
                </span>
                <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-[10px] font-mono font-bold text-emerald-600 dark:text-emerald-400">
                  {resolved.sheetFormat} ({resolved.maxFormatLabel})
                </span>
              </div>
              <p className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400 mt-0.5">
                {resolved.resolvedManufacturer} · {resolved.resolvedModel} ·{' '}
                {t('machines.blueprint.modalSubtitle')}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            data-testid="close-blueprint-modal-btn"
            className="p-2 rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:text-[#dc0000] transition-colors cursor-pointer self-end sm:self-auto"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Viewport Controls Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-6 py-3 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#131314]">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              data-testid="blueprint-theme-dark-btn"
              onClick={() => setTheme('dark')}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1.5 border transition-colors cursor-pointer ${
                theme === 'dark'
                  ? 'bg-[#0e0e11] text-white border-[#dc0000]'
                  : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800'
              }`}
            >
              <MoonIcon className="w-3.5 h-3.5 text-[#ef4444]" />
              {t('machines.blueprint.themeDark')}
            </button>

            <button
              type="button"
              data-testid="blueprint-theme-light-btn"
              onClick={() => setTheme('light')}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1.5 border transition-colors cursor-pointer ${
                theme === 'light'
                  ? 'bg-white text-zinc-900 border-[#dc0000] shadow-2xs'
                  : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800'
              }`}
            >
              <SunIcon className="w-3.5 h-3.5 text-[#dc0000]" />
              {t('machines.blueprint.themeLight')}
            </button>

            <button
              type="button"
              data-testid="blueprint-wireframe-toggle-btn"
              onClick={() => setWireframeOnly((prev) => !prev)}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1.5 border transition-colors cursor-pointer ${
                wireframeOnly
                  ? 'bg-red-500/15 text-[#dc0000] dark:text-red-400 border-[#dc0000]'
                  : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800'
              }`}
            >
              <Square2StackIcon className="w-3.5 h-3.5" />
              {t('machines.blueprint.wireframeToggle')}
            </button>
          </div>

          <button
            type="button"
            data-testid="blueprint-copy-svg-btn"
            onClick={handleCopySvgMarkup}
            className="px-3.5 py-1.5 rounded-lg bg-[#dc0000] hover:bg-red-700 text-white text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            {copiedSvg ? (
              <>
                <ClipboardDocumentCheckIcon className="w-4 h-4" />
                {t('machines.blueprint.copiedSvgToast')}
              </>
            ) : (
              <>
                <ClipboardDocumentIcon className="w-4 h-4" />
                {t('machines.blueprint.copySvgBtn')}
              </>
            )}
          </button>
        </div>

        {/* Interactive Vector Blueprint Canvas + Telemetry Hotspots */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          <div
            ref={svgContainerRef}
            data-testid="blueprint-svg-canvas"
            className={`relative rounded-xl border p-4 transition-colors ${
              theme === 'light'
                ? 'bg-white border-zinc-300'
                : 'bg-[#0e0e11] border-zinc-800'
            }`}
          >
            <div className="w-full h-64 sm:h-72">
              <Component
                className="w-full h-full"
                theme={theme}
                wireframeOnly={wireframeOnly}
                animatedTelemetry={true}
                unitsCount={resolved.unitsCount}
                sheetFormat={resolved.sheetFormat}
              />
            </div>

            {/* Interactive Clickable / Hoverable Telemetry Hotspots */}
            {HOTSPOTS.map((hs, idx) => {
              const isSelected = activeHotspot.id === hs.id;
              return (
                <button
                  key={hs.id}
                  type="button"
                  data-testid={`blueprint-hotspot-${hs.id}`}
                  onClick={() => setActiveHotspot(hs)}
                  onMouseEnter={() => setActiveHotspot(hs)}
                  style={{ left: `${hs.xPct}%`, top: `${hs.yPct}%` }}
                  className={`
                    absolute -translate-x-1/2 -translate-y-1/2 w-6 h-6 rounded-full font-mono text-[10px] font-black
                    flex items-center justify-center transition-all cursor-pointer border
                    ${
                      isSelected
                        ? 'bg-[#dc0000] text-white border-white scale-125 shadow-lg'
                        : 'bg-zinc-950/90 text-red-400 border-[#dc0000] hover:scale-110'
                    }
                  `}
                  title={t(hs.titleKey)}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>

          {/* Active Hotspot Telemetry Readout */}
          <div
            data-testid="blueprint-hotspot-panel"
            className="rounded-xl bg-zinc-50 dark:bg-[#0e0e11] border border-zinc-200 dark:border-zinc-800 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
          >
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <SparklesIcon className="w-4 h-4 text-[#dc0000]" />
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#dc0000]">
                  {t('machines.blueprint.hotspotsTitle')}
                </span>
              </div>
              <h4 className="text-xs font-black text-zinc-900 dark:text-zinc-100">
                {t(activeHotspot.titleKey)}
              </h4>
              <p className="text-xs text-zinc-600 dark:text-zinc-400">
                {t(activeHotspot.descKey)}
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
              {HOTSPOTS.map((hs, idx) => (
                <button
                  key={hs.id}
                  type="button"
                  onClick={() => setActiveHotspot(hs)}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold uppercase border cursor-pointer transition-colors ${
                    activeHotspot.id === hs.id
                      ? 'bg-[#dc0000] text-white border-[#dc0000]'
                      : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800'
                  }`}
                >
                  #{idx + 1} {hs.id.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Technical Specs Strip */}
          <div
            data-testid="blueprint-specs-strip"
            className="grid grid-cols-2 sm:grid-cols-4 gap-3"
          >
            <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                {t('machines.blueprint.specMaxMinFormat')}
              </span>
              <span className="font-mono text-xs font-black text-zinc-900 dark:text-zinc-100 mt-1 block">
                {resolved.maxFormatLabel} / {resolved.minFormatLabel}
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                {t('machines.blueprint.specNominalSpeed')}
              </span>
              <span className="font-mono text-xs font-black text-emerald-600 dark:text-emerald-400 mt-1 block">
                {resolved.nominalSpeedCph.toLocaleString()} cph
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                {t('machines.blueprint.specHourlyCost')}
              </span>
              <span className="font-mono text-xs font-black text-zinc-900 dark:text-zinc-100 mt-1 block">
                €{resolved.baseHourlyCostEur.toFixed(2)} / h
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                {t('machines.blueprint.specMaxInputFile')}
              </span>
              <span className="font-mono text-xs font-black text-[#dc0000] dark:text-red-400 mt-1 block">
                {resolved.maxFileSizeMb} MB (PDF/X-4)
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

