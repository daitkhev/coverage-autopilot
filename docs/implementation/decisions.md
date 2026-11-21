# Decisions made during the implementation

The documents in [the plan](../plan/system-design.md) describe the design
as it was before the first line of the product. They are no longer added
to. A decision made after that is written here: what was decided, why, and
where it lives in the code.

Where this log and the plan differ, this log and the code are right.

## 2026-11-21

### Time has one type and one text

- A moment is an `Instant` of the kernel: the whole milliseconds since the
  start of 1970 in UTC. It reads and writes one text,
  `YYYY-MM-DDTHH:mm:ss.sssZ`, with its own calendar arithmetic.
- The database and the contract carry that text and no other. The contract
  refuses another offset and another precision. The client shows a moment
  in the time zone of its user.
- `Date` of the language is used nowhere, the clock adapter included. The
  adapter adds the time the process has run to the moment it started.
- Why: one type and one format mean that two moments from two places always
  compare, and a test decides what the time is.
- Known limit: on Linux the counter of running time stops while the
  machine is suspended, so after a suspend the clock of the service is late
  until the service starts again. Only the adapter would change to fix it.
- Where: `backend/src/shared/kernel/time/`,
  `backend/src/shared/infrastructure/time/system-clock.adapter.ts`,
  `backend/tests/support/fixed-clock.ts`, `timestampSchema` in
  `api-contracts/src/values.ts`.

### The generator is paid by a subscription or by a key

- Claude Code is the only generator of the first version and the default.
  A key of a model router and Codex are later adapters behind the same
  port.
- The service knows who pays from its own settings, never from a request.
  An improvement records it, and `GET /health` reports it.
- Under a subscription the client shows a tag and the limits of the
  subscription, and never money. `GET /health` carries what the generator
  last said of the five-hour and the seven-day window: the share used and
  the moment of the reset, with the moment it was seen.
- Why: for a subscription a price of a call means nothing. The real limit
  is the window.
- Where: `billingSchema` in `api-contracts/src/statuses.ts`,
  `generatorAccountSchema` in `api-contracts/src/health.ts`.

### An improvement waits for the five-hour window and fails on the weekly one

- When the five-hour window is spent, the improvement moves to
  `waiting_for_limit` and keeps the moment the window opens. It goes on by
  itself at that moment.
- A wait spends no attempt and no minute of the budget: the deadline moves
  later by the length of the wait.
- While it waits, its file stays taken, its sandbox is given back, and it
  can be cancelled.
- An improvement waits at most twice. A third spent window fails it.
- A spent weekly quota fails the improvement at once. Nobody waits for it.
- Why: the short window often opens within the hour, and losing the work
  done so far costs more than the wait.
- Where: `improvementStatusSchema`, `generationOutcomeSchema`
  (`window_exhausted` waits, `quota_exhausted` fails) and `waitingForSchema`
  in `api-contracts/src/statuses.ts`; `resumesAt` and `limitWaits` in
  `api-contracts/src/improvements.ts`;
  `backend/migrations/0002-let-an-improvement-wait-for-a-limit.sql`.

### The budget has defaults and maximums, and tokens only with a key

- Attempts: 3 by default, 10 at most. Minutes: 30 by default, 120 at most.
- A limit of tokens exists only with a key. Under a subscription it is
  empty.
- `GET /settings/budget` gives the defaults and the maximums, so the dialog
  that starts an improvement holds no number of its own.
- Where: `budgetSchema` and `budgetSettingsSchema` in
  `api-contracts/src/improvements.ts`.

### A repository is outdated when its head moved

- The access check reads the head of the default branch and stores it. A
  repository is `outdated` when that head is not the commit of its latest
  snapshot.
- Why: this costs no call to GitHub when the list is drawn, and the user
  learns it before an improvement fails on a stale snapshot.
- The number of commits behind, which one picture of the plan shows, is not
  counted.
- Where: `headCommit` and `outdated` in `api-contracts/src/repositories.ts`,
  `backend/migrations/0003-record-the-head-of-a-repository.sql`.

### The history of a file is a filter, not a route

- `GET /improvements` takes a `filePath`. No separate route gives the
  history of a file.
- Where: `improvementListQuerySchema` in
  `api-contracts/src/improvements.ts`.

### An idle service can be asked to stop

- `POST /service/stop` answers 202 and the service stops. A service with
  running work answers 409 and changes nothing.
- Why: a client of a newer contract replaces an idle service of an older
  one.
- Where: `stopServiceResultSchema` in `api-contracts/src/health.ts`.

### The client takes its statuses from the contract

- The keys of the status tables of the client are the types of the
  contract, so a status the service adds or drops stops the build of the
  client.
- A scan is said in the words of an improvement. A refused step of the
  access check is red, and a step never reached is dim.
- A dialog writes spaces under itself. It has no background colour,
  because the terminal has no colour that means "the default background".
