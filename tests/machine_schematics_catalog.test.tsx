/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LocaleProvider } from '../src/ui/i18n';
import { en } from '../src/ui/en';
import { de } from '../src/ui/de';
import { es } from '../src/ui/es';
import { MACHINE_PRESETS_CATALOG } from '../src/ui/components/printhouse/machines/machinePresetsCatalog';
import { resolveMachineSchematic } from '../src/ui/components/printhouse/machines/resolveMachineSchematic';
import { MachineBlueprintModal } from '../src/ui/components/printhouse/machines/MachineBlueprintModal';
import { MachineBlueprintThumbnail } from '../src/ui/components/printhouse/machines/MachineBlueprintThumbnail';

describe('Industrial Vector Blueprint SVG Engine & Machine Preset Catalog', () => {
  it('1. Defines at least 20 pre-configured European industrial machines in MACHINE_PRESETS_CATALOG', () => {
    expect(MACHINE_PRESETS_CATALOG.length).toBeGreaterThanOrEqual(20);
    const technologies = new Set(MACHINE_PRESETS_CATALOG.map((p) => p.technology));
    expect(technologies.has('OFFSET')).toBe(true);
    expect(technologies.has('DIGITAL_PRESS')).toBe(true);
    expect(technologies.has('BINDER')).toBe(true);
    expect(technologies.has('CUTTER')).toBe(true);
    expect(technologies.has('FINISHER')).toBe(true);
  });

  it('2. Resolves all 6 Tier 1 Flagship OEM Schematics accurately', () => {
    const xl106 = resolveMachineSchematic({
      machine_name: 'Heidelberg Speedmaster XL 106-8-P+L',
      manufacturer: 'Heidelberg',
      machine_type: 'OFFSET',
    });
    expect(xl106.tier).toBe(1);
    expect(xl106.schematicKey).toBe('HeidelbergSpeedmasterXL106Svg');

    const g29 = resolveMachineSchematic({
      machine_name: 'Komori Lithrone G29-5+C',
      manufacturer: 'Komori',
      machine_type: 'OFFSET',
    });
    expect(g29.tier).toBe(1);
    expect(g29.schematicKey).toBe('KomoriLithroneG29Svg');

    const indigo100k = resolveMachineSchematic({
      machine_name: 'HP Indigo 100K Digital Press',
      manufacturer: 'HP Indigo',
      machine_type: 'DIGITAL_PRESS',
    });
    expect(indigo100k.tier).toBe(1);
    expect(indigo100k.schematicKey).toBe('HpIndigo100KSvg');

    const alegro = resolveMachineSchematic({
      machine_name: 'Müller Martini Alegro PUR Line',
      manufacturer: 'Müller Martini',
      machine_type: 'BINDER',
    });
    expect(alegro.tier).toBe(1);
    expect(alegro.schematicKey).toBe('MullerMartiniAlegroSvg');

    const polar = resolveMachineSchematic({
      machine_name: 'Polar Mohr 137 ED Guillotine',
      manufacturer: 'Polar Mohr',
      machine_type: 'CUTTER',
    });
    expect(polar.tier).toBe(1);
    expect(polar.schematicKey).toBe('PolarMohrCutterSvg');

    const stahl = resolveMachineSchematic({
      machine_name: 'Heidelberg Stahlfolder TH 82',
      manufacturer: 'Heidelberg',
      machine_type: 'FINISHER',
    });
    expect(stahl.tier).toBe(1);
    expect(stahl.schematicKey).toBe('StahlfolderTH82Svg');
  });

  it('3. Fuzzy-matches Tier 2 European Industrial Presets (KBA Rapida, Canon varioPRINT, Horizon BQ)', () => {
    const kba = resolveMachineSchematic({
      machine_name: 'KBA Rapida 106 6-Color',
      machine_type: 'OFFSET',
    });
    expect(kba.tier).toBe(2);
    expect(kba.schematicKey).toBe('ParametricSheetfedOffsetSvg');
    expect(kba.matchedPreset?.presetId).toBe('PRESET-KBA-RAPIDA-106');

    const canon = resolveMachineSchematic({
      machine_name: 'Canon varioPRINT iX3200 Inkjet',
      machine_type: 'DIGITAL_PRESS',
    });
    expect(canon.tier).toBe(2);
    expect(canon.schematicKey).toBe('ParametricDigitalPressSvg');
    expect(canon.matchedPreset?.presetId).toBe('PRESET-CANON-VARIOPRINT-IX3200');

    const horizon = resolveMachineSchematic({
      machine_name: 'Horizon BQ-500 PUR',
      machine_type: 'BINDER',
    });
    expect(horizon.tier).toBe(2);
    expect(horizon.schematicKey).toBe('ParametricPerfectBinderSvg');
  });

  it('4. Generates Tier 3 Procedural Parametric Fallbacks for unknown or custom machinery without ever returning null', () => {
    const customOffset = resolveMachineSchematic({
      machine_name: 'Custom Offset 6-Colors Special',
      machine_type: 'OFFSET',
      max_sheet_width_mm: 720,
      max_sheet_height_mm: 1020,
    });
    expect(customOffset.tier).toBe(3);
    expect(customOffset.schematicKey).toBe('ParametricSheetfedOffsetSvg');
    expect(customOffset.unitsCount).toBe(6);
    expect(customOffset.Component).toBeDefined();

    const artisanalBinder = resolveMachineSchematic({
      machine_name: 'Artesanal Binder 10-Clamp EVA',
      machine_type: 'BINDER',
    });
    expect(artisanalBinder.tier).toBe(3);
    expect(artisanalBinder.schematicKey).toBe('ParametricPerfectBinderSvg');
    expect(artisanalBinder.unitsCount).toBe(10);

    const unknownWeb = resolveMachineSchematic({
      machine_name: 'Custom Web Rotary Book Press',
    });
    expect(unknownWeb.tier).toBe(3);
    expect(unknownWeb.schematicKey).toBe('ParametricWebRotarySvg');
  });

  it('5. Renders interactive MachineBlueprintThumbnail & MachineBlueprintModal with Dark/White theme toggle, Wireframe mode, and Hotspots', () => {
    let inspected: any = null;
    const sampleMachine = {
      id: 'mach-xl106-test',
      machine_name: 'Heidelberg Speedmaster XL 106-8P',
      manufacturer: 'Heidelberg',
      machine_type: 'OFFSET',
      max_sheet_width_mm: 750,
      max_sheet_height_mm: 1060,
      nominal_speed_cph: 18000,
      hourly_cost_eur: 185,
      max_file_size_mb: 2048,
    };

    render(
      <LocaleProvider initialLocale="es">
        <MachineBlueprintThumbnail
          machine={sampleMachine}
          onInspect={(m) => {
            inspected = m;
          }}
        />
        <MachineBlueprintModal
          isOpen={true}
          onClose={() => {}}
          machine={sampleMachine}
        />
      </LocaleProvider>
    );

    const thumbBtn = screen.getByTestId('inspect-blueprint-btn-mach-xl106-test');
    fireEvent.click(thumbBtn);
    expect(inspected).not.toBeNull();

    // Verify modal renders SVG and controls in Spanish
    expect(screen.getByTestId('machine-blueprint-modal')).toBeTruthy();
    const canvas = screen.getByTestId('blueprint-svg-canvas');
    expect(canvas.querySelector('svg')).not.toBeNull();

    // Switch to White Engineering Drawing theme
    const lightBtn = screen.getByTestId('blueprint-theme-light-btn');
    fireEvent.click(lightBtn);
    expect(canvas.className).toContain('bg-white');

    // Toggle wireframe mode
    const wireBtn = screen.getByTestId('blueprint-wireframe-toggle-btn');
    fireEvent.click(wireBtn);

    // Click hotspot #3 (Dryer / Coater)
    const dryerHotspot = screen.getByTestId('blueprint-hotspot-dryer');
    fireEvent.click(dryerHotspot);
    expect(screen.getByTestId('blueprint-hotspot-panel').textContent).toContain(
      es['machines.blueprint.hotspotDryerTitle']
    );
  });

  it('6. Guarantees strict trilingual i18n parity across en.ts, de.ts, and es.ts', () => {
    const requiredKeys: (keyof typeof en)[] = [
      'machines.blueprint.inspectBtn',
      'machines.blueprint.modalSubtitle',
      'machines.blueprint.themeDark',
      'machines.blueprint.themeLight',
      'machines.blueprint.wireframeToggle',
      'machines.blueprint.copySvgBtn',
      'machines.blueprint.tier1Badge',
      'machines.blueprint.tier2Badge',
      'machines.blueprint.tier3Badge',
      'machines.blueprint.specMaxMinFormat',
      'machines.blueprint.specNominalSpeed',
      'machines.blueprint.specHourlyCost',
      'machines.blueprint.specMaxInputFile',
      'machines.blueprint.hotspotFeederTitle',
      'machines.blueprint.hotspotUnitsTitle',
      'machines.blueprint.hotspotDryerTitle',
      'machines.blueprint.hotspotDeliveryTitle',
      'machines.blueprint.hotspotClampsTitle',
    ];

    for (const key of requiredKeys) {
      expect(en[key]).toBeTruthy();
      expect(de[key]).toBeTruthy();
      expect(es[key]).toBeTruthy();
    }
  });
});
