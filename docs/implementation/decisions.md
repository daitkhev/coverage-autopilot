# Decisions made during the implementation

The documents of [the plan](../plan/system-design.md) describe the design
as it was before the first line of the product. A decision made after
that is written here, grouped by topic. Where this file and the plan
differ, this file and the code are right.

Every entry has one shape: a heading that states the decision, bullets
that say what holds now, a `Why:` with the fact or the measurement
behind it, and a `Where:` with the paths. What is still open is in the
last section and nowhere else.

## Contents

- [The service and its start](#the-service-and-its-start)
- [The queue and the jobs](#the-queue-and-the-jobs)
- [Scans and coverage](#scans-and-coverage)
- [Package managers and the install](#package-managers-and-the-install)
- [The sandbox and the secrets](#the-sandbox-and-the-secrets)
- [The improvement and its budget](#the-improvement-and-its-budget)
- [The generator](#the-generator)
- [Verification of a patch](#verification-of-a-patch)
- [Publication: git, gh and forks](#publication-git-gh-and-forks)
- [The contract between client and service](#the-contract-between-client-and-service)
- [The client](#the-client)
- [The harness and the tests](#the-harness-and-the-tests)
- [What real runs showed](#what-real-runs-showed)
- [Open debts and ideas left for later](#open-debts-and-ideas-left-for-later)

## The service and its start

### The client and the service are one package that plain Node runs

- One package: one build, one list of dependencies, one install. The
  build bundles the code of this repository with every `#` import
  resolved, and leaves the npm packages as imports. The bundler is the
  one the test runner already brings, and a warning fails the build.
- `dist/` holds `bin/service.js`, the program of the client (the `bin`
  of the manifest), the migrations and one `package.json` made from the
  root manifest and the dependencies of every workspace. One package
  asked for at two versions stops the build.
- No file is found from the place of another source file. The entry
  finds the migrations and the manifest one step up from its own place,
  built or not, because the build keeps them at the same path from the
  bundle. So the migrations live in the folder of the database code and
  the image files in the folder of the sandbox, not where the plan put
  them; the ratchet records a migration by its file name, so a moved
  folder does not read as removed migrations.
- Why: the end-to-end tests start the built file, so they test what a
  person installs, and no TypeScript loader runs the service. A bundle
  with every package inside also started, and stays a later option.
- Where: `harness/gate/run-build.ts`, `backend/src/main.ts`,
  `backend/src/shared/infrastructure/database/migration-files.ts`.

### A service starts in one order, under one lock

- The instance folder is made and kept to its owner, the lock is taken,
  the database is migrated and checked, and only then a socket a crashed
  service left is removed. A step that fails gives back what the steps
  before it took. A folder with no migrations is refused.
- The lock is `BEGIN EXCLUSIVE` on a SQLite file of its own, taken with
  no wait, and held by a reference for the life of the service: a lock
  the garbage collector takes is released. The socket is touched only
  by functions that take the held lock as an argument, and a path that
  holds anything but a socket is left alone.
- A stopping service deletes its socket before it gives back the lock,
  or its close could delete the socket of the next one. So a start that
  finds the lock held and no socket looks again for up to five seconds,
  and one that finds a socket leaves at once and says why.
- Why: only a lock tells a stale socket from a live one, and an
  exclusive transaction needs nothing else and holds between processes.
- Where: `backend/src/shared/infrastructure/database/instance-lock.ts`,
  `backend/src/shared/infrastructure/service/service-start.ts`.

### The composition binds the modules, and each module makes its values

- `backend/src/composition/` holds the root module, the settings of each
  module, the run, the process, the start of the images and the sweep of
  leftovers. Only the entry imports it. `main.ts` holds two paths and one
  call; the client has the same folder.
- Each module has `register(values)` and makes its own value objects.
  The worker takes exactly one handler for each kind of job.
- What the environment does not hold is a constant there: the metric
  (lines), the seven checks of the gate and three repeated runs, the
  version of the mutation tool, the tools the generator may use, a kill
  rate of 50 and a limit of 10 surviving mutants.
- Why: shared code may not import a module, so what binds the modules
  cannot be shared infrastructure, and a test gives every value.
- Where: `backend/src/composition/app.module.ts`,
  `backend/src/composition/module-settings.ts`.

### Only the entry files read the environment

- `process.env` is read by the host of the gate, the two entry files and
  the stand-in of the engine in the tests. Lint refuses every other way
  to reach it, by name, by text, through `globalThis` or an import.
- A wrong value stops the start and the message names every wrong
  variable. `.env.example` lists each variable with its default.
- Why: the loader of the configuration takes the variables as an
  argument, so a test decides every setting.
- Where: `harness/eslint/restricted-syntax.ts`,
  `backend/src/shared/infrastructure/config/`, `.env.example`.

### Time is one Instant over the Temporal of the platform

- A moment is an `Instant`: whole milliseconds in UTC, read and written
  as one text, `YYYY-MM-DDTHH:mm:ss.sssZ`, in the database and the
  contract alike. The client shows it in the time zone of its user.
- `Instant` asks `Temporal`, which Node has from 26.0, and still checks
  the text by its shape. The clock is `Temporal.Now`, read in one file of
  the service and one of the client; lint refuses it elsewhere, and
  `Date` everywhere.
- Why: the client needs the same arithmetic and cannot import the kernel,
  so the platform type spares a second implementation. It replaced a
  calendar of our own and a clock that was late after a suspend on Linux.
  Its price: the clock steps when the system sets its time.
- Where: `backend/src/shared/kernel/time/instant.ts`,
  `frontend/src/api/clock.ts`, `backend/tests/support/fixed-clock.ts`.

### An idle service can be asked to stop

- `POST /service/stop` answers 202 and stops once the answer is written.
  While a job runs it answers 409, since the job would go back to the
  queue half done; a queued job waits for the next start.
- `GET /health` and the stop live in the shared HTTP code and reach the
  service through a port the composition binds.
- Why: a client of a newer contract replaces an idle service.
- Where: `backend/src/shared/infrastructure/http/service.controller.ts`.

### A journey can be read in the log by one id

- Every job leaves a line when it is taken, ends, fails, is put back or
  is given up, and every step of a scan and of an improvement one at its
  start and end, with the ids of the job, the repository and the
  improvement. A scan or an improvement is about ten lines at info.
- Every program the service starts leaves one line at debug with its
  arguments, exit code and time, secrets hidden. A container run shows
  the image and the program alone. No environment, input or output.
- Why: a journey used to be four lines with no step, tool or host call.
- Where: `backend/src/shared/infrastructure/queue/job-worker-log.ts`,
  `backend/src/shared/infrastructure/logging/tool-log.ts`.

## The queue and the jobs

### A job that cannot be read is dead at its first claim

- A payload that is not a document with a version is never run or
  claimed again. The worker buries the job and calls its handler with
  `payload: null`, so its object fails like one whose runs are spent.
- Why: no run of the code can read it, so every retry would fail alike.
- Where: `backend/src/shared/infrastructure/queue/job-worker.ts`.

### A job can wait for its moment, and the queue answers for an object

- A job may carry a moment before which no worker takes it. A wait for a
  window leaves such a job in the save that starts the wait. A waiting
  job holds nothing, and its moment is no part of its identity.
- The queue cancels every open job of an object by the id of the object,
  and tells what its pending job waits for: its moment, its repository
  or a free worker. An index finds the open job of a subject.
- A job keeps the moment of its first claim; its end is its last change.
- Why: no timer has to outlive a restart, a cancel knows the improvement
  and not its jobs, and the screens group work by what it waits for.
- Where: `backend/src/shared/infrastructure/database/sqlite-job-leases.ts`,
  migrations `0006` to `0008`.

## Scans and coverage

### A scan is its job, read in the words of a scan

- The id of a scan is the id of its job, and no table of scans exists:
  `pending` reads `queued`, `leased` reads `running`, and a completed
  job reads by its outcome.
- A fault that is not retried, a removed repository and a dead job all
  read `retries_exhausted`, which to a person means nothing runs it
  again. A cancel of an ended scan answers it as it is, and the steps of
  a scan are shown only while they belong to its job.
- Why: the job already keeps everything a scan has.
- Where: `backend/src/modules/coverage/application/dto/scan-dto-mapping.ts`.

### A scan starts from the head the repositories module reads

- `resolveHead` reads the head of the default branch, stores it with the
  repository and returns it; the access check does the same. A
  repository is `outdated` when that head is not the commit of its
  newest snapshot. Commits behind are not counted.
- Why: a scan needs a commit, and the plan did not say who finds it. A
  stored head costs a list no call to the host, and shows a stale
  snapshot before an improvement fails on it.
- Where:
  `backend/src/modules/repositories/application/contracts/repositories-public-api.ts`.

### A scan lists its sources and measures exactly that list

- A file is a source when the TypeScript parser finds code that runs in
  it; a link in its place is refused. The `typescript` package may be
  imported only in the adapters of the coverage module, to parse.
- The runner measures the listed files alone (`--coverage.include`,
  `--collectCoverageFrom`), and its report is read for them alone.
- Folders of code that only calls the product are left out at any depth
  and in any case: `examples`, `example`, `demos`, `demo`, `samples`,
  `sample`, `benchmarks`, `benchmark`, `bench`, `fixtures` and
  `__fixtures__`. `docs` and `scripts` stay. The rule is named
  `typescript-sources-v2`, so a new list never compares with an old one.
- Why: without a list both runners leave out every file no test imports.
  A real scan counted the scripts of an `examples` folder and picked one
  to improve. A product file left out is missed in silence, so the list
  is short; its price is that `src/samples` of a product is left out.
- Where: `backend/src/modules/coverage/infrastructure/detection/source-file-list.ts`,
  `backend/src/modules/coverage/infrastructure/classification/`.

### A file keeps its four counters as columns

- `file_coverages` has a column for statements, branches, functions and
  lines; the document of a file holds what never ran. The files of a
  snapshot are one query with three filters.
- Why: the files are filtered and sorted by their numbers.
- Where: `backend/src/modules/coverage/infrastructure/persistence/`.

### A test run that wrote no coverage report fails the scan

- Such a run ends in `coverage_report_missing` with the output of the
  tests. Vitest gets `--coverage.reportOnFailure=true`, and Jest reports
  after a failure anyway, so a red test still measures.
- Why: it used to be a snapshot of unmeasured files with no cause.
- Where: `backend/src/modules/coverage/infrastructure/runners/vitest-command.ts`.

### Both runners write one JSON report of the tests

- Jest gets `--json --outputFile=<path>` and Vitest a second `json`
  reporter, both to `node_modules/.coverage-autopilot-test-results.json`
  in the copy, removed before each run. One reader gives the failure the
  generator hears and the tests that failed before a patch.
- Jest also gets a reporter the service writes into the copy, by an
  absolute path, which keeps only names, states and messages. Whatever
  is at its path is removed first, so no link is written through.
- Why: Jest writes every thrown value whole, and a failed request of an
  HTTP client holds a cycle, so on a real repository Jest wrote no report.
- Where: `backend/src/modules/coverage/infrastructure/reports/`,
  `backend/src/modules/coverage/infrastructure/runners/jest-results-reporter.ts`.

### A repository keeps a threshold of its own

- The default is `AUTOPILOT_COVERAGE_THRESHOLD`, a whole percent of lines
  from 1 to 100, and 80 when unset. A repository may keep its own
  (migration `0009`), set by `POST /repositories/:id/threshold` with a
  `percentage` or `null`, by `repo threshold`, or by `t` on its screen.
- The coverage module asks for it each time it judges a file, so a change
  counts at once, for older snapshots too. A lent copy has none.
- A change of the threshold, of the install mode and a look at the head
  each read the repository again in their transaction and save it whole,
  since the host may take seconds to answer.
- Why: the owner chose a threshold for each repository with a default of
  the environment, and asking each time needs no new scan.
- Where: `backend/src/modules/repositories/application/commands/change-threshold/`,
  `backend/src/modules/coverage/application/repository-thresholds.ts`.

## Package managers and the install

### The manager is the one the repository names, fetched by Corepack

- The manager is the one the `packageManager` field names at an exact
  version, else the one whose lockfile the copy has. npm is the npm of
  the image. Refused: a range or an address, two lockfiles and no field,
  a field without its lockfile, mixed yarn generations, bun and
  monorepos.
- Corepack 0.36.0 is in the image and fetches the exact program from
  the npm registry (`COREPACK_NPM_REGISTRY`, `COREPACK_ENV_FILE=0`)
  while the install has the network. Without a hash it checks pnpm and
  yarn 1 only, so the service pins the hash of each yarn 2 or later. The
  program lives in the memory home and goes with the container, so no
  later command, which has no network, can start a manager.
- Without a field the lockfile format picks: pnpm `5.4` is 7.33.7, `6.0`
  is 8.15.9, `9.0` is 10.34.9; yarn 1 is 1.22.22; yarn by
  `__metadata.version` 6, 8, 9 and 10 is 3.8.7, 4.13.0, 4.14.1, 4.18.1.
- Why: repositories ask for pnpm 7 to 12 and yarn 1, 3 and 4, so a baked
  manager would be wrong for most. A `.corepack.env` sent the download
  elsewhere in the spike. An immutable install by a yarn of another
  format failed with YN0028, and a wrong hash failed.
- Where: `backend/src/modules/coverage/infrastructure/detection/manager-choice.ts`,
  `backend/src/shared/infrastructure/sandbox/sandbox.Dockerfile`.

### A sandboxed install runs no code of the repository

- Every install skips scripts and hooks; the commands are in the table
  below. yarn 2 and later read a settings file the service writes: the
  `.yarnrc.yml` of the repository without `yarnPath`, `plugins` and
  `enableConstraintsChecks`, the rest kept, since package extensions
  change how the lockfile resolves. A line the service cannot read is
  refused, since a dropped setting could hide in it. The file is never
  written through a link and reaches no patch and no publication.
- yarn 1 gets `--ignore-engines`, so a package that asks for another
  Node installs, as with npm.
- Refused with `install_runs_code`: pnpm `configDependencies`, a package
  from git, an `exec:` package, and a pnpm lockfile with
  `pnpmfileChecksum`. Refused with `plug_and_play`: yarn 2 and later
  without `nodeLinker: node-modules`. The detail says how to trust the
  repository instead.
- The cache is on the disk of the copy, under `node_modules` (`.yarn/cache`
  for yarn 2 and later), and the runner version comes from the lockfile.
- Why, from a spike on fixtures that leave a mark: without the switches
  pnpm ran `.pnpmfile.cjs` and `postinstall`, yarn 1 ran a `yarnPath`,
  and yarn 4 ran `yarnPath`, a plugin, `postinstall` (even with
  `YARN_ENABLE_SCRIPTS=0`, until `--mode=skip-build`) and
  `yarn.config.cjs`. With them, pnpm 10.34.9 and yarn 1.22.22, 3.8.7 and
  4.18.1 ran nothing and left the manifest and lockfile as they were.
  Under `node_modules` yarn 2 and later removed their own cache.
- Where: `backend/src/modules/coverage/infrastructure/detection/`.

### A repository may be trusted to install as its developers do

- Trusted, its code and the scripts of its packages run during the
  install, with the network open. That code can send away anything in
  the copy, but cannot read a credential of this computer: the container
  holds no token, no key, no socket and no database. A person trusts a
  repository only when they would run its install on their own machine.
- The default is `AUTOPILOT_INSTALL` (`sandboxed` when unset). A
  repository may keep its own mode (migration `0010`), set by
  `POST /repositories/:id/install-mode`, `repo trust`, or `i` on its
  screen, whose dialog says what trusted code can reach. The mode is
  asked each time a copy is detected, so a mode taken back in the middle
  of a run ends it with an honest refusal.
- Trust changes the install alone. Every `install_runs_code` case
  installs; monorepos, bun, Plug'n'Play, an unreadable `.yarnrc.yml` and
  every refusal of a runner stay refused. The image has `git` and https
  certificates and no ssh client, so a git package comes over https.
- Why: the sandboxed install refuses every project whose install needs
  code to run. In the spike pnpm 10.34.9, yarn 1.22.22 and yarn 4.18.1
  ran the scripts and installed a git package only when trusted, and npm
  11.20.0 ran a git package's `prepare` only when trusted.
- Where: `backend/src/modules/repositories/application/commands/change-install-mode/`,
  `backend/src/modules/coverage/application/repository-detection.ts`.

| Manager | Sandboxed | Trusted |
| --- | --- | --- |
| npm | `npm ci --ignore-scripts --no-audit --no-fund --cache <cache>` | without `--ignore-scripts` |
| pnpm | `corepack pnpm@<v> install --frozen-lockfile --ignore-scripts --ignore-pnpmfile --store-dir <cache> --config.manage-package-manager-versions=false --reporter=append-only` | without `--ignore-scripts` and `--ignore-pnpmfile` |
| yarn 1 | `corepack yarn@<v> install --frozen-lockfile --ignore-scripts --ignore-engines --non-interactive --cache-folder <cache>` with `YARN_IGNORE_PATH=1` | without `--ignore-scripts` and `YARN_IGNORE_PATH` |
| yarn 2 and later | `corepack yarn@<v> install --immutable --mode=skip-build` with `YARN_IGNORE_PATH=1`, `YARN_RC_FILENAME=.coverage-autopilot-yarnrc.yml`, `YARN_ENABLE_SCRIPTS=0` | `--immutable` alone, reading the `.yarnrc.yml` of the repository |

Both modes of yarn 2 and later also set `YARN_ENABLE_GLOBAL_CACHE=0`,
`YARN_ENABLE_MIRROR=0`, `YARN_CACHE_FOLDER=.yarn/cache`,
`YARN_ENABLE_TELEMETRY=0`, `YARN_CHECKSUM_BEHAVIOR=throw` and
`YARN_NODE_LINKER=node-modules`.

## The sandbox and the secrets

### A command runs in a sandbox with three variables and no network

- `Sandbox` is a shared port: one command of an untrusted repository in
  a working copy, with the listed variables and no network unless the
  install opens it. A failed or timed-out command is a value.
  `ArtifactStore` keeps raw output in files named by their hash, and a
  file that is gone reads as nothing.
- A command gets the `PATH` of the image, a home in the scratch folder
  and `CI`. It runs as the user of the service (or
  `AUTOPILOT_SANDBOX_UID` and `_GID`, never 0) on a read-only root.
- The generator runs in a second instance of the same port, with its own
  image and an open network.
- Why: a command must write into the copy the service made, and must
  find no secret of this computer.
- Where: `backend/src/shared/application/ports/sandbox.port.ts`,
  `backend/src/shared/infrastructure/sandbox/container-arguments.ts`.

### A credential reaches only the program that needs it

- The credential of the generator comes from the environment, is never
  stored, and goes to the generator sandbox alone. `gh` gets the
  variables of its login; git gets `PATH`, `HOME` and the four author
  variables; the engine gets its own short list.
- A mismatch with the contract names the place and the rule, never the
  value, and a log line hides the secrets its runner knows.
- Why: the generator and the tests run code a repository can steer.
- Where: `backend/src/shared/infrastructure/config/service-config.ts`.

### The service builds both images from files it ships

- The image of the commands, `coverage-autopilot-sandbox:26`, is
  `node:26-slim` with `procps`, `git`, https certificates and Corepack.
  The image of the generator holds Node and the CLI at the measured
  version, `coverage-autopilot-generator:2.1.329`.
- An image the service makes is built when missing or built from another
  file, which a label with the digest of the file tells. Any other name
  is pulled when missing and never built. Every run says not to pull.
- The preparation starts in the background once the service listens; a
  command waits for it, and a stop cuts it short.
- Why: the slim image has no `ps`, which the mutation tool ends its
  runners with. No public image of the CLI comes from its maker, the
  container holds the credential, and a public tag would move.
- Where: `backend/src/shared/infrastructure/sandbox/image-preparation.ts`,
  `backend/src/shared/infrastructure/config/shipped-images.ts`.

### A working copy has one path, and git keeps out of it

- A copy is mounted at its host path, so a report names files the
  service reads as they are. Its git directory lives beside it, written
  only by the service, and every git call names both.
- A tree with a `.git` entry, at any depth and in any spelling, is
  refused with `working_copy_tampered` before git runs. A patch is taken
  only after the sandbox has ended.
- git on a copy reads no global, system or environment configuration,
  runs no hook, monitor or driver, and passes `core.fsmonitor=false`.
  The mirror and the push keep the configuration of the operator, which
  holds the credentials, and read no tree. A tool that writes more than
  64 MiB fails, and no part of its output is used.
- Why: a command can write anything into the copy, and the service runs
  git on it afterwards.
- Where: `backend/src/modules/repositories/infrastructure/git/`,
  `backend/src/modules/repositories/infrastructure/tools/tool-runner.ts`.

### A copy is removed whatever was done to it, and a start clears the rest

- A refused removal gives the owner back each folder and tries again,
  never through a link. Disposing never throws: a copy that stays is a
  log line, removed by the next copy of the id or the next start.
- A container that may still run after its command is a fault: no patch
  is taken. A start removes, under the lock and before the worker, the
  containers with its own label (made of the instance path), then every
  working copy, never a mirror.
- Why: code of a repository can leave folders the service may not empty,
  and their fault used to replace the result of a step, losing the record
  of a paid call. Two instances share one engine.
- Where: `backend/src/shared/infrastructure/sandbox/leftover-containers.ts`,
  `backend/src/composition/leftover-sweep.ts`.

### A call of the engine is stopped with its process group, twice

- The program of the engine leads its own process group, and a stop kills
  the group, and again once its leader has ended.
- Why: a hung credential helper kept the streams after its program was
  killed, so a ten-minute limit ended after twelve. One kill of the group
  missed a helper born during it in 35 of 1200 rounds under load; the
  second kill reached it every time.
- Where: `backend/src/shared/infrastructure/processes/kill-group.ts`.

## The improvement and its budget

### The budget has defaults and maximums, and tokens only with a key

- Attempts: 3, at most 10. Minutes: 30, at most 120. Tokens exist only
  with a key: 1,000,000, at most 5,000,000. `GET /settings/budget` gives
  them, so the dialog holds no number of its own.
- Why: under a subscription the windows are the limit.
- Where: `api-contracts/src/improvements.ts`.

### An improvement counts work, not waiting

- The minutes become one deadline when work starts, so a restart gives
  nothing back. Leaving `waiting_for_limit` or `awaiting_approval` moves
  the deadline later by the wait.
- The deadline stops the work through an alarm, a port beside the clock,
  and reaches each step and each call as a signal.
- Why: a person who approves the next morning spends no minute.
- Where: `backend/src/modules/improvement/domain/`,
  `backend/src/shared/application/ports/alarm.port.ts`.

### Attempts count when opened, and a patch is approved by its hash

- Every opened attempt is spent, but only ended ones decide whether a new
  one may open, so the open attempt of a run after a crash may finish.
  The allowance is asked and the attempt opened in one save.
- A rejected patch closes its attempt; an inconclusive verdict keeps it
  open in `verifying`. A save checks the version it read
  (`stale_improvement`).
- A person approves a patch by its hash, and another hash is refused.
- Why: a crash must neither give an attempt back nor spend one twice, and
  nobody approves a patch they did not see.
- Where: `backend/src/modules/improvement/domain/`.

### A request for an improvement is checked before it is stored

- Every value is built first, so a bad one costs no call to the host. The
  snapshot, the file and the head are asked outside the transaction. A
  file above the threshold is not refused: the run measures again.
- The fingerprint is a SHA-256 over the repository, the commit, the file,
  the quality policy and the generator without its billing; the key, the
  budget and the mode are no part of the work. A conflict names the
  earlier improvement.
- A quality policy without the check of test files is refused.
- An approval adds the job that publishes in the save that approves, and
  a cancel ends every open job of the improvement in the save that
  cancels.
- Why: a refusal costs nothing and stores nothing, and the check of test
  files keeps a generator out of the source.
- Where: `backend/src/modules/improvement/application/commands/start-improvement/`,
  `backend/src/modules/improvement/application/request-values.ts`.

### One handler runs an improvement, one step for each status

- Every job of an improvement has the same payload; the handler reads
  the status and goes on. A step saves its expected ends itself; a fault
  that may pass is retried, and one that will not fails the improvement
  with the reason the step names.
- `analyzing` fails with `stale_snapshot`, `mutation_unsupported`,
  `budget_exhausted`, `verification_error` or `existing_tests_fail`, and
  skips with `threshold_met` or `no_undetected_mutants`. `verifying`
  retries only when every unfinished check may finish on another run.
  `publishing` asks the head again and keeps 2000 characters of a
  refusal.
- The handler fails an improvement whose job another version of the
  service wrote, and throws on a step that went on without saving.
- What a person sees puts the wait of the job first: approval, then a
  worker or the repository, then the limit.
- Why: one place reads the state after any restart, a fault of the code
  cannot spin for ever, and a retry that ends in the same error would
  hide its reason.
- Where: `backend/src/modules/improvement/application/commands/run-improvement/`.

## The generator

### Claude Code is the generator, paid by a subscription or by a key

- Claude Code is the default and only generator for now; a model router
  and Codex are later adapters behind the same port. Who pays comes from
  `AUTOPILOT_GENERATOR_BILLING`, never from a request.
- Under a subscription the client shows the five-hour and seven-day
  windows as the generator last reported them, and never money.
- Why: for a subscription the price of a call means nothing.
- Where: `api-contracts/src/health.ts`, `api-contracts/src/statuses.ts`.

### An improvement waits for the five-hour window and fails on the weekly one

- A spent five-hour window moves the improvement to `waiting_for_limit`
  until the moment the generator said, else the end of the last window it
  reported, else an hour. Its file stays taken, its sandbox is given back,
  and it spends no attempt.
- A third spent window fails it with `quota_exhausted`; a spent weekly
  quota and every other spent limit fail at once.
- Why: the short window often opens within the hour, and losing the work
  done costs more than the wait.
- Where: `backend/src/modules/improvement/infrastructure/generator/usage-limit.ts`.

### The start of the generator is checked after its run

- The adapter reads the report of the start after the run: a tool that
  is not allowed, or any tool server, is a fault, and the output goes.
- Every file the run wrote is searched for the credential first, and a
  found one wins over every other ending. A run that wrote a `.git`
  fails as `credential_exposed`, and its cost is kept with the attempt.
- A service with no credential starts and scans, warns once, and refuses
  an improvement with 409 `generator_unavailable`.
- Why: the sandbox runs a command to its end, so a run cannot be stopped
  before its first call. Only content of the repository can have told a
  run to write a `.git` while it held the credential.
- Where: `backend/src/modules/improvement/infrastructure/generator/`.

### The generator hears how its tests failed

- The first failure of a test run travels as its own field,
  `testFailure`, never inside a message of the gate: a file that failed
  to run, else the first failed test, at most 4 lines of 200 characters,
  cut after a whole word, with control characters, copy paths and stack
  frames of packages removed. A report that is missing or of another
  shape gives no excerpt, never raw text. The attempt keeps it, and the
  history of the client shows it under the reasons of a rejection.
- Prompt version 2 tells the generator to read the runner and TypeScript
  settings first, and to remove the cause of a shown failure. The
  failure is quoted line by line after `>`, with the credential hidden
  before any cut. An improvement keeps the prompt version it began with.
- Why: a real improvement spent its three attempts on a test file that
  did not compile, while the generator heard only that its tests fail.
- Where: `backend/src/modules/coverage/infrastructure/reports/test-failure-excerpt.ts`,
  `backend/src/modules/improvement/infrastructure/generator/generation-prompt.ts`.

## Verification of a patch

### A patch only adds new test files

- A patch may add plain files whose names end like a test file
  (`.test.ts` and `.test.tsx` by default) and nothing else. The gate
  always requires this check, and the attempt keeps exactly the text it
  read, with its hash, so nothing else checks a patch before publication.
- A patch passes only as git writes new files: `new file mode 100644`,
  one hunk of added lines each, nothing outside a file, no path among the
  installed packages, and git must report exactly the files named.
- Why: the tests of the commit stay as they were, and a patch cannot
  pass by weakening one. `git apply` also takes a section with no header.
- Where: `backend/src/modules/verification/domain/services/`,
  `backend/src/modules/verification/application/commands/verify-patch/`.

### The gate measures a commit once and is given the measure back

- `measureBaseline` answers whether the commit type-checks, which tests
  fail, and which mutants nothing detects; every `verifyPatch` gets it. A
  check with nothing to compare with is `not_applicable`.
- The coverage check compares the counters of the target alone, and one
  that fell fails it.
- Why: every attempt is judged against the same commit.
- Where: `backend/src/modules/verification/application/commands/measure-baseline/`.

### The mutation tool is installed before code of the repository runs

- `installTool` runs right after the install of the packages, while the
  network is open and before any test, into
  `node_modules/.cache/coverage-autopilot/mutation` with no peer. A run
  gets `NODE_PATH=<copy>/node_modules/.pnpm/node_modules`, and both
  runners run every test.
- Why: installed later, it came after code of the repository with the
  network open. In the tree of the project it reshaped what pnpm or yarn
  laid out, and without `NODE_PATH` Jest missed `jest-environment-node`.
  A file no test imports has no related tests, so the tool ran none.
  StrykerJS 10.1.1 with Jest 30.5.2 and Vitest 4.1.12 then killed every
  mutant on pnpm, yarn 1 and yarn 4 projects.
- Where: `backend/src/modules/verification/infrastructure/mutation/stryker-configuration.ts`.

### The tests of a repository may fail in the sandbox

- `AUTOPILOT_BASELINE_TESTS` is `may_fail` (default) or `must_pass`. The
  baseline keeps the failing tests by file and full name.
- `must_pass`: a failing test ends the analysis with
  `existing_tests_fail`, saying how many fail and which first. A run that
  failed and named no test ends so under either setting.
- `may_fail`: a patch fails only on a test that fails with it and did not
  before. The files of failing tests are ignored by StrykerJS. With no
  test left, every mutant reads `no_coverage`.
- A snapshot counts the tests that ran and failed, and the client says
  `33 of 53 tests fail in the sandbox`.
- Why: tests that need the network fail in the sandbox, and the mutation
  tool stops when a test fails, so such a repository ended as
  `mutation_unsupported`, the wrong cause.
- Where: `backend/src/modules/verification/application/failing-tests.ts`,
  `backend/src/modules/verification/application/commands/verify-patch/checks/existing-tests-check.ts`.

## Publication: git, gh and forks

### git is told who commits, and an old git is refused

- The author is `Coverage Autopilot` at an address in the reserved
  domain `.invalid`, unless `AUTOPILOT_GIT_AUTHOR_NAME` and
  `AUTOPILOT_GIT_AUTHOR_EMAIL` say otherwise.
- The access check fails, as a value, for a git older than 2.36.
- Why: git would otherwise make up an author from the user and the
  machine and put it in a public pull request. An older git takes the
  `false` of `core.fsmonitor=false` for a program and starts it.
- Where: `backend/src/modules/repositories/application/commands/check-access/git-version.ts`.

### A mirror takes one fetch at a time

- Every repository has one mirror, and each change of it waits for its
  turn in one object shared by the adapters of git and of working
  copies. A read takes no turn. The turns hold within one service.
- Why: git moves a branch only from the commit it read first, so two
  fetches after the branch moved made one fail, and a request got 500.
- Where: `backend/src/modules/repositories/infrastructure/git/mirror-turns.ts`.

### A pull request holds one test commit on a branch named by the id

- The branch is `coverage-autopilot/<id>`; the commit and the title are
  `test: cover <file>`. The body shows what the gate measured, names the
  tool and no model. A push goes from a clean copy made for it.
- Why: a publication that starts again finds its own branch.
- Where: `backend/src/modules/improvement/application/commands/run-improvement/publishing.step.ts`.

### A result goes to a fork when the account may not push

- The access check says where a result goes: `repository`, or `fork`
  with the account. Publishing asks again, and on a fork it:
  1. asks `gh api --method=POST repos/<owner>/<name>/forks` and uses the
     `clone_url` of the answer, since a fork may be named `<name>-1`;
  2. waits up to 60 seconds, by `git ls-remote --symref`, for the fork to
     name its default branch;
  3. pushes the base commit to `coverage-autopilot/base-<full hash>` and
     the test commit in one atomic push;
  4. opens the pull request inside the fork, into that base.
- Each step first finds what an earlier run made. A refusal of the host
  is the outcome `refused` with its words; a fork not ready in time
  (`fork_not_ready`) and an unread permission (`permission_not_read`)
  may be tried again. `repo check`, `improve` and the start dialog say
  where a result will go before a run.
- The status of `gh` is asked with `--active`, and with no login every
  call fails at once.
- Why: the check used to fail for every repository the account does not
  own. An end-to-end test kills the service while it publishes, and the
  next start ends with one fork, one pull request and one commit. An old
  second account with a broken login in the keyring failed a status not
  asked for the active account alone.
- Where: `backend/src/modules/repositories/application/commands/publish-patch/publication-targets.ts`,
  `backend/src/modules/repositories/infrastructure/gh/gh-code-host.adapter.ts`.

## The contract between client and service

### One way to read a value and one shape of a refusal

- A value that crosses the socket is read with `parseAs` and a schema of
  the contracts package, by the service and the client alike.
- One filter answers what is not a success: 400 for a mismatch, the
  status of a refusal, 500 for a fault. The words of a fault never reach
  the client; the log keeps them.
- A route passes the signal of its request to a use case that starts a
  tool.
- Why: a presentation layer may import only the contracts and the kernel
  of what is shared, and a fault can repeat a secret of the request.
- Where: `api-contracts/src/parsing.ts`,
  `backend/src/shared/infrastructure/http/`.

### A route belongs to the module of its resource

- Repositories in `repositories`; scans, snapshots and their files in
  `coverage`; improvements in `improvement`. What a module above knows
  comes in through a port the module below declares in its contracts.
  The class that implements a port names its token, the module file binds
  it, and the modules are global, so the module below can inject it.
- Why: routes placed by who knew the whole answer left modules that only
  passed calls on. Joining answers in the client would cost a list one
  request per row.
- Where: `backend/src/modules/repositories/application/contracts/repository-coverage.ts`,
  `backend/tests/integration/module-ports.test.ts`.

### A route answers with the stored work, and refuses with a reason

- Starting work answers 202, or 200 when the key finds it. Connecting a
  repository answers 201 or 200; a repository the login cannot see is
  404, which does not say whether it exists.
- A refusal is an outcome of a use case, mapped to a status by the
  presentation layer. `GET /improvements` takes a `filePath` for the
  history of a file.
- Why: an expected outcome is a value, and a status is presentation.
- Where: the `infrastructure/http/` folder of each module.

### The version of the contract is raised with every change of a schema

- `CONTRACT_VERSION` is 6. A client reads the version of a health first,
  and replaces an idle service of another version.
- Why: the objects are strict, so a new field makes the other side
  refuse an answer.
- Where: `api-contracts/src/health.ts`.

## The client

### The client finds the service, and starts it when it must

- Where nothing answers on the socket, the client starts the service
  once, in a process group of its own with the variables the client got,
  and its standard error goes to `service.log`. An idle service of
  another version is replaced, and a busy one is named and left.
- A client never ends a shared service. With `--isolated` it makes an
  instance under `/tmp`, since a socket path has at most 104 bytes, and
  removes it on the way out.
- The client reads no clock to wait: a wait is counted in pauses. It
  repeats the names of the instance folder and the socket, and an
  end-to-end test of the built client holds them to the service.
- Why: a list of the variables of the service kept in the client would
  be a second list to keep in step.
- Where: `frontend/src/api/service-reach.ts`,
  `frontend/src/api/isolated-service.ts`.

### A request has thirty seconds, and a signal leaves as q does

- A request that runs out of time is a fault of its own: no second
  service starts, a command ends with one line, a screen asks again.
- A signal, a closed terminal among them, leaves as `q` does and ends
  with the code of the signal. A refused write to the terminal is
  ignored.
- Why: a service that took a connection and never answered held the
  client for good, and a closed terminal ended the client mid-leave.
- Where: `frontend/src/api/socket-exchange.ts`,
  `frontend/src/composition/process-signals.ts`.

### A command prints its result, and everything else beside it

- Standard output holds the result only when the exit code is 0. A
  refusal or a failed job goes to standard error as one line of JSON.
- `--wait` writes one line per change and ends at `awaiting_approval`
  with the `approve` command and the hash. `cancel <id>` tries the
  improvement first, then the scan. A command shows only what the
  service answers.
- Why: a script that captures the output never takes a reason for a
  result.
- Where: `frontend/src/commands/`.

### One app over six screens

- `main.tsx` reads the process and `client-process.ts` takes it as
  values, so a test runs the whole client. A screen gets the session and
  the frame, and knows no other screen.
- The keys of the status tables are the types of the contract, so a new
  status stops the build of the client.
- The header counts the improvements that wait for approval. Quitting
  while work runs prints which work goes on and the command that shows
  it.
- Colour is off with `NO_COLOR` or `--no-color`. Unicode is on when the
  first locale variable that is set names UTF-8, else ASCII. A dialog
  writes spaces under itself, since a terminal has no colour that means
  its default background.
- Why: one owner of the shell and the keys, statuses that cannot drift
  from the service, and no way to tell Unicode in the plan.
- Where: `frontend/src/app/`, `frontend/src/theme/status.ts`.

### The screens take the whole screen, from 80 by 16

- The screens draw on the other screen of the terminal and give it back.
  Ctrl+C is a key and leaves as `q` does. The client says it draws for a
  person, or the library draws nothing in CI.
- The smallest window is 80 by 16, and only the body gives way.
- Every action a route allows is on a screen, described once: its key,
  its words and its line in the command palette. Hidden screens stay
  mounted, so going back keeps the place, and a list follows its chosen
  row by what it is.
- Why: tests of frames of one size missed what a real terminal showed,
  and the terminal of an editor has fewer than 24 rows.
- Where: `frontend/src/app/interactive.tsx`,
  `frontend/src/hooks/use-screen-actions.ts`.

## The harness and the tests

### A module has three layers: routes are infrastructure

- Routes are in `infrastructure/http/` and contracts in
  `application/contracts/`. The routes import only the application layer
  of their module, and the contracts are the only way in from another
  module. The policy may give a part of a layer, named by two folders,
  a rule of its own.
- Why: a controller is an adapter of the framework, and the contracts are
  the face of the application layer.
- Where: `harness/policy/structure.json`,
  `harness/architecture/rules/module-boundary.ts`.

### The built package is tested by its own steps of the gate

- `build` writes `dist/`. `e2e` starts the built files as processes and
  reaches them only through the socket. The stress tests run in `ci`: a
  storm of requests, many services and clients starting on one instance,
  and a service stopped at random with cancels. Each run names its seed.
- No whole service in a test starts the real engine.
- Why: only the built file proves that what a person installs starts,
  migrates, answers, stops and exits with a code.
- Where: `harness/bin/e2e.ts`, `harness/bin/stress.ts`,
  `backend/tests/stress/`.

### The desk and CI run one Node

- Both run Node 26.13.1 (`.nvmrc`). A connection opens SQLite with its
  defensive flag.
- The audit of the dependencies has no finding in what the package
  installs; what is left sits in tools of the harness and stays until
  those tools move.
- Why: Node 26 sets that flag by default and Node 25 does not, so a test
  passed on a desk and failed in CI.
- Where: `.nvmrc`,
  `backend/src/shared/infrastructure/database/sqlite-connection.ts`.

### A test waits for the lock of a killed service to be free

- A stress test kills the one service and reads the instance lock. It
  waits for the lock to be free instead of reading it once the process is
  off the list of processes.
- Why: on the Linux runner of CI the lock read as held with no service
  left, once, at seed 1243311179. A killed process with several threads
  leaves the list before its last threads have closed its files, and the
  lock goes with the files. The product was right; the test looked too
  early.
- Where: `backend/tests/support/start-rounds.ts`,
  `backend/tests/stress/service-start-race.test.ts`.

## What real runs showed

### The first real engine built the image and ran a scan

- The generator image: a pull of the base in 4 seconds, a build in 16,
  932 MB. The CLI logged in with a subscription token and answered a turn
  in under a second, as a user that is not root, on a read-only root,
  with no network. A second start built nothing.
- A scan: 97 packages in a second, Vitest with v8 in half a second, the
  right numbers, and an unimported file listed with nothing covered.
- The engine of this machine cannot mount a folder removed and made again
  at the same path.
- Why: it showed what no stand-in could. A hung credential
  helper led to the kill of the whole process group, and the first real
  improvement stopped before the generator, which led to every test in a
  mutation run and to `ps` in the image of the commands.
- Where: `backend/src/shared/infrastructure/sandbox/`,
  `backend/src/shared/infrastructure/processes/kill-group.ts`.

### The first real fork and the first real installs worked as designed

- One attempt took a file from 3 of 26 lines to 26 of 26 and killed 35
  of 37 mutants. The fork got one push, and the pull request opened in
  it held one commit with one test file. Nothing reached the repository,
  and no token was in the log.
- Seven public repositories installed as they are: pnpm 10.33, 11.3 and
  11.10, yarn 1.22.22 twice, yarn 4.5.0 twice with a yarn of their own,
  which did not run, each manager at the version its repository names.
  Two refusals were right: a yarn lockfile with a package from git, and
  a Vitest project with no coverage provider. A later trusted yarn 3
  install with a git package completed.
- Why: these runs and the scans after them led to the status of `gh`
  read for the active account, the failure the generator hears, the
  tests that may fail in the sandbox, the folders of examples left out
  of a scan, and the reporter of the service for Jest.
- Where: `backend/tests/e2e/fork-publication.test.ts`.

## Open debts and ideas left for later

Every item was read against the code on 2026-11-23. Each says what is
open and why it matters. Owed work that the code shows done was dropped.

### A real run can fail, or lose work that was paid for

- The image of the generator was built by a real engine once, on one
  machine with Docker: an old engine with `--pull=never`, a build cut
  short and other engines are untried, so a first run elsewhere may fail.
- A build or a pull logs nothing until it ends, up to ten minutes, and
  the engine asks the password helper of the user even for a public
  image, so a hanging helper holds every pull in silence.
- A failed build of the image ends the improvement as
  `generator_unavailable` and counts an attempt, which opens before the
  image is asked for; a stopped engine is tried three times and the
  reason names no engine, so a person looks in the wrong place.
- Both images name their base by tag, not by digest, and a replaced
  image stays in the engine without a name: a build can change under the
  same file, and the engine grows.
- Three readings of the CLI are unmeasured guesses: a spent limit, a
  failed login, and a key with no credit. A wrong one fails where it
  should wait, or the reverse.
- git gets no token for a push. The real publications used the login
  `gh` keeps; where the login lives only in `GH_TOKEN`, a push may fail.
- A run whose container may still live fails its step, and a generator
  step that fails so does not record the call that was paid for.
- The new copy of a retried step has the path of the copy the old
  container was lent, and the engine of the desk refused to mount a
  folder removed and made again at one path. Listing by a label and the
  words for a container that is gone are proven on a stand-in only.
- The kill rate of 50 and the limit of 10 surviving mutants are
  placeholders. The one real attempt killed 35 of 37, so the gate may
  pass weak tests or refuse good ones until a calibration.
- A mutation run stopped at its time limit saves no partial cache: the
  sandbox kills, and the tool saves only when asked to stop. It costs
  time on the next run, nothing else.

### Not yet proven on a real container or a real host

- The words of the host when it refuses a fork or a push to a fork; the
  rest of the fork route ran once on the real host.
- That an ignore pattern keeps a failing file from the Jest runner of
  StrykerJS as it does from the Vitest one, and that the command runner
  runs `exit 0` through the shell of the image. If either fails,
  `may_fail` does not hold for a Jest repository, or for one with no test
  left.
- A yarn 1 offline mirror, which writes the archives it lacks into the
  copy, the `.env.yarn` file yarn 4 reads, and an `exec:` package: never
  tried, so their refusal or their safety rests on the documentation of
  the managers.
- A trusted install whose scripts download more than the 512 MB memory
  home holds: it would fail with words a person may not read as a limit.
- The lines of a type error from a real run of ts-jest; the excerpt was
  seen only from a Jest run that failed on a missing module.

### Known limits, not handled

- A push under `.github/workflows/` needs the `workflow` scope of `gh`,
  and an owner can forbid forks; the check asks neither, so both show
  only as a refused publication.
- When the right to push changes between a run cut short and the next,
  a branch or a pull request may end up both upstream and in the fork.
- The parent of the fork the host answers is not compared, and the base
  branches stay in the fork after a pull request is closed.
- The reporters named for Vitest replace those the repository
  configures, so a run in a copy prints as the default reporter does.
- A stored failure excerpt and the raw output keep the credential if a
  test printed it, since only the prompt hides it; the file of a failure
  is shown with its control characters.
- A snapshot taken before folders of examples were left out may still
  list such a file. Its improvement fails at the analysis with
  `verification_error` (read in the code, not run).

### A person meets it in the first minutes of the client

- The screens were looked at in a terminal with empty lists only; rows,
  lists and filters are proven by tests of the whole app, not by a look.
- A panel cut in a low window does not say that more is below.
- The list of the keys is sixteen lines, the whole smallest window, so
  one more key needs a list that scrolls.
- On Linux the browser is started with `xdg-open` and a path, and that
  program needs the variables of the desktop: a pull request probably
  does not open there, and nothing says so. Not tried on Linux.
- The name of the test runner is in the details of a repository and not
  in a row of the list.

### Rare, and severe when it happens

- A start sweeps leftovers before it listens, and waits up to thirty
  seconds for an engine that does not answer, longer than the client
  waits for a start.
- The label of a container is made of the path of the instance, so the
  containers of a moved folder are not found, nor those started before
  the label existed.
- A stopping service gives its socket back a moment before its lock. A
  start that comes then waits up to five seconds for the lock, and one
  that waited in vain leaves, so the client asks for twenty seconds.
- A signal that comes while the client leaves is not heard, so a leave
  cannot be cut short; at worst it takes forty seconds.
- A command whose reader went away runs to its end and says nothing,
  since a refused write is ignored for the sake of a closed terminal.
- The connect and the access check of a repository run tools while the
  client waits, and on a slow network they can pass the thirty seconds
  of a request.

### It makes a fault hard to find, or a screen say less

- A line of a tool carries no id of its job, so it is tied to a journey
  by its time alone. The steps of a baseline leave no lines of their own.
- A command whose own service did not start prints where its log is, and
  the leave then removes that folder.
- The advice for a service that does not answer in time is the one for a
  service of another version.
- Health leaves empty the account of the code host, the tools, the
  limits of the generator, the last sign of the worker and the paths of
  the service. The client knows the instance folder and the log and does
  not show them.
- No route returns the last access check of a repository or who
  cancelled an improvement, so neither is shown.
- The status of an answer is set in three places, and the two cancels
  answer ended work with two statuses, 200 and 202.
- A text right of a filler in a panel can stand one cell left, in six
  places. A dot and the marks of added and removed lines are written in
  five screens and not taken from the theme.
- `--json` without a command does nothing, and says nothing.

### Tests and the gate

- The end-to-end tests prove one journey and a fork publication, and the
  stress tests a cancel and a restart in the middle of work. Review mode,
  a rejected patch and a second attempt, a generator that fails or cannot
  log in, and a publication the host refuses are not proven from end to
  end.
- No test runs the screens in a real terminal or changes its size while
  they run; two faults were found by hand that way.
- A signal that ends the client was proven with a stand-in and by hand
  for two of three. Ctrl+C during a command was not tried in a terminal.
- Mutation tests cover the harness only, so a weak test of the product
  passes the gate. The rule that keeps colour and symbols in the theme
  is not written.
- The stress and mutation jobs of CI start only by hand since 2026-11-23,
  on the owner's word, so a push is not held by them. The storm of
  requests failed there once with seed 682130240: a `git fetch` into a
  mirror was killed by a cancel after 55 ms, and every later scan of that
  repository failed at `git checkout` with code 128 until its job was
  dead. The likely cause, not yet proven: the killed fetch left the
  commit in the mirror without its trees, and the mirror takes a commit
  it can name for one it holds whole, so it never fetches again. A fetch
  that keeps its pack (`fetch.unpackLimit=1`) would arrive whole or not
  at all.

### Thought of after the first real runs, and left for later by the owner

- A hint to trust a repository the account may push to. It is offered
  and never set by itself: the right to push does not make code safe.
- A network for the tests of a trusted repository. Tests that call a
  real service would run then, but it is a real weakening, and such
  tests want keys as well.
- A token of a private registry that an install alone can read. A
  trusted install does not help a repository whose packages are
  private: the sandbox holds no token.
