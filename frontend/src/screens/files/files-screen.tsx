import { type ReactNode, useCallback } from 'react';

import type { ClientSession } from '#api/client-session';
import { isServiceUnreachable } from '#api/service-unreachable-error';
import type { ShellFrame } from '#components/app-shell';
import { BareScreen } from '#components/bare-screen';
import { EmptyState } from '#components/empty-state';
import { Panel } from '#components/panel';
import { shownOf, UnansweredBody } from '#components/unanswered-body';
import { useDatedRequest } from '#hooks/use-dated-request';
import { type FilesView, loadFiles } from '#screens/files/files-answer';
import { FilesBrowser } from '#screens/files/files-browser';

/** The screen asks the service again about once a second. */
const EVERY_MS = 1000;

const PATH = ['Repositories'];

interface FilesScreenProps {
  readonly session: ClientSession;
  readonly frame: ShellFrame;
  readonly repositoryId: string;
  readonly onOpenImprovement: (improvementId: string) => void;
  readonly onBack: () => void;
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
  const { session, frame, repositoryId, onBack } = props;
  const load = useCallback(
    () => loadFiles(session.api, repositoryId),
    [session, repositoryId],
  );
  const request = useDatedRequest(load, {
    now: session.now,
    everyMs: EVERY_MS,
  });
  const shown = shownOf(request, isServiceUnreachable);
  const freshness = { ...request, now: session.now() };
  const bare = { frame, path: PATH, freshness, onBack };
  if (shown.kind !== 'answered') {
    return (
      <BareScreen
        {...bare}
        body={
          <UnansweredBody
            title="Files"
            headline="The files could not be read"
            state={shown}
          />
        }
      />
    );
  }
  const { repository, files } = shown.value;
  const snapshot = repository.latestSnapshot;
  if (files === undefined || snapshot === null) {
    return <BareScreen {...bare} body={<NeverScanned view={shown.value} />} />;
  }
  return (
    <FilesBrowser
      {...props}
      repository={repository}
      snapshot={snapshot}
      files={files}
      freshness={freshness}
    />
  );
}
