import { connect } from 'node:net';

import type { ReportView } from '@coverage-autopilot/api-contracts';

export const client = connect;
export type View = ReportView;
