import type { Host, NodeCommand } from '#harness/gate/host';

/** A host that runs nothing and remembers what it was asked to do. */
/** A program a host was asked to run, with what it was given. */
export interface Run {
  readonly program: string;
  readonly arguments: readonly string[];
}

export interface FakeHost extends Host {
  readonly started: NodeCommand[];
  readonly ran: Run[];
  readonly printed: string[];
}

interface Shape {
  readonly root?: string;
  /** Says whether a started program passes. Every program does by default. */
  readonly passes?: (command: NodeCommand) => boolean;
  /** Says whether a program that is not Node passes. Each does by default. */
  readonly runs?: (run: Run) => boolean;
  /** The settings of the machine. None is set by default. */
  readonly settings?: Readonly<Record<string, string>>;
  readonly processors?: number;
}

const PROCESSORS = 8;

export function fakeHost(shape: Shape = {}): FakeHost {
  const started: NodeCommand[] = [];
  const printed: string[] = [];
  const ran: Run[] = [];
  return {
    root: shape.root ?? '/nowhere',
    started,
    printed,
    ran,
    run: (program, arguments_) => {
      const run = { program, arguments: arguments_ };
      ran.push(run);
      return shape.runs?.(run) ?? true;
    },
    start: (command) => {
      started.push(command);
      return shape.passes?.(command) ?? true;
    },
    print: (text) => {
      printed.push(text);
    },
    setting: (name) => shape.settings?.[name],
    processors: shape.processors ?? PROCESSORS,
  };
}
