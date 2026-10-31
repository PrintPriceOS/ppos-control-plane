import { useState, useEffect } from 'react';
import { getTheme, subscribeTheme, Theme } from '../lib/themeStore';

export const useTheme = (): Theme => {
    const [theme, setThemeState] = useState<Theme>(getTheme);

    useEffect(() => {
        const unsubscribe = subscribeTheme((newTheme) => {
            setThemeState(newTheme);
        });
        return unsubscribe;
    }, []);

    return theme;
};
