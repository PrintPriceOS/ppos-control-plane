/**
 * src/ui/lib/themeStore.ts
 * 
 * Canonical theme controller for PrintPrice OS.
 * Manages dark/light mode state and synchronization.
 */

export type Theme = 'dark' | 'light';

const THEME_KEY = 'ppos-theme';

export const getTheme = (): Theme => {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === 'dark' || stored === 'light') return stored;
    
    // Default to dark for industrial vibe
    return 'dark';
};

export const setTheme = (theme: Theme) => {
    localStorage.setItem(THEME_KEY, theme);
    applyTheme(theme);
    
    // Dispatch custom event for reactive components
    window.dispatchEvent(new CustomEvent('ppos-theme-change', { detail: theme }));
};

export const applyTheme = (theme: Theme) => {
    if (theme === 'dark') {
        document.documentElement.classList.add('dark');
        document.documentElement.style.backgroundColor = '#0e0e0f';
    } else {
        document.documentElement.classList.remove('dark');
        document.documentElement.style.backgroundColor = '#ffffff';
    }
};

// Initialization helper
export const initTheme = () => {
    const theme = getTheme();
    applyTheme(theme);
};
