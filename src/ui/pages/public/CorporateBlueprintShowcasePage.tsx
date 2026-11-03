import React, { useState } from 'react';
import { useLocale, Locale } from '../../i18n';
import {
  BlueprintCard,
   BlueprintSurfaceTheme,
  IndustrialFleetNexusSvg,
  INDUSTRIAL_FLEET_NEXUS_HOTSPOTS,
  PreflightSelfHealingSvg,
  MachineryFleetIotSvg,
  PricingHawkEyeSvg,
  AlgorithmicRoutingMapSvg,
  EscrowInvoicingVaultSvg,
  TechnicalCtaBackdropSvg,
} from '../../components/blueprints';

export const CorporateBlueprintShowcasePage: React.FC = () => {
  const { t, locale, setLocale } = useLocale();
  const [globalSurface, setGlobalSurface] = useState<BlueprintSurfaceTheme>('dark');
  const [sandboxMode, setSandboxMode] = useState<'offset' | 'digital' | 'logistics'>('offset');

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 selection:bg-[#dc0000] selection:text-white">
      {/* Top Tactical Navigation & Controls Bar */}
      <header className="sticky top-0 z-40 border-b border-zinc-800/80 bg-[#09090b]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-3.5">
          <div className="flex items-center gap-3">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#dc0000] shadow-[0_0_10px_#dc0000]" />
            <span className="font-mono text-xs font-extrabold uppercase tracking-widest text-zinc-100">
              PRINTPRICE OS · CAD BLUEPRINT LAYER V5.2
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Theme Surface Switcher */}
            <div className="inline-flex rounded-lg border border-zinc-800 bg-zinc-900/90 p-0.5">
              <button
                type="button"
                onClick={() => setGlobalSurface('dark')}
                className={`rounded-md px-3 py-1 font-mono text-[11px] font-bold transition-colors ${
                  globalSurface === 'dark'
                    ? 'bg-[#dc0000] text-white'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {t('machines.blueprint.themeDark')}
              </button>
              <button
                type="button"
                onClick={() => setGlobalSurface('light')}
                className={`rounded-md px-3 py-1 font-mono text-[11px] font-bold transition-colors ${
                  globalSurface === 'light'
                    ? 'bg-[#dc0000] text-white'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {t('machines.blueprint.themeLight')}
              </button>
            </div>

            {/* Trilingual Selector */}
            <div className="inline-flex rounded-lg border border-zinc-800 bg-zinc-900/90 p-0.5">
              {(['en', 'de', 'es'] as Locale[]).map((loc) => (
                <button
                  key={loc}
                  type="button"
                  onClick={() => setLocale(loc)}
                  className={`rounded-md px-2.5 py-1 font-mono text-[11px] font-bold uppercase transition-colors ${
                    locale === loc
                      ? 'bg-zinc-100 text-zinc-950'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {loc}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      {/* SECTION 1: HERO & CORE PLATFORM ELEVATION WIREFRAME */}
      <section className="relative overflow-hidden border-b border-zinc-800/80 py-14">
        <div className="mx-auto max-w-7xl px-6">
          <div className="max-w-3xl">
            <h1 className="text-3xl font-black tracking-tight text-zinc-100 sm:text-5xl">
              {t('blueprint.showcase.heroHeadline')}
            </h1>
            <p className="mt-4 text-base leading-relaxed text-zinc-400 sm:text-lg">
              {t('blueprint.showcase.heroSubheadline')}
            </p>
          </div>

          <div className="mt-8">
            <BlueprintCard
              title="End-to-End Automated Book Manufacturing Line (Preflight → B1 Offset → PUR Bindery → EPAL Dispatch)"
              subtitle="Hover or click any mechanical station hotspot below to inspect live SCADA speed, format tolerances, and cryptographic handoffs."
              codeTag="HERO-ELEVATION · PPOS-NEXUS-01"
              metricBadge="18,000 CPH · ISO 12647-2"
              theme={globalSurface}
              aspectRatio="hero"
              hotspots={INDUSTRIAL_FLEET_NEXUS_HOTSPOTS}
              footerSpecs={[
                { label: 'INGESTION GATE', value: '2GB PDF/X-4 Stream' },
                { label: 'PRESS THROUGHPUT', value: '18,000 B1 Sheets/h' },
                { label: 'DISPATCH PROTOCOL', value: 'GS1-128 SSCC-18' },
              ]}
            >
              {({ theme, activeHotspotId, onHoverHotspot }) => (
                <IndustrialFleetNexusSvg
                  theme={theme}
                  activeHotspotId={activeHotspotId}
                  onHoverHotspot={onHoverHotspot}
                  sandboxMode={sandboxMode}
                />
              )}
            </BlueprintCard>
          </div>
        </div>
      </section>

      {/* SECTION 2: LIVE INTERACTIVE WIDGET SANDBOX (3-MODE ARCHITECTURE SWITCHER) */}
      <section className="border-b border-zinc-800/80 bg-[#0e0e11] py-12">
        <div className="mx-auto max-w-7xl px-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 className="text-xl font-extrabold tracking-tight text-zinc-100 sm:text-2xl">
              {t('blueprint.showcase.sandboxTitle')}
            </h2>

            <div className="inline-flex flex-wrap gap-2 rounded-xl border border-zinc-800 bg-zinc-950 p-1.5">
              {(
                [
                  { id: 'offset', label: t('blueprint.showcase.sandboxModeOffset') },
                  { id: 'digital', label: t('blueprint.showcase.sandboxModeDigital') },
                  { id: 'logistics', label: t('blueprint.showcase.sandboxModeLogistics') },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  data-sandbox-btn={item.id}
                  onClick={() => setSandboxMode(item.id)}
                  className={`rounded-lg px-3.5 py-1.5 font-mono text-xs font-bold transition-all ${
                    sandboxMode === item.id
                      ? 'bg-[#dc0000] text-white shadow-[0_0_15px_rgba(220,0,0,0.5)]'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 3: 4-PILLAR DARK TACTICAL FEATURE GRID + TECHNICAL WHITE EDITORIAL BLOCK */}
      <section className="py-14">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {/* Pillar 1: Preflight 2GB & Self-Healing */}
            <BlueprintCard
              title="Preflight 2GB & Automated Spine/Bleed Self-Healing"
              subtitle="6-axis forensic PDF/X-4 inspection with +3.0mm mirror bleed synthesis and parametric spine caliper."
              codeTag="MOD-01 · PREFLIGHT-FIX-IT"
              metricBadge="2GB STREAM · +3.0MM BLEED"
              theme={globalSurface}
              footerSpecs={[
                { label: 'MAX PAYLOAD', value: '2,048 MB Stream' },
                { label: 'SPINE FORMULA', value: 'GSM × Bulk / 1000' },
                { label: 'OUTPUT', value: 'PDF/X-4:2010 Ready' },
              ]}
              ctaLabel="Open Preflight Engine"
              ctaHref="https://preflight.printprice.pro/"
            >
              {({ theme }) => <PreflightSelfHealingSvg theme={theme} />}
            </BlueprintCard>

            {/* Pillar 2: Machinery Fleet & IoT */}
            <BlueprintCard
              title="Machinery Fleet Digital Twins & CIP4 JMF Telemetry"
              subtitle="Multi-unit sheetfed offset & web rotary cross-sections with cylinder nips, ink keys, and OEE tracking."
              codeTag="MOD-02 · FLEET-IOT-CAD"
              metricBadge="22 OEM PRESETS · JDF 1.7"
              theme={globalSurface}
              footerSpecs={[
                { label: 'SHEET FORMATS', value: 'B1 · B2 · SRA3 · REEL' },
                { label: 'SPEED RATING', value: 'Up to 18,000 cph' },
                { label: 'MAINTENANCE', value: '95% OEE Lock' },
              ]}
              ctaLabel="Explore Fleet Directory"
              ctaHref="/machines"
            >
              {({ theme }) => <MachineryFleetIotSvg theme={theme} />}
            </BlueprintCard>

            {/* Pillar 3: Pricing Intelligence & Hawk-Eye */}
            <BlueprintCard
              title="Pricing Intelligence & 5-Axis Hawk-Eye Calibrator"
              subtitle="Server-governed balance of substrate kg cost, CTP plates by signatures, make-ready, and Digital/Offset Q* crossover."
              codeTag="MOD-03 · HAWK-EYE-BPE"
              metricBadge="SHA-256 GOVERNED"
              theme={globalSurface}
              footerSpecs={[
                { label: 'CROSSOVER Q*', value: 'Dynamic Solver' },
                { label: 'CTP PLATES', value: 'By Signature & Color' },
                { label: 'REVISIONS', value: 'SHA-256 Immutable' },
              ]}
              ctaLabel="Launch Budget Calculator"
              ctaHref="https://budget.printprice.pro/"
            >
              {({ theme }) => <PricingHawkEyeSvg theme={theme} />}
            </BlueprintCard>

            {/* Pillar 4: 5-Axis Algorithmic Routing */}
            <BlueprintCard
              title="5-Axis Algorithmic Routing & 3D EPAL Cubing"
              subtitle="Geodesic European dispatch scoring Landed Cost (40%), EPAL Freight (30%), SLA (20%), and OEE (10%) over SSE."
              codeTag="MOD-04 · ROUTING-SSE-5X"
              metricBadge="SSE <500MS · HMAC-256"
              theme={globalSurface}
              footerSpecs={[
                { label: 'SCORING WEIGHTS', value: '40 / 30 / 20 / 10%' },
                { label: 'PALLET STANDARD', value: 'EPAL 120×80cm' },
                { label: 'WEBHOOKS', value: 'HMAC-SHA256 3x Retry' },
              ]}
              ctaLabel="Inspect Routing Rules"
              ctaHref="/ops/pricing"
            >
              {({ theme }) => <AlgorithmicRoutingMapSvg theme={theme} />}
            </BlueprintCard>
          </div>

          {/* Technical White Mode Block: Escrow & EN 16931 FinTech Invoicing */}
          <div className="mt-10 rounded-3xl bg-[#f8fafc] p-6 text-slate-900 shadow-xl sm:p-8">
            <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-12">
              <div className="lg:col-span-5">
                <span className="inline-block rounded border border-red-600/30 bg-red-50 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-widest text-[#dc0000]">
                  TECHNICAL WHITE DRAFTING SURFACE · EN 16931
                </span>
                <h2 className="mt-3 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
                  Dual-Padlock Escrow MoR &amp; Automated E-Invoicing
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-slate-600">
                  Engineered on high-contrast drafting paper (`#ffffff` / `#f8fafc`) for financial auditability: funds lock on 3D Soft-Proof Imprimatur and release automatically upon signed CMR/POD, generating compliant Facturae 3.2.2 (ES) and XRechnung 3.0 (DE) XML payloads.
                </p>
              </div>
              <div className="lg:col-span-7">
                <BlueprintCard
                  title="Commercial Escrow Vault & EN 16931 Fiscal Matrix"
                  subtitle="Dual-control settlement (88% Printhouse / 12% Platform & Carrier) with AES-256-GCM IBAN vaulting."
                  codeTag="MOD-05 · ESCROW-EN16931"
                  metricBadge="FACTURAE 3.2.2 · XRECHNUNG 3.0"
                  theme="light"
                  footerSpecs={[
                    { label: 'LOCK 01', value: '3D Imprimatur SHA-256' },
                    { label: 'LOCK 02', value: 'Signed CMR / POD' },
                    { label: 'SPLIT PAYOUT', value: '88% Net Printhouse' },
                  ]}
                >
                  <EscrowInvoicingVaultSvg theme="light" />
                </BlueprintCard>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 4: ENTERPRISE CONVERSION / ONBOARDING CTA WITH ARCHITECTURAL BACKDROP */}
      <section className="relative overflow-hidden border-t border-zinc-800 py-20">
        <div className="pointer-events-none absolute inset-0 z-0">
          <TechnicalCtaBackdropSvg theme="dark" />
        </div>

        <div className="relative z-10 mx-auto max-w-4xl px-6 text-center">
          <h2 className="text-3xl font-black tracking-tight text-white sm:text-4xl">
            {t('blueprint.showcase.ctaTitle')}
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-zinc-300">
            {t('blueprint.showcase.ctaSubtitle')}
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <a
              href="/printhouse/register"
              className="rounded-xl bg-[#dc0000] px-6 py-3.5 font-mono text-xs font-extrabold uppercase tracking-wider text-white shadow-[0_10px_30px_rgba(220,0,0,0.45)] transition-transform hover:-translate-y-0.5"
            >
              {t('blueprint.showcase.ctaPrimaryBtn')}
            </a>
            <a
              href="https://budget.printprice.pro/"
              className="rounded-xl border border-zinc-700 bg-zinc-900/80 px-6 py-3.5 font-mono text-xs font-extrabold uppercase tracking-wider text-zinc-100 backdrop-blur-sm transition-colors hover:border-red-500"
            >
              {t('blueprint.showcase.ctaSecondaryBtn')}
            </a>
          </div>
        </div>
      </section>
    </div>
  );
};