- Where: `frontend/src/theme/status.ts`,
  `frontend/src/components/dialog.tsx`.

### A scan starts from the head the repositories module reads

- The contract of `repositories` has one operation the plan does not list:
  `resolveHead`. It reads the head of the default branch from the host of
  the code, stores it with the repository and returns it.
- Why: a scan needs a commit to clone, and the plan did not say who finds
  it. The same read keeps `outdated` true to the last look.
- Where: `backend/src/modules/repositories/contracts/repositories-public-api.ts`.

### The sandbox and the store of tool output are shared ports

- `Sandbox` runs one command of an untrusted repository in a working copy,
  with exactly the listed variables and no network unless the request opens
  it for the install. A command that failed or ran out of time is a value.
- `ArtifactStore` keeps the raw output of the tools in files named by the
  hash of their content. A file that is gone reads as nothing.
- Why here: more than one module runs commands and keeps output, and the
  three files were written before the modules so the modules could be built
  side by side.
- Where: `backend/src/shared/application/ports/sandbox.port.ts`,
  `backend/src/shared/application/ports/artifact-store.port.ts`.

### A connection of the service may not edit the schema table

- The connection is opened with the defensive flag of SQLite. Node 26 sets
  it by default and Node 25 does not, so a test passed on a desk and failed
  in CI.
- Where: `backend/src/shared/infrastructure/database/sqlite-connection.ts`.

### Two files read the environment, and one module parses TypeScript

- `process.env` is read by the host of the gate and by the entry file of
  the service, `backend/src/main.ts`, and by nothing else. The entry file
  gives the variables to the loader of the configuration, which takes them
  as an argument.
- The `typescript` package may be imported in the adapters of the coverage
  module and nowhere else in the service. It is there to parse source
  files, not to compile them.
- The desk and CI run the same Node, 26.13.1.
- Where: `harness/eslint/config.ts`, `harness/policy/packages.json`,
  `.nvmrc`.

### Every way to read the environment is refused, and four files may

- The lint ban holds the property by its name and by a text, on the global
  and through `globalThis`, the object taken apart, and the process module
  imported by a name, by its default or as a whole.
- Four files may read it: the host of the gate, the entry file of the
  service, the entry file of the client, and the stand-in of the container
  engine in the tests, which is there to record what it was started with.
- Where: `harness/eslint/restricted-syntax.ts`, `harness/eslint/config.ts`.

### A sandboxed command runs as the user of the service

- By default the user and the group of a container are those the service
  runs as, so a command can write into a working copy the service made.
  `AUTOPILOT_SANDBOX_UID` and `AUTOPILOT_SANDBOX_GID` each replace one of
  them. A service that runs as root starts only when both are set.
- The default image is `node:26-slim`, the Node the project itself uses.
- Where: `backend/src/shared/infrastructure/config/`.

### A working copy has one path, in the sandbox and on the host

- The sandbox mounts a working copy at the path it has on the host. A
  coverage report and a mutation report name files by absolute paths, and
  the service reads them by the same paths with no translation.
- The git directory of a working copy is kept outside it. A sandboxed
  command can write anything into the copy, and the service runs `git` on
  the copy afterwards, so nothing in the copy may be read as a setting of
  git.
- A source file is classified by the parser of the TypeScript compiler,
  and a link in the place of a source is refused.
- Where: `backend/src/shared/infrastructure/sandbox/container-arguments.ts`,
  `backend/src/modules/repositories/infrastructure/git/`,
  `backend/src/modules/coverage/infrastructure/classification/`.

### The four counters of a file are columns

- `file_coverages` has a column for each counter of statements, branches,
  functions and lines. The document of a file holds what never ran and no
  number.
- Where: `backend/migrations/0004-count-the-statements-and-functions-of-a-file.sql`,
  `backend/src/modules/coverage/infrastructure/persistence/`.

### Owed to the wave that adds the routes

- A scan that ended in `test_run_timed_out` is answered with the reason
  of the same name, which the contract has since this day. The route of a
  scan maps it, and its test shows the answer.
- A monorepo and a package manager other than npm are refused as an
  unsupported project, with the reason in words. That is a limit of the
  first version, stated in the scope.

### git on a working copy reads no setting but its own

- A working copy is two folders: the tree a sandbox is lent, and a git
  directory beside it that only the service writes. Every call of git
  names both, so git never looks for a repository.
- A tree that holds an entry named `.git`, at any depth and in any
  spelling a file system may open as that name, is refused with
  `working_copy_tampered` before git runs in it. It is a fault and not a
  result: a caller does not plan for it.
- The work on a copy reads no global, system or environment
  configuration, and starts no hook and no monitor. A `.gitattributes` of
  the tree can name any driver, so no driver may be defined anywhere git
  reads. The mirror and the push keep the configuration of the operator,
  which holds the credentials, and read no tree.
- The author of a commit therefore comes only from the variables the
  settings give git, never from a `~/.gitconfig`.
