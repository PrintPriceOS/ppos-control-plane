/**
 * src/ui/lib/authStore.ts
 * 
 * Secure Bearer Token storage for PrintPrice OS Control Plane.
 */

const TOKEN_KEY = 'ppos_control_token';
const USER_KEY = 'ppos_control_user';

// ── TEMPORARY UX REVIEW DEV BYPASS (MUST BE REMOVED BEFORE FINAL COMMIT) ──────
const isLocalDevBypassEligible = (): boolean => {
    if (typeof window === 'undefined') return false;
    // Strict guard: MUST be Vite development mode (import.meta.env.DEV === true)
    // AND running exclusively on localhost or 127.0.0.1
    const isDev = Boolean(import.meta.env?.DEV);
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    return isDev && isLocalhost;
};

/**
 * Retrieves the stored Bearer token from localStorage.
 */
export function getAuthToken(): string {
    if (typeof window === 'undefined') return '';
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) return token.trim();
    // [TEMPORARY_DEV_BYPASS]: UX review access for localhost in development mode only
    if (isLocalDevBypassEligible()) {
        return 'dev_printhouse_operator_token';
    }
    return '';
}

/**
 * Saves a valid token to localStorage.
 */
export function setAuthToken(token: string): void {
    if (typeof window === 'undefined') return;
    const cleanToken = token ? token.trim() : '';
    if (cleanToken) {
        localStorage.setItem(TOKEN_KEY, cleanToken);
    }
}

/**
 * Saves user metadata to localStorage.
 */
export function setAuthUser(user: any): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(USER_KEY, JSON.stringify(user));
}

/**
 * Retrieves user metadata.
 */
export function getAuthUser(): any | null {
    if (typeof window === 'undefined') return null;
    const user = localStorage.getItem(USER_KEY);
    if (user) return JSON.parse(user);
    // [TEMPORARY_DEV_BYPASS]: UX review printhouse user for localhost in development mode only
    if (isLocalDevBypassEligible()) {
        return {
            email: 'operator@printhouse.local',
            role: 'PRINTHOUSE_OPERATOR',
            tenantId: 'tenant-demo-local',
            printhouseId: 'node-329a3bc4',
            companyName: 'Local Imprenta Demo'
        };
    }
    return null;
}

/**
 * Removes the token and user from localStorage.
 */
export function clearAuthToken(): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    // Compatibility with legacy keys if needed
    localStorage.removeItem('ppp_admin_api_key');
    localStorage.removeItem('admin_key');
}

/**
 * Checks if a token is present.
 */
export function isAuthenticated(): boolean {
    return !!getAuthToken();
}

/**
 * Accessors for specific user context fields.
 * Includes safe fallback for SUPER_ADMIN resolution.
 */
export function getUserRole(): string {
    const user = getAuthUser();
    if (!user) return 'VIEWER';

    const rawRole = (user.role || 'VIEWER').toUpperCase();
    const email = (user.email || '').toLowerCase();

    // SAFE FALLBACK: 
    // 1. Explicit SUPER_ADMIN role
    // 2. Canonical admin email
    // 3. isSuperAdmin flag (set by break-glass or master token)
    if (rawRole === 'SUPER_ADMIN' || email === 'admin@printprice.pro' || user.isSuperAdmin === true) {
        return 'SUPER_ADMIN';
    }

    return rawRole;
}

export function getUserTenantId(): string {
    return getAuthUser()?.tenantId || '';
}

export function getUserPrinthouseId(): string {
    return getAuthUser()?.printhouseId || '';
}

export function isSuperAdmin(): boolean {
    return getUserRole() === 'SUPER_ADMIN';
}

export function isPrinthouseUser(): boolean {
    return ['PRINTHOUSE_ADMIN', 'PRINTHOUSE_OPERATOR'].includes(getUserRole());
}
