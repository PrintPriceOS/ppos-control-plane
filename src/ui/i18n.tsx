import React, { createContext, useContext, useState, ReactNode, useMemo, useEffect } from 'react';
import { en } from './en';
import { es } from './es';
import { de } from './de';

export type Locale = 'en' | 'es' | 'de';
const translations: Record<Locale, any> = { en, es, de };

const LOCALE_KEY = 'ppos_locale';

export const getStoredLocale = (): Locale => {
  if (typeof window === 'undefined') return 'en';
  try {
    const stored = localStorage.getItem(LOCALE_KEY);
    if (stored === 'en' || stored === 'es' || stored === 'de') {
      return stored;
    }
  } catch (e) {}
  return 'en';
};

interface LocaleContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, params?: Record<string, any>) => string;
}

const LocaleContext = createContext<LocaleContextType | undefined>(undefined);

export const LocaleProvider: React.FC<{ children: ReactNode; initialLocale?: Locale }> = ({ children, initialLocale }) => {
  const [locale, setLocaleState] = useState<Locale>(() => initialLocale || getStoredLocale());

  const setLocale = (newLocale: Locale) => {
    setLocaleState(newLocale);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(LOCALE_KEY, newLocale);
        document.documentElement.lang = newLocale;
        window.dispatchEvent(new CustomEvent('ppos-locale-change', { detail: newLocale }));
      } catch (e) {}
    }
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      document.documentElement.lang = locale;
      const handler = (e: CustomEvent<Locale>) => {
        if (e.detail && e.detail !== locale) {
          setLocaleState(e.detail);
        }
      };
      window.addEventListener('ppos-locale-change', handler as EventListener);
      return () => window.removeEventListener('ppos-locale-change', handler as EventListener);
    }
  }, [locale]);

  const t = useMemo(() => (key: string, params?: Record<string, any>): string => {
    const dict = translations[locale] || translations.en;
    let template = (dict as any)[key] || (translations.en as any)[key] || key;

    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        template = template.replace(new RegExp(`{{${k}}}`, 'g'), String(v));
      });
    }

    return template;
  }, [locale]);

  return (
    <LocaleContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </LocaleContext.Provider>
  );
};

export const useLocale = () => {
  const context = useContext(LocaleContext);
  if (!context) throw new Error('useLocale must be used within a LocaleProvider');
  return context;
};

// Global legacy t support for extracted code
export const t = (key: string, params?: Record<string, any>): string => {
  const currentLoc = getStoredLocale();
  const dict = translations[currentLoc] || translations.en;
  let template = (dict as any)[key] || (translations.en as any)[key] || key;
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      template = template.replace(new RegExp(`{{${k}}}`, 'g'), String(v));
    });
  }
  return template;
};
