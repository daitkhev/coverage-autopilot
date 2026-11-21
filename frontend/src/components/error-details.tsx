import { Box, Text } from 'ink';
import type { ReactNode } from 'react';

import { Glyph } from '#components/glyph';
import { RoleText } from '#components/role-text';
import { Section } from '#components/section';
import type { StatusLook } from '#theme/status';
import { GAP } from '#theme/widths';

/** The words of the tool that refused, kept as it wrote them. */
interface ToolAnswer {
  /** Who answered, such as "THE TOOL SAID" or "GITHUB ANSWERED". */
  readonly heading: string;
  readonly text: string;
}

interface ErrorDetailsProps {
  /** The symbol and the role of the failure, from the status tables. */
  readonly look: StatusLook;
  /** What happened, as a sentence first. */
  readonly headline: string;
  /** The stable code, kept beside the sentence for searching and scripts. */
  readonly code?: string;
  readonly explanation?: string;
  readonly answer?: ToolAnswer;
  /** What to do next. */
  readonly next: string;
}

/** What happened, what the tool said, and what to do. */
export function ErrorDetails({
  look,
  headline,
  code,
  explanation,
  answer,
  next,
}: ErrorDetailsProps): ReactNode {
  return (
    <Box flexDirection="column">
      <Box gap={GAP}>
        <Text>
          <Glyph name={look.glyph} role={look.role} />{' '}
          <RoleText role={look.role} bold>
            {headline}
          </RoleText>
        </Text>
        {code === undefined ? null : (
          <RoleText role="secondary">{code}</RoleText>
        )}
      </Box>
      {explanation === undefined ? null : (
        <Box paddingLeft={GAP}>
          <RoleText>{explanation}</RoleText>
        </Box>
      )}
      {answer === undefined ? null : (
        <Section title={answer.heading}>
          <RoleText>{answer.text}</RoleText>
        </Section>
      )}
      <Section title="WHAT TO DO">
        <RoleText>{next}</RoleText>
      </Section>
    </Box>
  );
}
