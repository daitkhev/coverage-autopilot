import { type ReactNode, useEffect, useState } from 'react';

import type {
  BudgetSettings,
  Improvement,
  StartImprovementRequest,
} from '@coverage-autopilot/api-contracts/improvements';

import { Dialog } from '#components/dialog';
import type { KeyHint } from '#components/key-hints';
import { StartForm } from '#components/start-form';
import {
  changed,
  fieldsOf,
  type LimitField,
  type Limits,
  limitsOf,
  type StartFacts,
} from '#components/start-limits';
import { StageContent, stageOf, StartOutcome } from '#components/start-stage';
import type { Reply } from '#components/unanswered-body';
import { type ActionState, useAction } from '#hooks/use-action';
import { type KeyHandlers, useKeys } from '#hooks/use-keys';
import { DIALOG_WIDTH } from '#theme/widths';

/** As wide as the list of commands: the widest dialog that fits in 80. */
const FORM_WIDTH = DIALOG_WIDTH.palette;

/** What a start asks the service: the preflight with the limits, the start. */
interface StartCalls {
  readonly prepare: () => Promise<Reply<StartFacts>>;
  /** One start for one confirmation: a new key each time. */
  readonly start: (
    request: StartImprovementRequest,
  ) => Promise<Reply<Improvement>>;
}

interface StartDialogProps {
  readonly calls: StartCalls;
  readonly snapshotId: string;
  readonly filePath: string;
  readonly onOpenImprovement: (improvementId: string) => void;
  readonly onClose: () => void;
}

/** The improvement a refusal names, which `enter` then opens. */
function namedBy(state: ActionState<Reply<Improvement>>): string | undefined {
  return state.phase === 'ended' && state.outcome.outcome === 'refused'
    ? state.outcome.error.improvementId
    : undefined;
}

const CLOSE: KeyHint = { key: 'esc', label: 'close' };

const CHECK_AGAIN: KeyHint = { key: 'enter', label: 'check again' };

/** The keys of the form. A refusal that names an improvement opens it. */
function readyHints(start: ActionState<Reply<Improvement>>): KeyHint[] {
  const enter = namedBy(start) === undefined ? 'start' : 'open it';
  return [
    { key: 'enter', label: enter },
    { key: 'tab', label: 'next field' },
    { key: '- +', label: 'change' },
    CLOSE,
  ];
}

/** Starts the improvement, and opens it once the service took it. */
async function begin(
  calls: StartCalls,
  request: StartImprovementRequest,
  onStarted: (improvementId: string) => void,
): Promise<Reply<Improvement>> {
  const answer = await calls.start(request);
  if (answer.outcome === 'answered') {
    onStarted(answer.value.id);
  }
  return answer;
}

function requestOf(
  props: StartDialogProps,
  limits: Limits,
): StartImprovementRequest {
  const { attempts, tokens, minutes, mode } = limits;
  return {
    snapshotId: props.snapshotId,
    filePath: props.filePath,
    mode,
    budget: { attempts, tokens, minutes },
  };
}

/** The chosen limits and the field the arrows change. */
interface Form {
  readonly limits: Limits;
  readonly field: LimitField;
}

function formKeys({
  count,
  index,
  choose,
  change,
}: {
  readonly count: number;
  readonly index: number;
  readonly choose: (index: number) => void;
  readonly change: (by: number) => void;
}): KeyHandlers {
  const next = (): void => {
    choose((index + 1) % count);
  };
  const less = (): void => {
    change(-1);
  };
  const more = (): void => {
    change(1);
  };
  return {
    tab: next,
    down: next,
    up: () => {
      choose((index + count - 1) % count);
    },
    left: less,
    '-': less,
    right: more,
    '+': more,
  };
}

/**
 * The limits of the form, from the defaults of the service until the
 * person changes one, and the field the arrows change.
 */
function useForm(settings: BudgetSettings): Form {
  const [limits, setLimits] = useState(() => limitsOf(settings));
  const [index, setIndex] = useState(0);
  const fields = fieldsOf(settings);
  const field = fields[index] ?? fields[0];
  useKeys(
    formKeys({
      count: fields.length,
      index,
      choose: setIndex,
      change: (by) => {
        setLimits(changed(limits, { field, by, settings }));
      },
    }),
    { active: true },
  );
  return { limits, field };
}

/**
 * The form once the preflight passed. `enter` starts the improvement, or
 * opens the one a refusal names.
 */
function ReadyDialog({
  props,
  facts,
}: {
  readonly props: StartDialogProps;
  readonly facts: StartFacts;
}): ReactNode {
  const start = useAction<Reply<Improvement>>();
  const form = useForm(facts.settings);
  const confirm = (): void => {
    const named = namedBy(start.state);
    if (named === undefined) {
      const request = requestOf(props, form.limits);
      start.start(() => begin(props.calls, request, props.onOpenImprovement));
    } else {
      props.onOpenImprovement(named);
    }
  };
  return (
    <Dialog
      title={`Improve ${props.filePath}`}
      width={FORM_WIDTH}
      hints={readyHints(start.state)}
      onConfirm={confirm}
      onClose={props.onClose}
    >
      <StartForm facts={facts} limits={form.limits} field={form.field} />
      <StartOutcome state={start.state} />
    </Dialog>
  );
}

/**
 * The dialog between a file and its work: the preflight, the limits with
 * their maximums, and one start for one confirmation. A refusal stays in
 * the dialog with its sentence, and one that names an improvement opens
 * it on `enter`.
 */
export function StartDialog(props: StartDialogProps): ReactNode {
  const prepare = useAction<Reply<StartFacts>>();
  const check = (): void => {
    prepare.start(props.calls.prepare);
  };
  useEffect(check, []);
  const stage = stageOf(prepare.state);
  if (stage.kind === 'ready') {
    return <ReadyDialog props={props} facts={stage.facts} />;
  }
  return (
    <Dialog
      title={`Improve ${props.filePath}`}
      width={FORM_WIDTH}
      hints={stage.kind === 'preparing' ? [CLOSE] : [CHECK_AGAIN, CLOSE]}
      onConfirm={stage.kind === 'preparing' ? () => undefined : check}
      onClose={props.onClose}
    >
      <StageContent stage={stage} />
    </Dialog>
  );
}
