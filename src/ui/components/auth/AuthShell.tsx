/**
 * src/ui/components/auth/AuthShell.tsx
 *
 * Shared glassmorphic shell for all auth pages (Login, Register, Forgot Password).
 * Provides the animated background, centered card, branding header, and footer.
 *
 * Design System:
 *  - Dark:  bg-zinc-950/40 backdrop-blur-sm border-zinc-800
 *  - Light: bg-white/90   backdrop-blur-sm border-slate-200
 *  - Typography: text-slate-900 dark:text-white
 */
import React, { useEffect, useRef, CSSProperties } from 'react';
import { PrintPriceLogo } from '../PrintPriceLogo';

interface AuthShellProps {
    children: React.ReactNode;
    /** Max-width of the inner card. Default: 440px */
    maxWidth?: number;
    title?: string;
    subtitle?: string;
}

// ── Animated particle background ─────────────────────────────────────────────

const ParticleCanvas: React.FC = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let animId: number;
        let w = canvas.width = window.innerWidth;
        let h = canvas.height = window.innerHeight;

        interface Particle { x: number; y: number; r: number; vx: number; vy: number; alpha: number; }
        const particles: Particle[] = Array.from({ length: 60 }, () => ({
            x: Math.random() * w,
            y: Math.random() * h,
            r: Math.random() * 1.5 + 0.3,
            vx: (Math.random() - 0.5) * 0.3,
            vy: (Math.random() - 0.5) * 0.3,
            alpha: Math.random() * 0.4 + 0.05,
        }));

        const resize = () => {
            w = canvas.width = window.innerWidth;
            h = canvas.height = window.innerHeight;
        };
        window.addEventListener('resize', resize);

        const draw = () => {
            ctx.clearRect(0, 0, w, h);
            for (const p of particles) {
                p.x += p.vx;
                p.y += p.vy;
                if (p.x < 0) p.x = w;
                if (p.x > w) p.x = 0;
                if (p.y < 0) p.y = h;
                if (p.y > h) p.y = 0;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(220,0,0,${p.alpha})`;
                ctx.fill();
            }
            animId = requestAnimationFrame(draw);
        };
        draw();

        return () => {
            window.removeEventListener('resize', resize);
            cancelAnimationFrame(animId);
        };
    }, []);

    return (
        <canvas
            ref={canvasRef}
            style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0 }}
            aria-hidden="true"
        />
    );
};

// ── Utility: check dark mode ─────────────────────────────────────────────────

function isDarkMode() {
    if (typeof document === 'undefined') return true;
    return document.documentElement.classList.contains('dark') ||
        window.matchMedia('(prefers-color-scheme: dark)').matches;
}

// ── AuthShell ─────────────────────────────────────────────────────────────────

export const AuthShell: React.FC<AuthShellProps> = ({
    children,
    maxWidth = 440,
    title = 'PrintPrice Control Plane',
    subtitle = 'Governance & Operations',
}) => {
    const dark = isDarkMode();

    const backdrop: CSSProperties = {
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        position: 'relative',
        overflow: 'hidden',
        background: dark
            ? 'radial-gradient(ellipse at 20% 20%, rgba(220,0,0,0.08) 0%, transparent 60%), radial-gradient(ellipse at 80% 80%, rgba(99,102,241,0.07) 0%, transparent 60%), #0e0e0f'
            : 'radial-gradient(ellipse at 20% 20%, rgba(220,0,0,0.05) 0%, transparent 60%), #f1f5f9',
    };

    const card: CSSProperties = {
        position: 'relative',
        zIndex: 1,
        width: '100%',
        maxWidth,
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
    };

    const glassCard: CSSProperties = {
        background: dark ? 'rgba(9,9,11,0.60)' : 'rgba(255,255,255,0.92)',
        border: `1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        padding: '32px',
        boxShadow: dark
            ? '0 32px 64px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05)'
            : '0 32px 64px rgba(0,0,0,0.10), inset 0 1px 0 rgba(255,255,255,0.9)',
        // Note: border-radius is forced to 0 by global CSS — we override with style here
        borderRadius: '0px',
    };

    return (
        <div style={backdrop}>
            {/* Animated background particles */}
            <ParticleCanvas />

            {/* Decorative gradient blobs */}
            <div style={{
                position: 'fixed', top: '-30%', left: '-10%', width: '500px', height: '500px',
                background: 'radial-gradient(circle, rgba(220,0,0,0.06) 0%, transparent 70%)',
                pointerEvents: 'none', zIndex: 0,
            }} aria-hidden="true" />
            <div style={{
                position: 'fixed', bottom: '-20%', right: '-5%', width: '400px', height: '400px',
                background: 'radial-gradient(circle, rgba(99,102,241,0.06) 0%, transparent 70%)',
                pointerEvents: 'none', zIndex: 0,
            }} aria-hidden="true" />

            <div style={card}>
                {/* Branding */}
                <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                    <div style={{
                        width: 56, height: 56,
                        background: dark ? 'rgba(220,0,0,0.15)' : 'rgba(220,0,0,0.08)',
                        border: '1px solid rgba(220,0,0,0.2)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        borderRadius: '0px',
                    }}>
                        <PrintPriceLogo className="w-8 h-8" />
                    </div>
                    <div>
                        <h1 style={{
                            margin: 0, fontSize: '18px', fontWeight: 800,
                            color: dark ? '#f4f4f5' : '#0f172a',
                            letterSpacing: '-0.3px',
                            fontFamily: "'Manrope', system-ui, sans-serif",
                        }}>
                            {title}
                        </h1>
                        <p style={{
                            margin: '4px 0 0', fontSize: '11px', fontWeight: 700,
                            color: dark ? '#71717a' : '#94a3b8',
                            textTransform: 'uppercase', letterSpacing: '0.1em',
                            fontFamily: "'Manrope', system-ui, sans-serif",
                        }}>
                            {subtitle}
                        </p>
                    </div>
                </div>

                {/* Glass Card */}
                <div style={glassCard}>
                    {children}
                </div>

                {/* Footer */}
                <p style={{
                    textAlign: 'center', fontSize: '11px',
                    color: dark ? '#3f3f46' : '#94a3b8',
                    fontFamily: "'Manrope', system-ui, sans-serif",
                    fontWeight: 600,
                    margin: 0,
                }}>
                    PrintPrice OS v1.9.0 © {new Date().getFullYear()}
                    {' · '}
                    <a href="/printhouse/register" style={{ color: '#dc0000', textDecoration: 'none' }}>
                        New print house? Register
                    </a>
                </p>
            </div>
        </div>
    );
};

