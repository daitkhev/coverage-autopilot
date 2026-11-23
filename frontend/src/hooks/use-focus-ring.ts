import { useState } from 'react';

export interface FocusRing<Name extends string> {
  /** The one panel that takes the keys now. */
  readonly focused: Name;
  /** Moves the focus to the next panel, as `tab` does. */
  readonly next: () => void;
  readonly focus: (name: Name) => void;
}

/**
 * Exactly one panel of a screen has the focus. A screen that loses a panel,
 * at a narrow width, gives the focus to its first panel.
 */
export function useFocusRing<Name extends string>(
  names: readonly [Name, ...Name[]],
): FocusRing<Name> {
  const [wanted, setWanted] = useState<Name>(names[0]);
  const focused = names.includes(wanted) ? wanted : names[0];
  return {
    focused,
    next: () => {
      const following = names[names.indexOf(focused) + 1];
      setWanted(following ?? names[0]);
    },
    focus: setWanted,
  };
}
