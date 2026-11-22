import type { Budget } from '@coverage-autopilot/api-contracts/improvements';
import {
  type InstallMode,
  installModeSchema,
} from '@coverage-autopilot/api-contracts/repositories';
import {
  type CoverageMetric,
  coverageMetricSchema,
} from '@coverage-autopilot/api-contracts/statuses';

import type { Command, CommandName } from '#commands/command';

/** A switch has an empty value, and a flag that lacks its value has none. */
export type Flags = ReadonlyMap<string, string | undefined>;

/**
 * The words of a command after its name, and its flags, once the line
 * has the operands and the flags the command takes.
 */
export interface Line {
  readonly first: string;
  readonly second: string;
  readonly flags: Flags;
}

/** A sentence that says what is wrong with the line. */
type Problem = string;

const REPOSITORY = /^[^/\s]+\/[^/\s]+$/u;
const PERCENT = /^\d+(?:\.\d+)?$/u;
const WHOLE_NUMBER = /^\d+$/u;
const BUDGET_KEYS = ['attempts', 'tokens', 'minutes'] as const;

/** The word for no threshold or mode of its own: the one of the service. */
const DEFAULT_CHOICE = 'default';

function repositoryProblem(repository: string): Problem | undefined {
  return REPOSITORY.test(repository)
    ? undefined
    : `${repository} is not a repository; name it as owner/name.`;
}

/**
 * A number is checked by its shape only. Whether it is in range is a rule
 * of the service, which refuses it in its own words.
 */
function belowOf(
  text: string | undefined,
): { readonly below?: number } | Problem {
  if (text === undefined) {
    return {};
  }
  return PERCENT.test(text)
    ? { below: Number(text) }
    : `--below takes a percent such as 80, not ${text}.`;
}

/** The counters are those of the contract, so a new one needs no change here. */
function metricOf(
  text: string | undefined,
): { readonly metric?: CoverageMetric } | Problem {
  if (text === undefined) {
    return {};
  }
  const metric = coverageMetricSchema.options.find((each) => each === text);
  return metric === undefined
    ? `--metric takes one of ${coverageMetricSchema.options.join(', ')}.`
    : { metric };
}

/** A whole percent, checked by its shape only, as `belowOf` says. */
function thresholdOf(
  text: string,
): { readonly percentage: number | null } | Problem {
  if (text === DEFAULT_CHOICE) {
    return { percentage: null };
  }
  return WHOLE_NUMBER.test(text)
    ? { percentage: Number(text) }
    : `A threshold is a whole percent such as 90, or ${DEFAULT_CHOICE}, ` +
        `not ${text}.`;
}

function thresholdCommand(line: Line): Command<'repo threshold'> | Problem {
  const threshold = thresholdOf(line.second);
  if (typeof threshold === 'string') {
    return threshold;
  }
  return (
    repositoryProblem(line.first) ?? {
      name: 'repo threshold',
      repository: line.first,
      ...threshold,
    }
  );
}

/** The modes are those of the contract, so a new one needs no change here. */
function installModeOf(
  text: string,
): { readonly mode: InstallMode | null } | Problem {
  if (text === DEFAULT_CHOICE) {
    return { mode: null };
  }
  const mode = installModeSchema.options.find((each) => each === text);
  return mode === undefined
    ? `A mode of install is ${installModeSchema.options.join(' or ')}, or ` +
        `${DEFAULT_CHOICE}, not ${text}.`
    : { mode };
}

function trustCommand(line: Line): Command<'repo trust'> | Problem {
  const mode = installModeOf(line.second);
  if (typeof mode === 'string') {
    return mode;
  }
  return (
    repositoryProblem(line.first) ?? {
      name: 'repo trust',
      repository: line.first,
      ...mode,
    }
  );
}

/** The limits a person set. The service fills the others with its defaults. */
function budgetOf(flags: Flags): Partial<Budget> | Problem {
  const budget: { -readonly [Key in keyof Budget]?: number } = {};
  for (const key of BUDGET_KEYS) {
    const text = flags.get(`--${key}`);
    if (text !== undefined && !WHOLE_NUMBER.test(text)) {
      return `--${key} takes a whole number such as 3, not ${text}.`;
    }
    if (text !== undefined) {
      budget[key] = Number(text);
    }
  }
  return budget;
}

function filesCommand(line: Line): Command<'files'> | Problem {
  const below = belowOf(line.flags.get('--below'));
  const metric = metricOf(line.flags.get('--metric'));
  if (typeof below === 'string') {
    return below;
  }
  if (typeof metric === 'string') {
    return metric;
  }
  const state = line.flags.has('--unmeasured')
    ? ({ state: 'unmeasured' } as const)
    : {};
  return (
    repositoryProblem(line.first) ?? {
      name: 'files',
      repository: line.first,
      query: { ...below, ...metric, ...state },
    }
  );
}

/** Without `--review` the mode is said, so a later default cannot change it. */
function improveCommand(line: Line): Command<'improve'> | Problem {
  const budget = budgetOf(line.flags);
  if (typeof budget === 'string') {
    return budget;
  }
  return (
    repositoryProblem(line.first) ?? {
      name: 'improve',
      repository: line.first,
      wait: line.flags.has('--wait'),
      request: {
        filePath: line.second,
        mode: line.flags.has('--review') ? 'review' : 'automatic',
        budget,
      },
    }
  );
}

/** Each command made from its line, or the sentence that says what is wrong. */
const BUILDERS: {
  readonly [Name in CommandName]: (line: Line) => Command<Name> | Problem;
} = {
  // The service judges the address, and refuses one of no repository.
  'repo add': (line) => ({ name: 'repo add', url: line.first }),
  'repo list': () => ({ name: 'repo list' }),
  'repo check': (line) =>
    repositoryProblem(line.first) ?? {
      name: 'repo check',
      repository: line.first,
    },
  'repo threshold': thresholdCommand,
  'repo trust': trustCommand,
  scan: (line) =>
    repositoryProblem(line.first) ?? {
      name: 'scan',
      repository: line.first,
      wait: line.flags.has('--wait'),
    },
  files: filesCommand,
  improve: improveCommand,
  list: () => ({ name: 'list' }),
  status: (line) => ({ name: 'status', id: line.first }),
  patch: (line) => ({ name: 'patch', id: line.first }),
  approve: (line) => {
    const hash = line.flags.get('--hash');
    return hash === undefined
      ? 'approve needs --hash <hash>.'
      : { name: 'approve', id: line.first, hash };
  },
  cancel: (line) => ({ name: 'cancel', id: line.first }),
  doctor: () => ({ name: 'doctor' }),
};

/** The command of a name from its line, or what is wrong with its values. */
export function buildCommand(name: CommandName, line: Line): Command | Problem {
  return BUILDERS[name](line);
}
