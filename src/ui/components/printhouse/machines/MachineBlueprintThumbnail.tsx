import React from 'react';
import { MagnifyingGlassPlusIcon } from '@heroicons/react/24/outline';
import { useLocale } from '../../../i18n';
import {
  MachineResolutionInput,
  resolveMachineSchematic,
} from './resolveMachineSchematic';

export interface MachineBlueprintThumbnailProps {
  machine: MachineResolutionInput;
  onInspect: (machine: MachineResolutionInput) => void;
  compact?: boolean;
}

export const MachineBlueprintThumbnail: React.FC<MachineBlueprintThumbnailProps> = ({
  machine,
  onInspect,
  compact = false,
}) => {
  const { t } = useLocale();
  const resolved = resolveMachineSchematic(machine);
  const { Component } = resolved;
  const machineId = String(machine.id || machine.machineName || machine.machine_name || 'unit');

  return (
    <button
      type="button"
      onClick={() => onInspect(machine)}
      data-testid={`inspect-blueprint-btn-${machineId}`}
      className={`
        group relative overflow-hidden rounded-xl bg-[#0e0e11] border border-zinc-800
        hover:border-[#dc0000] transition-all cursor-pointer text-left
        ${compact ? 'w-40 h-16 shrink-0' : 'w-full h-28'}
      `}
      title={t('machines.blueprint.inspectBtn')}
    >
      <div className="w-full h-full p-1">
        <Component
          className="w-full h-full"
          theme="dark"
          wireframeOnly={false}
          animatedTelemetry={true}
          unitsCount={resolved.unitsCount}
          sheetFormat={resolved.sheetFormat}
        />
      </div>

      {/* Hover Overlay Indicator */}
      <div className="absolute inset-0 bg-black/65 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center px-2">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#dc0000] text-white text-[10px] font-mono font-bold uppercase tracking-wider shadow-md">
          <MagnifyingGlassPlusIcon className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{t('machines.blueprint.inspectBtn')}</span>
        </span>
      </div>
    </button>
  );
};