- A call of a tool that writes more than 64 MiB is stopped and fails. No
  part of a patch is used.
- Where: `backend/src/modules/repositories/infrastructure/git/`,
  `backend/src/modules/repositories/infrastructure/tools/tool-runner.ts`.

### Owed to the waves that lend a working copy and start the service

- The module that lends a copy to a sandbox takes its patch only after
  the sandbox has ended: the check for a `.git` runs right before git,
  and a process that is still alive could write one after it.
- A patch is published only when every file of it is a test file of the
  target and a plain file. A link, a workflow or a `.gitattributes` in a
  patch is refused by the module that owns the improvement.
- The start of the service gives git its `PATH`, its `HOME` and the four
  variables of the author and the committer, and the access check
  refuses a git older than 2.36.
- A tree a sandbox left unreadable is still removed: the sweep that
  clears what a crash left behind restores the permissions first.

### A patch only adds new test files

- A test patch may add new plain files whose names end like a test file,
  and nothing else. It never changes or removes a file of the commit.
- So the tests of the commit stay as they were, "the new tests" are the
  files of the patch, and a patch cannot pass by weakening a test that
  was there.
- The endings come with the request, `.test.ts` and `.test.tsx` by
  default. The generator is told the same endings.
- Where: `VerifyPatchRequest.testFileSuffixes` in
  `backend/src/modules/verification/contracts/verification-public-api.ts`,
  `GenerationRequest.testFileSuffixes` in
  `backend/src/modules/improvement/application/ports/test-generator.port.ts`.

### The gate measures a commit once and is given the measure back

- `measureBaseline` answers what the commit is like before any patch:
  whether it type-checks, whether its tests pass, and which mutants of
  the target nothing detects. The improvement keeps the answer and gives
  it to every `verifyPatch`.
- A check that has nothing to compare with is `not_applicable`: the type
  check when the commit did not type-check, the existing tests when they
  did not pass. A test run answers only whether it passed, not which
  tests did, so a commit with a failing test cannot show what a patch
  broke.
- The mutation tool is installed into the working copy of the gate while
  the network is open and no script runs. The copy of the gate is never
  the source of a patch.
- The generator runs in a second instance of the sandbox, with an image
  of its own and an open network. The port of the sandbox is the same.

### A job that cannot be read is dead at its first claim

- A stored payload that is not a document with a version is never run and
  never claimed again. The worker buries the job and tells its handler
  with `payload: null`, so the object of the job is failed like any other
  whose runs are spent.
- The worker writes a line for the start and the end of every job, for a
  handler that throws, for a claim the database refuses and for an end it
  cannot write.
- Where: `backend/src/shared/infrastructure/queue/job-worker.ts`,
  `job-worker-log.ts`, `DeadJobContext` in
  `backend/src/shared/application/ports/job-handler.port.ts`.

### The mutation tool is installed before code of the repository runs

- `installTool` is a call of its own on the port of the mutation runner.
  The gate makes it right after the packages of the project are
  installed, before a type check and before any test. A measure never
  opens the network.
- Why: the network is open only before code of the repository runs in a
  working copy. Installed inside a measure, the tool came after the
  tests, and code of the repository or of one of its packages could have
  sent the source out while the network was open.
- A run of the tool that is stopped at its time limit leaves no cache
  yet: the sandbox stops a command with `SIGKILL`, and the tool saves a
  partial cache only when it is asked to stop. The cache only saves
  time. A stop in two steps is owed to the wave of the stress tests.
- Where: `backend/src/modules/verification/application/ports/mutation-runner.port.ts`,
  `backend/src/modules/verification/infrastructure/mutation/`.

### The start of the generator is checked after its run

- The port of the sandbox runs a command to its end, so the adapter of
  the generator cannot stop a run before the first call of the model. It
  reads the report of the start afterwards: other tools than the allowed
  ones, or any tool server, is a fault, and what the run wrote is thrown
  away.
- A file the run wrote is searched for the credential before anything
  of the run leaves the adapter, and the credential is replaced in the
  output that is kept. A credential in a written file wins over every
  other way the run ended.
- A spent five-hour window waits and every other spent limit fails. How
  the CLI reports a spent limit, a failed login and a missing program was
  never seen: the adapter follows the types of the CLI and keeps each
  guess in one table.
- Where: `backend/src/modules/improvement/infrastructure/generator/`.

### Owed to the first real run of the generator

- The image of the generator sandbox with the CLI in it, an output limit
  large enough for the report of the start to survive, and the binding of
  the second sandbox, the settings and the port.
- One run with the consent of the owner: the arguments, the report of
  the start in a container, a home under `/tmp` with a read-only root,
  and who pays as the CLI says it under each login.
- The module that owns the improvement throws the working copy away
  after every outcome but `generated`, and after a fault as well, and its
  check of a patch refuses a path under `node_modules`.
