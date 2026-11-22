import { Box, Text } from 'ink';
import type { ReactNode } from 'react';

import type { CoverageCounter } from '@coverage-autopilot/api-contracts/coverage';
import type {
  FileCoverage,
  MeasuredFile,
} from '@coverage-autopilot/api-contracts/snapshots';

import { type Coverage, CoverageBar } from '#components/coverage-bar';
import type { RowState } from '#components/data-list';
import { Glyph } from '#components/glyph';
import { RoleText } from '#components/role-text';
import { StatusIndicator } from '#components/status-indicator';
import { coverageRoleOf } from '#theme/bars';
import { percentWords, ratioWords } from '#theme/counts';
import {
  FILE_STATE,
  IMPROVEMENT_STATUS,
  UNMEASURED_REASON,
} from '#theme/status';
import { BAR_CELLS, GAP, PERCENT_CELLS } from '#theme/widths';

/**
 * The columns after the path: the bar with its percentage after a gap,
 * the percentage of the branches, and the work.
 */
const LINES_CELLS = GAP + BAR_CELLS.list + PERCENT_CELLS + GAP;
const BRANCH_CELLS = PERCENT_CELLS + GAP;
/** A status of the work, as `⠹ REVIEW`, after a gap. */
const WORK_CELLS = 10;

/** Which columns a row has room for. Below the wide layout the branches go. */
export interface RowShape {
  readonly wide: boolean;
  readonly threshold: number;
}

/** A counter with nothing to count has no percentage, so it is no code. */
export function counterCoverage(counter: CoverageCounter): Coverage {
  return counter.percentage === null
    ? { state: 'no_executable_code' }
    : { state: 'measured', percent: counter.percentage };
}

/** What the coverage bar draws for a file: numbers, or why there are none. */
function coverageOf(file: FileCoverage): Coverage {
  switch (file.state) {
    case 'measured':
      return counterCoverage(file.coverage.lines);
    case 'unmeasured':
      return {
        state: 'unmeasured',
        reason: UNMEASURED_REASON[file.reason].said,
      };
    case 'no_executable_code':
      return { state: 'no_executable_code' };
  }
}

/** A counter as its percentage, or as `0/0` when it has nothing to count. */
export function CounterPercent({
  counter,
  threshold,
}: {
  readonly counter: CoverageCounter;
  readonly threshold: number;
}): ReactNode {
  return counter.percentage === null ? (
    <RoleText role="secondary">
      {ratioWords(counter.covered, counter.total)}
    </RoleText>
  ) : (
    <RoleText role={coverageRoleOf(counter.percentage, threshold)}>
      {percentWords(counter.percentage)}
    </RoleText>
  );
}

function Path({
  file,
  bold,
}: {
  readonly file: FileCoverage;
  readonly bold: boolean;
}): ReactNode {
  const look = FILE_STATE[file.state];
  return (
    <Text wrap="truncate-start">
      {file.state === 'measured' ? null : (
        <Text>
          <Glyph name={look.glyph} role={look.role} />{' '}
        </Text>
      )}
      <RoleText bold={bold}>{file.path}</RoleText>
    </Text>
  );
}

function Numbers({
  file,
  shape,
}: {
  readonly file: MeasuredFile;
  readonly shape: RowShape;
}): ReactNode {
  const work = file.latestImprovement;
  return (
    <Box flexShrink={0}>
      <Box width={LINES_CELLS} paddingLeft={GAP}>
        <CoverageBar
          coverage={coverageOf(file)}
          threshold={shape.threshold}
          cells={BAR_CELLS.list}
        />
      </Box>
      {shape.wide ? (
        <Box width={BRANCH_CELLS} justifyContent="flex-end">
          <CounterPercent
            counter={file.coverage.branches}
            threshold={shape.threshold}
          />
        </Box>
      ) : null}
      <Box width={WORK_CELLS} paddingLeft={GAP}>
        {work === null ? null : (
          <StatusIndicator look={IMPROVEMENT_STATUS[work.status]} />
        )}
      </Box>
    </Box>
  );
}

/** The cells a row gives to its numbers, so a reason fills the same room. */
function numberCells(shape: RowShape): number {
  return LINES_CELLS + WORK_CELLS + (shape.wide ? BRANCH_CELLS : 0);
}

/**
 * One file of a list. A file without numbers says why in the room of its
 * numbers, and never as a percentage.
 */
export function FileRow({
  file,
  row,
  shape,
}: {
  readonly file: FileCoverage;
  readonly row: RowState;
  readonly shape: RowShape;
}): ReactNode {
  return (
    <Box>
      <Box flexGrow={1} flexShrink={1}>
        <Path file={file} bold={row.bold} />
      </Box>
      {file.state === 'measured' ? (
        <Numbers file={file} shape={shape} />
      ) : (
        <Box width={numberCells(shape)} flexShrink={0} paddingLeft={GAP}>
          <CoverageBar
            coverage={coverageOf(file)}
            threshold={shape.threshold}
            cells={BAR_CELLS.list}
          />
        </Box>
      )}
    </Box>
  );
}

/** The names of the columns, over the rows of a list. */
export function FileColumns({
  shape,
  numbers,
}: {
  readonly shape: RowShape;
  readonly numbers: boolean;
}): ReactNode {
  return (
    <Box flexGrow={1}>
      <Box flexGrow={1}>
        <RoleText role="emphasis">File</RoleText>
      </Box>
      {numbers ? (
        <Box flexShrink={0}>
          <Box width={LINES_CELLS} paddingLeft={GAP}>
            <RoleText role="emphasis">Lines</RoleText>
          </Box>
          {shape.wide ? (
            <Box width={BRANCH_CELLS} justifyContent="flex-end">
              <RoleText role="emphasis">Branch</RoleText>
            </Box>
          ) : null}
          <Box width={WORK_CELLS} paddingLeft={GAP}>
            <RoleText role="emphasis">Work</RoleText>
          </Box>
        </Box>
      ) : (
        <Box width={numberCells(shape)} flexShrink={0} paddingLeft={GAP}>
          <RoleText role="emphasis">Why</RoleText>
        </Box>
      )}
    </Box>
  );
}
