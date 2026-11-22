import { type ReactNode, useCallback } from 'react';

import type { ClientSession } from '#api/client-session';
import type { ServiceAnswer } from '#api/service-api';
import { ServiceUnreachableError } from '#api/service-unreachable-error';
import { AppShell, type ShellFrame } from '#components/app-shell';
import { EmptyState } from '#components/empty-state';
import { KeyHints } from '#components/key-hints';
import { Panel } from '#components/panel';
import { StatusLine } from '#components/status-line-pathed';
import { type Unanswered, UnansweredBody } from '#components/unanswered-body';
import { useKeys } from '#hooks/use-keys';
import {
  type RepeatedRequest,
  useRepeatedRequest,
} from '#hooks/use-repeated-request';
import { type FilesView, loadFiles } from '#screens/files/files-answer';
import { FilesBrowser } from '#screens/files/files-browser';

/** The screen asks the service again about once a second. */
const EVERY_MS = 1000;

interface FilesScreenProps {
  readonly session: ClientSession;
  readonly frame: ShellFrame;
  readonly repositoryId: string;
  readonly onOpenImprovement: (improvementId: string) => void;
  readonly onBack: () => void;
}

type Shown =
  Unanswered | { readonly kind: 'answered'; readonly view: FilesView };

/**
 * What the screen shows. A service that does not answer leaves the last
 * answer standing, not fresh; any other fault of the request is shown.
 */
function shownOf({
  answer,
  failure,
}: RepeatedRequest<ServiceAnswer<FilesView>>): Shown {
  if (failure !== undefined && !(failure instanceof ServiceUnreachableError)) {
    return { kind: 'fault', fault: failure };
  }
  if (answer === undefined) {
    return { kind: 'waiting' };
  }
  return answer.outcome === 'refused'
    ? { kind: 'refused', error: answer.error }
    : { kind: 'answered', view: answer.value };
}

/** A screen with no files to show: on its way, refused, or never scanned. */
function Bare({
  frame,
  body,
  stale,
  onBack,
}: {
  readonly frame: ShellFrame;
  readonly body: ReactNode;
  readonly stale: boolean;
  readonly onBack: () => void;
}): ReactNode {
  useKeys({ esc: onBack }, { active: true });
  return (
    <AppShell
      {...frame}
      body={body}
      status={<StatusLine path={['Repositories']} facts={[]} stale={stale} />}
      keys={<KeyHints hints={[{ key: 'esc', label: 'back' }]} />}
    />
  );
}

function NeverScanned({ view }: { readonly view: FilesView }): ReactNode {
  const { owner, name } = view.repository;
  return (
    <Panel title="Files" focused>
      <EmptyState
        sentence={`${owner}/${name} has no scan yet.`}
        keyName="esc"
        action="to go back and scan it"
      />
    </Panel>
  );
}

/**
 * Which files need tests: the latest snapshot of one repository, asked
 * again about once a second. It shows what the service returned, in the
 * order it returned it.
 */
export function FilesScreen(props: FilesScreenProps): ReactNode {
  const { session, frame, repositoryId } = props;
  const load = useCallback(
    () => loadFiles(session.api, repositoryId),
    [session, repositoryId],
  );
  const request = useRepeatedRequest(load, EVERY_MS);
  const shown = shownOf(request);
  if (shown.kind !== 'answered') {
    const body = <UnansweredBody title="Files" state={shown} />;
    return (
      <Bare
        frame={frame}
        body={body}
        stale={request.stale}
        onBack={props.onBack}
      />
    );
  }
  const { repository, files } = shown.view;
  const snapshot = repository.latestSnapshot;
  if (files === undefined || snapshot === null) {
    const body = <NeverScanned view={shown.view} />;
    return (
      <Bare
        frame={frame}
        body={body}
        stale={request.stale}
        onBack={props.onBack}
      />
    );
  }
  return (
    <FilesBrowser
      {...props}
      repository={repository}
      snapshot={snapshot}
      files={files}
      stale={request.stale}
    />
  );
}
