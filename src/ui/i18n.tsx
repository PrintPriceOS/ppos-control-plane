import React, { createContext, useContext, useState, ReactNode, useMemo } from 'react';
import { en } from './en';
import { es } from './es';

export type Locale = 'en' | 'es';
const translations: Record<Locale, any> = { en, es };

interface LocaleContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, params?: Record<string, any>) => string;
}

const LocaleContext = createContext<LocaleContextType | undefined>(undefined);

export const LocaleProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [locale, setLocale] = useState<Locale>('en');

  const t = useMemo(() => (key: string, params?: Record<string, any>): string => {
    const dict = translations[locale];
    let template = (dict as any)[key] || key;

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

// Global legacy t support for extracted code (Default to English)
export const t = (key: string, params?: Record<string, any>): string => {
    const template = (en as any)[key] || key;
    if (params) {
        let res = template;
        Object.entries(params).forEach(([k, v]) => {
            res = res.replace(new RegExp(`{{${k}}}`, 'g'), String(v));
        });
        return res;
    }
    return template;
};
