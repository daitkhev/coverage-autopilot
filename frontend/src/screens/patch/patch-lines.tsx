import { Box, Text } from 'ink';
import type { ReactNode } from 'react';

import { DiffViewer } from '#components/diff-viewer';
import { Panel } from '#components/panel';
import { RoleText } from '#components/role-text';
import type { PatchFile } from '#screens/patch/patch-answer';
import { GAP } from '#theme/widths';

/** The cells of a short hash, as git prints it. */
export const SHORT_HASH = 7;

/** The rows of the panel above the lines: the file and its counts. */
export const FILE_ROWS = 1;

function FileLine({ file }: { readonly file: PatchFile }): ReactNode {
  return (
    <Box gap={GAP}>
      <Box flexGrow={1} gap={GAP}>
        <Box flexShrink={0}>
          <RoleText role="success">
            {file.created ? 'new file' : 'changed'}
          </RoleText>
        </Box>
        <Text wrap="truncate-start">{file.path}</Text>
      </Box>
      <Box flexShrink={0}>
        <Text>
          <RoleText role="success">{`+${String(file.added.length)}`}</RoleText>{' '}
          <RoleText role={file.removed === 0 ? 'secondary' : 'danger'}>
            {`-${String(file.removed)}`}
          </RoleText>
        </Text>
      </Box>
    </Box>
  );
}

interface PatchLinesProps {
  readonly hash: string;
  readonly files: readonly PatchFile[];
  /** The file shown, of the files of the patch. */
  readonly chosen: number;
  /** The first line drawn, and how many fit. */
  readonly top: number;
  readonly visible: number;
  readonly focused: boolean;
}

/**
 * The lines the patch adds, one file at a time, with their numbers. The
 * panel names the hash, which is what an approval names too.
 */
export function PatchLines(props: PatchLinesProps): ReactNode {
  const { files, chosen } = props;
  const file = files[chosen];
  const note =
    files.length > 1
      ? { note: `file ${String(chosen + 1)} of ${String(files.length)}` }
      : {};
  return (
    <Panel
      title={`Patch ${props.hash.slice(0, SHORT_HASH)}`}
      {...note}
      focused={props.focused}
    >
      {file === undefined ? (
        <RoleText role="secondary">The patch adds no file.</RoleText>
      ) : (
        <>
          <FileLine file={file} />
          <DiffViewer
            lines={file.added}
            offset={props.top}
            visible={props.visible}
          />
        </>
      )}
    </Panel>
  );
}
