/**
 * src/ui/components/SubscriptionGuard.tsx
 *
 * Phase Paywall — Subscription Guard with Stripe integration.
 * Renders a brand-aware PaywallModal when a tenant's plan does not
 * include access to a given feature. Falls back to Read-Only mode when
 * the subscription API is unreachable, ensuring printers never lose
 * access to their operations due to a billing sync error.
 */

import React, { useState, useEffect, useCallback, CSSProperties } from 'react';
import { adminFetch } from '../lib/adminApi';
import { getUserTenantId } from '../lib/authStore';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type PlanType = 'starter' | 'growth' | 'enterprise';

export type SubscriptionFeature =
  | 'observability'
  | 'custom_branding'
  | 'pricing_intelligence'
  | 'federation'
  | 'automation'
  | 'advanced_analytics'
  | 'priority_support';

export interface UiTokens {
  accent_color?: string;
  logo_url?: string;
}

export interface SubscriptionPayload {
  plan_type: PlanType;
  billing_status?: string;
  features?: SubscriptionFeature[];
  ui_tokens?: UiTokens;
  plan_label?: string;
}

interface SubscriptionGuardProps {
  /** Feature gate to check against the active plan */
  feature: SubscriptionFeature;
  /** Protected children rendered when plan allows access */
  children: React.ReactNode;
  /** Optional: override tenantId (defaults to authenticated user context) */
  tenantId?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Feature-to-plan matrix
// ─────────────────────────────────────────────────────────────────────────────

const FEATURE_PLAN_MATRIX: Record<SubscriptionFeature, PlanType[]> = {
  observability:         ['growth', 'enterprise'],
  custom_branding:       ['growth', 'enterprise'],
  pricing_intelligence:  ['growth', 'enterprise'],
  federation:            ['enterprise'],
  automation:            ['enterprise'],
  advanced_analytics:    ['growth', 'enterprise'],
  priority_support:      ['enterprise'],
};

function planAllows(plan: PlanType, feature: SubscriptionFeature): boolean {
  return FEATURE_PLAN_MATRIX[feature]?.includes(plan) ?? false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tier definitions (pricing table)
// ─────────────────────────────────────────────────────────────────────────────

interface PricingTier {
  planId: string;
  label: string;
  price: string;
  period: string;
  description: string;
  features: string[];
  highlighted: boolean;
}

const PRICING_TIERS: PricingTier[] = [
  {
    planId: 'plan_starter',
    label: 'Starter',
    price: '€0',
    period: '/mes',
    description: 'Ideal para empezar',
    features: [
      'Preflight básico',
      'Hasta 500 trabajos/mes',
      'Soporte por email',
    ],
    highlighted: false,
  },
  {
    planId: 'plan_growth',
    label: 'Growth',
    price: '€149',
    period: '/mes',
    description: 'Para imprentas en crecimiento',
    features: [
      'Todo en Starter',
      'Observability avanzada',
      'Inteligencia de precios',
      'Branding personalizado',
      'Analíticas avanzadas',
      'Hasta 5.000 trabajos/mes',
    ],
    highlighted: true,
  },
  {
    planId: 'plan_enterprise',
    label: 'Enterprise',
    price: '€499',
    period: '/mes',
    description: 'Para operaciones industriales',
    features: [
      'Todo en Growth',
      'Federación multi-nodo',
      'Automatización IA',
      'Soporte prioritario 24/7',
      'Trabajos ilimitados',
      'SLA garantizado',
    ],
    highlighted: false,
  },
];

const FEATURE_LABELS: Record<SubscriptionFeature, string> = {
  observability:         'Observability Avanzada',
  custom_branding:       'Branding Personalizado',
  pricing_intelligence:  'Inteligencia de Precios',
  federation:            'Federación Multi-Nodo',
  automation:            'Automatización IA',
  advanced_analytics:    'Analíticas Avanzadas',
  priority_support:      'Soporte Prioritario',
};

// ─────────────────────────────────────────────────────────────────────────────
// Stripe redirect helper
// ─────────────────────────────────────────────────────────────────────────────

async function redirectToStripeCheckout(planId: string): Promise<void> {
  const stripePublicKey = (import.meta as any).env?.VITE_STRIPE_PUBLIC_KEY as string | undefined;

  if (!stripePublicKey) {
    throw new Error('NO_STRIPE_KEY');
  }

  const data = await adminFetch<{ ok: boolean; sessionId?: string; error?: string }>(
    '/api/admin/billing/create-checkout-session',
    {
      method: 'POST',
      body: JSON.stringify({ planId }),
    }
  );

  if (!data?.ok || !data?.sessionId) {
    throw new Error(data?.error || 'SESSION_CREATION_FAILED');
  }

  // Dynamically import Stripe to avoid bundle bloat when paywall isn't visible
  const { loadStripe } = await import('@stripe/stripe-js');
  const stripe = await loadStripe(stripePublicKey);

  if (!stripe) {
    throw new Error('STRIPE_LOAD_FAILED');
  }

  const { error } = await stripe.redirectToCheckout({ sessionId: data.sessionId });
  if (error) throw new Error(error.message);
}

// ─────────────────────────────────────────────────────────────────────────────
// PaywallModal
// ─────────────────────────────────────────────────────────────────────────────

interface PaywallModalProps {
  feature: SubscriptionFeature;
  uiTokens: UiTokens;
  currentPlan: PlanType;
}

const PaywallModal: React.FC<PaywallModalProps> = ({ feature, uiTokens, currentPlan }) => {
  const [loadingPlanId, setLoadingPlanId] = useState<string | null>(null);
  const [upgradeError, setUpgradeError] = useState<string | null>(null);

  const accentColor = uiTokens?.accent_color || '#6366f1';

  const handleUpgrade = useCallback(async (planId: string) => {
    setLoadingPlanId(planId);
    setUpgradeError(null);
    try {
      await redirectToStripeCheckout(planId);
    } catch (err: any) {
      const msg = err?.message || '';
      if (msg === 'NO_STRIPE_KEY' || msg === 'STRIPE_LOAD_FAILED') {
        setUpgradeError(
          'El servicio de pago no está disponible en este momento. Por favor contacta a support@printprice.pro'
        );
      } else {
        setUpgradeError(
          `Error al iniciar el pago: ${msg}. Inténtalo de nuevo o contacta soporte.`
        );
      }
    } finally {
      setLoadingPlanId(null);
    }
  }, []);

  const accentBtn: CSSProperties = {
    backgroundColor: accentColor,
    color: '#ffffff',
    border: 'none',
  };

  const accentBorder: CSSProperties = {
    borderColor: accentColor,
    boxShadow: `0 0 0 1px ${accentColor}40, 0 8px 32px ${accentColor}20`,
  };

  return (
    /* Backdrop */
    <div style={styles.backdrop} aria-modal="true" role="dialog" aria-label="Upgrade Required">
      {/* Glass card */}
      <div style={styles.card}>

        {/* Header */}
        <div style={styles.header}>
          <div style={{ ...styles.iconWrap, background: `${accentColor}22`, border: `1px solid ${accentColor}44` }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={accentColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/>
            </svg>
          </div>
          <div>
            <h2 style={styles.title}>Función Premium Requerida</h2>
            <p style={styles.subtitle}>
              <strong style={{ color: accentColor }}>{FEATURE_LABELS[feature]}</strong>
              {' '}no está incluida en tu plan actual (<em>{currentPlan}</em>).
            </p>
          </div>
        </div>

        {/* Error banner */}
        {upgradeError && (
          <div style={styles.errorBanner} role="alert">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <span>{upgradeError}</span>
          </div>
        )}

        {/* Pricing table */}
        <div style={styles.tiersGrid}>
          {PRICING_TIERS.map((tier) => {
            const isCurrentPlan = tier.planId.includes(currentPlan);
            const isHighlighted = tier.highlighted;
            const isLoading = loadingPlanId === tier.planId;
            const isUnavailable = loadingPlanId !== null && !isLoading;

            return (
              <div
                key={tier.planId}
                style={{
                  ...styles.tierCard,
                  ...(isHighlighted ? { ...styles.tierCardHighlighted, ...accentBorder } : {}),
                }}
              >
                {isHighlighted && (
                  <div style={{ ...styles.popularBadge, backgroundColor: accentColor }}>
                    ★ Más Popular
                  </div>
                )}

                <div style={styles.tierHeader}>
                  <span style={styles.tierLabel}>{tier.label}</span>
                  <div style={styles.tierPriceWrap}>
                    <span style={{ ...styles.tierPrice, ...(isHighlighted ? { color: accentColor } : {}) }}>
                      {tier.price}
                    </span>
                    <span style={styles.tierPeriod}>{tier.period}</span>
                  </div>
                  <p style={styles.tierDesc}>{tier.description}</p>
                </div>

                <ul style={styles.featureList}>
                  {tier.features.map((f) => (
                    <li key={f} style={styles.featureItem}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={accentColor} strokeWidth="2.5">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                <button
                  id={`paywall-upgrade-${tier.planId}`}
                  disabled={isCurrentPlan || isUnavailable}
                  style={{
                    ...styles.ctaBtn,
                    ...(isHighlighted && !isCurrentPlan ? accentBtn : {}),
                    ...(isCurrentPlan ? styles.ctaBtnDisabled : {}),
                    ...(isUnavailable ? { opacity: 0.5, cursor: 'not-allowed' } : {}),
                  }}
                  onClick={() => !isCurrentPlan && handleUpgrade(tier.planId)}
                  aria-label={`Upgrade to ${tier.label}`}
                >
                  {isLoading ? (
                    <span style={styles.btnInner}>
                      <span style={styles.spinner} />
                      Redirigiendo…
                    </span>
                  ) : isCurrentPlan ? (
                    'Plan Actual'
                  ) : (
                    `Actualizar a ${tier.label}`
                  )}
                </button>
              </div>
            );
          })}
        </div>

        {/* Footer note */}
        <p style={styles.footerNote}>
          Todos los planes incluyen facturación segura mediante Stripe. Cancela en cualquier momento.
          <br />
          ¿Preguntas? <a href="mailto:support@printprice.pro" style={{ color: accentColor }}>support@printprice.pro</a>
        </p>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Read-Only Warning Banner
// ─────────────────────────────────────────────────────────────────────────────

const ReadOnlyBanner: React.FC = () => (
  <div style={styles.readOnlyBanner} role="alert" aria-label="Read-only mode active">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
    <span>
      <strong>Modo solo lectura</strong> — No se pudo verificar tu suscripción.
      Las acciones están deshabilitadas temporalmente. <a href="/login" style={{ color: 'inherit', fontWeight: 600 }}>Recargar sesión</a>
    </span>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// SubscriptionGuard — Main Export
// ─────────────────────────────────────────────────────────────────────────────

export const SubscriptionGuard: React.FC<SubscriptionGuardProps> = ({
  feature,
  children,
  tenantId: tenantIdProp,
}) => {
  const [subscription, setSubscription] = useState<SubscriptionPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncFailed, setSyncFailed] = useState(false);

  const resolvedTenantId = tenantIdProp || getUserTenantId();

  useEffect(() => {
    if (!resolvedTenantId) {
      // No tenant context — degrade gracefully, treat as starter
      setSubscription({ plan_type: 'starter' });
      setLoading(false);
      return;
    }

    let cancelled = false;

    const fetchSubscription = async () => {
      try {
        const data = await adminFetch<{ ok?: boolean; subscription?: SubscriptionPayload } & SubscriptionPayload>(
          `/api/admin/printhouse-capabilities/${resolvedTenantId}/subscription`
        );

        if (cancelled) return;

        // Defensive validation — ensure plan_type is always present
        const raw: any = data;
        const resolved = raw?.subscription ?? raw;
        const safe: SubscriptionPayload = resolved?.plan_type
          ? resolved
          : { plan_type: 'starter' };

        setSubscription(safe);
        setSyncFailed(false);
      } catch {
        if (cancelled) return;
        // API sync failed → degrade to read-only mode, don't block the operator
        setSyncFailed(true);
        setSubscription({ plan_type: 'starter' });
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchSubscription();
    return () => { cancelled = true; };
  }, [resolvedTenantId]);

  // ── Loading state (brief skeleton) ──────────────────────────────────────
  if (loading) {
    return (
      <div style={styles.loadingSkeleton} aria-busy="true" aria-label="Checking subscription…">
        <div style={styles.skeletonPulse} />
      </div>
    );
  }

  const safeSubscription: SubscriptionPayload = subscription ?? { plan_type: 'starter' };
  const hasAccess = planAllows(safeSubscription.plan_type, feature);

  // ── Access granted ───────────────────────────────────────────────────────
  if (hasAccess) {
    return (
      <>
        {syncFailed && <ReadOnlyBanner />}
        {children}
      </>
    );
  }

  // ── API sync failed → read-only degradation ──────────────────────────────
  if (syncFailed) {
    return (
      <>
        <ReadOnlyBanner />
        <div style={styles.readOnlyOverlay} aria-disabled="true" inert>
          {children}
        </div>
      </>
    );
  }

  // ── Plan insufficient → paywall ──────────────────────────────────────────
  return (
    <PaywallModal
      feature={feature}
      uiTokens={safeSubscription.ui_tokens ?? {}}
      currentPlan={safeSubscription.plan_type}
    />
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles: Record<string, CSSProperties> = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    zIndex: 9999,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(0, 0, 0, 0.72)',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    padding: '24px',
    overflowY: 'auto',
  },
  card: {
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.12)',
    backdropFilter: 'blur(24px)',
    WebkitBackdropFilter: 'blur(24px)',
    borderRadius: '20px',
    padding: '40px',
    maxWidth: '960px',
    width: '100%',
    color: '#f8fafc',
    boxShadow: '0 32px 80px rgba(0,0,0,0.5)',
    fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
  },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '16px',
    marginBottom: '32px',
  },
  iconWrap: {
    flexShrink: 0,
    width: '56px',
    height: '56px',
    borderRadius: '14px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    margin: '0 0 6px',
    fontSize: '22px',
    fontWeight: 700,
    color: '#f1f5f9',
    letterSpacing: '-0.3px',
  },
  subtitle: {
    margin: 0,
    fontSize: '14px',
    color: '#94a3b8',
    lineHeight: 1.6,
  },
  errorBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    background: 'rgba(239,68,68,0.15)',
    border: '1px solid rgba(239,68,68,0.35)',
    borderRadius: '10px',
    padding: '12px 16px',
    marginBottom: '24px',
    fontSize: '13px',
    color: '#fca5a5',
  },
  tiersGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: '16px',
    marginBottom: '28px',
  },
  tierCard: {
    position: 'relative',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.09)',
    borderRadius: '14px',
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    transition: 'transform 0.2s ease',
  },
  tierCardHighlighted: {
    background: 'rgba(255,255,255,0.07)',
    transform: 'translateY(-4px)',
  },
  popularBadge: {
    position: 'absolute',
    top: '-12px',
    left: '50%',
    transform: 'translateX(-50%)',
    fontSize: '11px',
    fontWeight: 700,
    color: '#fff',
    padding: '3px 12px',
    borderRadius: '20px',
    letterSpacing: '0.05em',
    whiteSpace: 'nowrap',
  },
  tierHeader: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  tierLabel: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
  },
  tierPriceWrap: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '4px',
    marginTop: '4px',
  },
  tierPrice: {
    fontSize: '32px',
    fontWeight: 800,
    color: '#f1f5f9',
    letterSpacing: '-1px',
  },
  tierPeriod: {
    fontSize: '13px',
    color: '#64748b',
  },
  tierDesc: {
    margin: '4px 0 0',
    fontSize: '12px',
    color: '#64748b',
  },
  featureList: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    flexGrow: 1,
  },
  featureItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '13px',
    color: '#cbd5e1',
  },
  ctaBtn: {
    marginTop: 'auto',
    width: '100%',
    padding: '11px 16px',
    borderRadius: '10px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.15)',
    color: '#e2e8f0',
    transition: 'all 0.2s ease',
  },
  ctaBtnDisabled: {
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.06)',
    color: '#475569',
    cursor: 'default',
  },
  btnInner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
  },
  spinner: {
    display: 'inline-block',
    width: '14px',
    height: '14px',
    border: '2px solid rgba(255,255,255,0.3)',
    borderTopColor: '#fff',
    borderRadius: '50%',
    animation: 'ppos-spin 0.7s linear infinite',
  },
  footerNote: {
    textAlign: 'center',
    fontSize: '12px',
    color: '#475569',
    lineHeight: 1.7,
    margin: 0,
  },
  readOnlyBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    background: 'rgba(234,179,8,0.12)',
    border: '1px solid rgba(234,179,8,0.3)',
    borderRadius: '10px',
    padding: '10px 16px',
    marginBottom: '12px',
    fontSize: '13px',
    color: '#fde68a',
  },
  readOnlyOverlay: {
    opacity: 0.45,
    pointerEvents: 'none',
    userSelect: 'none',
  },
  loadingSkeleton: {
    width: '100%',
    minHeight: '120px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  skeletonPulse: {
    width: '100%',
    height: '80px',
    borderRadius: '12px',
    background: 'linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.09) 50%, rgba(255,255,255,0.04) 75%)',
    backgroundSize: '200% 100%',
    animation: 'ppos-skeleton 1.5s ease-in-out infinite',
  },
};

// Inject global keyframes once
if (typeof document !== 'undefined' && !document.getElementById('ppos-paywall-styles')) {
  const styleEl = document.createElement('style');
  styleEl.id = 'ppos-paywall-styles';
  styleEl.textContent = `
    @keyframes ppos-spin {
      to { transform: rotate(360deg); }
    }
    @keyframes ppos-skeleton {
      0%   { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }
    #paywall-upgrade-plan_starter:not([disabled]):hover,
    #paywall-upgrade-plan_growth:not([disabled]):hover,
    #paywall-upgrade-plan_enterprise:not([disabled]):hover {
      filter: brightness(1.12);
      transform: translateY(-1px);
    }
  `;
  document.head.appendChild(styleEl);
}

export default SubscriptionGuard;
