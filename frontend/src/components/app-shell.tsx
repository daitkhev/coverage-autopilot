import { Box, Text } from 'ink';
import type { ReactNode } from 'react';

import { Glyph } from '#components/glyph';
import { KeyHints } from '#components/key-hints';
import { RoleText } from '#components/role-text';
import { BackdropContext } from '#hooks/use-backdrop';
import { useBorder } from '#hooks/use-border';
import { useTheme } from '#hooks/use-theme';
import { frameOf } from '#theme/symbols';
import { GAP, layoutOf, SMALLEST_SIZE, type TerminalSize } from '#theme/widths';

interface AppShellProps {
  readonly size: TerminalSize;
  /** The name of the tool, for a window that is too small. */
  readonly title: string;
  /** Commands that work at any size, offered when the window is too small. */
  readonly commands: readonly string[];
  readonly header: ReactNode;
  /** What the screen is about, on one row below the header. */
  readonly context?: ReactNode;
  readonly body: ReactNode;
  /** A short message about something that just happened. */
  readonly notice?: string;
  /** The path to the screen, and the position in the list. */
  readonly status: ReactNode;
  readonly position?: string;
  readonly keys: ReactNode;
  readonly help: ReactNode;
  /** A dialog drawn over the screen. Everything behind it is dim. */
  readonly dialog?: ReactNode;
}

function TooSmall({
  size,
  title,
  commands,
}: Pick<AppShellProps, 'size' | 'title' | 'commands'>): ReactNode {
  const needed = `${String(SMALLEST_SIZE.columns)} x ${String(SMALLEST_SIZE.rows)}`;
  return (
    <Box flexDirection="column" padding={1} gap={1}>
      <RoleText role="emphasis">{title}</RoleText>
      <Box flexDirection="column">
        <Text>
          <Glyph name="attention" role="warning" />{' '}
          <RoleText role="emphasis">
            This window is too small for the screens.
          </RoleText>
        </Text>
        <RoleText>{`  It is ${String(size.columns)} x ${String(size.rows)} and they need ${needed}.`}</RoleText>
      </Box>
      <RoleText role="secondary">
        Make the window larger, or use a command. Commands work at any size:
      </RoleText>
      <Box flexDirection="column" paddingLeft={GAP}>
        {commands.map((command) => (
          <RoleText key={command}>{command}</RoleText>
        ))}
      </Box>
      <KeyHints hints={[{ key: 'q', label: 'quit' }]} />
    </Box>
  );
}

function Ruled({
  edge,
  children,
}: {
  readonly edge: 'top' | 'bottom';
  readonly children: ReactNode;
}): ReactNode {
  return (
    <Box
      flexDirection="column"
      flexShrink={0}
      borderStyle={frameOf(useTheme()).rule}
      borderLeft={false}
      borderRight={false}
      borderTop={edge === 'top'}
      borderBottom={edge === 'bottom'}
      {...useBorder('border')}
    >
      {children}
    </Box>
  );
}

function Footer(
  props: Pick<AppShellProps, 'status' | 'position' | 'keys' | 'help'>,
): ReactNode {
  return (
    <Ruled edge="top">
      <Box justifyContent="space-between" gap={1}>
        {props.status}
        {props.position === undefined ? null : (
          <RoleText role="secondary">{props.position}</RoleText>
        )}
      </Box>
      <Box justifyContent="space-between" gap={1}>
        {props.keys}
        {props.help}
      </Box>
    </Ruled>
  );
}

function Overlay({
  size,
  children,
}: {
  readonly size: TerminalSize;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <Box
      position="absolute"
      top={0}
      left={0}
      width={size.columns}
      height={size.rows}
      alignItems="center"
      justifyContent="center"
    >
      {children}
    </Box>
  );
}

/**
 * The four zones of every screen: the header, the context, the body and
 * the footer. Below 80 by 24 it asks for more room instead.
 */
export function AppShell(props: AppShellProps): ReactNode {
  const { size, dialog } = props;
  if (layoutOf(size) === 'too-small') {
    return <TooSmall {...props} />;
  }
  return (
    <Box
      width={size.columns}
      height={size.rows}
      flexDirection="column"
      paddingX={1}
    >
      <BackdropContext value={dialog !== undefined}>
        <Ruled edge="bottom">{props.header}</Ruled>
        {props.context === undefined ? null : (
          <Box marginTop={1}>{props.context}</Box>
        )}
        <Box flexGrow={1} flexDirection="column">
          {props.body}
        </Box>
        {props.notice === undefined ? null : (
          <Box justifyContent="flex-end">
            <RoleText>{props.notice}</RoleText>
          </Box>
        )}
      </BackdropContext>
      <Footer {...props} />
      {dialog === undefined ? null : <Overlay size={size}>{dialog}</Overlay>}
    </Box>
  );
}
