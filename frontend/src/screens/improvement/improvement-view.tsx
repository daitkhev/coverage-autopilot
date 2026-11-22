import { type ReactNode, useState } from 'react';

import type { Improvement } from '@coverage-autopilot/api-contracts/improvements';
import type { Repository } from '@coverage-autopilot/api-contracts/repositories';

import type { ClientSession } from '#api/client-session';
import { AppShell, type ShellFrame } from '#components/app-shell';
import { type KeyHint, KeyHints } from '#components/key-hints';
import { SplitView } from '#components/split-view';
import { type Freshness, StatusLine } from '#components/status-line';
import { useFocusRing } from '#hooks/use-focus-ring';
import { useKeys } from '#hooks/use-keys';
import { type Selection, useSelection } from '#hooks/use-selection';
import { CancelQuestion } from '#screens/improvement/cancel-question';
import {
  acceptedOf,
  endOf,
  hasEnded,
} from '#screens/improvement/improvement-answer';
import { type Choice, Ending } from '#screens/improvement/improvement-ending';
import { Facts } from '#screens/improvement/improvement-facts';
import { History } from '#screens/improvement/improvement-history';
import {
  improvementHints,
  improvementKeys,
  type ImprovementKeysState,
  type ImprovementPanel,
} from '#screens/improvement/improvement-keys';
import { StepLine } from '#screens/improvement/step-line';
import { ageWords } from '#theme/moments';
import { repositoryName } from '#theme/names';
import { layoutOf } from '#theme/widths';

interface ImprovementViewProps {
  readonly session: ClientSession;
  readonly frame: ShellFrame;
  readonly improvement: Improvement;
  readonly repository: Repository;
  readonly freshness: Freshness;
  readonly onOpenPatch: (improvementId: string) => void;
  readonly onBack: () => void;
}

const PANELS: readonly [ImprovementPanel, ImprovementPanel] = ['work', 'facts'];

/** The question lists its own keys. The one that always works is here. */
const QUESTION_HINTS: readonly KeyHint[] = [{ key: 'esc', label: 'keep' }];

/** Where the person is: the panel, the chosen next step, the question. */
interface Place {
  readonly state: ImprovementKeysState;
  readonly choice: Selection;
  readonly asking: boolean;
  readonly close: () => void;
}

/** A failed improvement offers its patch when one passed, and the way back. */
function choicesOf(props: ImprovementViewProps): Choice[] {
  const { improvement } = props;
  if (improvement.status !== 'failed') {
    return [];
  }
  const accepted = acceptedOf(improvement);
  const patch =
    accepted === undefined
      ? []
      : [
          {
            label: `Show the patch of attempt ${String(accepted.number)}`,
            run: () => {
              props.onOpenPatch(improvement.id);
            },
          },
        ];
  return [...patch, { label: 'Go back', run: props.onBack }];
}

function usePlace(props: ImprovementViewProps): Place {
  const [asking, setAsking] = useState(false);
  const ring = useFocusRing(PANELS);
  const choices = choicesOf(props);
  const choice = useSelection({
    count: choices.length,
    visible: choices.length,
  });
  const state = {
    focused: ring.focused,
    layout: layoutOf(props.frame.size),
    improvement: props.improvement,
    choices,
  };
  const actions = {
    choice,
    focus: ring.focus,
    next: ring.next,
    ask: () => {
      setAsking(true);
    },
    openPatch: props.onOpenPatch,
    back: props.onBack,
  };
  // The screen is not behind the backdrop of its own shell, so it says
  // itself that the question takes every key.
  useKeys(improvementKeys(state, actions), { active: !asking });
  const close = (): void => {
    setAsking(false);
  };
  return { state, choice, asking, close };
}

function Body({
  props,
  place,
}: {
  readonly props: ImprovementViewProps;
  readonly place: Place;
}): ReactNode {
  const { improvement, repository, session } = props;
  const { state } = place;
  const work = state.focused === 'work';
  const now = session.now();
  const threshold = repository.latestSnapshot?.threshold.percentage;
  return (
    <SplitView
      layout={state.layout}
      shown={work ? 'left' : 'right'}
      left={
        hasEnded(improvement) ? (
          <Ending
            improvement={improvement}
            threshold={threshold}
            now={now}
            focused={work}
            choices={state.choices}
            chosen={place.choice.index}
          />
        ) : (
          <History
            improvement={improvement}
            now={now}
            timeZone={session.timeZone}
            focused={work}
          />
        )
      }
      right={
        <Facts
          improvement={improvement}
          repository={repository}
          threshold={threshold}
          focused={!work}
        />
      }
    />
  );
}

/**
 * How long ago the work ended, or that running work goes on without the
 * client. How old the work is the history says on its last line.
 */
function statusFacts(props: ImprovementViewProps, place: Place): string[] {
  const { improvement } = props;
  const now = props.session.now();
  if (place.asking) {
    return ['waiting for your answer'];
  }
  return hasEnded(improvement)
    ? [`${improvement.status} ${ageWords(endOf(improvement, now), now)} ago`]
    : ['closing this window stops nothing'];
}

/**
 * One improvement: the step line, the history of the work or how it
 * ended, the facts beside it, and the question before a cancel.
 */
export function ImprovementView(props: ImprovementViewProps): ReactNode {
  const place = usePlace(props);
  const { improvement, repository } = props;
  return (
    <AppShell
      {...props.frame}
      context={<StepLine improvement={improvement} now={props.session.now()} />}
      body={<Body props={props} place={place} />}
      status={
        <StatusLine
          path={[
            'Improvements',
            repositoryName(repository),
            improvement.targetFile,
          ]}
          facts={statusFacts(props, place)}
          freshness={props.freshness}
        />
      }
      keys={
        <KeyHints
          hints={place.asking ? QUESTION_HINTS : improvementHints(place.state)}
        />
      }
      {...(place.asking
        ? {
            dialog: (
              <CancelQuestion
                session={props.session}
                improvement={improvement}
                onClose={place.close}
              />
            ),
          }
        : {})}
    />
  );
}
