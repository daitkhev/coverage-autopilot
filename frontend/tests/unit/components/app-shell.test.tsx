import { Text } from 'ink';
import { cleanup, render } from 'ink-testing-library';
import { type ReactNode, useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { AppShell, type ShellFrame } from '#components/app-shell';
import { DataList } from '#components/data-list';
import { Dialog } from '#components/dialog';
import { KeyHints } from '#components/key-hints';
import { Panel } from '#components/panel';
import { RoleText } from '#components/role-text';
import { SplitView } from '#components/split-view';
import { TabBar } from '#components/tab-bar';
import { useKeys } from '#hooks/use-keys';
import { KEYS, press, screenOf } from '#tests/support/keys';
import {
  drawnAt,
  USUAL_COLUMNS,
  widestLine,
  WIDTHS,
} from '#tests/support/terminal-text';
import { DIALOG_WIDTH, layoutOf, type TerminalSize } from '#theme/widths';

const REPOSITORIES = [
  'example/payments',
  'example/ledger',
  'example/gateway',
  'example/billing-api',
];

function body(size: TerminalSize): ReactNode {
  return (
    <SplitView
      layout={layoutOf(size)}
      shown="left"
      left={
        <Panel title="Repositories" note="4" focused>
          <DataList
            items={REPOSITORIES}
            selected={0}
            offset={0}
            visible={4}
            focused
            keyOf={(name) => name}
            renderRow={(name, row) => (
              <RoleText bold={row.bold}>{name}</RoleText>
            )}
          />
        </Panel>
      }
      right={
        <Panel title="example/payments" focused={false}>
          <RoleText>main · 4f2a9c1 · scanned 2h ago</RoleText>
        </Panel>
      }
    />
  );
}

function shell(
  size: TerminalSize,
  parts: { readonly body?: ReactNode; readonly dialog?: ReactNode } = {},
): ReactNode {
  return (
    <AppShell
      size={size}
      title="coverage-autopilot"
      commands={['coverage-autopilot list', 'coverage-autopilot doctor']}
      header={
        <TabBar
          title="coverage-autopilot"
          sections={['Repositories', 'Improvements', 'Service']}
          active={0}
          waiting={{ count: 1, label: 'to review' }}
          service="up"
          layout={layoutOf(size)}
        />
      }
      body={parts.body ?? body(size)}
      notice="example/ledger was scanned"
      status={<RoleText>4 repositories · updated 1s ago</RoleText>}
      position="row 1 of 4"
      keys={
        <KeyHints
          hints={[
            { key: 'up-down', label: 'move' },
            { key: 'enter', label: 'open' },
            { key: 'q', label: 'quit' },
          ]}
        />
      }
      help={<KeyHints hints={[{ key: '?', label: 'help' }]} />}
      {...(parts.dialog === undefined ? {} : { dialog: parts.dialog })}
    />
  );
}

function question(onConfirm: (answer: number) => void): ReactNode {
  return (
    <Dialog
      title="Cancel this improvement?"
      width={DIALOG_WIDTH.question}
      tone="warning"
      answers={[
        { label: 'Keep it running' },
        { label: 'Cancel the improvement', destroys: true },
      ]}
      hints={[{ key: 'esc', label: 'keep' }]}
      onConfirm={onConfirm}
      onClose={() => undefined}
    />
  );
}

/** A screen whose list moves on `↓`, with a question over it or not. */
function Screen({ asking }: { readonly asking: boolean }): ReactNode {
  const [log, setLog] = useState<readonly string[]>([]);
  const note = (entry: string): void => {
    setLog((last) => [...last, entry]);
  };
  function Behind(): ReactNode {
    useKeys(
      {
        down: () => {
          note('list moved');
        },
        enter: () => {
          note('list opened');
        },
      },
      { active: true },
    );
    return <Text>{`log: ${log.join(', ') || 'empty'}`}</Text>;
  }
  return shell(
    { columns: 100, rows: 30 },
    {
      body: <Behind />,
      ...(asking
        ? {
            dialog: question((answer) => {
              note(`answer ${String(answer + 1)}`);
            }),
          }
        : {}),
    },
  );
}

/** A screen in the frame the app hands it, where the app owns `q`. */
function Framed({
  typing = false,
  asking = false,
}: {
  readonly typing?: boolean;
  readonly asking?: boolean;
}): ReactNode {
  const [log, setLog] = useState<readonly string[]>([]);
  const frame: ShellFrame = {
    size: { columns: 100, rows: 30 },
    title: 'coverage-autopilot',
    commands: ['coverage-autopilot list'],
    header: <Text>header</Text>,
    help: <Text>help</Text>,
    globalKeys: {
      q: () => {
        setLog((last) => [...last, 'quit']);
      },
    },
  };
  return (
    <AppShell
      {...frame}
      typing={typing}
      body={<Text>{`log: ${log.join(', ') || 'empty'}`}</Text>}
      status={<Text>status</Text>}
      keys={<Text>keys</Text>}
      {...(asking ? { dialog: question(() => undefined) } : {})}
    />
  );
}

afterEach(cleanup);

describe('AppShell', () => {
  it('should draw the four zones of a screen', () => {
    const size = { columns: USUAL_COLUMNS, rows: 24 };

    expect(drawnAt(shell(size), USUAL_COLUMNS)).toMatchSnapshot();
  });

  it.each(WIDTHS)('should fit in %i columns and the rows', (columns) => {
    const size = { columns, rows: 24 };
    const drawn = drawnAt(shell(size), columns);

    expect(widestLine(drawn)).toBeLessThanOrEqual(columns);
    expect(drawn.split('\n').length).toBeLessThanOrEqual(size.rows);
  });

  describe('when the window is below 80 by 24', () => {
    it('should ask for more room and offer the commands', () => {
      const drawn = drawnAt(shell({ columns: 60, rows: 16 }), 60);

      expect(drawn).toContain('! This window is too small for the screens.');
      expect(drawn).toContain('It is 60 x 16 and they need 80 x 24.');
      expect(drawn).toContain('  coverage-autopilot doctor');
      expect(drawn).toContain('q quit');
      expect(widestLine(drawn)).toBeLessThanOrEqual(60);
    });
  });

  describe('when a dialog is open', () => {
    it('should draw the dialog over the screen and hide what is behind', () => {
      const size = { columns: USUAL_COLUMNS, rows: 24 };
      const filler = <Text>{'x'.repeat(size.columns * size.rows)}</Text>;
      const drawn = drawnAt(
        shell(size, { body: filler, dialog: question(() => undefined) }),
        USUAL_COLUMNS,
      );
      const answer = drawn
        .split('\n')
        .find((line) => line.includes('Keep it running'));

      expect(answer).toBeDefined();
      expect(answer).toMatch(/│ › 1\. Keep it running +│/u);
    });

    it('should take every key, so nothing behind it reacts', async () => {
      const terminal = render(<Screen asking />);

      await press(terminal, KEYS.down, KEYS.enter);

      expect(screenOf(terminal)).toContain('log: answer 2');
      expect(screenOf(terminal)).not.toContain('list');
    });
  });

  describe('when no dialog is open', () => {
    it('should give the keys to the screen', async () => {
      const terminal = render(<Screen asking={false} />);

      await press(terminal, KEYS.down, KEYS.enter);

      expect(screenOf(terminal)).toContain('log: list moved, list opened');
    });
  });

  describe('when the app gives the keys that work anywhere', () => {
    it('should run a key of the app', async () => {
      const terminal = render(<Framed />);

      await press(terminal, 'q');

      expect(screenOf(terminal)).toContain('log: quit');
    });

    it('should run a key of the app in a window that is too small', async () => {
      const log: string[] = [];
      const terminal = render(
        <AppShell
          size={{ columns: 60, rows: 16 }}
          title="coverage-autopilot"
          commands={[]}
          globalKeys={{
            q: () => {
              log.push('quit');
            },
          }}
          header={null}
          body={null}
          status={null}
          keys={null}
          help={null}
        />,
      );

      await press(terminal, 'q');

      expect(log).toEqual(['quit']);
    });

    it('should not run a key of the app behind a dialog', async () => {
      const terminal = render(<Framed asking />);

      await press(terminal, 'q');

      expect(screenOf(terminal)).toContain('log: empty');
    });

    it('should not run a key of the app while a text field types', async () => {
      const terminal = render(<Framed typing />);

      await press(terminal, 'q');

      expect(screenOf(terminal)).toContain('log: empty');
    });
  });
});
