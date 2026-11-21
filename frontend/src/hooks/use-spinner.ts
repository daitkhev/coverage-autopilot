import { useAnimation } from 'ink';

import { useTheme } from '#hooks/use-theme';
import { SPINNER_INTERVAL_MS, spinnerFrameOf } from '#theme/symbols';

/**
 * The frame of the spinner. Every spinner on the screen runs on Ink's one
 * shared timer, so they turn together and redraw once.
 */
export function useSpinner(): string {
  const settings = useTheme();
  const { frame } = useAnimation({
    interval: SPINNER_INTERVAL_MS,
    isActive: settings.animation && settings.unicode,
  });
  return spinnerFrameOf(frame, settings);
}
