import { Text } from 'ink';
import { Fragment, type ReactNode } from 'react';

import type { AccessStep } from '@coverage-autopilot/api-contracts/repositories';
import type { AccessCheckName } from '@coverage-autopilot/api-contracts/statuses';

import { Glyph } from '#components/glyph';
import { RoleText } from '#components/role-text';
import { ACCESS_CHECK_STATUS } from '#theme/status';

/** What each step of the access check proves, in plain words. */
const STEP_WORDS: Readonly<Record<AccessCheckName, string>> = {
  git_present: 'git',
  gh_authenticated: 'gh logged in',
  push_allowed: 'can push',
};

function Step({ step }: { readonly step: AccessStep }): ReactNode {
  const look = ACCESS_CHECK_STATUS[step.status];
  return (
    <Text>
      <Glyph name={look.glyph} role={look.role} />{' '}
      <RoleText>{STEP_WORDS[step.name]}</RoleText>
      {step.status === 'passed' ? null : (
        <RoleText role={look.role}>{` ${look.word}`}</RoleText>
      )}
    </Text>
  );
}

/**
 * The steps of an access check on one line, in the order they ran. A step
 * that did not pass says so in words, so the line reads without colour.
 */
export function AccessSteps({
  steps,
}: {
  readonly steps: readonly AccessStep[];
}): ReactNode {
  return (
    <Text>
      {steps.map((step, index) => (
        <Fragment key={step.name}>
          {index === 0 ? null : (
            <Text>
              {' '}
              <Glyph name="separator" role="secondary" />{' '}
            </Text>
          )}
          <Step step={step} />
        </Fragment>
      ))}
    </Text>
  );
}
