import React, { createContext, useContext, ReactNode } from 'react';

// Minimal i18n stub for Control Plane
// Implementation: t(key) -> returns key
export const t = (key: string): string => {
  return key;
};

interface LocaleContextType {
  currentLocale: string;
}

const LocaleContext = createContext<LocaleContextType>({ currentLocale: 'en' });

interface LocaleProviderProps {
  children: ReactNode;
}

export const LocaleProvider: React.FC<LocaleProviderProps> = ({ children }) => {
  return (
    <LocaleContext.Provider value={{ currentLocale: 'en' }}>
      {children}
    </LocaleContext.Provider>
  );
};

export const useLocale = () => useContext(LocaleContext);
