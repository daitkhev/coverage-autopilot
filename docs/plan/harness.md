# Harness

Author: Valentin Daitkhe

The harness decides whether a change may land. Every rule of the project
is held by a tool that gives the same answer on every machine, and the
tools, their configuration and the settings of the AI agents live in
`harness/`. Where this text and the files there differ, the files win.
The rules for whoever changes the tree are in [AGENTS.md](../../AGENTS.md),
and the layout the rules hold is in
[Project structure](project-structure.md).

## Principles

- **A rule has a mechanism.** The few rules no tool can hold are in
  `AGENTS.md`. Every rule is an error, with no warnings and no list of
  known findings.
- **The same tree gives the same verdict.** `fast` and `full` use no
  clock, random number or language model, and no network but the first
  download of a tool. The stress tests depend on the scheduler, so they
  and the mutation tests are in the `ci` profile only, and in CI a person
  starts both by hand.
- **Numbers move one way.** A floor can rise and a ceiling can fall.
- **A check that did not run has failed.** A missing or partial report
  is a failure.

## The folder

| Part | Holds |
| --- | --- |
| `bin/` | One line per command, each calling a tested function: `check.ts` is the gate, `ratchet.ts` the architecture linter, the rest one step each |
| `policy/` | The rules as data: `structure.json` (modules, layers, folders, suffixes, aliases), `packages.json` (where each package may be imported), `limits.json` (every number), `mutation.json`, `frozen.json`, `tools.json` |
| `baseline.json` | The lists the ratchet recorded last, written by the ratchet only |
| `architecture/` | The ratchet and its rules, one file per rule |
| `gate/` | The steps and the profiles as data, and `host.ts`, the one file that reads the environment |
| `eslint/`, `configs/` | ESLint, and the configuration of every other tool |
| `documents/`, `mutation/` | The link check, and the kill rate of a mutation report |
| `agents/` | The hooks of any AI agent, and the settings of Claude Code and Codex |
| `git/` | `pre-commit`, `commit-msg` and `pre-push` |
| `fixtures/`, `tests/` | Small repositories that are wrong or right on purpose, and the tests of the harness |

## The gate

| Profile | When | Steps |
| --- | --- | --- |
| `fast` | After each small group of edits, and before a commit | `format`, `lint`, `types`, `architecture` |
| `full` | Before work is called done, and before a push | `fast`, then `compare`, `unused`, `duplication`, `build`, `unit`, `integration`, `e2e`, `coverage`, `documents`, `secrets` |
| `ci` | In CI | `full`, then `workflows`, `runners`, `stress`, `mutation` |

| Step | Tool | Fails when |
| --- | --- | --- |
| `format` | Prettier | A file differs from its formatted form |
| `lint` | ESLint with typescript-eslint | There is any finding |
| `types` | TypeScript, for the root and each workspace | There is any error |
| `architecture` | The ratchet | A rule has a finding, or the lists differ from the baseline |
| `compare` | The ratchet against a base commit | A recorded migration changed, or a limit got looser |
| `unused` | Knip | A file, export or dependency is unused or undeclared |
| `duplication` | jscpd | Copied lines pass 0.9% |
| `build` | rolldown | The package in `dist/` cannot be built, or a warning is printed |
| `unit`, `integration` | Vitest | A test fails |
| `e2e` | Vitest on the built package | A test fails |
| `coverage` | Vitest, one area at a time | A counter is below 95%, or a source file is missing from the report |
| `documents` | markdownlint and an offline link check | A rule is broken, such as a line past 80 columns, or a link or anchor leads nowhere |
| `secrets` | gitleaks | A credential is in the history or in a file git sees |
| `workflows` | actionlint, zizmor | An action is not pinned to a commit, or a job has more rights than it uses |
| `runners` | Jest and Vitest on fixture projects | A runner stops reporting coverage as the service relies on |
| `stress` | Vitest on the built service | A guarantee breaks under load or random kills |
| `mutation` | StrykerJS, then `mutation.ts` | A kill rate is below its floor, or the report is incomplete |

- A step can run alone by its name, as `check.ts lint`, and never
  repairs anything.
- gitleaks, actionlint and zizmor are programs. `tools.json` names the
  version and checksum of each, and the step downloads it once.

## The ratchet

The ratchet is the project's own architecture linter. It parses every
file git sees, follows every import through the aliases to its file, and
builds a graph of every import and one without `import type`.

