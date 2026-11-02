import React from 'react';
import {
  MACHINE_PRESETS_CATALOG,
  MachinePresetEntry,
  SchematicComponentKey,
} from './machinePresetsCatalog';
import { MachineSchematicProps } from './schematics/types';
import { HeidelbergSpeedmasterXL106Svg } from './schematics/HeidelbergSpeedmasterXL106Svg';
import { KomoriLithroneG29Svg } from './schematics/KomoriLithroneG29Svg';
import { HpIndigo100KSvg } from './schematics/HpIndigo100KSvg';
import { MullerMartiniAlegroSvg } from './schematics/MullerMartiniAlegroSvg';
import { PolarMohrCutterSvg } from './schematics/PolarMohrCutterSvg';
import { StahlfolderTH82Svg } from './schematics/StahlfolderTH82Svg';
import { ParametricSheetfedOffsetSvg } from './schematics/ParametricSheetfedOffsetSvg';
import { ParametricDigitalPressSvg } from './schematics/ParametricDigitalPressSvg';
import { ParametricWebRotarySvg } from './schematics/ParametricWebRotarySvg';
import { ParametricPerfectBinderSvg } from './schematics/ParametricPerfectBinderSvg';
import { ParametricFinishingCutterSvg } from './schematics/ParametricFinishingCutterSvg';

export const SCHEMATIC_COMPONENT_MAP: Record<
  SchematicComponentKey,
  React.FC<MachineSchematicProps>
> = {
  HeidelbergSpeedmasterXL106Svg,
  KomoriLithroneG29Svg,
  HpIndigo100KSvg,
  MullerMartiniAlegroSvg,
  PolarMohrCutterSvg,
  StahlfolderTH82Svg,
  ParametricSheetfedOffsetSvg,
  ParametricDigitalPressSvg,
  ParametricWebRotarySvg,
  ParametricPerfectBinderSvg,
  ParametricFinishingCutterSvg,
};

export interface MachineResolutionInput {
  id?: string;
  machineName?: string;
  machine_name?: string;
  manufacturer?: string;
  model?: string;
  technology?: string;
  machine_type?: string;
  machineType?: string;
  max_sheet_width_mm?: number | string;
  max_sheet_height_mm?: number | string;
  min_sheet_width_mm?: number | string;
  min_sheet_height_mm?: number | string;
  nominal_speed_cph?: number | string;
  hourly_cost_eur?: number | string;
  max_file_size_mb?: number | string;
  supported_color_modes_json?: string[];
  unitsCount?: number;
}

export interface ResolvedMachineSchematic {
  tier: 1 | 2 | 3;
  schematicKey: SchematicComponentKey;
  Component: React.FC<MachineSchematicProps>;
  matchedPreset: MachinePresetEntry | null;
  unitsCount: number;
  sheetFormat: 'B1' | 'B2' | 'B3' | 'SRA3' | 'CUSTOM';
  resolvedManufacturer: string;
  resolvedModel: string;
  nominalSpeedCph: number;
  baseHourlyCostEur: number;
  maxFileSizeMb: number;
  minFormatLabel: string;
  maxFormatLabel: string;
}

function inferSheetFormatFromDimensions(
  maxW?: number | string,
  maxH?: number | string,
  haystack = ''
): 'B1' | 'B2' | 'B3' | 'SRA3' | 'CUSTOM' {
  const maxDim = Math.max(Number(maxW || 0), Number(maxH || 0));
  if (maxDim >= 1000 || /\bb1\b|106|102|105|145|g40|r700|r900|920|970/i.test(haystack)) {
    return 'B1';
  }
  if (maxDim >= 700 || /\bb2\b|g29|sm\s*74|100k|12000|km-1/i.test(haystack)) {
    return 'B2';
  }
  if (maxDim >= 500 || /\bb3\b|ix3200/i.test(haystack)) {
    return 'B3';
  }
  if (maxDim > 0 || /\bsra3\b|7900|v1350|c14000|c9500/i.test(haystack)) {
    return 'SRA3';
  }
  return 'B1';
}

function inferUnitsCountFromInput(
  input: MachineResolutionInput,
  haystack: string,
  defaultUnits = 4
): number {
  if (input.unitsCount && input.unitsCount >= 1 && input.unitsCount <= 16) {
    return input.unitsCount;
  }
  const colorMatch = haystack.match(/(\d+)\s*[-\s]*(?:color|unit|tower|clamp|cuerpos|farben)/i);
  if (colorMatch) {
    const parsed = parseInt(colorMatch[1], 10);
    if (parsed >= 1 && parsed <= 16) return parsed;
  }
  const colorModes = Array.isArray(input.supported_color_modes_json)
    ? input.supported_color_modes_json
    : [];
  if (colorModes.includes('CMYK+SPOT') && colorModes.includes('CMYK+WHITE')) return 6;
  if (colorModes.includes('CMYK+SPOT')) return 5;
  if (colorModes.includes('MONOCHROME') && colorModes.length === 1) return 1;
  return defaultUnits;
}

