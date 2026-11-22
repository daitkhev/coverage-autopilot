import type { ReactNode } from 'react';

import type { Repository } from '@coverage-autopilot/api-contracts/repositories';
import type {
  SnapshotFiles,
  SnapshotSummary,
} from '@coverage-autopilot/api-contracts/snapshots';

import type { ClientSession } from '#api/client-session';
import { AppShell, type ShellFrame } from '#components/app-shell';
import { type KeyHint, KeyHints } from '#components/key-hints';
import { Panel } from '#components/panel';
import { RoleText } from '#components/role-text';
import { SplitView } from '#components/split-view';
import { type Freshness, StatusLine } from '#components/status-line';
import { FileDetails } from '#screens/files/file-details';
import { FileListPanel } from '#screens/files/file-list';
import { type Browser, useBrowser } from '#screens/files/files-browsing';
import { filesHints } from '#screens/files/files-keys';
import { RepositoryLine } from '#screens/files/repository-line';
import { StartDialog } from '#screens/files/start-dialog';
import { countWords } from '#theme/counts';
import { repositoryName } from '#theme/names';

/** What the browser is given: the latest snapshot and its files. */
interface FilesBrowserProps {
  readonly session: ClientSession;
  readonly frame: ShellFrame;
  readonly repository: Repository;
  readonly snapshot: SnapshotSummary;
  readonly files: SnapshotFiles;
  readonly freshness: Freshness;
  readonly onOpenImprovement: (improvementId: string) => void;
  readonly onBack: () => void;
}

const TYPING_HINTS: readonly KeyHint[] = [
  { key: 'enter', label: 'accept' },
  { key: 'esc', label: 'discard' },
];

/** The dialog lists its own keys. The one that always works is here. */
const DIALOG_HINTS: readonly KeyHint[] = [{ key: 'esc', label: 'close' }];

function Body({
  props,
  browser,
}: {
  readonly props: FilesBrowserProps;
  readonly browser: Browser;
}): ReactNode {
  const { files } = props;
  const { state, layout } = browser;
  const details = state.focused === 'details';
  return (
    <SplitView
      layout={layout}
      shown={details ? 'right' : 'left'}
      left={
        <FileListPanel
          items={files.items}
          rows={browser.rows}
          chosen={browser.chosen}
          filter={browser.filter.text}
          filterLine={browser.filter.line}
          position={browser.selection}
          visible={browser.visible}
          focused={!details}
          shape={{
            wide: layout === 'wide',
            threshold: files.threshold.percentage,
          }}
        />
      }
      right={
        state.selected === undefined ? (
          <Panel title="No file" focused={details}>
            <RoleText role="secondary">No file is chosen.</RoleText>
          </Panel>
        ) : (
          <FileDetails
            file={state.selected}
            threshold={files.threshold}
            focused={details}
            roomy={layout !== 'compact'}
          />
        )
      }
    />
  );
}

function statusFacts(browser: Browser): string[] {
  const { rows, chosen, filter, dialog } = browser;
  if (dialog.file !== undefined) {
    return [`limits for ${dialog.file.path}`];
  }
  return [
    `${countWords(rows.length, 'file')} ${chosen.said}`,
    ...(filter.text === '' ? [] : [`holding "${filter.text}"`]),
  ];
}

/** The keys that work now: the dialog's, the field's, or the screen's. */
function footerHints(browser: Browser): readonly KeyHint[] {
  if (browser.dialog.file !== undefined) {
    return DIALOG_HINTS;
  }
  return browser.filter.typing ? TYPING_HINTS : filesHints(browser.state);
}

function positionOf(browser: Browser): { readonly position?: string } {
  const count = browser.rows.length;
  return count === 0
    ? {}
    : {
        position: `row ${String(browser.selection.index + 1)} of ${String(count)}`,
      };
}

function dialogOf(
  props: FilesBrowserProps,
  browser: Browser,
): { readonly dialog?: ReactNode } {
  const starting = browser.dialog.file;
  return starting === undefined
    ? {}
    : {
        dialog: (
          <StartDialog
            session={props.session}
            repositoryId={props.repository.id}
            snapshotId={props.files.snapshotId}
            filePath={starting.path}
            onOpenImprovement={props.onOpenImprovement}
            onClose={browser.dialog.close}
          />
        ),
      };
}

/**
 * The files of the latest snapshot: the four lists on the left and the
 * chosen file on the right, a filter by a part of the path, and the
 * dialog that starts an improvement.
 */
export function FilesBrowser(props: FilesBrowserProps): ReactNode {
  const browser = useBrowser(props);
  const { repository } = props;
  return (
    <AppShell
      {...props.frame}
      typing={browser.filter.typing}
      context={
        <RepositoryLine
          repository={repository}
          snapshot={props.snapshot}
          now={props.session.now()}
          layout={browser.layout}
        />
      }
      body={<Body props={props} browser={browser} />}
      status={
        <StatusLine
          path={['Repositories', repositoryName(repository)]}
          facts={statusFacts(browser)}
          freshness={props.freshness}
        />
      }
      {...positionOf(browser)}
      keys={<KeyHints hints={footerHints(browser)} />}
      {...dialogOf(props, browser)}
    />
  );
}
