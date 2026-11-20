import type { Finding } from '#harness/architecture/finding';
import { isInSomePlace } from '#harness/architecture/patterns';
import { workspaceOf } from '#harness/architecture/places';
import type { Policy } from '#harness/architecture/policy';
import type {
  ImportRecord,
  Manifest,
  Project,
  Rule,
  SourceFile,
} from '#harness/architecture/project';
import { isRecord } from '#harness/shared/json';
import type { PackageRule } from '#harness/shared/packages';

const BUILTIN = 'node:';
const ANY_BUILTIN = 'node:*';
const SCOPED_PARTS = 2;
const DEPENDENCY_FIELDS = ['dependencies', 'devDependencies'];

/** The package a specifier belongs to: `@scope/name/sub` is `@scope/name`. */
export function packageNameOf(specifier: string): string {
  const parts = specifier.split('/');
  const count = specifier.startsWith('@') ? SCOPED_PARTS : 1;
  return parts.slice(0, count).join('/');
}

function names(rule: PackageRule, name: string): boolean {
  const anyBuiltin =
    name.startsWith(BUILTIN) && rule.packages.includes(ANY_BUILTIN);
  return anyBuiltin || rule.packages.includes(name);
}

function takesOnly(record: ImportRecord, allowed: readonly string[]): boolean {
  return (
    record.names.length > 0 &&
    record.names.every((name) => allowed.includes(name))
  );
}

function problemOf(
  file: SourceFile,
  record: ImportRecord,
  rules: readonly PackageRule[],
): string {
  const name = packageNameOf(record.specifier);
  const known = rules.filter((rule) => names(rule, name));
  if (known.length === 0) {
    return `"${name}" is not in packages.json.`;
  }
  const here = known.filter((rule) => isInSomePlace(file.path, rule.places));
  if (here.length === 0) {
    return `"${name}" may not be imported here.`;
  }
  const limit = here.flatMap((rule) => rule.names ?? []);
  const free = here.some((rule) => rule.names === undefined);
  return free || takesOnly(record, limit)
    ? ''
    : `Only ${limit.join(', ')} may be imported from "${name}" here.`;
}

function importFindings(project: Project, policy: Policy): Finding[] {
  return project.files.flatMap((file) =>
    file.imports
      .filter(
        (record) => record.kind === 'package' || record.kind === 'builtin',
      )
      .flatMap((record) => {
        const detail = problemOf(file, record, policy.packages);
        return detail === ''
          ? []
          : [
              {
                rule: 'package-placement',
                path: file.path,
                line: record.line,
                detail,
              },
            ];
      }),
  );
}

function declaredIn(manifest: Manifest): string[] {
  const content = isRecord(manifest.content) ? manifest.content : {};
  return DEPENDENCY_FIELDS.flatMap((field) => {
    const list = content[field];
    return isRecord(list) ? Object.keys(list) : [];
  });
}

function manifestFindings(project: Project, policy: Policy): Finding[] {
  return project.manifests
    .filter(
      (manifest) => workspaceOf(manifest.path, policy.structure) !== undefined,
    )
    .flatMap((manifest) =>
      declaredIn(manifest)
        .filter((name) => !policy.packages.some((rule) => names(rule, name)))
        .map((name) => ({
          rule: 'package-placement',
          path: manifest.path,
          line: 1,
          detail: `"${name}" is declared and is not in packages.json.`,
        })),
    );
}

/** A package is imported only where the policy allows it. */
export function packagePlacement(policy: Policy): Rule {
  return {
    id: 'package-placement',
    check: (project) => [
      ...importFindings(project, policy),
      ...manifestFindings(project, policy),
    ],
  };
}
