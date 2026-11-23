import { useState } from 'react';

import type {
  FileCoverage,
  MeasuredFile,
  SnapshotFiles,
} from '@coverage-autopilot/api-contracts/snapshots';

import type { ShellFrame } from '#components/app-shell';
import { type ListFilter, useListFilter } from '#components/list-filter';
import { useFocusRing } from '#hooks/use-focus-ring';
import { type ScreenAction, useScreenActions } from '#hooks/use-screen-actions';
import { type Selection, useSelection } from '#hooks/use-selection';
import {
  type FileList,
  fileListAt,
  filesOf,
  listAfter,
} from '#screens/files/files-answer';
import { filesActions, type FilesPanel } from '#screens/files/files-keys';
import { type Layout, layoutOf } from '#theme/widths';

/**
 * The rows of the screen that hold no file: the header, the context, the
 * frame of the panel, the lists, the filter, the names of the columns,
 * "more below" and the footer.
 */
const CHROME_ROWS = 13;

const PANELS: readonly [FilesPanel, FilesPanel] = ['list', 'details'];

/** What the footer calls the two panels. */
const PANEL_WORDS = ['list', 'details'] as const;

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
  readonly focused: FilesPanel;
  readonly selected: FileCoverage | undefined;
  readonly filter: ListFilter;
  readonly dialog: StartChoice;
  /** What the keys do while neither the filter nor the dialog has them. */
  readonly actions: readonly ScreenAction[];
}

/** The files of the chosen list that hold the filter, and the chosen one. */
function useRows(
  files: SnapshotFiles,
  {
    list,
    filter,
    frame,
  }: {
    readonly list: number;
    readonly filter: ListFilter;
    readonly frame: ShellFrame;
  },
): Pick<Browser, 'chosen' | 'rows' | 'visible' | 'selection'> {
  const chosen = fileListAt(list);
  const rows = filesOf(files.items, { list: chosen, filter: filter.text });
  const visible = Math.max(1, frame.size.rows - CHROME_ROWS);
  const selection = useSelection({
    count: rows.length,
    visible,
    keys: rows.map(({ path }) => path),
  });
  return { chosen, rows, visible, selection };
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
  const filter = useListFilter();
  const ring = useFocusRing(PANELS);
  const shown = useRows(files, { list, filter, frame });
  const { rows, selection } = shown;
  const layout = layoutOf(frame.size);
  const selected = rows[selection.index];
  const actions = filesActions(
    { layout, list, selected },
    {
      selection,
      panels: { ring, names: PANELS, words: PANEL_WORDS },
      showList: (by) => {
        setList(listAfter(list, by));
        selection.first();
      },
      filter: filter.start,
      openWork: onOpenImprovement,
      improve: dialog.open,
      back: onBack,
    },
  );
  // The screen is not behind the backdrop of its own shell, so it says
  // itself that the dialog takes every key.
  useScreenActions(actions, {
    active: !filter.typing && dialog.file === undefined,
  });
  return {
    ...shown,
    layout,
    focused: ring.focused,
    selected,
    filter,
    dialog,
    actions,
  };
}
