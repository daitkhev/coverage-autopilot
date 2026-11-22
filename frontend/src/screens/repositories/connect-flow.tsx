import type { ErrorBody } from '@coverage-autopilot/api-contracts/errors';
import type {
  AccessCheck,
  Repository,
} from '@coverage-autopilot/api-contracts/repositories';

import type { ServiceApi } from '#api/service-api';

/** Why the repository cannot be worked on: the service, the tools, a fault. */
export type ConnectRefusal =
  | {
      readonly kind: 'refused';
      readonly status: number;
      readonly error: ErrorBody;
    }
  | {
      readonly kind: 'access';
      readonly repository: Repository;
      readonly check: AccessCheck;
    }
  | { readonly kind: 'fault'; readonly fault: unknown };

/**
 * Where the dialog stands. The service connects a repository first and
 * then checks access in one answer, so the steps are drawn when it comes.
 */
export type ConnectPhase =
  | { readonly step: 'editing' }
  | { readonly step: 'connecting'; readonly since: string }
  | {
      readonly step: 'checking';
      readonly since: string;
      readonly repository: Repository;
    }
  | { readonly step: 'refused'; readonly refusal: ConnectRefusal };

/** Only an address that is not being checked can be typed and sent. */
export function isEditable(phase: ConnectPhase): boolean {
  return phase.step === 'editing' || phase.step === 'refused';
}

function refusedBy({
  status,
  error,
}: {
  readonly status: number;
  readonly error: ErrorBody;
}): ConnectPhase {
  return { step: 'refused', refusal: { kind: 'refused', status, error } };
}

interface ConnectOptions {
  readonly api: ServiceApi;
  readonly url: string;
  /** The moment the person pressed `enter`. */
  readonly since: string;
  readonly report: (phase: ConnectPhase) => void;
}

/**
 * Connects a repository by its address and checks access to it. The
 * repository when every step passed; otherwise the refusal is reported
 * and nothing is returned. A fault the service throws is left to the
 * caller.
 */
export async function connectAndCheck({
  api,
  url,
  since,
  report,
}: ConnectOptions): Promise<Repository | undefined> {
  report({ step: 'connecting', since });
  const connected = await api.connectRepository({ url });
  if (connected.outcome === 'refused') {
    report(refusedBy(connected));
    return undefined;
  }
  const repository = connected.value;
  report({ step: 'checking', since, repository });
  const checked = await api.checkAccess(repository.id);
  if (checked.outcome === 'refused') {
    report(refusedBy(checked));
    return undefined;
  }
  if (!checked.value.passed) {
    const refusal = {
      kind: 'access',
      repository,
      check: checked.value,
    } as const;
    report({ step: 'refused', refusal });
    return undefined;
  }
  return repository;
}
