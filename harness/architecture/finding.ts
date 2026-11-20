export interface Finding {
  readonly rule: string;
  readonly path: string;
  readonly line: number;
  readonly detail: string;
}

/** Orders findings by path, then line, then rule, so output never moves. */
export function compareFindings(left: Finding, right: Finding): number {
  if (left.path !== right.path) {
    return left.path < right.path ? -1 : 1;
  }
  if (left.line !== right.line) {
    return left.line - right.line;
  }
  if (left.rule !== right.rule) {
    return left.rule < right.rule ? -1 : 1;
  }
  return 0;
}

export function formatFinding(finding: Finding): string {
  const place = `${finding.path}:${String(finding.line)}`;
  return `${place} ${finding.rule} ${finding.detail}`;
}
