import { Box, Text } from 'ink';
import type { ReactNode } from 'react';

import type { FileCoverage } from '@coverage-autopilot/api-contracts/snapshots';

import { DataList } from '#components/data-list';
import { EmptyState } from '#components/empty-state';
import { Panel } from '#components/panel';
import { RoleText } from '#components/role-text';
import type { ListPosition } from '#hooks/use-selection';
import { FileColumns, FileRow, type RowShape } from '#screens/files/file-row';
import {
  FILE_LISTS,
  type FileList,
  filesOf,
} from '#screens/files/files-answer';
import { GAP, KEY_GAP } from '#theme/widths';

interface FileListPanelProps {
  /** Every file of the snapshot, to count the lists by. */
  readonly items: readonly FileCoverage[];
  /** The files of the chosen list that hold the filter. */
  readonly rows: readonly FileCoverage[];
  readonly chosen: FileList;
  readonly filter: string;
  /** The line of the filter: the field while it types, or what it holds. */
  readonly filterLine: ReactNode;
  readonly position: ListPosition;
  readonly visible: number;
  readonly focused: boolean;
  readonly shape: RowShape;
}

function Tab({
  label,
  count,
  active,
}: {
  readonly label: string;
  readonly count: number;
  readonly active: boolean;
}): ReactNode {
  return active ? (
    <Text underline>
      <RoleText role="accent" bold>{`${label} ${String(count)}`}</RoleText>
    </Text>
  ) : (
    <Text>
      <RoleText>{label}</RoleText>{' '}
      <RoleText role="secondary">{String(count)}</RoleText>
    </Text>
  );
}

/** The four lists, each with its size, and the chosen one underlined. */
function Tabs({
  items,
  chosen,
}: Pick<FileListPanelProps, 'items' | 'chosen'>): ReactNode {
  return (
    <Box gap={KEY_GAP}>
      {FILE_LISTS.map((each) => (
        <Tab
          key={each.label}
          label={each.label}
          count={filesOf(items, { list: each, filter: '' }).length}
          active={each === chosen}
        />
      ))}
    </Box>
  );
}

function Empty({
  filter,
  sentence,
}: {
  readonly filter: string;
  readonly sentence: string;
}): ReactNode {
  return filter === '' ? (
    <EmptyState sentence={sentence} keyName="]" action="to see the next list" />
  ) : (
    <EmptyState
      sentence={`No file of this list holds "${filter}".`}
      keyName="/"
      action="to change the filter"
    />
  );
}

/**
 * The left panel: the four lists, the filter, and the files of the chosen
 * list in the order the service gave them.
 */
export function FileListPanel(props: FileListPanelProps): ReactNode {
  const { chosen } = props;
  return (
    <Panel title="Files" focused={props.focused}>
      <Tabs items={props.items} chosen={chosen} />
      <Box height={1}>{props.filterLine}</Box>
      {props.rows.length === 0 ? (
        <Empty filter={props.filter} sentence={chosen.empty} />
      ) : (
        <DataList
          items={props.rows}
          selected={props.position.index}
          offset={props.position.offset}
          visible={props.visible}
          focused={props.focused}
          keyOf={(file) => file.path}
          header={<FileColumns shape={props.shape} numbers={chosen.numbers} />}
          renderRow={(file, row) => (
            <FileRow file={file} row={row} shape={props.shape} />
          )}
        />
      )}
      {chosen.note === undefined ? null : (
        <Box marginTop={1} paddingLeft={GAP}>
          <RoleText>{chosen.note}</RoleText>
        </Box>
      )}
    </Panel>
  );
}
