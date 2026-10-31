/**
 * src/ui/lib/themeStore.ts
 * 
 * Canonical theme controller for PrintPrice OS.
 * Manages dark/light mode state and synchronization.
 */

// ── Theme ──────────────────────────────────────────────────────────────────────
export type Theme = 'dark' | 'light';
const THEME_KEY = 'ppos-theme';
let currentTheme: Theme = 'dark';

export const getTheme = (): Theme => {
    if (typeof window === 'undefined') return 'dark';
    try {
        const stored = localStorage.getItem(THEME_KEY);
        if (stored === 'dark' || stored === 'light') {
            currentTheme = stored;
            return stored;
        }
    } catch (e) {
        // Ignore errors in secure/private contexts
    }
    return 'dark';
};

export const setTheme = (theme: Theme) => {
    currentTheme = theme;
    if (typeof window !== 'undefined') {
        try {
            localStorage.setItem(THEME_KEY, theme);
        } catch (e) {}
        applyTheme(theme);
        window.dispatchEvent(new CustomEvent('ppos-theme-change', { detail: theme }));
    }
};

export const applyTheme = (theme: Theme) => {
    if (typeof document !== 'undefined') {
        if (theme === 'dark') {
            document.documentElement.classList.add('dark');
            document.documentElement.style.backgroundColor = '#0e0e0f';
        } else {
            document.documentElement.classList.remove('dark');
            document.documentElement.style.backgroundColor = '#ffffff';
        }
    }
};

type ThemeListener = (theme: Theme) => void;
const themeListeners: Set<ThemeListener> = new Set();

if (typeof window !== 'undefined') {
    window.addEventListener('ppos-theme-change', ((e: CustomEvent<Theme>) => {
        themeListeners.forEach(listener => listener(e.detail));
    }) as EventListener);
}

export const subscribeTheme = (listener: ThemeListener): (() => void) => {
    themeListeners.add(listener);
    listener(getTheme());
    return () => {
        themeListeners.delete(listener);
    };
};

// ── UI Density ────────────────────────────────────────────────────────────────
export type Density = 'compact' | 'comfortable';
const DENSITY_KEY = 'ppos-density';
let currentDensity: Density = 'comfortable';

export const getDensity = (): Density => {
    if (typeof window === 'undefined') return 'comfortable';
    try {
        const stored = localStorage.getItem(DENSITY_KEY);
        if (stored === 'compact' || stored === 'comfortable') {
            currentDensity = stored;
            return stored;
        }
    } catch (e) {}
    return 'comfortable';
};

export const setDensity = (density: Density) => {
    currentDensity = density;
    if (typeof window !== 'undefined') {
        try {
            localStorage.setItem(DENSITY_KEY, density);
        } catch (e) {}
        applyDensity(density);
        window.dispatchEvent(new CustomEvent('ppos-density-change', { detail: density }));
    }
};

export const applyDensity = (density: Density) => {
    if (typeof document !== 'undefined') {
        document.documentElement.setAttribute('data-density', density);
    }
};

type DensityListener = (density: Density) => void;
const densityListeners: Set<DensityListener> = new Set();

if (typeof window !== 'undefined') {
    window.addEventListener('ppos-density-change', ((e: CustomEvent<Density>) => {
        densityListeners.forEach(listener => listener(e.detail));
    }) as EventListener);
}

export const subscribeDensity = (listener: DensityListener): (() => void) => {
    densityListeners.add(listener);
    listener(getDensity());
    return () => {
        densityListeners.delete(listener);
    };
};

// ── UI Animations / Reduced Motion ──────────────────────────────────────────
const ANIMATIONS_KEY = 'ppos-animations';
let currentAnimations: boolean = true;

export const getAnimations = (): boolean => {
    if (typeof window === 'undefined') return true;
    try {
        const stored = localStorage.getItem(ANIMATIONS_KEY);
        if (stored !== null) {
            currentAnimations = stored === 'true';
            return currentAnimations;
        }
    } catch (e) {}
    return true;
};

export const setAnimations = (enabled: boolean) => {
    currentAnimations = enabled;
    if (typeof window !== 'undefined') {
        try {
            localStorage.setItem(ANIMATIONS_KEY, String(enabled));
        } catch (e) {}
        applyAnimations(enabled);
        window.dispatchEvent(new CustomEvent('ppos-animations-change', { detail: enabled }));
    }
};

export const applyAnimations = (enabled: boolean) => {
    if (typeof document !== 'undefined') {
        const systemPrefersReduced = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
            ? Boolean(window.matchMedia('(prefers-reduced-motion: reduce)')?.matches)
            : false;
        // Most restrictive preference prevails: if user disabled animations OR system prefers reduced motion
        const shouldReduce = !enabled || systemPrefersReduced;
        if (shouldReduce) {
            document.documentElement.setAttribute('data-reduced-motion', 'true');
        } else {
            document.documentElement.removeAttribute('data-reduced-motion');
        }
    }
};

type AnimationsListener = (enabled: boolean) => void;
const animationsListeners: Set<AnimationsListener> = new Set();

if (typeof window !== 'undefined') {
    window.addEventListener('ppos-animations-change', ((e: CustomEvent<boolean>) => {
        animationsListeners.forEach(listener => listener(e.detail));
    }) as EventListener);

    // Also listen to system prefers-reduced-motion changes
    if (window.matchMedia) {
        window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', () => {
            applyAnimations(getAnimations());
        });
    }
}

export const subscribeAnimations = (listener: AnimationsListener): (() => void) => {
    animationsListeners.add(listener);
    listener(getAnimations());
    return () => {
        animationsListeners.delete(listener);
    };
};

// ── Master Init ─────────────────────────────────────────────────────────────
export const initTheme = () => {
    if (typeof window !== 'undefined') {
        applyTheme(getTheme());
        applyDensity(getDensity());
        applyAnimations(getAnimations());
    }
};

