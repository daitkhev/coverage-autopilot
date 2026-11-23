import { Box, Text } from 'ink';
import type { ReactNode } from 'react';

import type { ServiceStep } from '#api/service-start';
import {
  type NotReached,
  reachWordsOf,
  STEP_WORDS,
} from '#app/service-reach-words';
import { ErrorDetails } from '#components/error-details';
import { Glyph } from '#components/glyph';
import { KeyHints } from '#components/key-hints';
import { RoleText } from '#components/role-text';
import { useKeys } from '#hooks/use-keys';
import type { StatusLook } from '#theme/status';

const TITLE = 'coverage-autopilot';

const NOT_REACHED: StatusLook = {
  glyph: 'failed',
  word: 'not reached',
  role: 'danger',
};

function Page({ children }: { readonly children: ReactNode }): ReactNode {
  return (
    <Box flexDirection="column" padding={1} gap={1}>
      <RoleText role="emphasis">{TITLE}</RoleText>
      {children}
    </Box>
  );
}

/** What shows while the client is on its way to a service. */
export function StartingService({
  step,
}: {
  readonly step: ServiceStep | undefined;
}): ReactNode {
  return (
    <Page>
      <Text>
        <Glyph name="spinner" role="running" />{' '}
        <RoleText>
          {step === undefined ? 'Looking for the service' : STEP_WORDS[step]}
        </RoleText>
      </Text>
    </Page>
  );
}

interface ServiceNotReachedProps {
  readonly problem: NotReached;
  readonly onRetry: () => void;
  readonly onQuit: () => void;
}

/**
 * What shows when no service could be reached: what happened, what the
 * service wrote, and the two ways on.
 */
export function ServiceNotReached({
  problem,
  onRetry,
  onQuit,
}: ServiceNotReachedProps): ReactNode {
  useKeys({ enter: onRetry, q: onQuit }, { active: true });
  const words = reachWordsOf(problem);
  return (
    <Page>
      <ErrorDetails
        look={NOT_REACHED}
        headline={words.headline}
        code={words.code}
        {...(words.said.length === 0
          ? {}
          : {
              answer: {
                heading: 'THE SERVICE SAID',
                text: words.said.join('\n'),
              },
            })}
        next={words.next}
      />
      <KeyHints
        hints={[
          { key: 'enter', label: 'try again' },
          { key: 'q', label: 'quit' },
        ]}
      />
    </Page>
  );
}
