import React, { useState, useRef } from 'react';
import {
  BlueprintHotspot,
  BlueprintSurfaceTheme,
  useBlueprintTranslation,
} from './blueprintTheme';

export interface BlueprintCardProps {
  title: string;
  subtitle?: string;
  codeTag?: string;
  metricBadge?: string;
  theme?: BlueprintSurfaceTheme;
  hotspots?: BlueprintHotspot[];
  children:
    | React.ReactNode
    | ((props: {
        theme: BlueprintSurfaceTheme;
        activeHotspotId: string | null;
        onHoverHotspot: (hotspot: BlueprintHotspot | null) => void;
      }) => React.ReactNode);
  footerSpecs?: Array<{ label: string; value: string }>;
  ctaLabel?: string;
  ctaHref?: string;
  className?: string;
  aspectRatio?: '16/9' | 'auto' | 'hero';
}

export const BlueprintCard: React.FC<BlueprintCardProps> = ({
  title,
  subtitle,
  codeTag = 'CAD-REV-5.2',
  metricBadge,
  theme = 'dark',
  hotspots = [],
  children,
  footerSpecs = [],
  ctaLabel,
  ctaHref,
  className = '',
  aspectRatio = '16/9',
}) => {
  const { tr } = useBlueprintTranslation();
  const cardRef = useRef<HTMLDivElement>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number }>({ x: 50, y: 50 });
  const [isHovered, setIsHovered] = useState(false);
  const [activeHotspot, setActiveHotspot] = useState<BlueprintHotspot | null>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
    setMousePos({ x, y });
  };

  const isLight = theme === 'light';

  const containerClasses = isLight
    ? 'rounded-2xl border border-slate-200/90 bg-white/95 text-slate-900 shadow-[0_16px_40px_-12px_rgba(15,23,42,0.08)] hover:border-red-600/50'
    : 'rounded-2xl border border-zinc-800/80 bg-zinc-950/60 text-zinc-100 backdrop-blur-md shadow-[0_20px_50px_-15px_rgba(0,0,0,0.75)] hover:border-red-500/50';

  const viewportClasses = isLight
    ? 'relative overflow-hidden rounded-xl border border-slate-200 bg-[#f8fafc]'
    : 'relative overflow-hidden rounded-xl border border-zinc-800/90 bg-[#09090b]';

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        setActiveHotspot(null);
      }}
      data-blueprint-card={codeTag}
      data-theme={theme}
      className={`group relative flex flex-col justify-between p-5 transition-all duration-300 ${containerClasses} ${className}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        position: 'relative',
        padding: '1.25rem',
        borderRadius: '16px',
        border: isLight
          ? isHovered
            ? '1px solid rgba(220, 0, 0, 0.45)'
            : '1px solid rgba(226, 232, 240, 0.95)'
          : isHovered
          ? '1px solid rgba(239, 68, 68, 0.5)'
          : '1px solid rgba(39, 39, 42, 0.85)',
        backgroundColor: isLight ? 'rgba(255, 255, 255, 0.96)' : 'rgba(9, 9, 11, 0.72)',
        color: isLight ? '#0f172a' : '#f4f4f5',
        backdropFilter: 'blur(12px)',
        boxShadow: isLight
          ? '0 16px 40px -12px rgba(15, 23, 42, 0.08)'
          : '0 20px 50px -15px rgba(0, 0, 0, 0.75)',
        transition: 'border-color 0.25s ease, box-shadow 0.25s ease, transform 0.25s ease',
        backgroundImage: isHovered
          ? `radial-gradient(520px circle at ${mousePos.x}% ${mousePos.y}%, ${
              isLight ? 'rgba(220, 0, 0, 0.05)' : 'rgba(220, 0, 0, 0.12)'
            }, transparent 65%)`
          : undefined,
      }}
    >
      {/* Top Technical Header Strip */}
      <div>
        <div
          className="mb-3 flex items-center justify-between gap-2"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.5rem',
            marginBottom: '0.75rem',
          }}
        >
          <div className="flex items-center gap-2" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span
              className="inline-block h-2 w-2 rounded-full bg-[#dc0000] shadow-[0_0_8px_#dc0000]"
              style={{
                display: 'inline-block',
                width: '8px',
                height: '8px',
                borderRadius: '9999px',
                backgroundColor: '#dc0000',
                boxShadow: '0 0 8px #dc0000',
              }}
            />
            <span
              className={`font-mono text-[10px] font-bold uppercase tracking-widest ${
                isLight ? 'text-slate-600' : 'text-zinc-400'
              }`}
              style={{
                fontFamily: 'monospace',
                fontSize: '10px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                color: isLight ? '#475569' : '#a1a1aa',
              }}
            >
              {codeTag}
            </span>
          </div>
          {metricBadge && (
            <span
              className={`rounded border px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider ${
                isLight
                  ? 'border-red-600/30 bg-red-50 text-[#dc0000]'
                  : 'border-red-500/30 bg-red-950/40 text-red-400'
              }`}
              style={{
                fontFamily: 'monospace',
                fontSize: '10px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                padding: '0.15rem 0.5rem',
                borderRadius: '6px',
                border: isLight ? '1px solid rgba(220,0,0,0.3)' : '1px solid rgba(239,68,68,0.35)',
                backgroundColor: isLight ? '#fef2f2' : 'rgba(69, 10, 10, 0.45)',
                color: isLight ? '#dc0000' : '#f87171',
              }}
            >
              {metricBadge}
            </span>
          )}
        </div>

        {/* 16:9 or Hero Technical Wireframe Viewport */}
        <div
          className={`${viewportClasses} ${
            aspectRatio === '16/9'
              ? 'aspect-[16/10] w-full'
              : aspectRatio === 'hero'
              ? 'w-full'
              : 'w-full'
          }`}
          style={{
            position: 'relative',
            overflow: 'hidden',
            borderRadius: '12px',
            border: isLight ? '1px solid #e2e8f0' : '1px solid rgba(39, 39, 42, 0.9)',
            backgroundColor: isLight ? '#f8fafc' : '#09090b',
            width: '100%',
            aspectRatio: aspectRatio === '16/9' ? '400 / 260' : undefined,
          }}
        >
          {/* Corner Structural Crosshairs */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-2 top-2 z-10 font-mono text-[9px] text-[#dc0000]/70"
            style={{ position: 'absolute', left: '8px', top: '6px', zIndex: 10, fontFamily: 'monospace', fontSize: '9px', color: 'rgba(220,0,0,0.7)', pointerEvents: 'none' }}
          >
            +
          </span>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute right-2 top-2 z-10 font-mono text-[9px] text-[#dc0000]/70"
            style={{ position: 'absolute', right: '8px', top: '6px', zIndex: 10, fontFamily: 'monospace', fontSize: '9px', color: 'rgba(220,0,0,0.7)', pointerEvents: 'none' }}
          >
            +
          </span>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute bottom-2 left-2 z-10 font-mono text-[9px] text-[#dc0000]/70"
            style={{ position: 'absolute', left: '8px', bottom: '6px', zIndex: 10, fontFamily: 'monospace', fontSize: '9px', color: 'rgba(220,0,0,0.7)', pointerEvents: 'none' }}
          >
            +
          </span>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute bottom-2 right-2 z-10 font-mono text-[9px] text-[#dc0000]/70"
            style={{ position: 'absolute', right: '8px', bottom: '6px', zIndex: 10, fontFamily: 'monospace', fontSize: '9px', color: 'rgba(220,0,0,0.7)', pointerEvents: 'none' }}
          >
            +
          </span>

          {/* SVG Content */}
          <div className="h-full w-full transition-transform duration-300 group-hover:scale-[1.01]" style={{ width: '100%', height: '100%' }}>
            {typeof children === 'function'
              ? children({
                  theme,
                  activeHotspotId: activeHotspot?.id ?? null,
                  onHoverHotspot: setActiveHotspot,
                })
              : children}
          </div>

          {/* Interactive Hotspot Pills Overlay */}
          {hotspots.length > 0 && (
            <div
              className="pointer-events-auto absolute bottom-2.5 left-3 right-3 z-20 flex flex-wrap items-center justify-between gap-1.5"
              style={{
                position: 'absolute',
                bottom: '10px',
                left: '12px',
                right: '12px',
                zIndex: 20,
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <div className="flex flex-wrap items-center gap-1" style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                {hotspots.map((hs) => {
                  const isActive = activeHotspot?.id === hs.id;
                  return (
                    <button
                      key={hs.id}
                      type="button"
                      onMouseEnter={() => setActiveHotspot(hs)}
                      onFocus={() => setActiveHotspot(hs)}
                      onClick={() => setActiveHotspot(isActive ? null : hs)}
                      className={`rounded px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider transition-all ${
                        isActive
                          ? 'bg-[#dc0000] text-white shadow-[0_0_12px_rgba(220,0,0,0.6)]'
                          : isLight
                          ? 'border border-slate-300 bg-white/90 text-slate-700 hover:border-red-600 hover:text-[#dc0000]'
                          : 'border border-zinc-700/80 bg-zinc-900/90 text-zinc-300 hover:border-red-500 hover:text-red-400'
                      }`}
                      style={{
                        fontFamily: 'monospace',
                        fontSize: '9px',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        padding: '3px 7px',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        border: isActive
                          ? '1px solid #dc0000'
                          : isLight
                          ? '1px solid #cbd5e1'
                          : '1px solid rgba(63, 63, 70, 0.85)',
                        backgroundColor: isActive
                          ? '#dc0000'
                          : isLight
                          ? 'rgba(255,255,255,0.92)'
                          : 'rgba(24,24,27,0.92)',
                        color: isActive ? '#ffffff' : isLight ? '#334155' : '#d4d4d8',
                      }}
                    >
                      [{hs.code}] {tr(hs.titleKey, hs.titleFallback)}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Active Telemetry Tooltip HUD */}
          {activeHotspot && (
            <div
              role="status"
              aria-live="polite"
              className={`pointer-events-none absolute right-3 top-3 z-30 max-w-[250px] rounded-lg border p-2.5 font-mono text-[10px] shadow-xl transition-opacity duration-150 ${
                isLight
                  ? 'border-red-600/40 bg-white/95 text-slate-900'
                  : 'border-red-500/50 bg-zinc-950/95 text-zinc-100'
              }`}
              style={{
                position: 'absolute',
                right: '12px',
                top: '12px',
                zIndex: 30,
                maxWidth: '250px',
                borderRadius: '8px',
                padding: '10px',
                fontFamily: 'monospace',
                fontSize: '10px',
                border: '1px solid rgba(220, 0, 0, 0.5)',
                backgroundColor: isLight ? 'rgba(255, 255, 255, 0.96)' : 'rgba(9, 9, 11, 0.95)',
                color: isLight ? '#0f172a' : '#f4f4f5',
                boxShadow: '0 12px 28px rgba(0,0,0,0.45)',
                pointerEvents: 'none',
              }}
            >
              <div
                className="flex items-center justify-between gap-2 border-b border-red-500/20 pb-1"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px',
                  borderBottom: '1px solid rgba(220,0,0,0.2)',
                  paddingBottom: '4px',
                }}
              >
                <span className="font-bold text-[#dc0000]" style={{ fontWeight: 700, color: '#dc0000' }}>
                  {activeHotspot.code} · {tr(activeHotspot.titleKey, activeHotspot.titleFallback)}
                </span>
                <span
                  className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[#dc0000]"
                  style={{ width: '6px', height: '6px', borderRadius: '9999px', backgroundColor: '#dc0000' }}
                />
              </div>
              <div className="mt-1 font-bold" style={{ marginTop: '4px', fontWeight: 700 }}>
                {tr(activeHotspot.metricKey, activeHotspot.metricFallback)}
              </div>
              <div
                className={`mt-0.5 text-[9.5px] ${isLight ? 'text-slate-600' : 'text-zinc-400'}`}
                style={{ marginTop: '2px', fontSize: '9.5px', color: isLight ? '#475569' : '#a1a1aa' }}
              >
                {tr(activeHotspot.specKey, activeHotspot.specFallback)}
              </div>
            </div>
          )}
        </div>

        {/* Title & Technical Copy */}
        <div className="mt-4" style={{ marginTop: '1rem' }}>
          <h3
            className={`text-lg font-extrabold tracking-tight ${
              isLight ? 'text-slate-900' : 'text-zinc-100'
            }`}
            style={{
              fontSize: '1.125rem',
              fontWeight: 800,
              letterSpacing: '-0.02em',
              margin: 0,
              color: isLight ? '#0f172a' : '#f4f4f5',
            }}
          >
            {title}
          </h3>
          {subtitle && (
            <p
              className={`mt-1.5 text-sm leading-relaxed ${
                isLight ? 'text-slate-600' : 'text-zinc-400'
              }`}
              style={{
                marginTop: '0.4rem',
                marginBottom: 0,
                fontSize: '0.875rem',
                lineHeight: 1.55,
                color: isLight ? '#475569' : '#a1a1aa',
              }}
            >
              {subtitle}
            </p>
          )}
        </div>
      </div>

      {/* Footer Specs & Optional Action */}
      {(footerSpecs.length > 0 || ctaLabel) && (
        <div
          className={`mt-4 border-t pt-3 ${
            isLight ? 'border-slate-200/80' : 'border-zinc-800/80'
          }`}
          style={{
            marginTop: '1rem',
            paddingTop: '0.75rem',
            borderTop: isLight ? '1px solid #e2e8f0' : '1px solid rgba(39, 39, 42, 0.85)',
          }}
        >
          {footerSpecs.length > 0 && (
            <div
              className="grid grid-cols-3 gap-2"
              style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '0.5rem' }}
            >
              {footerSpecs.map((spec, idx) => (
                <div key={idx} className="min-w-0" style={{ minWidth: 0 }}>
                  <div
                    className={`truncate font-mono text-[9px] uppercase tracking-wider ${
                      isLight ? 'text-slate-500' : 'text-zinc-400'
                    }`}
                    style={{
                      fontFamily: 'monospace',
                      fontSize: '9px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      color: isLight ? '#64748b' : '#a1a1aa',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {spec.label}
                  </div>
                  <div
                    className={`truncate font-mono text-xs font-bold ${
                      isLight ? 'text-slate-900' : 'text-zinc-200'
                    }`}
                    style={{
                      fontFamily: 'monospace',
                      fontSize: '12px',
                      fontWeight: 700,
                      color: isLight ? '#0f172a' : '#e4e4e7',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {spec.value}
                  </div>
                </div>
              ))}
            </div>
          )}

          {ctaLabel && ctaHref && (
            <div
              className="mt-3 flex items-center justify-end"
              style={{ marginTop: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}
            >
              <a
                href={ctaHref}
                className="inline-flex items-center gap-1.5 font-mono text-xs font-bold uppercase tracking-wider text-[#dc0000] transition-transform hover:translate-x-0.5"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontFamily: 'monospace',
                  fontSize: '12px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: '#dc0000',
                  textDecoration: 'none',
                }}
              >
                <span>{ctaLabel}</span>
                <span aria-hidden="true">→</span>
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
