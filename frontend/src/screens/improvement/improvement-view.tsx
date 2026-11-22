import type { ReactNode } from 'react';

import type { Improvement } from '@coverage-autopilot/api-contracts/improvements';
import type { Repository } from '@coverage-autopilot/api-contracts/repositories';

import type { ClientSession } from '#api/client-session';
import { AppShell, type ShellFrame } from '#components/app-shell';
import { KeyHints } from '#components/key-hints';
import { SplitView } from '#components/split-view';
import { type Freshness, StatusLine } from '#components/status-line';
import { endOf, hasEnded } from '#screens/improvement/improvement-answer';
import {
  dialogFacts,
  dialogHints,
  ImprovementDialog,
} from '#screens/improvement/improvement-dialog';
import { Ending } from '#screens/improvement/improvement-ending';
import { Facts } from '#screens/improvement/improvement-facts';
import { History } from '#screens/improvement/improvement-history';
import { improvementHints } from '#screens/improvement/improvement-keys';
import { type Place, usePlace } from '#screens/improvement/improvement-place';
import { StepLine } from '#screens/improvement/step-line';
import { ageWords } from '#theme/moments';
import { repositoryName } from '#theme/names';

interface ImprovementViewProps {
  readonly session: ClientSession;
  readonly frame: ShellFrame;
  readonly improvement: Improvement;
  readonly repository: Repository;
  readonly freshness: Freshness;
  readonly onOpenPatch: (improvementId: string) => void;
  /** Shows other work in place of this one, such as work started here. */
  readonly onOpenImprovement: (improvementId: string) => void;
  readonly onBack: () => void;
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
  if (place.dialog !== undefined) {
    return dialogFacts(place.dialog);
  }
  return hasEnded(improvement)
    ? [`${improvement.status} ${ageWords(endOf(improvement, now), now)} ago`]
    : ['closing this window stops nothing'];
}

function dialogOf(
  props: ImprovementViewProps,
  place: Place,
): { readonly dialog?: ReactNode } {
  const { dialog } = place;
  return dialog === undefined
    ? {}
    : {
        dialog: (
          <ImprovementDialog
            dialog={dialog}
            session={props.session}
            improvement={props.improvement}
            onStarted={(improvementId) => {
              place.leave();
              props.onOpenImprovement(improvementId);
            }}
            onClose={place.close}
          />
        ),
      };
}

/**
 * One improvement: the step line, the history of the work or how it
 * ended, the facts beside it, and the dialog over them: the question
 * before a cancel, or a start of more work, which then shows in place.
 */
export function ImprovementView(props: ImprovementViewProps): ReactNode {
  const place = usePlace(props);
  const { improvement, repository } = props;
  const notice = props.frame.notice ?? place.notice;
  return (
    <AppShell
      {...props.frame}
      {...(notice === undefined ? {} : { notice })}
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
          hints={
            place.dialog === undefined
              ? improvementHints(place.state)
              : dialogHints(place.dialog)
          }
        />
      }
      {...dialogOf(props, place)}
    />
  );
}
