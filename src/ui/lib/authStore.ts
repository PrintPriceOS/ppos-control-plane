/**
 * src/ui/lib/authStore.ts
 * 
 * Secure Bearer Token storage for PrintPrice OS Control Plane.
 */

const TOKEN_KEY = 'ppos_control_token';
const USER_KEY = 'ppos_control_user';

/**
 * Retrieves the stored Bearer token from localStorage.
 */
export function getAuthToken(): string {
    if (typeof window === 'undefined') return '';
    const token = localStorage.getItem(TOKEN_KEY);
    return token ? token.trim() : '';
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
    return user ? JSON.parse(user) : null;
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
 */
export function getUserRole(): string {
    const user = getAuthUser();
    return (user?.role || 'VIEWER').toUpperCase();
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
