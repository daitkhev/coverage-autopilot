import { Box, Text } from 'ink';
import type { ReactNode } from 'react';

import type { Improvement } from '@coverage-autopilot/api-contracts/improvements';

import { DataList } from '#components/data-list';
import { FactLine } from '#components/fact-line';
import { RoleText } from '#components/role-text';
import { Rule } from '#components/rule';
import { StatusIndicator } from '#components/status-indicator';
import { GROUP_ORDER } from '#screens/improvements/improvement-listing';
import {
  ageMomentOf,
  besideWords,
  GROUP_LOOKS,
  type GroupName,
  groupOf,
} from '#screens/improvements/improvement-words';
import { ageWords } from '#theme/moments';
import { IMPROVEMENT_STATUS } from '#theme/status';
import { GAP, type TerminalSize } from '#theme/widths';

/** The cells of the widest status, `■ CANCEL`. */
const STATUS_CELLS = 8;

/** The header, the footer and the frame of the panel. */
const CHROME_ROWS = 7;

/** A heading for each of the four groups, and "more below". */
const RESERVED_ROWS = GROUP_ORDER.length + 1;

const ROW_LINES = 2;

/** How many improvements fit in the list, each on two lines. */
export function visibleRowsOf(size: TerminalSize): number {
  return Math.max(
    1,
    Math.floor((size.rows - CHROME_ROWS - RESERVED_ROWS) / ROW_LINES),
  );
}

/** The moment now and the zone of the user. */
interface Moment {
  readonly now: string;
  readonly timeZone: string;
}

interface ImprovementListProps {
  /** Every improvement, in the order of its group. */
  readonly improvements: readonly Improvement[];
  readonly names: ReadonlyMap<string, string>;
  readonly selected: number;
  readonly offset: number;
  readonly visible: number;
  readonly focused: boolean;
  readonly moment: Moment;
}

/** The improvements of one group that are on the screen. */
interface Slice {
  readonly group: GroupName;
  /** The place of its first improvement in the whole list. */
  readonly start: number;
  readonly items: readonly Improvement[];
}

function slicesOf(
  improvements: readonly Improvement[],
  { offset, visible }: Pick<ImprovementListProps, 'offset' | 'visible'>,
): Slice[] {
  const drawn = improvements.slice(offset, offset + visible);
  return GROUP_ORDER.flatMap((group) => {
    const items = drawn.filter((each) => groupOf(each) === group);
    const first = items[0];
    return first === undefined
      ? []
      : [{ group, start: improvements.indexOf(first), items }];
  });
}

function GroupHeading({
  group,
  count,
}: {
  readonly group: GroupName;
  readonly count: number;
}): ReactNode {
  const look = GROUP_LOOKS[group];
  return (
    <Box>
      <Text>
        <RoleText role={look.role} bold>
          {look.title}
        </RoleText>
        <RoleText>{` ${String(count)} `}</RoleText>
      </Text>
      <Rule />
    </Box>
  );
}

function ImprovementRow({
  improvement,
  name,
  bold,
  moment,
}: {
  readonly improvement: Improvement;
  readonly name: string;
  readonly bold: boolean;
  readonly moment: Moment;
}): ReactNode {
  return (
    <Box flexDirection="column">
      <Box gap={GAP}>
        <Box width={STATUS_CELLS} flexShrink={0}>
          <StatusIndicator look={IMPROVEMENT_STATUS[improvement.status]} />
        </Box>
        <Box flexGrow={1}>
          <RoleText bold={bold} truncate>
            {improvement.targetFile}
          </RoleText>
        </Box>
        <RoleText role="secondary">
          {ageWords(ageMomentOf(improvement), moment.now)}
        </RoleText>
      </Box>
      <Box paddingLeft={STATUS_CELLS + GAP}>
        <FactLine
          facts={[
            { text: name },
            { text: besideWords(improvement, moment.timeZone) },
          ]}
        />
      </Box>
    </Box>
  );
}

/**
 * Every improvement under the heading of what it needs, each on two
 * lines: its status, file and age, then its repository and what it does
 * or waits for. A group that is scrolled into keeps its heading.
 */
export function ImprovementList(props: ImprovementListProps): ReactNode {
  const { improvements, names, selected, moment } = props;
  const below = improvements.length - props.offset - props.visible;
  return (
    <Box flexDirection="column">
      {slicesOf(improvements, props).map((slice) => (
        <Box key={slice.group} flexDirection="column">
          <GroupHeading
            group={slice.group}
            count={
              improvements.filter((each) => groupOf(each) === slice.group)
                .length
            }
          />
          <DataList
            items={slice.items}
            selected={selected - slice.start}
            offset={0}
            visible={slice.items.length}
            focused={props.focused}
            keyOf={(improvement) => improvement.id}
            renderRow={(improvement, row) => (
              <ImprovementRow
                improvement={improvement}
                name={
                  names.get(improvement.repositoryId) ??
                  improvement.repositoryId
                }
                bold={row.bold}
                moment={moment}
              />
            )}
          />
        </Box>
      ))}
      {below > 0 ? (
        <Box paddingLeft={GAP}>
          <RoleText role="secondary">{`${String(below)} more below`}</RoleText>
        </Box>
      ) : null}
    </Box>
  );
}
