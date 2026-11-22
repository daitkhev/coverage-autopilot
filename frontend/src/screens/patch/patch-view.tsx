import { Box } from 'ink';
import { type ReactNode, useState } from 'react';

import type { ClientSession } from '#api/client-session';
import { AppShell, type ShellFrame } from '#components/app-shell';
import { KeyHints } from '#components/key-hints';
import { SplitView } from '#components/split-view';
import { type Freshness, StatusLine } from '#components/status-line';
import { type Action, useAction } from '#hooks/use-action';
import { useFocusRing } from '#hooks/use-focus-ring';
import { useKeys } from '#hooks/use-keys';
import { type Selection, useSelection } from '#hooks/use-selection';
import {
  type LoadedPatch,
  type PatchFile,
  patchFilesOf,
} from '#screens/patch/patch-answer';
import {
  decide,
  type Decided,
  DECISION_ROWS,
  DecisionPanel,
  DECISIONS,
  wasChanged,
  wasTaken,
} from '#screens/patch/patch-decision';
import { Evidence } from '#screens/patch/patch-evidence';
import {
  patchHints,
  patchKeys,
  type PatchKeysState,
  type PatchPanel,
  type Scroll,
} from '#screens/patch/patch-keys';
import { FILE_ROWS, PatchLines } from '#screens/patch/patch-lines';
import { ageWords } from '#theme/moments';
import { layoutOf } from '#theme/widths';

interface PatchViewProps {
  readonly session: ClientSession;
  readonly frame: ShellFrame;
  readonly shown: LoadedPatch;
  readonly freshness: Freshness;
  /** Asks for the patch again at once, after it changed. */
  readonly onReload: () => void;
  readonly onBack: () => void;
}

const PANELS: readonly [PatchPanel, PatchPanel] = ['patch', 'evidence'];

/**
 * The rows that hold no line of the patch: the header, the footer, the
 * frame of the panel, the file above the lines, and "more lines below".
 */
const HEADER_ROWS = 2;
const FOOTER_ROWS = 3;
const FRAME_ROWS = 2;
const MORE_ROWS = 1;
const CHROME_ROWS =
  HEADER_ROWS + FOOTER_ROWS + FRAME_ROWS + FILE_ROWS + MORE_ROWS;
const NOTICE_ROWS = 1;

const APPROVED = 'Approved. The service opens the pull request.';
const REJECTED = 'Rejected. The improvement is cancelled.';
const CHANGED =
  'The patch changed since it was shown, so it was loaded again. Read it before you approve.';

/** The file shown, and the first line of it drawn. */
interface Reading {
  readonly chosen: number;
  readonly top: number;
  readonly count: number;
  readonly scroll: Scroll;
}

function useReading(files: readonly PatchFile[], visible: number): Reading {
  const [wanted, setWanted] = useState({ chosen: 0, top: 0 });
  const chosen = Math.min(wanted.chosen, Math.max(0, files.length - 1));
  const count = files[chosen]?.added.length ?? 0;
  const most = Math.max(0, count - visible);
  const top = Math.min(wanted.top, most);
  const to = (line: number): void => {
    setWanted({ chosen, top: Math.min(Math.max(line, 0), most) });
  };
  return {
    chosen,
    top,
    count,
    scroll: {
      by: (lines) => {
        to(top + lines);
      },
      page: (pages) => {
        to(top + pages * visible);
      },
      first: () => {
        to(0);
      },
      last: () => {
        to(most);
      },
      file: (by) => {
        const next = (chosen + by + files.length) % files.length;
        setWanted({ chosen: next, top: 0 });
      },
    },
  };
}

/** The question of review mode, the chosen answer, and what was sent. */
interface Deciding {
  readonly action: Action<Decided>;
  readonly answer: Selection;
  readonly asking: boolean;
  readonly confirm: () => void;
}

function useDeciding(props: PatchViewProps): Deciding {
  const action = useAction<Decided>();
  const answer = useSelection({
    count: DECISIONS.length,
    visible: DECISIONS.length,
  });
  const { improvement, patch } = props.shown;
  const confirm = (): void => {
    const decision = DECISIONS[answer.index] ?? 'later';
    if (decision === 'later') {
      props.onBack();
      return;
    }
    const sent = {
      decision,
      improvementId: improvement.id,
      patchHash: patch.patchHash,
    };
    action.start(() => decide(props.session.api, sent, props.onReload));
  };
  const asking =
    improvement.status === 'awaiting_approval' && !wasTaken(action.state);
  return { action, answer, asking, confirm };
}

