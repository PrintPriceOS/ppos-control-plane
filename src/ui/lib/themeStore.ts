/**
 * src/ui/lib/themeStore.ts
 * 
 * Canonical theme controller for PrintPrice OS.
 * Manages dark/light mode state and synchronization.
 */

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

export const initTheme = () => {
    if (typeof window !== 'undefined') {
        const theme = getTheme();
        applyTheme(theme);
    }
};

type ThemeListener = (theme: Theme) => void;
const listeners: Set<ThemeListener> = new Set();

if (typeof window !== 'undefined') {
    window.addEventListener('ppos-theme-change', ((e: CustomEvent<Theme>) => {
        listeners.forEach(listener => listener(e.detail));
    }) as EventListener);
}

export const subscribeTheme = (listener: ThemeListener): (() => void) => {
    listeners.add(listener);
    listener(getTheme());
    return () => {
        listeners.delete(listener);
    };
};
