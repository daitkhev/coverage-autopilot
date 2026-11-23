import type { UnsupportedProject } from '#coverage/application/ports/project-detector.port';
import {
  TEST_RUNNER_NAMES,
  type TestRunnerName,
} from '#coverage/domain/value-objects/detected-project.vo';
import type { PackageManifest } from '#coverage/infrastructure/detection/package-manifest.schema';

/** A step of the detection that found what it looked for. */
export interface Found<Value> {
  readonly outcome: 'found';
  readonly value: Value;
}

/** Runners the service knows by name, to say which one it does not support. */
const OTHER_RUNNERS = [
  'mocha',
  'ava',
  'jasmine',
  'tap',
  'uvu',
  '@playwright/test',
  'cypress',
];

/** The two Vitest providers, by the package that brings each. */
const VITEST_PROVIDERS = [
  ['@vitest/coverage-v8', 'v8'],
  ['@vitest/coverage-istanbul', 'istanbul'],
] as const;

/**
 * Jest counts with Babel unless told otherwise. Babel leaves a file of
 * types alone out of the report, where the V8 provider of Jest makes a
 * row of zeros for a file it never loaded.
 */
const JEST_PROVIDER = 'babel';

export function unsupported(
  reason: UnsupportedProject['reason'],
  detail: string,
): UnsupportedProject {
  return { outcome: 'unsupported', reason, detail };
}

export function declaredPackages(manifest: PackageManifest): Set<string> {
  return new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.devDependencies ?? {}),
  ]);
}

function namedByTestScript(manifest: PackageManifest): TestRunnerName | null {
  const script = manifest.scripts?.['test'] ?? '';
  const [only, other] = TEST_RUNNER_NAMES.filter((name) =>
    new RegExp(`\\b${name}\\b`, 'u').test(script),
  );
  return other === undefined ? (only ?? null) : null;
}

function withoutSupportedRunner(
  declared: ReadonlySet<string>,
): UnsupportedProject {
  const other = OTHER_RUNNERS.find((name) => declared.has(name));
  return other === undefined
    ? unsupported('no_test_runner', 'package.json declares no test runner.')
    : unsupported(
        'other_test_runner',
        `The tests run with ${other}, and only Jest and Vitest are supported.`,
      );
}

/**
 * The runner the manifest declares. When it declares both, the test
 * script decides, and a script that names both or neither leaves the
 * project ambiguous.
 */
export function chooseRunner(
  manifest: PackageManifest,
): Found<TestRunnerName> | UnsupportedProject {
  const declared = declaredPackages(manifest);
  const [only, other] = TEST_RUNNER_NAMES.filter((name) => declared.has(name));
  if (only === undefined) {
    return withoutSupportedRunner(declared);
  }
  const chosen = other === undefined ? only : namedByTestScript(manifest);
  return chosen === null
    ? unsupported(
        'ambiguous_test_runner',
        'package.json declares Jest and Vitest, and its test script does ' +
          'not name one of them alone.',
      )
    : { outcome: 'found', value: chosen };
}

export function coverageProviderOf(
  runner: TestRunnerName,
  declared: ReadonlySet<string>,
): Found<string> | UnsupportedProject {
  const provider =
    runner === 'jest'
      ? JEST_PROVIDER
      : VITEST_PROVIDERS.find(([name]) => declared.has(name))?.[1];
  return provider === undefined
    ? unsupported(
        'no_coverage_provider',
        'Vitest measures coverage through @vitest/coverage-v8 or ' +
          '@vitest/coverage-istanbul, and package.json declares neither.',
      )
    : { outcome: 'found', value: provider };
}