export function resolveMachineSchematic(
  input: MachineResolutionInput = {}
): ResolvedMachineSchematic {
  const rawName = String(
    input.machineName || input.machine_name || input.model || input.id || 'Industrial Unit'
  ).trim();
  const rawMfg = String(input.manufacturer || '').trim();
  const rawModel = String(input.model || '').trim();
  const rawTech = String(
    input.technology || input.machine_type || input.machineType || ''
  ).toUpperCase();

  const haystack = `${rawName} ${rawMfg} ${rawModel} ${rawTech} ${input.id || ''}`.toLowerCase();

  // 1. Check Tier 1 & Tier 2 Preset Catalog via keyword & regex matching
  for (const preset of MACHINE_PRESETS_CATALOG) {
    const matchedKeyword = preset.keywords.some((kw) => haystack.includes(kw.toLowerCase()));
    const exactModel =
      rawModel && preset.model.toLowerCase().includes(rawModel.toLowerCase()) && rawModel.length >= 3;
    if (matchedKeyword || exactModel) {
      const sheetFormat =
        input.max_sheet_width_mm || input.max_sheet_height_mm
          ? inferSheetFormatFromDimensions(input.max_sheet_width_mm, input.max_sheet_height_mm, haystack)
          : preset.sheetFormat;
      const unitsCount = inferUnitsCountFromInput(input, haystack, preset.unitsCount);

      return {
        tier: preset.tier,
        schematicKey: preset.schematicType,
        Component: SCHEMATIC_COMPONENT_MAP[preset.schematicType],
        matchedPreset: preset,
        unitsCount,
        sheetFormat,
        resolvedManufacturer: rawMfg || preset.manufacturer,
        resolvedModel: rawModel || preset.model,
        nominalSpeedCph: Number(input.nominal_speed_cph || preset.nominalSpeedCph),
        baseHourlyCostEur: Number(input.hourly_cost_eur || preset.baseHourlyCostEur),
        maxFileSizeMb: Number(input.max_file_size_mb || preset.maxFileSizeMb || 2048),
        minFormatLabel: `${input.min_sheet_width_mm || preset.minSheetDimensions.widthMm}×${
          input.min_sheet_height_mm || preset.minSheetDimensions.heightMm
        } mm`,
        maxFormatLabel: `${input.max_sheet_width_mm || preset.maxSheetDimensions.widthMm}×${
          input.max_sheet_height_mm || preset.maxSheetDimensions.heightMm
        } mm`,
      };
    }
  }

  // 2. Specific Tier 1 / Tier 3 heuristics before generic technology fallback
  const sheetFormat = inferSheetFormatFromDimensions(
    input.max_sheet_width_mm,
    input.max_sheet_height_mm,
    haystack
  );

  if (/\b(?:folder|plegadora|falz|buckle|stahl|mbo)\b/i.test(haystack)) {
    return {
      tier: 1,
      schematicKey: 'StahlfolderTH82Svg',
      Component: StahlfolderTH82Svg,
      matchedPreset: null,
      unitsCount: inferUnitsCountFromInput(input, haystack, 6),
      sheetFormat: 'B1',
      resolvedManufacturer: rawMfg || 'Heidelberg / MBO',
      resolvedModel: rawModel || rawName,
      nominalSpeedCph: Number(input.nominal_speed_cph || 16000),
      baseHourlyCostEur: Number(input.hourly_cost_eur || 75),
      maxFileSizeMb: Number(input.max_file_size_mb || 2048),
      minFormatLabel: `${input.min_sheet_width_mm || 140}×${input.min_sheet_height_mm || 180} mm`,
      maxFormatLabel: `${input.max_sheet_width_mm || 820}×${input.max_sheet_height_mm || 1200} mm`,
    };
  }

  if (/\b(?:cutter|guillotin|guillotina|polar|schneid|trimmer)\b/i.test(haystack)) {
    const isPolar = /polar|mohr/i.test(haystack);
    const key: SchematicComponentKey = isPolar
      ? 'PolarMohrCutterSvg'
      : 'ParametricFinishingCutterSvg';
    return {
      tier: isPolar ? 1 : 3,
      schematicKey: key,
      Component: SCHEMATIC_COMPONENT_MAP[key],
      matchedPreset: null,
      unitsCount: 1,
      sheetFormat: 'B1',
      resolvedManufacturer: rawMfg || 'Industrial Finishing OEM',
      resolvedModel: rawModel || rawName,
      nominalSpeedCph: Number(input.nominal_speed_cph || 4500),
      baseHourlyCostEur: Number(input.hourly_cost_eur || 60),
      maxFileSizeMb: Number(input.max_file_size_mb || 2048),
      minFormatLabel: `${input.min_sheet_width_mm || 100}×${input.min_sheet_height_mm || 100} mm`,
      maxFormatLabel: `${input.max_sheet_width_mm || 920}×${input.max_sheet_height_mm || 1370} mm`,
    };
  }

  if (/\b(?:binder|binding|pur|eva|encuadernad|klebebind|hardcover|case|clamp)\b/i.test(haystack)) {
    const unitsCount = inferUnitsCountFromInput(input, haystack, 8);
    return {
      tier: 3,
      schematicKey: 'ParametricPerfectBinderSvg',
      Component: ParametricPerfectBinderSvg,
      matchedPreset: null,
      unitsCount,
      sheetFormat: 'CUSTOM',
      resolvedManufacturer: rawMfg || 'Bookbinding Systems OEM',
      resolvedModel: rawModel || rawName,
      nominalSpeedCph: Number(input.nominal_speed_cph || 6000),
      baseHourlyCostEur: Number(input.hourly_cost_eur || 110),
      maxFileSizeMb: Number(input.max_file_size_mb || 2048),
      minFormatLabel: `${input.min_sheet_width_mm || 105}×${input.min_sheet_height_mm || 148} mm`,
      maxFormatLabel: `${input.max_sheet_width_mm || 320}×${input.max_sheet_height_mm || 480} mm`,
    };
  }

  if (/\b(?:web|rotary|rotativa|reel|bobina|continuous)\b/i.test(haystack)) {
    const unitsCount = inferUnitsCountFromInput(input, haystack, 4);
    return {
      tier: 3,
      schematicKey: 'ParametricWebRotarySvg',
      Component: ParametricWebRotarySvg,
      matchedPreset: null,
      unitsCount,
      sheetFormat: 'CUSTOM',
      resolvedManufacturer: rawMfg || 'Web Rotary OEM',
      resolvedModel: rawModel || rawName,
      nominalSpeedCph: Number(input.nominal_speed_cph || 25000),
      baseHourlyCostEur: Number(input.hourly_cost_eur || 210),
      maxFileSizeMb: Number(input.max_file_size_mb || 2048),
      minFormatLabel: `${input.min_sheet_width_mm || 420}×${input.min_sheet_height_mm || 594} mm`,
      maxFormatLabel: `${input.max_sheet_width_mm || 630}×${input.max_sheet_height_mm || 960} mm`,
    };
  }

  if (/\b(?:digital|indigo|toner|inkjet|electroink|vdp|sra3)\b/i.test(haystack)) {
    return {
      tier: 3,
      schematicKey: 'ParametricDigitalPressSvg',
      Component: ParametricDigitalPressSvg,
      matchedPreset: null,
      unitsCount: inferUnitsCountFromInput(input, haystack, 4),
      sheetFormat: sheetFormat === 'B1' ? 'SRA3' : sheetFormat,
      resolvedManufacturer: rawMfg || 'Digital Press OEM',
      resolvedModel: rawModel || rawName,
      nominalSpeedCph: Number(input.nominal_speed_cph || 4600),
      baseHourlyCostEur: Number(input.hourly_cost_eur || 95),
      maxFileSizeMb: Number(input.max_file_size_mb || 2048),
      minFormatLabel: `${input.min_sheet_width_mm || 210}×${input.min_sheet_height_mm || 297} mm`,
      maxFormatLabel: `${input.max_sheet_width_mm || 330}×${input.max_sheet_height_mm || 487} mm`,
    };
  }

  if (/\b(?:finisher|laminat|varnish|uv|foil)\b/i.test(haystack)) {
    return {
      tier: 3,
      schematicKey: 'ParametricFinishingCutterSvg',
      Component: ParametricFinishingCutterSvg,
      matchedPreset: null,
      unitsCount: 1,
      sheetFormat,
      resolvedManufacturer: rawMfg || 'Finishing Systems OEM',
      resolvedModel: rawModel || rawName,
      nominalSpeedCph: Number(input.nominal_speed_cph || 5500),
      baseHourlyCostEur: Number(input.hourly_cost_eur || 85),
      maxFileSizeMb: Number(input.max_file_size_mb || 2048),
      minFormatLabel: `${input.min_sheet_width_mm || 210}×${input.min_sheet_height_mm || 297} mm`,
      maxFormatLabel: `${input.max_sheet_width_mm || 750}×${input.max_sheet_height_mm || 1060} mm`,
    };
  }

  // Default Universal Procedural Fallback: Parametric Sheetfed Offset (1..10 towers)
  const unitsCount = inferUnitsCountFromInput(input, haystack, 4);
  return {
    tier: 3,
    schematicKey: 'ParametricSheetfedOffsetSvg',
    Component: ParametricSheetfedOffsetSvg,
    matchedPreset: null,
    unitsCount,
    sheetFormat,
    resolvedManufacturer: rawMfg || 'Industrial Offset OEM',
    resolvedModel: rawModel || rawName,
    nominalSpeedCph: Number(input.nominal_speed_cph || 16000),
    baseHourlyCostEur: Number(input.hourly_cost_eur || 165),
    maxFileSizeMb: Number(input.max_file_size_mb || 2048),
    minFormatLabel: `${input.min_sheet_width_mm || 340}×${input.min_sheet_height_mm || 480} mm`,
    maxFormatLabel: `${input.max_sheet_width_mm || 750}×${input.max_sheet_height_mm || 1060} mm`,
  };
}

