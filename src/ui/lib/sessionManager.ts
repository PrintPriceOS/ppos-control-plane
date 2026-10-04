/**
 * src/ui/lib/sessionManager.ts
 * 
 * Production Session Lifetime & Inactivity Controller for PrintPrice OS.
 * Coordinates user activity, inactivity expiration, multi-tab sync, draft protection,
 * and graceful session termination.
 */
import { clearAuthToken, isAuthenticated } from './authStore';

const INACTIVITY_KEY = 'ppos_session_timeout_min';
const LAST_ACTIVITY_KEY = 'ppos_last_activity_ts';
const LOGOUT_CHANNEL_KEY = 'ppos_auth_sync';

export interface SessionConfig {
    timeoutMinutes: number;
    lastActivityTs: number;
    isActive: boolean;
}

class SessionManager {
    private checkIntervalId: any = null;
    private activityListenersBound = false;
    private broadcastChannel: BroadcastChannel | null = null;

    constructor() {
        if (typeof window !== 'undefined') {
            try {
                this.broadcastChannel = new BroadcastChannel(LOGOUT_CHANNEL_KEY);
                this.broadcastChannel.onmessage = (event) => {
                    if (event.data?.type === 'SESSION_TERMINATED') {
                        this.handleRemoteLogout(event.data?.reason || 'INACTIVITY');
                    } else if (event.data?.type === 'ACTIVITY_HEARTBEAT') {
                        // Another tab recorded activity; update local in-memory knowledge
                        this.recordLocalActivity();
                    }
                };
            } catch (e) {
                // Fallback for environments where BroadcastChannel is not supported
                window.addEventListener('storage', (e) => {
                    if (e.key === 'ppos_control_token' && !e.newValue) {
                        this.handleRemoteLogout('TOKEN_CLEARED');
                    }
                });
            }
        }
    }

    /**
     * Initializes activity listeners and the inactivity heartbeat loop.
     */
    public startSessionMonitoring(): void {
        if (typeof window === 'undefined') return;

        this.recordActivity();
        this.bindActivityListeners();

        if (this.checkIntervalId) {
            clearInterval(this.checkIntervalId);
        }

        // Run heartbeat verification every 1 second if timeout < 1 min, else 5 seconds
        const intervalMs = this.getInactivityTimeoutMinutes() < 1 ? 1000 : 5000;
        this.checkIntervalId = setInterval(() => {
            this.evaluateSessionExpiration();
        }, intervalMs);
    }

    /**
     * Stops monitoring loop.
     */
    public stopSessionMonitoring(): void {
        if (this.checkIntervalId) {
            clearInterval(this.checkIntervalId);
            this.checkIntervalId = null;
        }
    }

    /**
     * Binds throttle-protected DOM activity listeners.
     */
    private bindActivityListeners(): void {
        if (this.activityListenersBound || typeof window === 'undefined') return;
        this.activityListenersBound = true;

        let throttled = false;
        const onActivity = () => {
            if (!throttled) {
                throttled = true;
                this.recordActivity();
                setTimeout(() => {
                    throttled = false;
                }, 3000); // Record at most every 3 seconds
            }
        };

        ['mousedown', 'keydown', 'scroll', 'touchstart'].forEach(evt => {
            window.addEventListener(evt, onActivity, { passive: true });
        });
    }

    /**
     * Records local activity and broadcasts heartbeat across all browser tabs.
     */
    public recordActivity(): void {
        if (typeof window === 'undefined') return;
        const now = Date.now();
        try {
            localStorage.setItem(LAST_ACTIVITY_KEY, String(now));
        } catch (e) {}

        if (this.broadcastChannel) {
            try {
                this.broadcastChannel.postMessage({ type: 'ACTIVITY_HEARTBEAT', ts: now });
            } catch (e) {}
        }
    }

    private recordLocalActivity(): void {
        try {
            localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
        } catch (e) {}
    }

    /**
     * Resolves the effective inactivity timeout in minutes.
     * Capped strictly by the server's policy (default 60 min, max 480 min).
     */
    public getInactivityTimeoutMinutes(): number {
        if (typeof window === 'undefined') return 60;
        try {
            const raw = localStorage.getItem(INACTIVITY_KEY);
            const val = parseFloat(raw || '60');
            if (!isNaN(val) && val >= 0.01 && val <= 480) {
                return val;
            }
        } catch (e) {}
        return 60;
    }

    /**
     * Evaluates whether inactivity threshold has elapsed since last recorded activity.
     */
    public evaluateSessionExpiration(): boolean {
        if (typeof window === 'undefined' || !isAuthenticated()) return false;

        const timeoutMs = this.getInactivityTimeoutMinutes() * 60 * 1000;
        const lastActivityStr = localStorage.getItem(LAST_ACTIVITY_KEY);
        const lastActivity = lastActivityStr ? parseInt(lastActivityStr, 10) : Date.now();

        const elapsed = Date.now() - lastActivity;
        if (elapsed >= timeoutMs) {
            this.terminateSession('INACTIVITY');
            return true;
        }
        return false;
    }

    /**
     * Explicitly terminates session with coordination across all tabs.
     */
    public terminateSession(reason: 'INACTIVITY' | 'USER_LOGOUT' | 'REVOKED' = 'USER_LOGOUT'): void {
        if (typeof window === 'undefined') return;

        // Clear tokens from storage
        clearAuthToken();

        // Broadcast termination to other tabs
        if (this.broadcastChannel) {
            try {
                this.broadcastChannel.postMessage({ type: 'SESSION_TERMINATED', reason });
            } catch (e) {}
        }

        // Notify in-tab consumers
        window.dispatchEvent(new CustomEvent('ppos-session-expired', { detail: { reason } }));

        // Graceful redirect to login without loss of location context
        if (window.location.pathname !== '/login') {
            const currentPath = encodeURIComponent(window.location.pathname + window.location.search);
            window.location.href = `/login?reason=${reason}&redirect=${currentPath}`;
        }
    }

    private handleRemoteLogout(reason: string): void {
        clearAuthToken();
        window.dispatchEvent(new CustomEvent('ppos-session-expired', { detail: { reason } }));
        if (window.location.pathname !== '/login') {
            window.location.href = `/login?reason=${reason}`;
        }
    }
}

export const sessionManager = new SessionManager();
