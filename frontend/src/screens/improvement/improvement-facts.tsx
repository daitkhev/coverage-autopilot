import { Box } from 'ink';
import type { ReactNode } from 'react';

import type { Improvement } from '@coverage-autopilot/api-contracts/improvements';
import type { Repository } from '@coverage-autopilot/api-contracts/repositories';
import type { CoverageMetric } from '@coverage-autopilot/api-contracts/statuses';

import { Clipped } from '#components/clipped';
import { CoverageBar } from '#components/coverage-bar';
import { counterCoverage } from '#components/coverage-change';
import { Panel } from '#components/panel';
import { ProgressMeter } from '#components/progress-meter';
import { RoleText } from '#components/role-text';
import { Section } from '#components/section';
import {
  acceptedOf,
  baselineOf,
} from '#screens/improvement/improvement-answer';
import { COUNTER_NAMES, countWords } from '#theme/counts';
import { shortHash } from '#theme/names';
import { GENERATOR_WORDS } from '#theme/status';

/** The cells of the name of a fact, as "Generator". */
const LABEL_CELLS = 10;

/**
 * A bar that leaves room for its numbers in the narrower of two panels,
 * where "28 of 30 min" follows it.
 */
const FACT_BAR_CELLS = 8;
const SECONDS_PER_MINUTE = 60;

/** The counters of the file before the work, as the mock-ups show them. */
const BASELINE: readonly CoverageMetric[] = ['lines', 'branches'];

/** Tokens are many, so they are written short: `84k`. */
const TOKENS = new Intl.NumberFormat('en', { notation: 'compact' });

function tokensWords(tokens: number): string {
  return TOKENS.format(tokens).toLowerCase();
}

function Fact({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <Box>
      <Box width={LABEL_CELLS} flexShrink={0}>
        <RoleText role="secondary">{label}</RoleText>
      </Box>
      {children}
    </Box>
  );
}

/** The three limits in use. Under a subscription tokens have no limit. */
function Used({
  improvement,
}: {
  readonly improvement: Improvement;
}): ReactNode {
  const { budget, usage } = improvement;
  const minutes = Math.floor(usage.seconds / SECONDS_PER_MINUTE);
  const cells = FACT_BAR_CELLS;
  return (
    <Section title="USED">
      <Fact label="Attempts">
        <ProgressMeter
          kind="limit"
          used={usage.attempts}
          total={budget.attempts}
          cells={cells}
        />
      </Fact>
      <Fact label="Tokens">
        {budget.tokens === null ? (
          <RoleText>{`${tokensWords(usage.tokens)} used, no limit`}</RoleText>
        ) : (
          <ProgressMeter
            kind="limit"
            used={usage.tokens}
            total={budget.tokens}
            cells={cells}
            usedText={tokensWords(usage.tokens)}
            totalText={tokensWords(budget.tokens)}
          />
        )}
      </Fact>
      <Fact label="Time">
        <ProgressMeter
          kind="limit"
          used={usage.seconds}
          total={budget.minutes * SECONDS_PER_MINUTE}
          cells={cells}
          usedText={String(minutes)}
          totalText={`${String(budget.minutes)} min`}
        />
      </Fact>
    </Section>
  );
}

/** The baseline of the file, as the first report of the gate measured it. */
function Baseline({
  improvement,
  threshold,
}: {
  readonly improvement: Improvement;
  readonly threshold: number;
}): ReactNode {
  const report = baselineOf(improvement);
  const before = report?.coverageBefore ?? null;
  if (before === null) {
    return null;
  }
  const mutants = report?.mutants ?? null;
  return (
    <>
      {BASELINE.map((counter) => (
        <Fact key={counter} label={COUNTER_NAMES[counter]}>
          <CoverageBar
            coverage={counterCoverage(before[counter])}
            threshold={threshold}
            cells={FACT_BAR_CELLS}
          />
        </Fact>
      ))}
      {mutants === null ? null : (
        <Fact label="Mutants">
          <RoleText>{`${String(mutants.undetectedBefore)} undetected`}</RoleText>
        </Fact>
      )}
    </>
  );
}

interface FactsProps {
  readonly improvement: Improvement;
  readonly repository: Repository;
  readonly threshold: number | undefined;
  readonly focused: boolean;
}

/** Where the work starts, or for finished work where it was published. */
function Target({ improvement, repository, threshold }: FactsProps): ReactNode {
  const commit = shortHash(improvement.baseCommit);
  const patch = acceptedOf(improvement)?.patchHash ?? null;
  if (improvement.status === 'completed') {
    return (
      <Section title="PUBLISHED">
        <Fact label="Branch">
          <RoleText>{improvement.branch ?? 'none'}</RoleText>
        </Fact>
        <Fact label="Base">
          <RoleText>{`${repository.defaultBranch} at ${commit}`}</RoleText>
        </Fact>
        <Fact label="Patch">
          <RoleText>{patch === null ? 'none' : shortHash(patch)}</RoleText>
        </Fact>
      </Section>
    );
  }
  return (
    <Section title="TARGET">
      <Fact label="File">
        <RoleText truncate>{improvement.targetFile}</RoleText>
      </Fact>
      <Fact label="Commit">
        <RoleText>{`${commit} on ${repository.defaultBranch}`}</RoleText>
      </Fact>
      {threshold === undefined ? null : (
        <Baseline improvement={improvement} threshold={threshold} />
      )}
    </Section>
  );
}

function Settings({
  improvement,
}: {
  readonly improvement: Improvement;
}): ReactNode {
  const { mode, generator, qualityPolicy } = improvement;
  return (
    <Section title="SETTINGS">
      <Fact label="Publish">
        <RoleText>
          {mode === 'review' ? 'wait for approval' : 'without asking'}
        </RoleText>
      </Fact>
      <Fact label="Generator">
        <RoleText>{`${GENERATOR_WORDS[generator.cli]}, ${generator.model}`}</RoleText>
      </Fact>
      <Fact label="Gate">
        <RoleText>{`${countWords(qualityPolicy.requiredChecks.length, 'check')} required`}</RoleText>
      </Fact>
    </Section>
  );
}

/** Where the raw output of the latest attempt that wrote any is stored. */
function Output({
  improvement,
}: {
  readonly improvement: Improvement;
}): ReactNode {
  const paths =
    improvement.attempts.findLast(
      (attempt) => attempt.rawOutputPaths.length > 0,
    )?.rawOutputPaths ?? [];
  return (
    <Section title="OUTPUT">
      {paths.length === 0 ? (
        <RoleText role="secondary">nothing written yet</RoleText>
      ) : (
        paths.map((path) => (
          <RoleText key={path} role="secondary">
            {path}
          </RoleText>
        ))
      )}
    </Section>
  );
}

/**
 * The facts beside the work: the three limits in use, the target or the
 * branch it was published on, the settings, and where the raw output is.
 */
export function Facts(props: FactsProps): ReactNode {
  const { improvement, focused } = props;
  return (
    <Panel title={improvement.targetFile} focused={focused}>
      <Clipped>
        <Used improvement={improvement} />
        <Target {...props} />
        <Settings improvement={improvement} />
        <Output improvement={improvement} />
      </Clipped>
    </Panel>
  );
}
