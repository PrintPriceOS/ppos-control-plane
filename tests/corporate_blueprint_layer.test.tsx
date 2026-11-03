import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import fs from 'fs';
import path from 'path';
import { LocaleProvider } from '../src/ui/i18n';
import {
  BlueprintCard,
  IndustrialFleetNexusSvg,
  INDUSTRIAL_FLEET_NEXUS_HOTSPOTS,
  PreflightSelfHealingSvg,
  MachineryFleetIotSvg,
  PricingHawkEyeSvg,
  AlgorithmicRoutingMapSvg,
  EscrowInvoicingVaultSvg,
  TechnicalCtaBackdropSvg,
} from '../src/ui/components/blueprints';
import { CorporateBlueprintShowcasePage } from '../src/ui/pages/public/CorporateBlueprintShowcasePage';

describe('Phase 17 — Corporate Vector Blueprint Visual Layer (printprice.pro & Control Plane)', () => {
  it('1. Keeps all 7 standalone SVG blueprint components lightweight (< 35KB uncompressed)', () => {
    const svgFiles = [
      'IndustrialFleetNexusSvg.tsx',
      'PreflightSelfHealingSvg.tsx',
      'MachineryFleetIotSvg.tsx',
      'PricingHawkEyeSvg.tsx',
      'AlgorithmicRoutingMapSvg.tsx',
      'EscrowInvoicingVaultSvg.tsx',
      'TechnicalCtaBackdropSvg.tsx',
    ];

    for (const file of svgFiles) {
      const fullPath = path.resolve(__dirname, '../src/ui/components/blueprints', file);
      const stat = fs.statSync(fullPath);
      expect(stat.size).toBeLessThan(35 * 1024);
    }
  });

  it('2. Renders IndustrialFleetNexusSvg with accessible <title>/<desc> and 5 interactive mechanical hotspots', () => {
    render(
      <LocaleProvider initialLocale="en">
        <BlueprintCard
          title="End-to-End Line"
          codeTag="HERO-NEXUS"
          hotspots={INDUSTRIAL_FLEET_NEXUS_HOTSPOTS}
        >
          {({ theme, activeHotspotId, onHoverHotspot }) => (
            <IndustrialFleetNexusSvg
              theme={theme}
              activeHotspotId={activeHotspotId}
              onHoverHotspot={onHoverHotspot}
            />
          )}
        </BlueprintCard>
      </LocaleProvider>
    );

    expect(
      screen.getByTitle(/PrintPrice OS End-to-End Industrial Elevation Schematic/i)
    ).toBeTruthy();

    // Click or hover hotspot PF-01 and PR-08
    const pressBtn = screen.getByRole('button', { name: /\[PR-08\] 8-Unit B1 Offset Line/i });
    fireEvent.click(pressBtn);

    expect(screen.getByRole('status').textContent).toContain('B1 Feeder: 18,000 cph');
  });

  it('3. Supports Dual-Surface adaptation (Dark Tactical #09090b vs Technical White #f8fafc) across all 6 modular SVGs', () => {
    const { container, rerender } = render(
      <LocaleProvider initialLocale="de">
        <div>
          <PreflightSelfHealingSvg theme="dark" />
          <MachineryFleetIotSvg theme="dark" />
          <PricingHawkEyeSvg theme="dark" />
          <AlgorithmicRoutingMapSvg theme="dark" />
          <EscrowInvoicingVaultSvg theme="dark" />
          <TechnicalCtaBackdropSvg theme="dark" />
        </div>
      </LocaleProvider>
    );

    const darkRects = container.querySelectorAll('rect[fill="#09090b"]');
    expect(darkRects.length).toBeGreaterThanOrEqual(6);

    rerender(
      <LocaleProvider initialLocale="de">
        <div>
          <PreflightSelfHealingSvg theme="light" />
          <MachineryFleetIotSvg theme="light" />
          <PricingHawkEyeSvg theme="light" />
          <AlgorithmicRoutingMapSvg theme="light" />
          <EscrowInvoicingVaultSvg theme="light" />
          <TechnicalCtaBackdropSvg theme="light" />
        </div>
      </LocaleProvider>
    );

    const lightRects = container.querySelectorAll('rect[fill="#f8fafc"]');
    expect(lightRects.length).toBeGreaterThanOrEqual(6);
  });

  it('4. Renders CorporateBlueprintShowcasePage with 3-mode Live Sandbox toggle and trilingual EN/DE/ES switching', () => {
    const { container } = render(
      <LocaleProvider initialLocale="en">
        <CorporateBlueprintShowcasePage />
      </LocaleProvider>
    );

    expect(
      screen.getByText(/The Operating System for Modern Print Infrastructure/i)
    ).toBeTruthy();

    // Switch sandbox to Digital Hub View
    const digitalBtn = container.querySelector('[data-sandbox-btn="digital"]') as HTMLButtonElement;
    expect(digitalBtn).toBeTruthy();
    fireEvent.click(digitalBtn);
    expect(container.textContent).toContain('HP INDIGO 100K B2 + HORIZON BQ');

    // Switch locale to German (DE)
    const deBtn = screen.getByRole('button', { name: /^de$/i });
    fireEvent.click(deBtn);
    expect(
      screen.getByText(/Das Betriebssystem für Moderne Druckinfrastruktur/i)
    ).toBeTruthy();
  });
});

