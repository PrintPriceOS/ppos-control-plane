export interface MachineSchematicProps {
  className?: string;
  theme?: 'dark' | 'light';
  wireframeOnly?: boolean;
  animatedTelemetry?: boolean;
  unitsCount?: number;
  sheetFormat?: 'B1' | 'B2' | 'B3' | 'SRA3' | 'CUSTOM';
  activeHotspotId?: string | null;
  onSelectHotspot?: (hotspotId: string) => void;
}

export interface BlueprintPalette {
  bg: string;
  gridMinor: string;
  gridMajor: string;
  primaryRed: string;
  secondaryRed: string;
  chassisFill: string;
  chassisStroke: string;
  mutedStroke: string;
  dimLine: string;
  labelColor: string;
}

export function getBlueprintPalette(theme: 'dark' | 'light' = 'dark', wireframeOnly = false): BlueprintPalette {
  if (theme === 'light') {
    return {
      bg: '#ffffff',
      gridMinor: '#f1f5f9',
      gridMajor: '#e2e8f0',
      primaryRed: '#dc0000',
      secondaryRed: '#b91c1c',
      chassisFill: wireframeOnly ? 'none' : 'rgba(220, 0, 0, 0.04)',
      chassisStroke: '#dc0000',
      mutedStroke: '#64748b',
      dimLine: '#94a3b8',
      labelColor: '#0f172a',
    };
  }
  return {
    bg: '#0e0e11',
    gridMinor: '#16161b',
    gridMajor: '#1f1f26',
    primaryRed: '#ef4444',
    secondaryRed: '#dc0000',
    chassisFill: wireframeOnly ? 'none' : 'rgba(220, 0, 0, 0.08)',
    chassisStroke: '#ef4444',
    mutedStroke: '#52525b',
    dimLine: '#3f3f46',
    labelColor: '#e4e4e7',
  };
}