| Rule | Fails when |
| --- | --- |
| `unknown-module`, `unknown-layer`, `misplaced-file` | A folder or a suffix is outside the places `structure.json` names |
| `file-name` | A name is not kebab-case, or is `index`, `utils`, `helpers`, `common` or `misc` |
| `relative-import`, `unresolved-import` | An import starts with a dot, or an alias leads to no file |
| `layer-direction`, `module-boundary`, `module-direction` | A layer, a module or shared code imports what it may not, or a module is entered other than through its contracts |
| `workspace-boundary`, `client-direction` | An alias crosses workspaces, or a folder of the client imports outside its row |
| `package-placement`, `package-manifest`, `lockfile-source` | A package is imported where `packages.json` does not allow it, a manifest has a field or a range it may not, or the lockfile holds a source other than the registry |
| `import-cycle` | Files import each other in a circle |
| `test-placement`, `unit-test-reach` | A test is outside a folder of its kind, or a unit test reaches I/O through any chain of imports |
| `unknown-file` | A file or a link is of a kind its place does not list |

`baseline.json` holds two lists that must not change unseen: the exports
of each module's contracts, and the hash of every migration by its file
name. `npm run ratchet:write` records them, and refuses while a rule has
a finding or a recorded migration changed.

## Numbers

Every number is in `policy/limits.json`, and `compare` fails a change
that moves one the wrong way.

| Number | Value | May move |
| --- | --- | --- |
| Coverage floor of each area, four counters | 95 | Up |
| Kill rate floor of the harness | 88 | Up |
| Duplication ceiling | 0.9% of lines | Down |
| Lines in a function, branches, nesting, parameters | 50, 8, 3, 3 | Down |
| Lines in a file | 300 | Down |

ESLint starts from the strict, type-checked sets of typescript-eslint and
adds what a file can break on its own, such as no `Date`, no read of the
environment outside the files named for it, no `.then(`, no default
export and one class per file. A comment cannot turn a rule off. Each
rule the policy adds has a wrong and a right fixture.

## Tests of the harness and the product

- Coverage is measured per area, the harness and each workspace by its
  own unit and integration tests.
- The stress tests start the built service as processes: a storm of
  requests while jobs run, a service killed at random, and services
  racing to start on one folder.
- Mutation tests run on the harness only, and no floor is set yet for the
  product. A run takes its machine settings from the environment or a
  `.env` that is never committed: `HARNESS_MUTATION_WORKERS`,
  `HARNESS_MUTATION_MEMORY_MB` and `HARNESS_MUTATION_TIMEOUT_MS`.

`mutation.ts` computes the kill rate from the report itself. A timeout is
never a kill, and a missing or interrupted report fails the step:

$$
\frac{\text{Killed}}
{\text{Killed} + \text{Survived} + \text{NoCoverage} + \text{Timeout}}
$$

## Hooks

| Hook | Holds |
| --- | --- |
| `pre-commit` | `fast` |
| `commit-msg` | A Conventional Commit with a lower-case subject, no scope but those of Dependabot, and a header of at most 80 characters |
| `pre-push` | No push to `main` and no rewrite of history, then `full` |
| Agent, before a shell command | No `--no-verify`, no forced push, no push to `main`, no change of `core.hooksPath`, no `gh pr merge` |
| Agent, before an edit | A file of the policy waits for the owner. In a linked work tree it is refused |
| Agent, when it is done | `full` on the tree it worked in. A red step sends it back once with the last 8,000 characters of the output |

- The agent hooks are written once and know no agent.
  `.claude/settings.json` and `.codex/hooks.json` are links to the
  settings in `harness/agents/`.
- A verdict is kept by the fingerprint of the tree in `reports/gate/`, so
  the same tree is not judged twice.

## Who judges the judge

`frozen.json` names the policy: everything in `harness/` except
`baseline.json`, every file at the root except `README.md` and the
lockfile, every `tsconfig`, `.github/`, `.claude/` and `.codex/`.

| A change that | Lands as |
| --- | --- |
| Adds an export to a contract, or a migration | One change: the code and `baseline.json` |
| Adds a dependency | First `packages.json` alone, then the code with its manifest and lockfile |
| Adds or updates a tool | One change of the policy, with the lockfile |
| Adds a rule that existing code breaks | First the code is fixed, then the rule |

- A change of the policy and a change of anything else never land
  together. The `frozen` workflow runs on `pull_request_target`, so
  GitHub takes it from the default branch, and it judges the list of
  changed files without checking the change out. The promotion of `dev`
  into `main` is not judged.
- CI runs each step of `ci` as its own job, with `compare`, the commit
  messages and the branch name, and holds no secret. The mutation step
  runs on pull requests into `main` and by hand.
- Install scripts are off for every package. The settings of the
  repository on GitHub are not files, and no check here holds them.
