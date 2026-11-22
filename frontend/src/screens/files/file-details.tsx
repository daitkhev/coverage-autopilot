import { Box, Text } from 'ink';
import type { ReactNode } from 'react';

import type { Threshold } from '@coverage-autopilot/api-contracts/coverage';
import type {
  FileCoverage,
  LineRange,
  MeasuredFile,
  NoCodeFile,
  UnmeasuredFile,
} from '@coverage-autopilot/api-contracts/snapshots';
import type { CoverageMetric } from '@coverage-autopilot/api-contracts/statuses';

import { CoverageBar } from '#components/coverage-bar';
import { counterCoverage, CounterPercent } from '#components/coverage-change';
import { ErrorDetails } from '#components/error-details';
import { type KeyHint, KeyHints } from '#components/key-hints';
import { Panel } from '#components/panel';
import { RoleText } from '#components/role-text';
import { Section } from '#components/section';
import { StatusIndicator } from '#components/status-indicator';
import { percentWords, ratioWords } from '#theme/counts';
import {
  FILE_STATE,
  IMPROVEMENT_STATUS,
  UNMEASURED_REASON,
} from '#theme/status';
import { BAR_CELLS, GAP } from '#theme/widths';

/** The cells of a label in the panel, as long as "Statements" and a gap. */
const LABEL_CELLS = 12;

/** The four counters, in the order the mock-ups list them. */
const COUNTERS: readonly (readonly [CoverageMetric, string])[] = [
  ['lines', 'Lines'],
  ['branches', 'Branches'],
  ['functions', 'Functions'],
  ['statements', 'Statements'],
];

interface DetailsProps {
  readonly file: FileCoverage;
  readonly threshold: Threshold;
  readonly focused: boolean;
  /** Whether the counts fit beside the bars. */
  readonly roomy: boolean;
}

/** Lines that hold an open branch, or nothing when none does. */
function linesWords(lines: readonly string[]): string {
  return lines.length === 0 ? '' : `open on lines ${lines.join(', ')}`;
}

function rangeWords(range: LineRange): string {
  return range.start === range.end
    ? String(range.start)
    : `${String(range.start)}-${String(range.end)}`;
}

function Fact({
  label,
  children,
}: {
  readonly label: string;
  readonly children: string;
}): ReactNode {
  return (
    <Box>
      <Box width={LABEL_CELLS} flexShrink={0}>
        <RoleText role="secondary">{label}</RoleText>
      </Box>
      <RoleText>{children === '' ? 'none' : children}</RoleText>
    </Box>
  );
}

/** Each line of the hints of a panel, one key on each. */
function NextKeys({
  hints,
}: {
  readonly hints: readonly KeyHint[];
}): ReactNode {
  return (
    <Section title="NEXT">
      {hints.map((hint) => (
        <KeyHints key={hint.key} hints={[hint]} />
      ))}
    </Section>
  );
}

function Counters({
  file,
  threshold,
  roomy,
}: Omit<DetailsProps, 'focused' | 'file'> & {
  readonly file: MeasuredFile;
}): ReactNode {
  return (
    <Section title={`COVERAGE threshold ${percentWords(threshold.percentage)}`}>
      {COUNTERS.map(([metric, label]) => {
        const counter = file.coverage[metric];
        return (
          <Box key={metric}>
            <Box width={LABEL_CELLS} flexShrink={0}>
              <RoleText>{label}</RoleText>
            </Box>
            <CoverageBar
              coverage={counterCoverage(counter)}
              threshold={threshold.percentage}
              cells={BAR_CELLS.list}
            />
            {roomy ? (
              <Box flexGrow={1} justifyContent="flex-end" paddingLeft={GAP}>
                <RoleText role="secondary">
                  {ratioWords(counter.covered, counter.total)}
                </RoleText>
              </Box>
            ) : null}
          </Box>
        );
      })}
    </Section>
  );
}

function Measured(
  props: DetailsProps & { readonly file: MeasuredFile },
): ReactNode {
  const { file, threshold } = props;
  const work = file.latestImprovement;
  return (
    <Panel title={file.path} focused={props.focused}>
      <Text>
        <CounterPercent
          counter={file.coverage[threshold.metric]}
          threshold={threshold.percentage}
        />
        <RoleText role="secondary">{` of ${threshold.metric}`}</RoleText>
      </Text>
      <Counters file={file} threshold={threshold} roomy={props.roomy} />
      <Section title="NOT COVERED">
        <Fact label="Lines">
          {file.uncoveredLines.map(rangeWords).join(', ')}
        </Fact>
        <Fact label="Branches">
          {linesWords(file.openBranchLines.map(String))}
        </Fact>
        <Fact label="Functions">
          {file.uncoveredFunctions.map((each) => each.name).join(', ')}
        </Fact>
      </Section>
      <Section title="LATEST WORK">
        {work === null ? (
          <RoleText role="secondary">no improvement yet</RoleText>
        ) : (
          <StatusIndicator look={IMPROVEMENT_STATUS[work.status]} />
        )}
      </Section>
      <NextKeys
        hints={[
          { key: 'i', label: 'improve this file' },
          ...(work === null ? [] : [{ key: 'enter', label: 'open the work' }]),
        ]}
      />
    </Panel>
  );
}

function Unmeasured({ file }: { readonly file: UnmeasuredFile }): ReactNode {
  const reason = UNMEASURED_REASON[file.reason];
  return (
    <Panel title={file.path} focused tone="warning">
      <ErrorDetails
        look={FILE_STATE.unmeasured}
        headline="Not measured"
        code={file.reason}
        explanation={`The file ${reason.said}. It has no numbers at all, and cannot be improved until a scan measures it.`}
        {...(file.toolMessage === null
          ? {}
          : { answer: { heading: 'THE TOOL SAID', text: file.toolMessage } })}
        next={reason.next}
      />
      <NextKeys
        hints={[{ key: 'i', label: 'improve', inactive: 'after a scan' }]}
      />
    </Panel>
  );
}

function WithoutCode({
  file,
  focused,
}: {
  readonly file: NoCodeFile;
  readonly focused: boolean;
}): ReactNode {
  return (
    <Panel title={file.path} focused={focused}>
      <StatusIndicator look={FILE_STATE.no_executable_code} />
      <RoleText>
        The file has no executable code, so it has no numbers and is never a
        target.
      </RoleText>
      <NextKeys
        hints={[{ key: 'i', label: 'improve', inactive: 'no code to test' }]}
      />
    </Panel>
  );
}

/**
 * The selected file: its four counters and what is not covered, or, for a
 * file without numbers, why, what the tool said and what to do.
 */
export function FileDetails(props: DetailsProps): ReactNode {
  const { file } = props;
  switch (file.state) {
    case 'measured':
      return <Measured {...props} file={file} />;
    case 'unmeasured':
      return <Unmeasured file={file} />;
    case 'no_executable_code':
      return <WithoutCode file={file} focused={props.focused} />;
  }
}
