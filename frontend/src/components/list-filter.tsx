import { type ReactNode, useState } from 'react';

import { TextField } from '#components/text-field';
import { useKeys } from '#hooks/use-keys';

/** The filter of a list: what it holds, and whether it has the keys. */
export interface ListFilter {
  readonly text: string;
  readonly typing: boolean;
  readonly start: () => void;
  /** The field while it types or holds a text, and nothing otherwise. */
  readonly line: ReactNode;
}

/** Whether a path holds the text of the filter, in any case. */
export function holdsFilter(path: string, filter: string): boolean {
  return path.toLowerCase().includes(filter.toLowerCase());
}

/**
 * The filter of a list by a part of a path, in the one text field. While
 * it types, `enter` keeps its text and `esc` throws it away.
 */
export function useListFilter(): ListFilter {
  const [text, setText] = useState('');
  const [typing, setTyping] = useState(false);
  useKeys(
    {
      enter: () => {
        setTyping(false);
      },
      esc: () => {
        setText('');
        setTyping(false);
      },
    },
    { active: typing },
  );
  const shown = typing || text !== '';
  return {
    text,
    typing,
    start: () => {
      setTyping(true);
    },
    line: shown ? (
      <TextField prompt="/" value={text} active={typing} onChange={setText} />
    ) : null,
  };
}
