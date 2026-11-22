import type { ReactNode } from 'react';

import type { ScanParameters } from '@coverage-autopilot/api-contracts/snapshots';

import { AppShell, type ShellFrame } from '#components/app-shell';
import { DataList } from '#components/data-list';
import { EmptyState } from '#components/empty-state';
import { type KeyHint, KeyHints } from '#components/key-hints';
import { Panel } from '#components/panel';
import { type Problem, ProblemDetails } from '#components/problem-details';
import { SplitView } from '#components/split-view';
import { StatusLine } from '#components/status-line';
import type { DatedRequest } from '#hooks/use-dated-request';
import type { ListPosition } from '#hooks/use-selection';
import {
  ConnectDialogView,
  connectHintsOf,
  type ConnectState,
  connectStatusOf,
} from '#screens/repositories/connect-dialog-view';
import { isEditable } from '#screens/repositories/connect-flow';
import { RepositoryDetails } from '#screens/repositories/repository-details';
import {
  type RepositoryListing,
  type RepositoryWork,
  rowsOf,
} from '#screens/repositories/repository-listing';
import { RepositoryRowLines } from '#screens/repositories/repository-row';
import { isScanning } from '#screens/repositories/repository-words';
import { countWords } from '#theme/counts';
import { repositoryName } from '#theme/names';
import { BAR_CELLS, layoutOf, type TerminalSize } from '#theme/widths';

/** The list and the panel of the selected repository. */
export const REPOSITORIES_PANELS = ['list', 'details'] as const;

type RepositoriesPanel = (typeof REPOSITORIES_PANELS)[number];

/** The header, the footer, the frame of the panel and "more below". */
const CHROME_ROWS = 8;

const ROW_LINES = 2;

const PATH = ['Repositories'];

/** How many repositories fit in the list, each on two lines. */
export function visibleRowsOf(size: TerminalSize): number {
  return Math.max(1, Math.floor((size.rows - CHROME_ROWS) / ROW_LINES));
}

/** The open dialog that connects a repository, and what it does. */
export interface ConnectDialogParts {
  readonly state: ConnectState;
  readonly onChange: (url: string) => void;
  readonly onConfirm: () => void;
  readonly onClose: () => void;
}

interface RepositoriesViewProps {
  readonly frame: ShellFrame;
  readonly listing: DatedRequest<RepositoryListing>;
  readonly work: RepositoryWork | undefined;
  /** How the latest snapshot of the chosen repository was measured. */
  readonly parameters?: ScanParameters | undefined;
  /** What went wrong with the last request, beside the list it keeps. */
  readonly problem: Problem | undefined;
  readonly now: string;
  readonly position: ListPosition;
  readonly visible: number;
  readonly focused: RepositoriesPanel;
  /** The repositories whose scan was started here, not yet in the list. */
  readonly starting: ReadonlySet<string>;
  readonly notice: string | undefined;
  readonly connect: ConnectDialogParts | undefined;
}

function ListPanel(props: RepositoriesViewProps): ReactNode {
  const { listing, position, starting } = props;
  const rows = rowsOf(listing.answer);
  const focused = props.focused === 'list';
  return (
    <Panel title="Repositories" note={String(rows.length)} focused={focused}>
      {listing.answer?.outcome === 'answered' && rows.length === 0 ? (
        <EmptyState
          sentence="No repositories yet."
          keyName="a"
          action="to add one"
        />
      ) : (
        <DataList
          items={rows}
          selected={position.index}
          offset={position.offset}
          visible={props.visible}
          focused={focused}
          keyOf={(row) => row.repository.id}
          renderRow={(row, state) => (
            <RepositoryRowLines
              row={row}
              starting={starting.has(row.repository.id)}
              bold={state.bold}
              now={props.now}
            />
          )}
        />
      )}
    </Panel>
  );
}

function DetailsPanel(props: RepositoriesViewProps): ReactNode {
  const { answer } = props.listing;
  const chosen = rowsOf(answer)[props.position.index];
  const { repository } = chosen ?? {};
  return (
    <Panel
      title={
        repository === undefined ? 'Repository' : repositoryName(repository)
      }
      focused={props.focused === 'details'}
    >
      <ProblemDetails
        headline="The list could not be read"
        problem={props.problem}
        next="The screen asks again every second."
      />
      {chosen === undefined ? null : (
        <RepositoryDetails
          row={chosen}
          starting={props.starting.has(chosen.repository.id)}
          work={props.work}
          parameters={props.parameters}
          now={props.now}
          cells={
            layoutOf(props.frame.size) === 'wide'
              ? BAR_CELLS.detail
              : BAR_CELLS.list
          }
        />
      )}
    </Panel>
  );
}

function listHints(props: RepositoriesViewProps): KeyHint[] {
  const chosen = rowsOf(props.listing.answer)[props.position.index];
  const scannable = chosen !== undefined && !isScanning(chosen, props.starting);
  return [
    ...(chosen === undefined
      ? []
      : [
          { key: 'up-down', label: 'move' },
          { key: 'enter', label: 'open' },
        ]),
    ...(scannable ? [{ key: 's', label: 'scan' }] : []),
    { key: 'a', label: 'add' },
    { key: 'tab', label: 'details' },
  ];
}

/** The footer of the list, or of the dialog while it is open. */
function footerOf(props: RepositoriesViewProps): {
  readonly status: ReactNode;
  readonly keys: ReactNode;
  readonly position?: string;
} {
  const { connect, listing, position, starting } = props;
  const freshness = { ...listing, now: props.now };
  if (connect !== undefined) {
    return {
      status: (
        <StatusLine
          path={PATH}
          facts={[connectStatusOf(connect.state)]}
          freshness={freshness}
        />
      ),
      keys: <KeyHints hints={connectHintsOf(connect.state.phase)} />,
    };
  }
  const rows = rowsOf(listing.answer);
  const scanning = rows.filter((row) => isScanning(row, starting)).length;
  return {
    status: (
      <StatusLine
        path={PATH}
        facts={[
          countWords(rows.length, 'repository', 'repositories'),
          countWords(scanning, 'scan running', 'scans running'),
        ]}
        freshness={freshness}
      />
    ),
    keys: <KeyHints hints={listHints(props)} />,
    ...(rows.length === 0
      ? {}
      : {
          position: `row ${String(position.index + 1)} of ${String(rows.length)}`,
        }),
  };
}

/**
 * Which repositories are connected and what is known of each: a list of
 * two lines a row, the selected one beside it, and the dialog that
 * connects one more.
 */
export function RepositoriesView(props: RepositoriesViewProps): ReactNode {
  const { frame, connect } = props;
  const notice = frame.notice ?? props.notice;
  const typing = connect !== undefined && isEditable(connect.state.phase);
  return (
    <AppShell
      {...frame}
      {...(notice === undefined ? {} : { notice })}
      typing={typing}
      body={
        <SplitView
          layout={layoutOf(frame.size)}
          shown={props.focused === 'list' ? 'left' : 'right'}
          left={<ListPanel {...props} />}
          right={<DetailsPanel {...props} />}
        />
      }
      {...footerOf(props)}
      {...(connect === undefined
        ? {}
        : { dialog: <ConnectDialogView {...connect} now={props.now} /> })}
    />
  );
}
