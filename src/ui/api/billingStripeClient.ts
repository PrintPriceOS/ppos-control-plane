/**
 * src/ui/api/billingStripeClient.ts
 *
 * Frontend API client for Stripe billing operations.
 * Wraps all /api/admin/billing/* endpoints through the authenticated adminFetch.
 */

import { adminFetch } from '../lib/adminApi';

export interface CheckoutSessionResponse {
  ok: boolean;
  sessionId?: string;
  url?: string;
  error?: string;
}

export interface BillingPortalResponse {
  ok: boolean;
  url?: string;
  error?: string;
}

export interface SubscriptionStatusResponse {
  ok: boolean;
  subscription?: {
    plan_type: string;
    billing_status: string;
    stripe_subscription_id?: string;
    current_period_end?: string;
    features?: string[];
    ui_tokens?: {
      accent_color?: string;
      logo_url?: string;
    };
  };
  error?: string;
}

/**
 * Create a Stripe Checkout session for upgrading to a given plan.
 * Returns a sessionId for use with stripe.redirectToCheckout().
 */
export async function createCheckoutSession(planId: string): Promise<CheckoutSessionResponse> {
  return adminFetch<CheckoutSessionResponse>('/api/admin/billing/create-checkout-session', {
    method: 'POST',
    body: JSON.stringify({ planId }),
  });
}

/**
 * Create a Stripe Billing Portal session so a tenant can manage their subscription.
 */
export async function createBillingPortalSession(returnUrl?: string): Promise<BillingPortalResponse> {
  return adminFetch<BillingPortalResponse>('/api/admin/billing/create-portal-session', {
    method: 'POST',
    body: JSON.stringify({ returnUrl: returnUrl || window.location.href }),
  });
}

/**
 * Fetch the current subscription status for a tenant.
 * Wraps GET /api/admin/billing/status
 */
export async function getSubscriptionStatus(tenantId?: string): Promise<SubscriptionStatusResponse> {
  const qs = tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : '';
  return adminFetch<SubscriptionStatusResponse>(`/api/admin/billing/status${qs}`);
}
