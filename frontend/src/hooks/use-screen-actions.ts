import {
  createContext,
  useContext,
  useEffect,
  useSyncExternalStore,
} from 'react';

import { type KeyHandlers, useKeys } from '#hooks/use-keys';
import type { Role } from '#theme/roles';

/** How the footer names an action: `s` scan. */
export interface ActionHint {
  readonly label: string;
  /**
   * The key as the footer writes it, where one hint stands for more keys
   * than the one of the action, such as `up-down` for both arrows.
   */
  readonly key?: string;
  /** A key whose action cannot be undone is red. */
  readonly role?: Role;
}

/** How the list of commands names an action, for whoever looks it up. */
interface ActionCommand {
  readonly title: string;
  /** What it acts on, such as the chosen repository. */
  readonly target?: string;
}

/**
 * What a person can do on a screen, described once: the key that runs it,
 * the words of the footer and the line of the list of commands. The list
 * runs the same handler the key runs.
 */
export interface ScreenAction {
  /**
   * The key, as `useKeys` names it. A next step of failed work has none:
   * it is chosen in its list, or in the list of commands.
   */
  readonly key?: string;
  readonly run: () => void;
  /** Without one the footer leaves the key to the help. */
  readonly hint?: ActionHint;
  /** Without one, as for a move in a list, the list of commands leaves it out. */
  readonly command?: ActionCommand;
}

/** An action the list of commands names. */
export type NamedAction = ScreenAction & { readonly command: ActionCommand };

/** The actions the screen that shows offers to the list of commands. */
export interface OfferedActions {
  readonly current: () => readonly ScreenAction[];
  readonly subscribe: (listener: () => void) => () => void;
  readonly offer: (actions: readonly ScreenAction[]) => void;
  /** Takes back an offer, unless another one came after it. */
  readonly withdraw: (actions: readonly ScreenAction[]) => void;
}

const NONE: readonly ScreenAction[] = [];

/** The handlers of the actions that have a key. */
export function keysOf(actions: readonly ScreenAction[]): KeyHandlers {
  return Object.fromEntries(
    actions.flatMap(({ key, run }) => (key === undefined ? [] : [[key, run]])),
  );
}

/** Where the screens offer their actions, and the list of commands reads. */
export function offeredActions(): OfferedActions {
  let offered = NONE;
  const listeners = new Set<() => void>();
  const set = (actions: readonly ScreenAction[]): void => {
    offered = actions;
    for (const listener of listeners) {
      listener();
    }
  };
  return {
    current: () => offered,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    offer: set,
    withdraw: (actions) => {
      if (offered === actions) {
        set(NONE);
      }
    },
  };
}

/** The offers of the app. A screen drawn alone offers to nothing. */
export const OfferedContext = createContext<OfferedActions | undefined>(
  undefined,
);

/**
 * Runs the actions on their keys, and offers them to the list of commands
 * while they work. A screen whose dialog or text field has the keys
 * offers nothing, as its keys do nothing. The offer is made after each
 * drawing and taken back when the screen is hidden, so only the screen
 * that shows offers anything.
 */
export function useScreenActions(
  actions: readonly ScreenAction[],
  { active }: { readonly active: boolean },
): void {
  useKeys(keysOf(actions), { active });
  const offers = useContext(OfferedContext);
  const offered = active ? actions : NONE;
  useEffect(() => {
    offers?.offer(offered);
    return () => {
      offers?.withdraw(offered);
    };
  });
}

/** What the screen that shows offers now. It draws again on every offer. */
export function useOfferedActions(
  offers: OfferedActions,
): readonly ScreenAction[] {
  return useSyncExternalStore(offers.subscribe, offers.current);
}
