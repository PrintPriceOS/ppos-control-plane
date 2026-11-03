import React from 'react';
import { useLocale } from '../../i18n';

export type BlueprintSurfaceTheme = 'dark' | 'light';

export interface BlueprintHotspot {
  id: string;
  x: number;
  y: number;
  code: string;
  titleKey: string;
  titleFallback: string;
  metricKey: string;
  metricFallback: string;
  specKey: string;
  specFallback: string;
}

export interface CorporateBlueprintSvgProps {
  theme?: BlueprintSurfaceTheme;
  className?: string;
  animated?: boolean;
  activeHotspotId?: string | null;
  onHoverHotspot?: (hotspot: BlueprintHotspot | null) => void;
  sandboxMode?: 'offset' | 'digital' | 'logistics';
}

export interface CorporateBlueprintPalette {
  canvasBg: string;
  panelBg: string;
  gridMinor: string;
  gridMajor: string;
  crosshair: string;
  laserRed: string;
  laserGlow: string;
  secondaryRed: string;
  structuralStroke: string;
  mutedStroke: string;
  dimensionLine: string;
  textPrimary: string;
  textMuted: string;
  tintFill: string;
  tintStrongFill: string;
  badgeBg: string;
}

export function getCorporateBlueprintPalette(theme: BlueprintSurfaceTheme = 'dark'): CorporateBlueprintPalette {
  if (theme === 'light') {
    return {
      canvasBg: '#f8fafc',
      panelBg: '#ffffff',
      gridMinor: '#e2e8f0',
      gridMajor: '#cbd5e1',
      crosshair: '#94a3b8',
      laserRed: '#dc0000',
      laserGlow: 'rgba(220, 0, 0, 0.16)',
      secondaryRed: '#b91c1c',
      structuralStroke: '#334155',
      mutedStroke: '#64748b',
      dimensionLine: '#94a3b8',
      textPrimary: '#0f172a',
      textMuted: '#475569',
      tintFill: 'rgba(220, 0, 0, 0.045)',
      tintStrongFill: 'rgba(220, 0, 0, 0.10)',
      badgeBg: '#f1f5f9',
    };
  }

  return {
    canvasBg: '#09090b',
    panelBg: '#0e0e11',
    gridMinor: '#16161b',
    gridMajor: '#22222a',
    crosshair: '#3f3f46',
    laserRed: '#ef4444',
    laserGlow: 'rgba(239, 68, 68, 0.25)',
    secondaryRed: '#dc0000',
    structuralStroke: '#71717a',
    mutedStroke: '#52525b',
    dimensionLine: '#3f3f46',
    textPrimary: '#f4f4f5',
    textMuted: '#a1a1aa',
    tintFill: 'rgba(220, 0, 0, 0.08)',
    tintStrongFill: 'rgba(239, 68, 68, 0.16)',
    badgeBg: '#141418',
  };
}

export const useBlueprintTranslation = () => {
  const { t, locale } = useLocale();
  const tr = (key: string, fallback: string): string => {
    const val = t(key);
    return val && val !== key ? val : fallback;
  };
  return { tr, locale };
};

