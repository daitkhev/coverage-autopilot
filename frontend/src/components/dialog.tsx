import { Box } from 'ink';
import type { ReactNode } from 'react';

import { DataList } from '#components/data-list';
import { type KeyHint, KeyHints } from '#components/key-hints';
import { Panel, type PanelTone } from '#components/panel';
import { RoleText } from '#components/role-text';
import { type KeyHandlers, useKeys } from '#hooks/use-keys';
import { useSelection } from '#hooks/use-selection';
import { BLANK_FILL } from '#theme/roles';

/** A numbered answer. The answer that destroys work is drawn red. */
export interface Answer {
  readonly label: string;
  readonly destroys?: boolean;
}

interface DialogProps {
  readonly title: string;
  readonly width: number;
  /** Yellow for a question about what cannot be undone, red for a failure. */
  readonly tone?: PanelTone;
  /** The answers of a question, the one that changes nothing first. */
  readonly answers?: readonly Answer[];
  readonly hints: readonly KeyHint[];
  /** `enter`, with the chosen answer. A form gets the first. */
  readonly onConfirm: (answer: number) => void;
  /** `esc`, which closes with no change. */
  readonly onClose: () => void;
  /** The sentences of a question, or the fields of a form. */
  readonly children?: ReactNode;
}

/** The answers that a digit picks: `1` to `9`. */
const PICKED_BY_DIGIT = 9;

function digitKeys(count: number, pick: (answer: number) => void): KeyHandlers {
  return Object.fromEntries(
    Array.from({ length: Math.min(count, PICKED_BY_DIGIT) }, (_, answer) => [
      String(answer + 1),
      () => {
        pick(answer);
      },
    ]),
  );
}

function Answers({
  answers,
  selected,
}: {
  readonly answers: readonly Answer[];
  readonly selected: number;
}): ReactNode {
  return (
    <Box marginTop={1}>
      <DataList
        items={answers}
        selected={selected}
        offset={0}
        visible={answers.length}
        focused
        keyOf={(answer) => answer.label}
        renderRow={(answer, row) => (
          <RoleText
            role={answer.destroys === true ? 'danger' : 'primary'}
            bold={row.bold}
          >
            {`${String(answers.indexOf(answer) + 1)}. ${answer.label}`}
          </RoleText>
        )}
      />
    </Box>
  );
}

/**
 * A panel over the screen: a question or a form. It takes every key while
 * it is open. A digit picks an answer and only `enter` confirms it, so
 * nothing irreversible happens on one key.
 */
export function Dialog(props: DialogProps): ReactNode {
  const answers = props.answers ?? [];
  const selection = useSelection({
    count: answers.length,
    visible: answers.length,
  });
  useKeys(
    {
      ...digitKeys(answers.length, selection.moveTo),
      up: () => {
        selection.moveBy(-1);
      },
      down: () => {
        selection.moveBy(1);
      },
      enter: () => {
        props.onConfirm(selection.index);
      },
      esc: props.onClose,
    },
    { active: true },
  );
  return (
    <Box width={props.width} backgroundColor={BLANK_FILL}>
      <Panel
        title={props.title}
        focused
        {...(props.tone === undefined ? {} : { tone: props.tone })}
      >
        {props.children}
        {answers.length === 0 ? null : (
          <Answers answers={answers} selected={selection.index} />
        )}
        <Box marginTop={1}>
          <KeyHints hints={props.hints} joined />
        </Box>
      </Panel>
    </Box>
  );
}
