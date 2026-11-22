import { type ReactNode, useState } from 'react';

import type {
  FileCoverage,
  MeasuredFile,
  SnapshotFiles,
} from '@coverage-autopilot/api-contracts/snapshots';

import type { ShellFrame } from '#components/app-shell';
import { TextField } from '#components/text-field-prompted';
import { useFocusRing } from '#hooks/use-focus-ring';
import { useKeys } from '#hooks/use-keys';
import { type Selection, useSelection } from '#hooks/use-selection';
import {
  FILE_LISTS,
  type FileList,
  filesOf,
} from '#screens/files/files-answer';
import {
  filesKeys,
  type FilesKeysState,
  type FilesPanel,
} from '#screens/files/files-keys';
import { type Layout, layoutOf } from '#theme/widths';

/**
 * The rows of the screen that hold no file: the header, the context, the
 * frame of the panel, the lists, the filter, the names of the columns,
 * "more below" and the footer.
 */
const CHROME_ROWS = 13;

const PANELS: readonly [FilesPanel, FilesPanel] = ['list', 'details'];

/** The filter of the list: what it holds, and whether it has the keys. */
interface Filter {
  readonly text: string;
  readonly typing: boolean;
  readonly start: () => void;
  /** The field while it types or holds a text, and nothing otherwise. */
  readonly line: ReactNode;
}

/** The file the dialog that starts an improvement is open for, if any. */
interface StartChoice {
  readonly file: MeasuredFile | undefined;
  readonly open: (file: MeasuredFile) => void;
  readonly close: () => void;
}

/** Where the person is in the files: the list, the row, the panel, the dialog. */
export interface Browser {
  readonly layout: Layout;
  readonly chosen: FileList;
  readonly rows: readonly FileCoverage[];
  readonly visible: number;
  readonly selection: Selection;
  readonly state: FilesKeysState;
  readonly filter: Filter;
  readonly dialog: StartChoice;
}

function useStartChoice(): StartChoice {
  const [file, setFile] = useState<MeasuredFile | undefined>();
  return {
    file,
    open: setFile,
    close: () => {
      setFile(undefined);
    },
  };
}

function useFilter(): Filter {
  const [text, setText] = useState('');
  const [typing, setTyping] = useState(false);
  const shown = typing || text !== '';
  return {
    text,
    typing,
    start: () => {
      setTyping(true);
    },
    line: shown ? (
      <TextField
        prompt="/"
        value={text}
        active={typing}
        onChange={setText}
        onAccept={() => {
          setTyping(false);
        }}
        onDiscard={() => {
          setText('');
          setTyping(false);
        }}
      />
    ) : null,
  };
}

/**
 * The state of the screen and its keys. The keys go to the filter while
 * it types, and to nothing behind the dialog.
 */
export function useBrowser({
  frame,
  files,
  onOpenImprovement,
  onBack,
}: {
  readonly frame: ShellFrame;
  readonly files: SnapshotFiles;
  readonly onOpenImprovement: (improvementId: string) => void;
  readonly onBack: () => void;
}): Browser {
  const [list, setList] = useState(0);
  const dialog = useStartChoice();
  const filter = useFilter();
  const ring = useFocusRing(PANELS);
  const chosen = FILE_LISTS[list] ?? FILE_LISTS[0];
  const rows = filesOf(files.items, { list: chosen, filter: filter.text });
  const visible = Math.max(1, frame.size.rows - CHROME_ROWS);
  const selection = useSelection({ count: rows.length, visible });
  const layout = layoutOf(frame.size);
  const selected = rows[selection.index];
  const state = { focused: ring.focused, layout, selected };
  useKeys(
    filesKeys(state, {
      selection,
      showList: (by) => {
        setList((list + by + FILE_LISTS.length) % FILE_LISTS.length);
        selection.first();
      },
      filter: filter.start,
      focus: ring.focus,
      next: ring.next,
      openWork: onOpenImprovement,
      improve: dialog.open,
      back: onBack,
    }),
    // The screen is not behind the backdrop of its own shell, so it says
    // itself that the dialog takes every key.
    { active: !filter.typing && dialog.file === undefined },
  );
  return { layout, chosen, rows, visible, selection, state, filter, dialog };
}
