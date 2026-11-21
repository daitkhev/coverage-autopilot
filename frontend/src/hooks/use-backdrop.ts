import { createContext, useContext } from 'react';

/**
 * Whether a part is behind an open dialog. Everything behind it is drawn
 * dim and takes no keys until the dialog closes.
 */
export const BackdropContext = createContext(false);

export function useBackdrop(): boolean {
  return useContext(BackdropContext);
}
