import { Box, Text } from 'ink';
import type { ReactNode } from 'react';

import type { BudgetSettings } from '@coverage-autopilot/api-contracts/improvements';

import { AccessSteps } from '#components/access-steps';
import { Glyph } from '#components/glyph';
import { RoleText } from '#components/role-text';
import { Section } from '#components/section';
import type { LimitField, Limits, StartFacts } from '#components/start-limits';
import { GAP } from '#theme/widths';

/** The cells of the name of a field, and of its value. */
const LABEL_CELLS = 12;
const VALUE_CELLS = 14;

const NUMBERS = new Intl.NumberFormat('en');

interface Row {
  readonly field: LimitField;
  readonly label: string;
  readonly value: string;
  readonly most: string;
}

function minutesWords(minutes: number): string {
  return `${String(minutes)} min`;
}

function rowsOf(limits: Limits, settings: BudgetSettings): Row[] {
  const { maximums } = settings;
  const tokens: Row[] =
    maximums.tokens === null
      ? []
      : [
          {
            field: 'tokens',
            label: 'Tokens',
            value: NUMBERS.format(limits.tokens ?? maximums.tokens),
            most: NUMBERS.format(maximums.tokens),
          },
        ];
  return [
    {
      field: 'attempts',
      label: 'Attempts',
      value: String(limits.attempts),
      most: String(maximums.attempts),
    },
    ...tokens,
    {
      field: 'minutes',
      label: 'Time',
      value: minutesWords(limits.minutes),
      most: minutesWords(maximums.minutes),
    },
  ];
}

function Marker({ chosen }: { readonly chosen: boolean }): ReactNode {
  return (
    <Box width={GAP} flexShrink={0}>
      {chosen ? <Glyph name="selected" role="accent" /> : null}
    </Box>
  );
}

function LimitRow({
  row,
  chosen,
}: {
  readonly row: Row;
  readonly chosen: boolean;
}): ReactNode {
  return (
    <Box>
      <Marker chosen={chosen} />
      <Box width={LABEL_CELLS} flexShrink={0}>
        <RoleText bold={chosen}>{row.label}</RoleText>
      </Box>
      <Box width={VALUE_CELLS} flexShrink={0}>
        <RoleText role="emphasis">{row.value}</RoleText>
      </Box>
      <RoleText role="secondary">{`up to ${row.most}`}</RoleText>
    </Box>
  );
}

/** Under a subscription the service sets no limit of tokens at all. */
function NoTokenLimit(): ReactNode {
  return (
    <Box paddingLeft={GAP}>
      <Box width={LABEL_CELLS} flexShrink={0}>
        <RoleText>Tokens</RoleText>
      </Box>
      <RoleText role="secondary">no limit</RoleText>
    </Box>
  );
}

function ModeOption({
  label,
  on,
}: {
  readonly label: string;
  readonly on: boolean;
}): ReactNode {
  return (
    <Text>
      <Glyph
        name={on ? 'on' : 'notStarted'}
        role={on ? 'accent' : 'secondary'}
      />{' '}
      <RoleText>{label}</RoleText>
    </Text>
  );
}

/**
 * The form of a start: the preflight that passed, the limits with their
 * maximums, and how the work is published. A limit is a chosen value and
 * not a bar, because nothing is used yet.
 */
export function StartForm({
  facts,
  limits,
  field,
}: {
  readonly facts: StartFacts;
  readonly limits: Limits;
  readonly field: LimitField;
}): ReactNode {
  return (
    <Box flexDirection="column">
      <Section title="READY">
        <AccessSteps steps={facts.access.steps} />
      </Section>
      <Section title="LIMITS">
        {rowsOf(limits, facts.settings).map((row) => (
          <LimitRow key={row.field} row={row} chosen={row.field === field} />
        ))}
        {facts.settings.maximums.tokens === null ? <NoTokenLimit /> : null}
      </Section>
      <Section title="PUBLISHING">
        <Box>
          <Marker chosen={field === 'mode'} />
          <Box flexDirection="column">
            <ModeOption
              label="Wait for my approval"
              on={limits.mode === 'review'}
            />
            <ModeOption
              label="Open the pull request without asking"
              on={limits.mode === 'automatic'}
            />
          </Box>
        </Box>
      </Section>
      <Box marginTop={1}>
        <RoleText>Nothing is spent until you start.</RoleText>
      </Box>
    </Box>
  );
}
