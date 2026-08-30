import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { safeGetFromStorage, safeSetToStorage } from '@/modules/storage';
import { CONSTANTS } from '@/constants';

const ThemeContext = createContext({
  theme: 'dark',
  toggleTheme: () => {},
  setTheme: () => {},
  hasStoredPreference: false,
});

function storedTheme() {
  const saved = safeGetFromStorage(CONSTANTS.STORAGE_KEYS.THEME);
  return saved === 'light' || saved === 'dark' ? saved : null;
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => storedTheme() || 'dark');

  // Whether this device had a theme of its own before the effect below wrote
  // one. A signed-in coach's theme is adopted from the server on a device that
  // has none — a phone signed into for the first time — and not on one that
  // does: a device set to light for the sun at the touchline should not be
  // dragged into dark because the laptop is.
  const hasStoredPreference = useRef(storedTheme() !== null).current;

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    safeSetToStorage(CONSTANTS.STORAGE_KEYS.THEME, theme);
  }, [theme]);

  // Stable identities: App builds the sign-in effect that adopts the coach's
  // theme out of setTheme, and a new function each render would restart it.
  const toggleTheme = useCallback(() => {
    setThemeState((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  const setTheme = useCallback((t) => {
    if (t === 'dark' || t === 'light') setThemeState(t);
  }, []);

  const value = useMemo(
    () => ({ theme, toggleTheme, setTheme, hasStoredPreference }),
    [theme, toggleTheme, setTheme, hasStoredPreference]
  );

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
