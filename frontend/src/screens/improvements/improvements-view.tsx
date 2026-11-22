import type { ReactNode } from 'react';

import type { Improvement } from '@coverage-autopilot/api-contracts/improvements';

import { AppShell, type ShellFrame } from '#components/app-shell';
import { EmptyState } from '#components/empty-state';
import { type KeyHint, KeyHints } from '#components/key-hints';
import { TYPING_HINTS } from '#components/list-filter';
import { Panel } from '#components/panel';
import { type Problem, ProblemDetails } from '#components/problem-details';
import { SplitView } from '#components/split-view';
import { StatusLine } from '#components/status-line';
import type { DatedRequest } from '#hooks/use-dated-request';
import type { ListPosition } from '#hooks/use-selection';
import {
  filterHints,
  isNarrowed,
  type Narrowing,
  narrowingFacts,
} from '#screens/improvements/improvement-filters';
import { ImprovementList } from '#screens/improvements/improvement-list';
import type { Listing } from '#screens/improvements/improvement-listing';
import { ImprovementSummary } from '#screens/improvements/improvement-summary';
import { groupOf } from '#screens/improvements/improvement-words';
import { countWords } from '#theme/counts';
import { type Layout, layoutOf } from '#theme/widths';

/** The list and the panel of the selected improvement. */
export const IMPROVEMENTS_PANELS = ['list', 'details'] as const;

type ImprovementsPanel = (typeof IMPROVEMENTS_PANELS)[number];

interface ImprovementsViewProps {
  readonly frame: ShellFrame;
  readonly listing: DatedRequest<Listing>;
  /** What the list is narrowed to, and the field of its filter. */
  readonly narrowing: Narrowing;
  /** What went wrong with the last request, beside the list it keeps. */
  readonly problem: Problem | undefined;
  readonly moment: { readonly now: string; readonly timeZone: string };
  readonly position: ListPosition;
  readonly visible: number;
  readonly focused: ImprovementsPanel;
}

const NO_NAMES: ReadonlyMap<string, string> = new Map();

const PATH = ['Improvements'];

function answeredOf(listing: Listing | undefined): {
  readonly improvements: readonly Improvement[];
  readonly names: ReadonlyMap<string, string>;
} {
  return listing?.outcome === 'answered'
    ? listing
    : { improvements: [], names: NO_NAMES };
}

/** No improvement at all, or none the filters leave. */
function Empty({ narrowed }: { readonly narrowed: boolean }): ReactNode {
  return narrowed ? (
    <EmptyState
      sentence="No improvement matches the filters."
      keyName="f, r or /"
      action="to change them"
    />
  ) : (
    <EmptyState
      sentence="No improvements yet."
      keyName="1"
      action="to choose a repository"
    />
  );
}

function ListPanel(props: ImprovementsViewProps): ReactNode {
  const { improvements, names } = answeredOf(props.listing.answer);
  const empty =
    props.listing.answer?.outcome === 'answered' && improvements.length === 0;
  return (
    <Panel
      title="Improvements"
      note={String(improvements.length)}
      focused={props.focused === 'list'}
    >
      {props.narrowing.path.line}
      {empty ? (
        <Empty narrowed={isNarrowed(props.narrowing)} />
      ) : (
        <ImprovementList
          improvements={improvements}
          names={names}
          selected={props.position.index}
          offset={props.position.offset}
          visible={props.visible}
          focused={props.focused === 'list'}
          moment={props.moment}
        />
      )}
    </Panel>
  );
}

function DetailsPanel(props: ImprovementsViewProps): ReactNode {
  const { answer } = props.listing;
  const { improvements, names } = answeredOf(answer);
  const chosen = improvements[props.position.index];
  const title =
    chosen === undefined
      ? 'Improvement'
      : `${names.get(chosen.repositoryId) ?? chosen.repositoryId} · ${chosen.targetFile}`;
  return (
    <Panel title={title} focused={props.focused === 'details'}>
      <ProblemDetails
        headline="The list could not be read"
        problem={props.problem}
        next="The screen asks again every second."
      />
      {chosen === undefined ? null : (
        <ImprovementSummary improvement={chosen} moment={props.moment} />
      )}
    </Panel>
  );
}

function statusFacts(props: ImprovementsViewProps): string[] {
  const { improvements, names } = answeredOf(props.listing.answer);
  const count = (group: ReturnType<typeof groupOf>): number =>
    improvements.filter((each) => groupOf(each) === group).length;
  return [
    ...narrowingFacts(props.narrowing, names),
    countWords(count('needsYou'), 'needs you', 'need you'),
    `${String(count('running'))} running`,
    `${String(count('waiting'))} waiting`,
  ];
}

function listHints(count: number, layout: Layout): KeyHint[] {
  return [
    ...(count === 0
      ? []
      : [
          { key: 'up-down', label: 'move' },
          { key: 'enter', label: 'open' },
        ]),
    ...filterHints(layout),
    { key: 'tab', label: 'details' },
  ];
}

/** The keys that work now: the filter's while it types, else the list's. */
function keyHintsOf(props: ImprovementsViewProps, count: number): KeyHint[] {
  return props.narrowing.path.typing
    ? [...TYPING_HINTS]
    : listHints(count, layoutOf(props.frame.size));
}

/**
 * All improvements of all repositories, grouped by what they need, and
 * the selected one in short with its next step.
 */
export function ImprovementsView(props: ImprovementsViewProps): ReactNode {
  const { frame, listing, moment, position } = props;
  const { improvements } = answeredOf(listing.answer);
  return (
    <AppShell
      {...frame}
      typing={props.narrowing.path.typing}
      body={
        <SplitView
          layout={layoutOf(frame.size)}
          shown={props.focused === 'list' ? 'left' : 'right'}
          left={<ListPanel {...props} />}
          right={<DetailsPanel {...props} />}
        />
      }
      status={
        <StatusLine
          path={PATH}
          facts={statusFacts(props)}
          freshness={{ ...listing, now: moment.now }}
        />
      }
      {...(improvements.length === 0
        ? {}
        : {
            position: `row ${String(position.index + 1)} of ${String(improvements.length)}`,
          })}
      keys={<KeyHints hints={keyHintsOf(props, improvements.length)} />}
    />
  );
}
