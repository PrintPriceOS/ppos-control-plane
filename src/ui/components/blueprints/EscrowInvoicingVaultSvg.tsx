import React from 'react';
import {
  CorporateBlueprintSvgProps,
  getCorporateBlueprintPalette,
  useBlueprintTranslation,
} from './blueprintTheme';

export const EscrowInvoicingVaultSvg: React.FC<CorporateBlueprintSvgProps> = ({
  theme = 'light',
  className = 'w-full h-full',
  animated = true,
}) => {
  const p = getCorporateBlueprintPalette(theme);
  const { tr } = useBlueprintTranslation();

  return (
    <svg
      viewBox="0 0 400 260"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-labelledby="escrow-svg-title escrow-svg-desc"
      data-blueprint-svg="EscrowInvoicingVaultSvg"
    >
      <title id="escrow-svg-title">
        {tr('blueprint.escrow.svgTitle', 'Commercial Escrow MoR Vault & EN 16931 E-Invoicing Blueprint')}
      </title>
      <desc id="escrow-svg-desc">
        {tr(
          'blueprint.escrow.svgDesc',
          'Technical drafting diagram displaying the dual-padlock escrow vault, Facturae 3.2.2 and XRechnung 3.0 XML document matrix, and SHA-256 cryptographic signature seal.'
        )}
      </desc>

      <defs>
        <pattern id={`escrow-grid-${theme}`} width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M 20 0 L 0 0 0 20" fill="none" stroke={p.gridMinor} strokeWidth="0.7" />
        </pattern>
      </defs>

      <rect x="0" y="0" width="400" height="260" fill={p.canvasBg} />
      <rect x="0" y="0" width="400" height="260" fill={`url(#escrow-grid-${theme})`} />

      <text x="20" y="22" fill={p.laserRed} fontSize="8.5" fontFamily="monospace" fontWeight="bold">
        ESCROW MoR VAULT · EN 16931 XML · AES-256-GCM
      </text>
      <text x="380" y="22" textAnchor="end" fill={p.textMuted} fontSize="8" fontFamily="monospace">
        88% / 12% SPLIT
      </text>

      {/* Left Side: Dual-Padlock Cryptographic Escrow Vault */}
      <g transform="translate(22, 42)">
        <rect x="0" y="0" width="144" height="162" rx="6" fill={p.tintFill} stroke={p.laserRed} strokeWidth="1.6" />
        <rect x="10" y="10" width="124" height="142" rx="4" fill="none" stroke={p.structuralStroke} strokeWidth="1.1" />

        {/* Rotary Vault Wheel */}
        <circle cx="72" cy="72" r="32" fill={p.tintStrongFill} stroke={p.laserRed} strokeWidth="1.5" />
        <circle cx="72" cy="72" r="14" fill="none" stroke={p.laserRed} strokeWidth="1.3" />
        <line x1="72" y1="40" x2="72" y2="104" stroke={p.laserRed} strokeWidth="1.2" />
        <line x1="40" y1="72" x2="104" y2="72" stroke={p.laserRed} strokeWidth="1.2" />

        {/* Dual Padlock Badges (Lock 1: 3D Imprimatur, Lock 2: Signed POD) */}
        <rect x="18" y="114" width="48" height="26" rx="2" fill={p.badgeBg} stroke={p.laserRed} strokeWidth="1.2" />
        <text x="42" y="126" textAnchor="middle" fill={p.laserRed} fontSize="6.8" fontFamily="monospace" fontWeight="bold">
          LOCK 01
        </text>
        <text x="42" y="135" textAnchor="middle" fill={p.textPrimary} fontSize="6.5" fontFamily="monospace">
          IMPRIMATUR
        </text>

        <rect x="78" y="114" width="48" height="26" rx="2" fill={p.badgeBg} stroke={p.laserRed} strokeWidth="1.2" />
        <text x="102" y="126" textAnchor="middle" fill={p.laserRed} fontSize="6.8" fontFamily="monospace" fontWeight="bold">
          LOCK 02
        </text>
        <text x="102" y="135" textAnchor="middle" fill={p.textPrimary} fontSize="6.5" fontFamily="monospace">
          CMR / POD
        </text>
      </g>

      {/* Transmission Arrow */}
      <path
        d="M 172 122 L 204 122"
        fill="none"
        stroke={p.laserRed}
        strokeWidth="1.6"
        strokeDasharray={animated ? '4 3' : undefined}
      />

      {/* Right Side: Facturae 3.2.2 & XRechnung 3.0 Electronic Document Matrix */}
      <g transform="translate(208, 42)">
        <rect x="0" y="0" width="172" height="162" rx="4" fill={p.badgeBg} stroke={p.structuralStroke} strokeWidth="1.2" />
        <text x="12" y="18" fill={p.laserRed} fontSize="8" fontFamily="monospace" fontWeight="bold">
          EN 16931 E-INVOICE MATRIX
        </text>

        {/* XML Tree Nodes */}
        <rect x="12" y="28" width="148" height="32" rx="2" fill={p.tintFill} stroke={p.laserRed} strokeWidth="1.2" />
        <text x="20" y="42" fill={p.textPrimary} fontSize="7.5" fontFamily="monospace" fontWeight="bold">
          FACTURAE 3.2.2 (ES-AEAT)
        </text>
        <text x="20" y="53" fill={p.textMuted} fontSize="6.8" fontFamily="monospace">
          &lt;TaxOutput&gt; · XAdES-EPES
        </text>

        <rect x="12" y="68" width="148" height="32" rx="2" fill={p.tintFill} stroke={p.laserRed} strokeWidth="1.2" />
        <text x="20" y="82" fill={p.textPrimary} fontSize="7.5" fontFamily="monospace" fontWeight="bold">
          XRECHNUNG 3.0 (DE-B2B)
        </text>
        <text x="20" y="93" fill={p.textMuted} fontSize="6.8" fontFamily="monospace">
          UBL 2.1 · Leitweg-ID / IBAN
        </text>

        {/* SHA-256 Cryptographic Seal */}
        <rect x="12" y="110" width="148" height="40" rx="3" fill={p.tintStrongFill} stroke={p.laserRed} strokeWidth="1.4" />
        <circle cx="32" cy="130" r="11" fill="none" stroke={p.laserRed} strokeWidth="1.3" strokeDasharray="2 2" />
        <text x="32" y="133" textAnchor="middle" fill={p.laserRed} fontSize="6.5" fontFamily="monospace" fontWeight="bold">
          SHA
        </text>
        <text x="50" y="126" fill={p.textPrimary} fontSize="7.2" fontFamily="monospace" fontWeight="bold">
          CRYPTOGRAPHIC SEAL
        </text>
        <text x="50" y="138" fill={p.laserRed} fontSize="6.8" fontFamily="monospace">
          93da2ba7...e40c6554
        </text>
      </g>

      {/* Bottom Split-Payout Bar */}
      <rect x="16" y="226" width="368" height="22" rx="3" fill={p.badgeBg} stroke={p.gridMajor} strokeWidth="1" />
      <text x="26" y="240" fill={p.textPrimary} fontSize="7.8" fontFamily="monospace">
        STRIPE CONNECT + SEPA IBAN MOD-97
      </text>
      <text x="374" y="240" textAnchor="end" fill={p.laserRed} fontSize="8" fontFamily="monospace" fontWeight="bold">
        ZERO COUNTERPARTY RISK
      </text>
    </svg>
  );
};

