import type { ReactNode } from 'react';

import { DataList } from '#components/data-list';
import type { Answer } from '#components/dialog';
import { RoleText } from '#components/role-text';

interface AnswerListProps {
  /** The answers, the one that changes nothing first. */
  readonly answers: readonly Answer[];
  readonly selected: number;
  readonly focused: boolean;
}

/**
 * The numbered answers of a question that stays on the screen, outside a
 * dialog. The chosen one is marked, and the answer that destroys work is
 * red, as in a dialog.
 */
export function AnswerList({
  answers,
  selected,
  focused,
}: AnswerListProps): ReactNode {
  return (
    <DataList
      items={answers}
      selected={selected}
      offset={0}
      visible={answers.length}
      focused={focused}
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
  );
}
