import { Box, Text } from 'ink';
import type { ReactNode } from 'react';

import type {
  AccessCheck,
  AccessStep,
} from '@coverage-autopilot/api-contracts/repositories';

import { Dialog } from '#components/dialog';
import { ErrorDetails } from '#components/error-details';
import { Glyph } from '#components/glyph';
import type { KeyHint } from '#components/key-hints';
import { ProblemDetails } from '#components/problem-details';
import { RoleText } from '#components/role-text';
import { TextField } from '#components/text-field';
import type {
  ConnectPhase,
  ConnectRefusal,
} from '#screens/repositories/connect-flow';
import { isEditable } from '#screens/repositories/connect-flow';
import { durationWords, elapsedMs } from '#theme/moments';
import { repositoryName } from '#theme/names';
import { ACCESS_CHECK_STATUS, ACCESS_STEP_WORDS } from '#theme/status';
import { DIALOG_WIDTH } from '#theme/widths';

/** The dialog that connects a repository: the address, and where it stands. */
export interface ConnectState {
  /** Counts the dialogs opened, so an answer for a closed one is dropped. */
  readonly id: number;
  readonly url: string;
  readonly phase: ConnectPhase;
}

interface ConnectDialogViewProps {
  readonly state: ConnectState;
  readonly now: string;
  readonly onChange: (url: string) => void;
  readonly onConfirm: () => void;
  readonly onClose: () => void;
}

const BAD_REQUEST = 400;
const NOT_FOUND = 404;

/** What to do when the service refused, by the status it refused with. */
const NEXT_BY_STATUS: ReadonlyMap<number, string> = new Map([
  [BAD_REQUEST, 'Type the HTTPS address of a repository, then press enter.'],
  [
    NOT_FOUND,
    'Check the address, and that gh is signed in as an account that can see the repository. Then press enter.',
  ],
]);

const TRY_AGAIN = 'Press enter to try again.';

/** `enter` sends only an address that is not being checked. */
const CONFIRM_LABELS: Readonly<Record<ConnectPhase['step'], string | null>> = {
  editing: 'check',
  connecting: null,
  checking: null,
  refused: 'check again',
};

/** The keys of the dialog where it stands, also for the footer. */
export function connectHintsOf(phase: ConnectPhase): KeyHint[] {
  const label = CONFIRM_LABELS[phase.step];
  return [
    ...(label === null ? [] : [{ key: 'enter', label }]),
    { key: 'esc', label: 'close' },
  ];
}

/** Where the dialog stands, said in the status line of the screen. */
export function connectStatusOf({ url, phase }: ConnectState): string {
  switch (phase.step) {
    case 'editing':
      return 'type the address of a repository';
    case 'connecting':
      return `reading ${url}`;
    case 'checking':
      return `checking access to ${repositoryName(phase.repository)}`;
    case 'refused':
      return phase.refusal.kind === 'access'
        ? `access to ${repositoryName(phase.refusal.repository)} was refused`
        : `${url} was not connected`;
  }
}

function Working({
  title,
  since,
  now,
}: {
  readonly title: string;
  readonly since: string;
  readonly now: string;
}): ReactNode {
  return (
    <Box justifyContent="space-between">
      <Text>
        <Glyph name="spinner" role="running" />{' '}
        <RoleText role="emphasis">{title}</RoleText>
      </Text>
      <RoleText role="secondary">
        {durationWords(elapsedMs(since, now))}
      </RoleText>
    </Box>
  );
}

/** A passed step says what it found; one that did not run says so. */
function stepWords(step: AccessStep): string {
  const words = ACCESS_STEP_WORDS[step.name];
  if (step.status === 'passed') {
    return step.message ?? words;
  }
  return step.status === 'failed'
    ? words
    : `${words} ${ACCESS_CHECK_STATUS.not_run.word}`;
}

function AccessRefusal({ check }: { readonly check: AccessCheck }): ReactNode {
  const failed = check.steps.find((step) => step.status === 'failed');
  const toolOutput = failed?.toolOutput ?? null;
  return (
    <>
      {check.steps.map((step) => {
        const look = ACCESS_CHECK_STATUS[step.status];
        return (
          <Text key={step.name}>
            <Glyph name={look.glyph} role={look.role} />{' '}
            <RoleText>{stepWords(step)}</RoleText>
          </Text>
        );
      })}
      <Box marginTop={1}>
        <ErrorDetails
          look={ACCESS_CHECK_STATUS.failed}
          headline="Access refused"
          explanation="It is connected, and no work starts until every step passes."
          {...(toolOutput === null
            ? {}
            : { answer: { heading: 'THE TOOL SAID', text: toolOutput } })}
          next={failed?.message ?? 'Fix what failed, then press enter.'}
        />
      </Box>
    </>
  );
}

function Refusal({ refusal }: { readonly refusal: ConnectRefusal }): ReactNode {
  if (refusal.kind === 'access') {
    return <AccessRefusal check={refusal.check} />;
  }
  return (
    <ProblemDetails
      headline="Not connected"
      problem={refusal}
      next={
        refusal.kind === 'refused'
          ? (NEXT_BY_STATUS.get(refusal.status) ?? TRY_AGAIN)
          : TRY_AGAIN
      }
    />
  );
}

function PhaseBody({
  phase,
  now,
}: {
  readonly phase: ConnectPhase;
  readonly now: string;
}): ReactNode {
  switch (phase.step) {
    case 'editing':
      return (
        <RoleText role="secondary">
          The HTTPS address of the repository, such as
          https://github.com/acme/widgets.
        </RoleText>
      );
    case 'connecting':
      return (
        <Working title="Reading the repository" since={phase.since} now={now} />
      );
    case 'checking':
      return (
        <>
          <Working title="Checking access" since={phase.since} now={now} />
          <RoleText role="secondary">
            {`Checking git, the login of gh and the right to push to ${repositoryName(phase.repository)}.`}
          </RoleText>
        </>
      );
    case 'refused':
      return <Refusal refusal={phase.refusal} />;
  }
}

/**
 * The dialog that connects a repository: one address and one `enter`,
 * then the access check, and what refused it with what to do.
 */
export function ConnectDialogView({
  state,
  now,
  onChange,
  onConfirm,
  onClose,
}: ConnectDialogViewProps): ReactNode {
  const { phase } = state;
  return (
    <Dialog
      title="Connect a repository"
      width={DIALOG_WIDTH.palette}
      {...(phase.step === 'refused' ? { tone: 'danger' } : {})}
      hints={connectHintsOf(phase)}
      onConfirm={onConfirm}
      onClose={onClose}
    >
      <TextField
        prompt="URL"
        value={state.url}
        active={isEditable(phase)}
        onChange={onChange}
      />
      <Box marginTop={1} flexDirection="column">
        <PhaseBody phase={phase} now={now} />
      </Box>
    </Dialog>
  );
}
