/** The callbacks of a screen, each noting what the app was asked to do. */
export interface ScreenLog {
  /** What was asked, in order: `open <id>`, `patch <id>`, `back`. */
  readonly log: string[];
  readonly onOpenImprovement: (improvementId: string) => void;
  readonly onOpenPatch: (improvementId: string) => void;
  readonly onBack: () => void;
}

/** Callbacks for a screen under test, and the log they write. */
export function screenLog(): ScreenLog {
  const log: string[] = [];
  return {
    log,
    onOpenImprovement: (improvementId) => {
      log.push(`open ${improvementId}`);
    },
    onOpenPatch: (improvementId) => {
      log.push(`patch ${improvementId}`);
    },
    onBack: () => {
      log.push('back');
    },
  };
}
