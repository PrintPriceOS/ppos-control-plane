import React, { useState } from 'react';
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
  useBlueprintTranslation,
} from './index';

export interface CorporateBlueprintSectionProps {
  initialTheme?: BlueprintSurfaceTheme;
}

export const CorporateBlueprintSection: React.FC<CorporateBlueprintSectionProps> = ({
  initialTheme = 'dark',
}) => {
  const { tr, locale } = useBlueprintTranslation();
  const [surface, setSurface] = useState<BlueprintSurfaceTheme>(initialTheme);
  const [sandboxMode, setSandboxMode] = useState<'offset' | 'digital' | 'logistics'>('offset');

  return (
    <section
      id="blueprint-architecture"
      data-blueprint-section="corporate-cad-layer"
      style={{
        padding: 'clamp(4rem, 7vw, 6rem) 0',
        background: '#09090b',
        borderTop: '1px solid rgba(255, 255, 255, 0.08)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        color: '#f4f4f5',
      }}
    >
      <div style={{ maxWidth: '1240px', margin: '0 auto', padding: '0 1.5rem' }}>
        {/* Header & Live Surface / Sandbox Switchers */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            gap: '1.5rem',
            marginBottom: '2.5rem',
          }}
        >
          <div style={{ maxWidth: '720px' }}>
            <h2
              style={{
                fontSize: 'clamp(1.85rem, 4vw, 2.65rem)',
                fontWeight: 900,
                letterSpacing: '-0.03em',
                lineHeight: 1.1,
                margin: 0,
                color: '#f4f4f5',
              }}
            >
              {tr(
                'blueprint.showcase.heroHeadline',
                locale === 'es'
                  ? 'El Sistema Operativo para la Infraestructura Gráfica Moderna'
                  : locale === 'de'
                  ? 'Das Betriebssystem für Moderne Druckinfrastruktur'
                  : 'The Operating System for Modern Print Infrastructure'
              )}
            </h2>
            <p
              style={{
                marginTop: '0.75rem',
                marginBottom: 0,
                fontSize: '1rem',
                lineHeight: 1.6,
                color: '#a1a1aa',
              }}
            >
              {tr(
                'blueprint.showcase.heroSubheadline',
                locale === 'es'
                  ? 'Fabricación industrial de libros gobernada en servidor: preflight auto-reparable PDF/X-4 hasta 2GB, calibración de costes CTP/prensa en 5 ejes, enrutamiento algorítmico multiplanta y liquidación Escrow EN 16931.'
                  : locale === 'de'
                  ? 'Durchgängige servergesteuerte Buchfertigung: 2GB PDF/X-4 Selbstheilungs-Preflight, 5-Achsen-CTP-/Maschinenkalkulation, algorithmisches Multi-Plant-Routing und EN 16931 Treuhandabrechnung.'
                  : 'End-to-end server-governed book manufacturing: 2GB PDF/X-4 self-healing preflight, 5-axis CTP/press cost calibration, algorithmic multi-plant dispatch, and EN 16931 escrow settlement.'
              )}
            </p>
          </div>

          {/* Interactive Surface & Plant Sandbox Toggles */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
            <div
              style={{
                display: 'inline-flex',
                padding: '4px',
                borderRadius: '10px',
                border: '1px solid rgba(63, 63, 70, 0.85)',
                backgroundColor: '#131316',
                gap: '4px',
              }}
            >
              {(
                [
                  {
                    id: 'offset',
                    label:
                      locale === 'es'
                        ? 'Línea Offset B1'
                        : locale === 'de'
                        ? 'B1-Offsetlinie'
                        : 'Offset Line View',
                  },
                  {
                    id: 'digital',
                    label:
                      locale === 'es'
                        ? 'Hub Digital B2'
                        : locale === 'de'
                        ? 'B2-Digital-Hub'
                        : 'Digital Hub View',
                  },
                  {
                    id: 'logistics',
                    label:
                      locale === 'es'
                        ? 'Matriz Logística EPAL'
                        : locale === 'de'
                        ? 'EPAL-Logistikmatrix'
                        : 'Logistics Matrix',
                  },
                ] as const
              ).map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  data-sandbox-btn={mode.id}
                  onClick={() => setSandboxMode(mode.id)}
                  style={{
                    fontFamily: 'monospace',
                    fontSize: '11px',
                    fontWeight: 700,
                    padding: '6px 12px',
                    borderRadius: '7px',
                    border: 'none',
                    cursor: 'pointer',
                    backgroundColor: sandboxMode === mode.id ? '#dc0000' : 'transparent',
                    color: sandboxMode === mode.id ? '#ffffff' : '#a1a1aa',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {mode.label}
                </button>
              ))}
            </div>

            <div
              style={{
                display: 'inline-flex',
                padding: '4px',
                borderRadius: '10px',
                border: '1px solid rgba(63, 63, 70, 0.85)',
                backgroundColor: '#131316',
                gap: '4px',
              }}
            >
              <button
                type="button"
                onClick={() => setSurface('dark')}
                style={{
                  fontFamily: 'monospace',
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '6px 10px',
                  borderRadius: '7px',
                  border: 'none',
                  cursor: 'pointer',
                  backgroundColor: surface === 'dark' ? '#27272a' : 'transparent',
                  color: surface === 'dark' ? '#ffffff' : '#a1a1aa',
                }}
              >
                DARK CAD
              </button>
              <button
                type="button"
                onClick={() => setSurface('light')}
                style={{
                  fontFamily: 'monospace',
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '6px 10px',
                  borderRadius: '7px',
                  border: 'none',
                  cursor: 'pointer',
                  backgroundColor: surface === 'light' ? '#f8fafc' : 'transparent',
                  color: surface === 'light' ? '#0f172a' : '#a1a1aa',
                }}
              >
                WHITE DRAFT
              </button>
            </div>
          </div>
        </div>

        {/* 1. Full-Width Hero Elevation Blueprint */}
        <div style={{ marginBottom: '2rem' }}>
          <BlueprintCard
            title={
              locale === 'es'
                ? 'Alzado Industrial End-to-End (Portal Preflight 2GB → Prensa Offset B1 8 Cuerpos → Tren PUR → Paletizado EPAL)'
                : locale === 'de'
                ? 'Durchgängiger Werks-Aufrissplan (Preflight 2GB → 8-Werk B1-Offset → PUR-Bindelinie → EPAL-Palettierung)'
                : 'End-to-End Automated Plant Elevation (Preflight 2GB Gate → 8-Unit B1 Offset → PUR Binder → EPAL Robot)'
            }
            subtitle={
              locale === 'es'
                ? 'Inspeccione los 5 puntos interactivos de telemetría para verificar velocidades nominales, tolerancias de lomo y sellos SHA-256.'
                : locale === 'de'
                ? 'Klicken oder bewegen Sie den Mauszeiger über die 5 Telemetrie-Hotspots für Nennleistung, Rückentoleranz und SHA-256-Siegel.'
                : 'Hover or click the 5 mechanical hotspots below to inspect nominal CPH speeds, spine caliper tolerances, and SHA-256 handoffs.'
            }
            codeTag="SCADA-ELEVATION · PPOS-NEXUS-01"
            metricBadge="18,000 CPH · ISO 12647-2"
            theme={surface}
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

        {/* 2. 4-Pillar Modular 16:9 CAD Blueprint Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(440px, 100%), 1fr))',
            gap: '1.5rem',
            marginBottom: '2.5rem',
          }}
        >
          <BlueprintCard
            title={
              locale === 'es'
                ? 'Preflight 2GB y Auto-Reparación Geométrica PDF/X-4'
                : locale === 'de'
                ? 'Preflight 2GB & Automatische PDF/X-4-Geometrieheilung'
                : 'Preflight 2GB & Automated Spine/Bleed Self-Healing'
            }
            subtitle={
              locale === 'es'
                ? 'Escáner forense de 6 ejes con síntesis de sangrado espejo (+3.0 mm) y recalibrado paramétrico de lomo.'
                : locale === 'de'
                ? 'Forensischer 6-Achsen-Scanner mit +3,0 mm Beschnittsynthese und parametrischer Rückenstärken-Kalibrierung.'
                : '6-axis forensic PDF/X-4 inspection with +3.0mm mirror bleed synthesis and parametric spine caliper.'
            }
            codeTag="MOD-01 · PREFLIGHT-FIX-IT"
            metricBadge="2GB STREAM · +3.0MM BLEED"
            theme={surface}
            footerSpecs={[
              { label: 'MAX PAYLOAD', value: '2,048 MB Stream' },
              { label: 'SPINE FORMULA', value: 'GSM × Bulk / 1000' },
              { label: 'OUTPUT', value: 'PDF/X-4:2010 Ready' },
            ]}
            ctaLabel={locale === 'es' ? 'Abrir Motor Preflight' : locale === 'de' ? 'Preflight-Engine öffnen' : 'Open Preflight Engine'}
            ctaHref="https://preflight.printprice.pro/"
          >
            {({ theme }) => <PreflightSelfHealingSvg theme={theme} />}
          </BlueprintCard>

          <BlueprintCard
            title={
              locale === 'es'
                ? 'Flota de Maquinaria y Telemetría IoT CIP4 JDF/JMF'
                : locale === 'de'
                ? 'Maschinenflotte & CIP4 JDF/JMF IoT-Telemetrie'
                : 'Machinery Fleet Digital Twins & CIP4 JMF Telemetry'
            }
            subtitle={
              locale === 'es'
                ? 'Sección transversal de prensas offset y digitales con puntos de presión, llaves de tintero, cabezal de succión y OEE.'
                : locale === 'de'
                ? 'Querschnitt von Bogenoffset- und Digitaldruckwerken mit Zylinderspalt, Farbzonen, Vakuumanleger und OEE-Tracking.'
                : 'Multi-unit sheetfed offset & digital cross-sections with cylinder nips, ink keys, vacuum feeder heads, and OEE tracking.'
            }
            codeTag="MOD-02 · FLEET-IOT-CAD"
            metricBadge="22 OEM PRESETS · JDF 1.7"
            theme={surface}
            footerSpecs={[
              { label: 'SHEET FORMATS', value: 'B1 · B2 · SRA3 · REEL' },
              { label: 'SPEED RATING', value: 'Up to 18,000 cph' },
              { label: 'MAINTENANCE', value: '95% OEE Lock' },
            ]}
            ctaLabel={locale === 'es' ? 'Conectar Flota en Control Plane' : locale === 'de' ? 'Maschinenflotte verbinden' : 'Connect Fleet in Control Plane'}
            ctaHref="https://control.printprice.pro/printhouse/register"
          >
            {({ theme }) => <MachineryFleetIotSvg theme={theme} />}
          </BlueprintCard>

          <BlueprintCard
            title={
              locale === 'es'
                ? 'Pricing Intelligence y Calibrador Hawk-Eye de 5 Ejes'
                : locale === 'de'
                ? 'Pricing Intelligence & 5-Achsen Hawk-Eye Kalibrierer'
                : 'Pricing Intelligence & 5-Axis Hawk-Eye Calibrator'
            }
            subtitle={
              locale === 'es'
                ? 'Equilibrio gobernado en servidor entre coste de papel por kg, planchas CTP por signaturas, puesta a punto y cruce Digital/Offset.'
                : locale === 'de'
                ? 'Servergesteuerte Kostenwaage für Papier-kg, CTP-Platten nach Signaturen, Rüstzeit und Digital/Offset-Crossover Q*.'
                : 'Server-governed balance of substrate kg cost, CTP plates by signatures, make-ready, and Digital/Offset Q* crossover.'
            }
            codeTag="MOD-03 · HAWK-EYE-BPE"
            metricBadge="SHA-256 GOVERNED"
            theme={surface}
            footerSpecs={[
              { label: 'CROSSOVER Q*', value: 'Dynamic Solver' },
              { label: 'CTP PLATES', value: 'By Signature & Color' },
              { label: 'REVISIONS', value: 'SHA-256 Immutable' },
            ]}
            ctaLabel={locale === 'es' ? 'Calcular en Budget' : locale === 'de' ? 'In Budget kalkulieren' : 'Launch Budget Calculator'}
            ctaHref="https://budget.printprice.pro/"
          >
            {({ theme }) => <PricingHawkEyeSvg theme={theme} />}
          </BlueprintCard>

          <BlueprintCard
            title={
              locale === 'es'
                ? 'Enrutamiento Algorítmico 5 Ejes y Cubicaje 3D EPAL'
                : locale === 'de'
                ? 'Algorithmisches 5-Achsen-Routing & 3D-EPAL-Cubing'
                : '5-Axis Algorithmic Routing & 3D EPAL Cubing'
            }
            subtitle={
              locale === 'es'
                ? 'Despacho geodésico europeo evaluando Coste Landed (40%), Flete EPAL (30%), SLA (20%) y OEE (10%) sobre SSE.'
                : locale === 'de'
                ? 'Geodätisches europäisches Dispatching nach Landed Cost (40%), EPAL-Fracht (30%), SLA (20%) und OEE (10%) via SSE.'
                : 'Geodesic European dispatch scoring Landed Cost (40%), EPAL Freight (30%), SLA (20%), and OEE (10%) over real-time SSE.'
            }
            codeTag="MOD-04 · ROUTING-SSE-5X"
            metricBadge="SSE <500MS · HMAC-256"
            theme={surface}
            footerSpecs={[
              { label: 'SCORING WEIGHTS', value: '40 / 30 / 20 / 10%' },
              { label: 'PALLET STANDARD', value: 'EPAL 120×80cm' },
              { label: 'WEBHOOKS', value: 'HMAC-SHA256 3x Retry' },
            ]}
            ctaLabel={locale === 'es' ? 'Ver Gobernanza de Red' : locale === 'de' ? 'Netzwerk-Governance prüfen' : 'Explore Network Governance'}
            ctaHref="/governance"
          >
            {({ theme }) => <AlgorithmicRoutingMapSvg theme={theme} />}
          </BlueprintCard>
        </div>

        {/* 3. Technical White Mode Block: Escrow & EN 16931 FinTech Invoicing */}
        <div
          style={{
            borderRadius: '24px',
            backgroundColor: '#f8fafc',
            border: '1px solid #e2e8f0',
            padding: 'clamp(1.5rem, 3.5vw, 2.5rem)',
            color: '#0f172a',
            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.35)',
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(360px, 100%), 1fr))',
              gap: '2rem',
              alignItems: 'center',
            }}
          >
            <div>
              <span
                style={{
                  display: 'inline-block',
                  fontFamily: 'monospace',
                  fontSize: '10px',
                  fontWeight: 800,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  padding: '4px 10px',
                  borderRadius: '6px',
                  backgroundColor: '#fef2f2',
                  border: '1px solid rgba(220, 0, 0, 0.3)',
                  color: '#dc0000',
                  marginBottom: '0.85rem',
                }}
              >
                TECHNICAL WHITE DRAFTING MODE · EN 16931
              </span>
              <h3
                style={{
                  fontSize: 'clamp(1.5rem, 3vw, 2.1rem)',
                  fontWeight: 900,
                  letterSpacing: '-0.025em',
                  lineHeight: 1.15,
                  margin: '0 0 0.85rem 0',
                  color: '#0f172a',
                }}
              >
                {locale === 'es'
                  ? 'Cámara Acorazada Escrow MoR y Facturación Electrónica Facturae / XRechnung'
                  : locale === 'de'
                  ? 'Zwei-Schloss-Escrow-MoR-Tresor & Automatische EN 16931 E-Rechnung'
                  : 'Dual-Padlock Escrow MoR Vault & Automated EN 16931 E-Invoicing'}
              </h3>
              <p
                style={{
                  fontSize: '0.95rem',
                  lineHeight: 1.65,
                  color: '#475569',
                  margin: 0,
                }}
              >
                {locale === 'es'
                  ? 'Delineado sobre papel técnico blanco de alto contraste (#f8fafc / #ffffff) para auditoría financiera: bloqueo criptográfico en Imprimátur 3D y liberación automática tras albarán CMR/POD firmado, emitiendo XML Facturae 3.2.2 (ES) y XRechnung 3.0 (DE).'
                  : locale === 'de'
                  ? 'Gezeichnet auf hochkontrastreichem technischem Zeichenpapier (#f8fafc / #ffffff) für Finanzprüfungen: Treuhandsperre bei 3D-Imprimatur und automatische Auszahlung nach quittiertem CMR/POD mit Facturae 3.2.2 (ES) und XRechnung 3.0 (DE) XML.'
                  : 'Rendered on high-contrast engineering drafting paper (#f8fafc / #ffffff) for financial auditability: funds lock on 3D Soft-Proof Imprimatur and release automatically upon signed CMR/POD, generating compliant Facturae 3.2.2 (ES) and XRechnung 3.0 (DE) XML.'}
              </p>
            </div>

            <div>
              <BlueprintCard
                title={
                  locale === 'es'
                    ? 'Liquidación Comercial Escrow y Matriz Fiscal EN 16931'
                    : locale === 'de'
                    ? 'Kommerzielle Escrow-Abrechnung & EN 16931 Steuermatrix'
                    : 'Commercial Escrow Vault & EN 16931 Fiscal Matrix'
                }
                subtitle={
                  locale === 'es'
                    ? 'Liquidación de doble candado (88% Imprenta / 12% Plataforma y Transporte) con custodia IBAN AES-256-GCM.'
                    : locale === 'de'
                    ? 'Zwei-Faktor-Auszahlung (88% Druckerei / 12% Plattform & Fracht) mit AES-256-GCM IBAN-Tresor.'
                    : 'Dual-control settlement (88% Printhouse / 12% Platform & Carrier) with AES-256-GCM IBAN vaulting.'
                }
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
  );
};