// ── Shared input component ────────────────────────────────────────────────────

interface AuthInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    label: string;
    icon: React.FC<{ style?: CSSProperties }>;
    error?: string | null;
    rightSlot?: React.ReactNode;
}

export const AuthInput: React.FC<AuthInputProps> = ({ label, icon: Icon, error, rightSlot, ...props }) => {
    const dark = isDarkMode();

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{
                fontSize: '10px', fontWeight: 800,
                color: dark ? '#52525b' : '#94a3b8',
                textTransform: 'uppercase', letterSpacing: '0.08em',
                fontFamily: "'Manrope', system-ui, sans-serif",
            }}>
                {label}
            </label>
            <div style={{ position: 'relative' }}>
                <div style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
                    <Icon style={{ width: 16, height: 16, color: dark ? '#52525b' : '#94a3b8' }} />
                </div>
                <input
                    {...props}
                    style={{
                        width: '100%',
                        paddingLeft: '40px',
                        paddingRight: rightSlot ? '44px' : '14px',
                        paddingTop: '11px',
                        paddingBottom: '11px',
                        background: dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                        border: `1px solid ${error
                            ? 'rgba(239,68,68,0.5)'
                            : dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.10)'
                        }`,
                        color: dark ? '#f4f4f5' : '#0f172a',
                        fontSize: '14px',
                        fontWeight: 500,
                        outline: 'none',
                        transition: 'border-color 0.15s ease',
                        fontFamily: "'Manrope', system-ui, sans-serif",
                        boxSizing: 'border-box',
                        borderRadius: '0px',
                        ...(props.style || {}),
                    }}
                    onFocus={(e) => {
                        (e.target as HTMLInputElement).style.borderColor = error ? 'rgba(239,68,68,0.7)' : '#dc0000';
                        props.onFocus?.(e);
                    }}
                    onBlur={(e) => {
                        (e.target as HTMLInputElement).style.borderColor = error
                            ? 'rgba(239,68,68,0.5)'
                            : dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.10)';
                        props.onBlur?.(e);
                    }}
                />
                {rightSlot && (
                    <div style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)' }}>
                        {rightSlot}
                    </div>
                )}
            </div>
            {error && (
                <p style={{ margin: 0, fontSize: '11px', color: '#ef4444', fontWeight: 600, fontFamily: "'Manrope', system-ui, sans-serif" }}>
                    {error}
                </p>
            )}
        </div>
    );
};

// ── Shared primary button ─────────────────────────────────────────────────────

interface AuthButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    loading?: boolean;
    accentColor?: string;
    children: React.ReactNode;
}

export const AuthButton: React.FC<AuthButtonProps> = ({
    loading = false,
    accentColor = '#dc0000',
    children,
    disabled,
    style,
    ...props
}) => (
    <button
        {...props}
        disabled={disabled || loading}
        style={{
            width: '100%',
            padding: '13px 20px',
            background: disabled || loading ? `${accentColor}80` : accentColor,
            color: '#ffffff',
            border: 'none',
            fontSize: '14px',
            fontWeight: 800,
            cursor: disabled || loading ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            transition: 'all 0.15s ease',
            fontFamily: "'Manrope', system-ui, sans-serif",
            letterSpacing: '0.02em',
            borderRadius: '0px',
            ...(style || {}),
        }}
        onMouseEnter={(e) => {
            if (!disabled && !loading) (e.currentTarget).style.filter = 'brightness(1.1)';
        }}
        onMouseLeave={(e) => {
            (e.currentTarget).style.filter = '';
        }}
    >
        {loading ? (
            <>
                <span style={{
                    display: 'inline-block', width: 16, height: 16,
                    border: '2px solid rgba(255,255,255,0.3)',
                    borderTopColor: '#fff',
                    borderRadius: '50%',
                    animation: 'ppos-auth-spin 0.7s linear infinite',
                }} />
                <span>Processing…</span>
            </>
        ) : children}
    </button>
);

// Inject keyframes
if (typeof document !== 'undefined' && !document.getElementById('ppos-auth-shell-styles')) {
    const s = document.createElement('style');
    s.id = 'ppos-auth-shell-styles';
    s.textContent = `@keyframes ppos-auth-spin { to { transform: rotate(360deg); } }`;
    document.head.appendChild(s);
}
