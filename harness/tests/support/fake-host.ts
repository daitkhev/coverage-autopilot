import type { Host, NodeCommand } from '#harness/gate/host';

/** A host that runs nothing and remembers what it was asked to do. */
export interface FakeHost extends Host {
  readonly started: NodeCommand[];
  readonly printed: string[];
}

interface Shape {
  readonly root?: string;
  /** Says whether a started program passes. Every program does by default. */
  readonly passes?: (command: NodeCommand) => boolean;
  /** The settings of the machine. None is set by default. */
  readonly settings?: Readonly<Record<string, string>>;
  readonly processors?: number;
}

const PROCESSORS = 8;

export function fakeHost(shape: Shape = {}): FakeHost {
  const started: NodeCommand[] = [];
  const printed: string[] = [];
  return {
    root: shape.root ?? '/nowhere',
    started,
    printed,
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