function noticeOf(deciding: Deciding): { readonly notice?: string } {
  const { state } = deciding.action;
  if (wasChanged(state)) {
    return { notice: CHANGED };
  }
  if (state.phase !== 'ended' || !wasTaken(state)) {
    return {};
  }
  return {
    notice: state.outcome.decision === 'approve' ? APPROVED : REJECTED,
  };
}

/** Where the person is: the panel, the file, the line, the answer. */
interface Place {
  readonly state: PatchKeysState;
  readonly files: readonly PatchFile[];
  readonly reading: Reading;
  readonly visible: number;
  readonly deciding: Deciding;
  readonly notice: { readonly notice?: string };
}

function usePlace(props: PatchViewProps): Place {
  const ring = useFocusRing(PANELS);
  const deciding = useDeciding(props);
  const notice = noticeOf(deciding);
  const files = patchFilesOf(props.shown.patch.patch);
  const visible = Math.max(
    1,
    props.frame.size.rows -
      CHROME_ROWS -
      (deciding.asking ? DECISION_ROWS : 0) -
      (notice.notice === undefined ? 0 : NOTICE_ROWS),
  );
  const reading = useReading(files, visible);
  const state = {
    focused: ring.focused,
    layout: layoutOf(props.frame.size),
    asking: deciding.asking,
    files: files.length,
  };
  useKeys(
    patchKeys(state, {
      scroll: reading.scroll,
      choose: deciding.answer.moveBy,
      pick: deciding.answer.moveTo,
      confirm: deciding.confirm,
      focus: ring.focus,
      next: ring.next,
      back: props.onBack,
    }),
    { active: true },
  );
  return { state, files, reading, visible, deciding, notice };
}

function Body({
  props,
  place,
}: {
  readonly props: PatchViewProps;
  readonly place: Place;
}): ReactNode {
  const { improvement, patch, repository } = props.shown;
  const { state, reading, deciding } = place;
  const reviewing = state.focused === 'patch';
  return (
    <Box flexDirection="column" flexGrow={1}>
      <SplitView
        layout={state.layout}
        shown={reviewing ? 'left' : 'right'}
        left={
          <PatchLines
            hash={patch.patchHash}
            files={place.files}
            chosen={reading.chosen}
            top={reading.top}
            visible={place.visible}
            focused={reviewing}
          />
        }
        right={
          <Evidence
            improvement={improvement}
            patch={patch}
            threshold={repository.latestSnapshot?.threshold.percentage}
            focused={!reviewing}
          />
        }
      />
      {deciding.asking ? (
        <DecisionPanel
          repository={repository}
          chosen={deciding.answer.index}
          state={deciding.action.state}
        />
      ) : null}
    </Box>
  );
}

function statusFacts(props: PatchViewProps): string[] {
  const { improvement, patch } = props.shown;
  return improvement.status === 'awaiting_approval'
    ? [
        `waiting for approval for ${ageWords(improvement.updatedAt, props.session.now())}`,
      ]
    : [`patch of attempt ${String(patch.attemptNumber)}`];
}

function positionOf(reading: Reading): { readonly position?: string } {
  return reading.count === 0
    ? {}
    : {
        position: `line ${String(reading.top + 1)} of ${String(reading.count)}`,
      };
}

/**
 * What exactly will be published: the added lines on the left, the
 * evidence on the right, and in review mode the question below them,
 * which stays while the patch scrolls.
 */
export function PatchView(props: PatchViewProps): ReactNode {
  const place = usePlace(props);
  const { improvement, repository } = props.shown;
  return (
    <AppShell
      {...props.frame}
      {...place.notice}
      body={<Body props={props} place={place} />}
      status={
        <StatusLine
          path={[
            'Improvements',
            `${repository.owner}/${repository.name}`,
            improvement.targetFile,
          ]}
          facts={statusFacts(props)}
          freshness={props.freshness}
        />
      }
      {...positionOf(place.reading)}
      keys={<KeyHints hints={patchHints(place.state)} />}
    />
  );
}
