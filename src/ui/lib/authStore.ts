/**
 * src/ui/lib/authStore.ts
 * 
 * Secure Bearer Token storage for PrintPrice OS Control Plane.
 */

const TOKEN_KEY = 'ppos_control_token';

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
 * Removes the token from localStorage.
 */
export function clearAuthToken(): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(TOKEN_KEY);
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
