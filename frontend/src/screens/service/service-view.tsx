import type { ReactNode } from 'react';

import type { Health } from '@coverage-autopilot/api-contracts/health';

import { AppShell, type ShellFrame } from '#components/app-shell';
import { FactLine } from '#components/fact-line';
import { FactRow } from '#components/fact-row';
import { type KeyHint, KeyHints } from '#components/key-hints';
import { Panel } from '#components/panel';
import { ProblemDetails } from '#components/problem-details';
import { Section } from '#components/section';
import { SplitView } from '#components/split-view';
import { StatusIndicator } from '#components/status-indicator';
import { StatusLine } from '#components/status-line';
import type { DatedRequest } from '#hooks/use-dated-request';
import {
  environmentRows,
  headlineOf,
  type HealthRow,
  type Moment,
  statusRows,
  UNKNOWN,
} from '#screens/service/health-words';
import {
  type Restart,
  restartBlockOf,
  restartNoticeOf,
} from '#screens/service/restart';
import { layoutOf } from '#theme/widths';

/** The two panels of the screen, the first one with the focus. */
export const SERVICE_PANELS = ['status', 'storage'] as const;

type ServicePanel = (typeof SERVICE_PANELS)[number];

interface ServiceViewProps {
  readonly frame: ShellFrame;
  readonly health: DatedRequest<Health>;
  /** What the last request threw, other than a service that is down. */
  readonly fault: unknown;
  readonly moment: Moment;
  readonly focused: ServicePanel;
  readonly restart: Restart;
}

const PATH = ['Service'];

/** Where the service keeps its files. The health does not say it yet. */
const STORAGE_ROWS: readonly HealthRow[] = [
  { label: 'Data', fact: UNKNOWN },
  { label: 'Output', fact: UNKNOWN },
  { label: 'Log', fact: UNKNOWN },
];

function Rows({ rows }: { readonly rows: readonly HealthRow[] }): ReactNode {
  return rows.map((row) => (
    <FactRow key={row.label} label={row.label}>
      <FactLine facts={[row.fact]} />
    </FactRow>
  ));
}

function StatusPanel({
  health,
  moment,
  focused,
}: {
  readonly health: Health | undefined;
  readonly moment: Moment;
  readonly focused: boolean;
}): ReactNode {
  return (
    <Panel title="Service" focused={focused}>
      {health === undefined ? null : (
        <>
          <StatusIndicator look={headlineOf(health)} />
          <Section title="STATUS">
            <Rows rows={statusRows(health, moment)} />
          </Section>
          <Section title="ENVIRONMENT">
            <Rows rows={environmentRows(health, moment)} />
          </Section>
        </>
      )}
    </Panel>
  );
}

function restartHintOf(props: ServiceViewProps): KeyHint {
  const block = restartBlockOf(props.health.answer, props.restart);
  const hint = { key: 'r', label: 'restart' };
  return block === undefined ? hint : { ...hint, inactive: block };
}

function StoragePanel(props: ServiceViewProps): ReactNode {
  return (
    <Panel title="Storage and actions" focused={props.focused === 'storage'}>
      <ProblemDetails
        headline="The health could not be read"
        refusal={undefined}
        fault={props.fault}
        next="The screen asks again every second. If this stays, the client and the service may be of different versions."
      />
      <Section title="STORAGE">
        <Rows rows={STORAGE_ROWS} />
      </Section>
      <Section title="ACTIONS">
        <KeyHints hints={[restartHintOf(props)]} />
      </Section>
    </Panel>
  );
}

function footerHints(props: ServiceViewProps): KeyHint[] {
  const restart = restartHintOf(props);
  return [
    { key: 'tab', label: 'other panel' },
    ...(restart.inactive === undefined ? [restart] : []),
  ];
}

/**
 * Whether everything is in order: the state of the service, the tools it
 * found, where it keeps its files and what can be done with it.
 */
export function ServiceView(props: ServiceViewProps): ReactNode {
  const { frame, health, moment } = props;
  const notice = frame.notice ?? restartNoticeOf(props.restart);
  const facts =
    health.answer === undefined
      ? []
      : [`service ${health.answer.serviceVersion}`];
  return (
    <AppShell
      {...frame}
      {...(notice === undefined ? {} : { notice })}
      body={
        <SplitView
          layout={layoutOf(frame.size)}
          shown={props.focused === 'status' ? 'left' : 'right'}
          left={
            <StatusPanel
              health={health.answer}
              moment={moment}
              focused={props.focused === 'status'}
            />
          }
          right={<StoragePanel {...props} />}
        />
      }
      status={
        <StatusLine
          path={PATH}
          facts={facts}
          freshness={{ ...health, now: moment.now }}
        />
      }
      keys={<KeyHints hints={footerHints(props)} />}
    />
  );
}
