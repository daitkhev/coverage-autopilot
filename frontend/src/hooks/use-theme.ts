import { createContext, useContext } from 'react';

import { FULL_THEME, type ThemeSettings } from '#theme/settings';

/** What the terminal can show, set once at the root of the client. */
export const ThemeContext = createContext<ThemeSettings>(FULL_THEME);

export function useTheme(): ThemeSettings {
  return useContext(ThemeContext);
}
