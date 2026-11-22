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
- Changed on 2026-11-22: the arithmetic and the clock are those of
  `Temporal` now. See "Time is the Temporal of the platform".

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
  after every outcome but `generated`, and after a fault as well.

### The gate reads a patch strictly

- A patch passes the first check only as text git itself writes for new
  plain files: one `new file mode 100644` and one hunk of added lines for
  each file, and no line outside a file, because `git apply` also takes a
  section with no header. A path among the installed packages is refused.
- The files git says it wrote must be exactly the files the text names.
  A difference means git read the text in another way than the gate did.
- The coverage check compares the counters of the target alone. A counter
  that fell fails the check, whatever the others did.
- The deadline is looked at before every step and every check. A call
  into the coverage module has no time limit of the gate inside it: only
  the limits of that module and the signal stop it. A limit that travels
  with the call is owed to the wave that drives an improvement.
- The module refuses settings that cannot work when the service starts.
- Where: `backend/src/modules/verification/domain/services/`,
  `backend/src/modules/verification/application/commands/verify-patch/`,
  `backend/src/modules/verification/verification.module.ts`.

### An improvement counts work, not waiting

- The limit of minutes becomes one deadline when work starts, so a
  restart of the service cannot give the minutes back.
- Two statuses are waits: `waiting_for_limit` and `awaiting_approval`.
  Leaving either moves the deadline later by the length of the wait, so a
  person who approves the next morning spends no minute of the budget.
- A third spent window fails the improvement with the reason
  `quota_exhausted`: the contract has no reason of its own for it, and to
  a person it means the same, that the account has no usage for now.
- What is spent counts every attempt that was opened. Whether a new one
  may open counts only the attempts that are over, so the open attempt of
  a run after a crash may finish.
- A rejected patch closes its attempt. An inconclusive verdict keeps the
  attempt open in `verifying`, because it says nothing about the patch:
  the caller runs the gate again or fails the improvement.
- A person approves a patch by its hash. Another hash is refused, so
  nobody approves a patch they did not see.
- The branch is `coverage-autopilot/<id>` and follows from the id alone,
  so publishing that starts again finds the branch it made.
- A limit of tokens is a number or nothing. The default and the maximum
  of the service have it together or not at all, and the aggregate never
  asks who pays.
- Both baselines must name the commit of the improvement, and the
  baseline of the gate its file as well. Generation starts with both.
- A save checks the version the improvement was read with. One that
  moved is `stale_improvement`, and nothing is written.
- Where: `backend/src/modules/improvement/domain/`,
  `backend/src/modules/improvement/infrastructure/persistence/`,
  `backend/migrations/0005-keep-what-an-improvement-and-its-attempts-show.sql`.

### Owed to the wave that drives an improvement

- The generator may not say when the window opens, and the aggregate
  takes only a definite moment. The application chooses one, such as the
  end of the window the last report named, or a fixed wait.
- After a rejected patch the improvement is `generating` whatever is left
  of the budget, and opening an attempt with a spent budget is refused.
  The step asks for the allowance first and fails the improvement with
  `budget_exhausted`.
- The id of a snapshot is a value object in two modules. It moves to the
  kernel when a third place needs it.
- The answer of a route reads `coverageBefore` that may be empty, the
  paths of raw output from the stored references, and the wait for a
  worker or a repository from the job, which the aggregate does not know.
- The binding of the store, the generator, its sandbox and its settings
  in the file of the module.

### A job can wait for its moment

- A job may carry a moment before which no worker takes it. An
  improvement that waits for a window leaves such a job behind, in the
  save that starts the wait, so it goes on by itself and no timer has to
  outlive a restart of the service.
- A job that waits holds nothing: another job of its repository runs
  meanwhile.
- The moment is no part of what makes two requests the same job.
- The queue cancels every open job of an object by the id of the object.
  A cancel of an improvement knows the improvement and not its jobs: the
  first run, the one an approval adds, and one for each wait.
- The queue tells what the pending job of an object waits for: its
  moment, its repository, or a free worker. The screen groups the
  improvements by it.
- Where: `backend/migrations/0006-let-a-job-wait-for-its-moment.sql`,
  `backend/src/shared/application/ports/job-queue.port.ts`,
  `backend/src/shared/infrastructure/database/sqlite-job-leases.ts`.

### One handler runs an improvement, one step for each status

- Every job of an improvement has the same payload and differs in its
  key alone: the handler reads the status and goes on from there.
- A step saves its expected ends itself and throws a fault as it came.
  The handler decides what a fault means: one that may pass is a
  technical retry, and one that will not fails the improvement with the
  reason the step names.
- Two reasons were missing for that: `generator_unavailable`, for an AI
  CLI that cannot be started at all, and `publish_failed`, for a branch
  or a pull request the host of the code refused.
- A step saves through the run, which applies a change to a copy and
  stores it through the lease of the job, with what follows from the new
  status in the same transaction.
- The deadline of an improvement stops its work through an alarm, a port
  beside the clock: a test decides when the moment comes, and the clock
  decides whether a timer that fired is on time.
- A fingerprint is a hash, and the application may not hash: the hash is
  a port with one adapter.
- Where: `backend/src/modules/improvement/application/commands/run-improvement/`,
  `backend/src/modules/improvement/application/improvement-settings.ts`,
  `backend/src/shared/application/ports/alarm.port.ts`,
  `backend/src/shared/infrastructure/time/timer-alarm.adapter.ts`.

### A request for an improvement is checked before it is stored

- Every value of a request is built first, so a bad value or a budget
  above the maximum costs no call to the host of the code.
- The snapshot, the file and the head of the default branch are asked
  outside the transaction, and only a request that is still good is
  registered. A file above the threshold is not refused: the fresh
  measurement of the run decides whether there is anything to improve.
- The fingerprint is the SHA-256 of a text with a fixed order of keys:
  the repository, the base commit, the file, the quality policy with its
  checks in the order of the gate, and the generator without its
  billing. The key, the budget and the mode are no part of the work.
- A refusal is a value with a reason. A conflict with earlier work names
  that improvement, also when it is the key that was used again.
- An approval adds the job that publishes in the save that approves, and
  a cancel ends every open job of the improvement in the save that
  cancels. Both read inside their transaction.
- What a person sees is the stored state, what the clock adds to the
  usage, and what the queue knows of the job. A final improvement asks
  the queue nothing.
- Where: `backend/src/modules/improvement/application/commands/start-improvement/`,
  `backend/src/modules/improvement/application/dto/`.

### How each step of an improvement ends

- `analyzing` fails with `stale_snapshot` for a file that changed, with
  `mutation_unsupported` when the mutation tool cannot run, with
  `budget_exhausted` when the gate ran out of time, and with
  `verification_error` for a commit that cannot be measured. It skips
  with `threshold_met`, and with `no_undetected_mutants` when the policy
  requires the mutation check and no mutant is left to detect: that
  check could never pass.
- `generating` asks the allowance and opens the attempt in one save.
  A spent window ends when the generator said, else when the window it
  last reported opens, else after the wait of the settings, and the job
  that goes on then is stored with the wait. A call is given no more
  time than is left of the budget.
- `verifying` retries only when every required check that could not
  finish may finish on another run. One error that cannot pass fails the
  improvement at once, with the report, in one save: a retry would end
  in it again and hide the reason behind spent retries.
- `publishing` asks the head once more, and keeps at most 2000
  characters of what a tool said when it refused. The commit and the
  title are `test: cover <file>`, and the body shows what the gate
  measured and nothing it did not. It names the tool and no model.
- The handler fails an improvement whose job another version of the
  service wrote, and throws on a step that went on without saving, so
  that a fault of the code cannot spin for ever.
- Where: `backend/src/modules/improvement/application/commands/run-improvement/`,
  `backend/src/modules/improvement/improvement.module.ts`.

### Owed after the wave that drives an improvement

- The routes: `snapshot_not_found` and `target_not_measured` have no
  code of an HTTP answer yet, the report of the contract takes no empty
  `coverageBefore`, and the references of raw output become paths.
- The start of the service binds the handler into the worker, the alarm
  to its timer, the sandbox of the generator and both sets of settings.
- Two tests of the client wait for real time and failed once each while
  four gates ran at once, and a hook of a git test passed its ten
  seconds. The first is fixed in the tests, the second is a limit of the
  policy.
- A working copy that was tampered with fails the improvement as
  `generator_unavailable`, and the tokens of that call are not recorded.
- A working improvement with no deadline is answered in two ways: the
  generating step falls back to the limit of the settings, the analyzing
  step throws.
- The tests of the requests and of the generation each keep settings of
  their own.
- The wait and its job share a transaction on the real database in the
  test of the module alone, with stand-ins below it. A run with real
  git, a real gate and a real generator is owed to the end-to-end wave.

## 2026-11-22

### The service is one package, built into files plain Node runs

- The client and the service are one application and one package: one
  build, one list of dependencies, one install.
- The build bundles the code of this repository, with the contracts and
  every `#` import resolved, and leaves the packages of npm as imports.
  They come with the install of the package. A bundle with every package
  inside started from an empty folder as well and stays a later option.
- Why: an ordinary package first. The end-to-end tests start the built
  file as a process, so they test what a person installs, and no loader
  of TypeScript is needed to run the service from source.
- The bundler is the one the test runner brings already, so the tree
  gains no package.
- A file of the service is never found from the place of another source
  file, since a bundle moves them all. The entry file gives the folder of
  the migrations from its own place.
- Where: `backend/src/shared/infrastructure/database/migration-files.ts`.
  The build step itself comes with the entry file.

### A service starts in one order, under one lock

- The instance directory is made and kept to its owner, then the lock is
  taken, then the database is migrated and checked, and only then a
  socket a crashed service left is removed.
- The lock is an exclusive transaction on a SQLite file of its own, taken
  with no wait: a second service is told at once and exits. Nothing but
  `BEGIN EXCLUSIVE` is needed, and it holds between processes. The file
  is never deleted.
- The holder keeps a reference to the lock for its whole life: a lock the
  garbage collector takes closes its connection and is released.
- Removing the stale socket and narrowing the new one take the held lock
  as an argument and check it, so the type and the code both say who may
  touch the socket. A path that holds anything but a socket is refused
  and left alone.
- A step that fails gives back what the steps before it took, so the next
  start begins from the same place.
- Where: `backend/src/shared/infrastructure/database/instance-lock.ts`,
  `backend/src/shared/infrastructure/service/`.

### git is told who commits, and an old git is refused

- git gets its `PATH`, its `HOME` and the four variables of the author
  and the committer from the configuration, and nothing else of the
  environment of the service.
- The author is `Coverage Autopilot` with an address in the reserved
  domain `.invalid`, unless two variables of the service name another.
  Why: git would otherwise make an author up from the user and the
  machine, and that would reach a public pull request. An address that
  reaches no one credits no account of a code host with the commit.
- The module refuses to start with settings that do not say who commits.
- The access check fails, as a value, for a git older than 2.36: every
  call passes `core.fsmonitor=false`, and an older git takes `false` for
  the name of a program and starts it.
- Where: `backend/src/shared/infrastructure/config/service-config.ts`,
  `backend/src/modules/repositories/application/commands/check-access/git-version.ts`.

### A scan is its job, read in the words of a scan

- The id of a scan is the id of its job, and no table of scans exists.
  The answer is made from the job: `pending` is `queued`, `leased` is
  `running`, and a completed job is read by its outcome. The table is in
  the code, and a record over the kinds of outcome makes every outcome
  the scan writes have a reading.
- The contract has no reason for a fault that ends a scan, so a fault
  that is not retried, a removed repository and a dead job are all
  `retries_exhausted`: to a person each means that nothing runs it again.
- A job keeps the moment of its first claim, and a later claim keeps it.
  The moment it ended is its last change, since no statement writes a job
  that has ended.
- The steps of a scan are shown only when they belong to this job: the
  subject of a scan is its repository, and another scan of it may run.
- Cancelling a scan that has ended answers it as it is, with no write.
- The files of a snapshot are one query with three filters. `below` and
  `metric` make the threshold the files are judged by, and `metric` alone
  narrows nothing.
- Where: `backend/migrations/0007-keep-the-moment-a-job-started.sql`,
  `backend/src/modules/coverage/application/dto/scan-dto-mapping.ts`,
  `backend/src/modules/coverage/application/queries/list-snapshot-files/`.

### What an improvement answers, and three of its rules

- What the job of an improvement waits for wins over its own wait for a
  limit: approval first, then a worker or the repository as the queue
  says, and only then the limit. A window that has opened while the job
  waits for its repository is shown as that.
- A working improvement always has a deadline. Loading a stored one
  without it is refused, and every step reads the same getter.
- A call that wrote a `.git` into its working copy fails the improvement
  as `credential_exposed`, and what the call spent is kept with the
  attempt. Why this reason: the run started and ran well, so
  `generator_unavailable` would send a person to the wrong place, and
  only content of the repository can have told the run to do it while it
  held the credential.
- Nothing but the gate has to check the files of a patch before it is
  published: the gate reads the text strictly, always requires the check
  of test files, and the attempt keeps exactly that text with its hash.
  Tests at the publishing step and of the module hold this.
- Where: `backend/src/modules/improvement/application/dto/improvement-views.ts`,
  `backend/src/modules/improvement/application/commands/run-improvement/generation-record.ts`,
  `backend/src/modules/improvement/domain/services/stored-state.service.ts`.

### One way to read a request and one shape of a refusal

- A value that crosses the socket is read with `parseAs` and a schema of
  the contracts. A mismatch is one error of the contracts package, for
  the service and the client alike. It names the place and the rule and
  never the value, which may be a secret.
- One filter answers everything that is not a success: 400 for a
  mismatch, the status and the body a route refused with, and 500 for a
  fault. A route refuses with an exception of the framework that carries
  the body of the contract.
- The words of a fault and of a refusal of the framework never reach the
  client: both can repeat a part of the request or a path. The log keeps
  the fault with its route and its code.
- A route passes the signal of its request to a use case that starts a
  tool. Node gives every request that signal from 26.1 on, and a test
  holds the platform to it.
- Why the reading lives in the contracts package: a presentation layer
  may import the contracts and the kernel and nothing else that is
  shared, and the client reads answers the same way.
- Where: `api-contracts/src/parsing.ts`,
  `backend/src/shared/infrastructure/http/`,
  `backend/tests/support/http-service.ts`.

### A route belongs to the lowest module that knows its whole answer

- The answer for a repository holds its newest snapshot, its scan that
  has not ended and whether it is outdated, so the routes of a repository
  are in the module `coverage`. The files of a snapshot name the newest
  improvement of each file, so that route is in the module `improvement`.
  Only the access check is a route of the module `repositories`.
- Why: a presentation layer may not reach another module, and a module
  may reach only the contracts of the modules below it. The alternative,
  a client that joins the answers, would cost the list of repositories
  one request for each row.

### What a route answers, and how it refuses

- A route that starts work answers 202 with the work as it is stored, and
  200 when the same key finds the work that is there already. A cancel
  of work that had ended is no error and changes nothing: an improvement
  then answers 200, and a scan 202 as for a cancel that took effect.
- A refusal is an outcome of a use case, a value with a reason, and the
  presentation layer maps each reason to a status and a body of the
  contract. No route catches a domain error: a value of a request that
  breaks a rule of the domain is made into a refusal in the application
  layer (`request-values.ts`).
- Connecting a repository answers 201, and 200 when it is connected
  already. It has two refusals of its own: an address that is not one of
  a repository on the code host is 400, and a repository the login cannot
  see is 404, which does not say whether it exists.
- A repository in an answer carries its newest snapshot, the scan that
  has not ended, and `outdated`: the head the repository keeps is not the
  commit of that snapshot. No host is asked to answer a list. The newest
  snapshot is read alone, and the open job of a subject through an index
  (`0008`), so a row of the list costs two small reads.
- The defaults and the maximums of a budget are read at
  `GET /settings/budget`, so the client shows the limits before a request
  is refused for them.
- A request may name a quality policy, and one without the check that a
  patch only adds test files is refused: that check is what keeps a
  generator out of the source.

### The root binds the modules, and each module makes its own values

- Every module has `register(values)`, which takes plain values and makes
  the value objects of its domain itself. The root file knows no layer of
  a module: it imports the module files and nothing else, and takes the
  handler of a job from a static field of the module file.
- The worker gets exactly one handler for each kind of job. A kind with
  none or with two stops the start.
- What the environment does not hold is a constant in
  `backend/src/module-settings.ts`: the threshold (lines, 80), the checks
  of the gate (all seven, three repeated runs), the version of the
  mutation tool and the tools the generator may use. A kill rate of 50
  and a limit of 10 surviving mutants are placeholders until a real run
  calibrates them.
- A service with no credential of the generator starts and scans. It
  warns once at the start and names the variable, never a value. A
  request for an improvement is then refused at once with 409
  `generator_unavailable` and nothing is stored, also for a key that was
  used before. A job that was queued while the credential was set fails
  with the same reason, before any container starts.
- A command of a repository gets exactly three variables in its sandbox:
  the `PATH` of the image, a home in the scratch folder and `CI`.
- Where: `backend/src/app.module.ts`, `backend/src/module-settings.ts`,
  `backend/src/job-handlers.ts`, the `*.module.ts` of each module.

### The service reports on itself and stops when it is idle

- `GET /health` and `POST /service/stop` are routes of the shared HTTP
  code, not of a module. They reach the running service through a port
  the root binds, because shared code may not import a root file.
- A stop is refused with 409 while a job runs: the job would go back to
  the queue half done. A queued job does not block a stop; it waits for
  the next start. The stop begins once the answer is written.
- The version is read from the manifest beside the entry file, by the
  same step up that finds the migrations, built or not.
- A folder of migrations that holds none is refused: a build that lost
  the folder would otherwise start on an empty database.
- Health does not know yet what only a module knows: the account of the
  code host, the limits a subscription last reported and the versions of
  the tools. The contract allows the empty answer for each.

### The build and the end-to-end tests are steps of the gate

- `build` writes the package a person installs into `dist/`, with the
  bundler the test runner already brings, and a warning fails it:
  `bin/service.js`, the migrations and one `package.json`. The manifest
  takes its name, version and Node from the root manifest, and its
  dependencies are those of every workspace together; one package asked
  for at two versions stops the build. A program is in `bin/`, so it
  finds the migrations and the manifest one step up, as the entry file
  does in its workspace. The program of the client joins `bin/` when the
  client has its entry file.
- `e2e` builds for itself and then runs the tests of `tests/e2e/`, which
  start the built file as a process of its own with an explicit list of
  variables and reach it only through its socket. Coverage does not count
  them: the code runs in another process.
- Why a step of its own: a unit or an integration test loads the source
  through the test runner. Only this step proves that the file a person
  installs starts, migrates, answers, stops and exits with a code.
- The audit of the dependencies has no finding in what the package
  installs. What is left is in tools of the harness and needs an older
  major version of a direct dependency, so it stays until those tools
  move.

### A test run that wrote no report is a failed scan

- A capture whose runner ended and wrote no report at all ends in
  `coverage_report_missing` with the output of the tests, and a scan
  fails with that reason. Before, it was a completed snapshot in which
  every file was unmeasured: a table of no numbers and no cause.
- Vitest writes no report once a test has failed unless it is told to,
  so it is started with `--coverage.reportOnFailure=true`. Jest writes
  one anyway. Both were tried on a project with one red test. A
  repository with a red test is therefore measured, and what is left for
  the new reason is a runner that stopped before it measured anything.
- A report that is there and lacks a file still leaves only that file
  unmeasured, and a project with no file that holds code needs no report.
- A test run in a lent working copy, for the gate of a patch, answers as
  before: the gate judges the target file, and an unmeasured target is
  already an error of the check.
- The scan has one reason more, so the version of the contract is 4.
- Where: `backend/src/modules/coverage/application/commands/`
  (`capture-snapshot/snapshot-capture.ts`, `run-tests/test-execution.ts`),
  `backend/src/modules/coverage/infrastructure/runners/vitest-command.ts`.

### Time is the Temporal of the platform

- The client needs what the service needs, the age of a moment and its
  one text, and also the time zone of its user. It cannot import the
  kernel of the service, so a second arithmetic of time would have been
  written beside the first. Instead both use `Temporal`, which Node has
  from 26.0 on with no flag.
- `Instant` of the kernel keeps its interface and its strict text. Inside
  it asks `Temporal`, and the calendar arithmetic of our own is gone. The
  text is still checked by its shape and by writing the moment back,
  because `Temporal` reads more shapes than the one of the contract.
- The clock of the service is `Temporal.Now`, cut to milliseconds. This
  ends the limit of the first clock, which was late after a machine was
  suspended. The price: the clock steps when the system sets its time.
- The clock is read in two files, one of the service and one of the
  client, and lint refuses `Temporal.Now` in every other file. `Date` of
  the language stays banned everywhere.
- Where: `backend/src/shared/kernel/time/instant.ts`,
  `backend/src/shared/infrastructure/time/system-clock.adapter.ts`,
  `frontend/src/api/clock.ts`, `harness/eslint/restricted-syntax.ts`,
  `harness/configs/tsconfig.base.json`.

### Owed after the wave that starts the service

- The worker should record its last poll, so health can say when it was
  last seen, and should itself refuse two handlers of one kind.
- The end-to-end tests cover the start and the stop of the built file
  and one journey from a repository to a pull request, with stand-ins
  for the engine, the code host and the generator. They do not cover
  yet: review mode, a rejected patch and a second attempt, a generator
  that fails or cannot log in, a publication the host refuses, a cancel,
  and a restart in the middle of an improvement.
- The log of a whole journey is four lines, the start and the end of
  each job, also at the level of debug. A step of a job, a tool that was
  started and a call of the code host leave no line.
- git gets `PATH` and `HOME` only. A push that goes through the
  credential helper of `gh` may need the token of the environment: to be
  proven on the first real publication.
- The image of the generator is named in the settings and built by
  nothing in the repository.
- The status of an answer is set in two ways: the improvement module has
  a helper for it and the coverage module sets it in the route. The two
  cancels should also answer an ended one with the same status.

### The client finds the service, and starts it when it must

- One client of the socket serves the screens and the commands. Every
  answer is read with the schema of its route. A refusal of the service
  is a value with its status and its error. A socket nothing answers on
  is an error of its own, which the callers catch in one place each.
- Where nothing answers, the client starts the service once, as a
  process of its own group that outlives the terminal. The service gets
  the variables the client was started with, as it would from a person
  who started it by hand, and the instance folder the client looks in.
  The other choice, a list of the variables of the service kept in the
  client, would be a second list to keep in step with the first.
- The standard error of a started service goes to `service.log` in the
  instance folder. When the service does not answer in time, or its
  process ends, the client shows the last lines it wrote and the path of
  the file.
- A health of another contract may not match the schema of this client.
  So the client reads the version and the running work first, and the
  whole health only when the version is its own. An idle service of
  another version is asked to stop and replaced. A busy one is left as it
  is, and the client says which work it runs.
- A client never ends a service of the user, also one it started and
  that did not answer in time. With `--isolated` it makes an instance in
  a new folder under `/tmp`, because the path of a socket is at most 104
  bytes, and ends that service and removes the folder on the way out.
- The client reads no clock to wait: a wait is counted in pauses.
- Where: `frontend/src/api/socket-service-api.ts`,
  `frontend/src/api/service-reach.ts`,
  `frontend/src/api/isolated-service.ts`,
  `frontend/src/app/service-door.tsx`.

### A command prints its result, and everything else beside it

- Standard output holds the result and only when the exit code is 0. A
  refusal of the service and a job that failed go to standard error as
  one line of JSON in the shape of the service, so a script that captures
  the output never takes a reason for a result.
- `--wait` asks about once a second and writes one line to standard
  error for each change. An improvement that waits for approval ends the
  wait with 0 and prints the `approve` command with the hash.
- `cancel <id>` tries the improvement first, and the scan when the
  service knows no improvement of that id.
- Three things the plan shows that no route returns: the baseline
  numbers on the line of `analyzing`, who cancelled an improvement, and
  the paths and the version of the client in `doctor`. A command prints
  what the service answers and makes up nothing.
- Where: `frontend/src/commands/`.

### One app over six screens

- A screen draws the whole shell and is handed two things: the session,
  which is the service, the moment and the time zone, and the frame,
  which is what the app owns of the shell. A screen knows no other
  screen: it asks for a move through a callback.
- The app owns the keys that work everywhere: the sections, the
  commands, the keys and quitting. A dialog of the app is drawn over the
  screen, and the screen with its own dialog is then behind it: dim, and
  without keys.
- The header counts the improvements that wait for approval and says
  how the service is, from one question the app repeats for all screens.
- When the service stops answering, the app reaches it again as it did
  at the start, and the screens stay open over the same session. That is
  also how the restart of the service screen works: it asks an idle
  service to stop, and the next question starts it.
- Quitting while work runs prints which work keeps running and the
  command that shows it later.
- Colour is off with `NO_COLOR` or `--no-color`. Unicode is on when the
  first locale variable that is set names UTF-8, and every symbol is its
  ASCII replacement otherwise. The plan named no way to tell.
- Where: `frontend/src/app/`, `frontend/src/screens/`.

### The root of the client reads the process, and nothing else does

- Only a root file may import both the app and the commands, so the
  choice between them is made there. `main.tsx` reads the process and
  holds no decision. `client-process.tsx` is given the arguments, the
  variables and the terminal as values, so a test runs the whole client
  with a stand-in of the service and a terminal of its own.
- The root files of the client have an alias, as those of the service
  have, because a relative import is refused.
- The package has two programs in `dist/bin/`. The client is the one a
  person starts: its file names what runs it, may be run, and is the
  `bin` of the manifest under the name of the package. It starts the
  service from the file beside its own.
- An end-to-end test runs the built client with a home of its own. The
  client repeats the names of the instance folder and of the socket,
  which it cannot import from the service, and this test holds the two
  together: the service makes the files and the client finds them.
- Where: `frontend/src/main.tsx`, `frontend/src/client-process.tsx`,
  `harness/gate/run-build.ts`, `frontend/tests/e2e/built-client.test.ts`.

### Owed after the wave of the client

- The list of commands holds the commands of the app only. The plan
  wants every action of every screen in it.
- Going back draws the screen anew, so the selected row is not kept.
- No test runs the screens in a real pseudo-terminal, so a change of
  width under a running client is not proven.
- The screens leave out what no route returns: the last access check of
  a repository, the name of its test runner, the paths of the service,
  and who cancelled an improvement. They also leave out the filters and
  the cancel of the list of improvements, opening a pull request in the
  browser, the next file, and asking again with larger limits after a
  failure.
- A start removes what was left before it listens, and an engine that
  does not answer is waited for thirty seconds, longer than the client
  waits for a start.
- The label of a container is made of the path of the instance, so the
  containers of a folder that was moved are not found, and those started
  before the label existed never are.
- An old service removes its socket a moment before it releases its
  lock. A new one that tried the lock in that moment would leave, and
  the client would wait its whole wait and say the service did not
  start.
- A request has no time limit, so a service that takes a connection and
  never answers holds the client.

### The routes are infrastructure, and the contracts are application

- The plan gave a module five folders: `domain`, `application`,
  `infrastructure`, `presentation` and `contracts`. A controller is an
  adapter of the framework as a repository of SQLite is, and the
  contracts of a module are the face of its application layer, so a
  module has three layers now. The routes are in `infrastructure/http/`
  and the contracts in `application/contracts/`.
- Each of the two keeps the rule it had as a layer. The routes import
  the application layer of their module and nothing else of it, and
  nothing but the module file imports them, so an adapter cannot call a
  route. The contracts import nothing else of their module, and another
  module enters a module through them only.
- How: the policy may give a part of a layer a rule of its own. A layer
  named with two folders, such as `application/contracts`, is that part,
  and a file in it is judged by the rule of the part, not by the rule of
  the layer around it. The policy also names which layers are the
  contracts, so the rule of the boundary holds no name of a folder.
- A unit test may not load a route, as it may not load any other
  infrastructure.
- Where: `harness/policy/structure.json`, `harness/architecture/places.ts`,
  `harness/architecture/rules/module-boundary.ts`.

### A route belongs to the module of its resource

- This overturns "A route belongs to the lowest module that knows its
  whole answer". The routes of a repository are in the module
  `repositories`, and the files of a snapshot are a route of `coverage`.
  The scans and the snapshots of a repository stay in `coverage`: they
  are its resources under the path of another.
- What a module above knows comes in through a port. The module below
  declares the port in its contracts and the module above implements it:
  `coverage` says what it knows of a repository, and `improvement` names
  the newest improvement of each file. So a module still imports nothing
  of a module above it, and no use case only passes a call on.
- A module file may not import the contracts of another module, so the
  class that implements a port names its token, and the module file
  binds the class to it. The modules are global, which lets the module
  below inject what the module above exports. `improvement` became global
  for this, and a test starts the whole application to hold the two
  bindings.
- Why not before: the first design let a route follow the knowledge, and
  it left the module of repositories with one route and the module of
  coverage with three use cases that did nothing of their own.
- Where: `backend/src/modules/repositories/application/contracts/repository-coverage.ts`,
  `backend/src/modules/coverage/application/contracts/file-improvements.ts`,
  `backend/tests/integration/module-ports.test.ts`.

### The root of the source holds one file

- What puts the service together from its modules is in
  `backend/src/composition/`: the root module, the settings of each
  module, the run and the process. It may import module files and the
  shared code, and only the entry imports it. It is no shared
  infrastructure, because the shared code may not import a module. What
  imported no module went there: the running service and the list of the
  job handlers.
- The client has the same folder for the two files that choose between
  the screens and the commands.
- `main.ts` holds two paths and one call. The paths stay there because
  one step up from the entry finds the migrations and the package from
  the source and from the bundle alike. Reading the version, the signals
  that stop the service and the ids of the user are decisions, and they
  are in the composition, where a test gives values. A package that
  cannot be read is now one line on the standard error, not a stack.
- The alias of the root stays for the entry alone: a test has to load
  it, and a relative import is refused.
- Where: `harness/policy/structure.json` (`entry`, `composition`),
  `harness/architecture/places.ts`,
  `backend/src/composition/service-process.ts`.

### Owed after the look at the client in a terminal

- The screens were run in a real terminal emulator for the first time.
  Two faults showed that no test had caught. The top edge of a panel
  ended one column early at four widths of five, because a share of the
  width is a fraction and a text is moved left to a whole cell. And a
  restart from the screens of a client with a service of its own left
  it without a service for good. Both are fixed and held by a test.
- A share of the width still gives a panel a width that is no whole
  number, so a text right of a filler inside it can stand one cell left.
- A client with a service of its own that is ended by a signal leaves
  that service running, with its folder.
- A start of a service of its own that failed keeps its folder for the
  log, and each new try makes another folder.
- One test of the client is not stable under load: the one that waits
  for an old service of another contract that does not go in time failed
  once in a run of the whole gate and passed alone.

### What is owed, read against the code

Every list of owed work above was read against the code on this day.
This list replaces them: what is not named here was found done.

A real run can fail, or lose work that was paid for:

- The image of the generator was built by a real engine once, on one
  machine. Not tried: `--pull=never` on an old engine, a build that is
  cut short, and any engine but Docker.
- A build or a pull that waits says nothing in the log until it ends,
  which may be ten minutes later. The engine is given the home of the
  user, so it asks the helper that keeps the passwords of that user even
  for a public image, and a helper that hangs holds every pull.
- A build that fails ends the improvement as a generator that is not
  there, with the words of the engine. No call was paid for, but the
  attempt was opened before the image was asked for, so it is counted.
  An engine that is not running is tried three times, and the reason
  that is then shown names no engine.
- The base of the image is named by its tag, not by its digest, and an
  image that was replaced stays in the engine without a name.
- Three readings of the generator are guesses that no run has measured:
  the status of a spent limit, the words of a failed login, and the
  error of a key with no credit.
- git gets no token for a push. Where the login of the code host lives
  in the environment only, a publication may fail: to be proven on the
  first real one.
- A run whose container may still live fails its step, and a step of
  the generator that fails so does not record the call that was paid
  for. The fault can be tried again, and the new copy has the path of
  the one the old container was lent.
- Every reading of the engine was proven on a stand-in. Not tried on a
  real one: the listing by a label, the words for a container that is
  gone or is being removed, and a mount of a copy made anew at one path.

A person meets it in the first minutes of the client:

- The screens that are kept were looked at in a terminal with empty
  lists only. That a row, a list and a filter come back is proven by
  tests of the whole app, not by a look with data.
- A panel that is cut in a low window does not say that more is below.
- The list of the keys is sixteen lines, the whole of the smallest
  window: one more line needs a list that scrolls.
- The browser is started with a path and nothing else. On Linux the
  program that opens an address needs the variables of the desktop, so
  there a pull request probably does not open, and nothing says so. Not
  tried on Linux.
- The name of the test runner is in the details of a repository and not
  in a row of the list.

Rare, and severe when it happens:

- A start removes what was left before it listens, and an engine that
  does not answer is waited for thirty seconds, longer than the client
  waits for a start.
- The label of a container is made of the path of the instance, so the
  containers of a folder that was moved are not found, and those started
  before the label existed never are.
- A service that stops still gives its socket back a moment before its
  lock. A start that comes then waits up to five seconds for the lock.
  One that waited in vain leaves with a line and the code of a start
  that gave way, so the client goes on asking for twenty seconds.
- A signal that comes while the client leaves is not heard, so a leave
  cannot be cut short. At worst it takes the wait for a start and the
  wait for a stop, forty seconds.
- A refused write to the terminal is ignored, for the terminal that was
  closed. So is the one of a command whose reader went away: it runs to
  its end and says nothing.
- A request has thirty seconds. The connect and the access check of a
  repository run tools while the client waits, and on a slow network
  they can take longer than that.

It makes a fault hard to find, or a screen say less:

- A line of a tool carries no id of its job, so it is tied to a journey
  by its time alone. The steps of a baseline that an improvement
  measures leave no lines of their own.
- A command whose service of its own did not start prints where the log
  is, and the leave then removes that folder.
- The advice for a service that does not answer in time is the one for
  a service of another version.
- Health says nothing of the account of the code host, the tools, the
  limits of the generator, the last sign of the worker and the paths of
  the service, and its two signs of life only repeat that the service
  is not stopping. The client knows the folder of the instance and the
  log itself and does not show them.
- No route returns the last access check of a repository or who
  cancelled an improvement.
- The status of an answer is set in three places, and the two cancels
  answer work that had ended with two statuses, 202 and 200.
- A text right of a filler in a panel can stand one cell left, in six
  places. A dot and the marks of added and removed lines are written in
  five screens and not taken from the theme.
- `--json` without a command does nothing.

Tests and the gate:

- The policy lists stress tests and the plan runs them in CI, and no
  test of that kind and no step of the gate exists.
- The end-to-end tests prove one journey. Not proven from end to end:
  review mode, a rejected patch and a second attempt, a generator that
  fails or cannot log in, a publication the host refuses, a cancel, and
  a restart in the middle of an improvement.
- No test runs the screens in a real terminal or changes its size while
  they run. Two faults were found by hand that way.
- A signal that ends the client was proven with a stand-in for the
  process and by hand in a terminal for two of the three. Ctrl+C during
  a command was not tried in one.
- Mutation tests cover the harness only, and the rule that keeps colour
  and symbols in the theme is not written.

Found done since they were written: the reason of a scan that ran out
of time, the refusal of a monorepo and of another package manager, the
patch taken after the sandbox ended, the refusal of a patch that holds
more than tests, the variables of git and its oldest version, the
bindings of the generator and of the worker, the wait for a limit, the
budget asked for before an attempt, the answers of an improvement, the
two refusals without a status, one deadline for every step, and one set
of settings for the tests. A working copy that was tampered with now
fails the improvement as an exposed credential and keeps its tokens.

### The screens take the whole screen, and sixteen rows are enough

- The screens are drawn on the other screen of the terminal, as an
  editor is. What the shell showed is hidden while they run and is back
  when they end, nothing above them can be scrolled into, and a change
  of the size of the window draws the frame anew with nothing left of
  the one before.
- Ctrl+C is a key of the client, not a signal. It leaves as `q` does:
  the line about work that goes on is printed, and a service of this run
  alone is stopped. Before the screens appear it leaves as well.
- The client says that it draws for a person. Without that, the library
  of the screens draws nothing until the end where a variable names an
  automated run, and so did the tests of the screens in CI.
- The smallest window is 80 by 16, down from 24 rows, because the
  terminal of an editor is low. In a low window only the body gives way:
  the header, the context, the notice and the footer keep their rows,
  and a panel cuts its content at its end.
- A screen has the actions its routes allow: asking again with larger
  limits after a spent budget, a pull request in the browser, the next
  file below the threshold, the filters and the cancel in the list of
  improvements, and the name of the test runner. The browser is given
  to the screens with the session, so a test opens nothing.
- Why not before: the screens were tested as frames of one size, and a
  frame does not show what a terminal keeps around it. The look in a
  real emulator showed it.
- Where: `frontend/src/app/interactive.tsx`,
  `frontend/src/theme/widths.ts`, `frontend/src/components/panel.tsx`,
  `frontend/src/api/browser.ts`.

### A copy is removed whatever was done to it, and a start clears the rest

- Code of a repository can leave a tree with folders the service may
  not list or empty. A removal that is refused gives the owner back each
  folder of the tree and tries again. A link is never followed, so
  nothing outside the tree is changed.
- The result of a step counts for more than its folders. Disposing of a
  copy never throws: a copy that stays is an error line in the log, and
  the next copy of the id or the next start removes it. One place holds
  this, behind the port of the working copies, so no step changed.
- A container that may still run after its command is a fault of the
  run, not an outcome: it may still write into the copy, so no patch is
  taken and the copy is thrown away. A name the engine no longer knows
  counts as removed.
- A start removes what a service that was killed left: the containers
  first, then every working copy, and never a mirror. It runs under the
  lock and before the worker, so no job holds a copy, and a job taken
  back after a crash makes its copy anew.
- Two instances share one engine, so a container carries a label made
  of the path of its instance, and a start removes only those with its
  own label and a name the sandbox gave. A part of this that fails is a
  line in the log, and the start goes on.
- No whole service of a test starts the real engine any more: each runs
  on a stand-in unless a test gives another.
- Where: `backend/src/modules/repositories/infrastructure/git/working-copy-folders.ts`,
  `backend/src/shared/infrastructure/sandbox/container-removal.ts`,
  `backend/src/shared/infrastructure/sandbox/leftover-containers.ts`,
  `backend/src/composition/leftover-sweep.ts`.

### An action is described once, and a screen is kept as it was left

- An action of a screen is one value: its key, its words in the footer
  and its line in the list of commands. One hook takes the list of a
  screen, runs the actions on their keys and offers them to a store the
  app reads, so the list of commands runs the handler the key runs. The
  lists of keys and of hints that each screen kept apart are gone.
- An action that cannot run is not in the list: the screen leaves it
  out, and a screen whose dialog or text field has the keys offers
  nothing. The actions of the screen come first, the commands of the
  app after them, and the typed text filters both.
- Every screen of every trail stays mounted, and the ones that do not
  show are hidden by the activity of the library. A hidden screen is
  not drawn and its effects rest, so it takes no key, asks the service
  nothing and offers no action, and it asks at once when it shows again.
  The other way, a memory of each place in the trail, needed a part of
  its own in every screen. This is one mechanism, and the last answer
  stays, so a return shows no empty screen.
- Each section keeps its trail. The key of a section shows it where it
  was left, and the key of the section that shows goes to its first
  screen.
- A list follows its chosen row by what the row is, not by its number.
  A row that moved is still chosen, and for a row that is gone the one
  at its place is.
- Where: `frontend/src/hooks/use-screen-actions.ts`,
  `frontend/src/app/shown-screen.tsx`, `frontend/src/app/navigation.tsx`,
  `frontend/src/hooks/use-selection.ts`.

### What the service reads is beside the code that reads it

- The migrations are in the folder of the database code,
  `backend/src/shared/infrastructure/database/migrations/`, and the file
  the image of the generator is built from is in the folder of the
  sandbox. The workspace of the service holds its sources, its tests and
  nothing beside them.
- The entry file still finds each by one step from its own place, built
  or not, because the build puts them at the same path from the bundle:
  `bin/shared/infrastructure/database/migrations/` in the package. The
  other way, short folders at the top of the package, needed an entry
  file that knows whether it was built.
- The table of the files of a workspace is read by the longest folder a
  file is in, so a migration is allowed in its folder alone and not in
  the whole of the sources.
- The ratchet records a migration by the name of its file. It recorded
  the whole path, and took a move of the folder for the removal of every
  migration, in the tree and against any older commit. A migration still
  may not change, go or get another name; the folder moves only with the
  policy that names it. A baseline with whole paths is read as names, so
  a tree is compared with a commit from before.
- This overturns the place the plan gives the migrations, beside the
  sources.
- Where: `harness/policy/structure.json` (`files`, `backend.migrations`),
  `harness/architecture/rules/unknown-file.ts`,
  `harness/architecture/lists.ts`, `harness/gate/run-build.ts`,
  `backend/src/main.ts`.

### The client gives up on a request, and leaves on a signal as on a key

- A request has thirty seconds from its connection to the last byte of
  its answer. One that ran out is a fault of its own, not a service that
  is not there: no second service is started for it, a command ends
  with one line, and a screen shows it and asks again.
- The signals that end a client, a closed terminal among them, make it
  leave as `q` does: a service of this run alone is stopped and its
  folder removed, the terminal is given back, and the process ends with
  the code of the signal. A shared service is never stopped. The entry
  file hands the process over as the place the signals arrive, as the
  service does.
- A closed terminal refuses the last write of the screens, and that
  error ended the client in the middle of its leave. No test saw it: a
  stand-in terminal refuses nothing. The entry file now ignores a
  refused write.
- What answers after a start is held to the contract as what was found
  is. One reach replaces at most one service.
- One run keeps at most one folder of a start that failed, and leaving
  removes it.
- Where: `frontend/src/api/socket-exchange.ts`,
  `frontend/src/composition/process-signals.ts`,
  `frontend/src/api/service-reach.ts`, `frontend/src/main.tsx`.

### A journey can be read in the log, and a start waits for a lock

- Every job leaves a line when it is taken, when it ends, when its
  handler fails, when it is put back and when it is given up. Every
  step of a scan and of an improvement leaves one at its start and one
  at its end, with the ids of the job, the repository and the
  improvement, so the lines of one journey are found by one id. At the
  default level a scan and an improvement are ten lines each.
- Every program the service starts leaves one line at debug: git, the
  program of the code host and the container engine, with its
  arguments, its exit code and its time. A runner hides the secrets it
  knows in them, and a run of a container shows the image and the
  program alone, since what follows may be a prompt. The environment,
  the input and the output of a program are never written.
- A service that stops deletes its socket as its server closes, before
  the database and the lock are given back, and the order cannot be
  turned: a lock given back first would let the close delete the socket
  of the next service. So a start that finds the lock held and no socket
  looks again for up to five seconds. One that finds a socket leaves at
  once, as before, and now says why on the standard error.
- The worker refuses a second handler of one kind when it is made.
- Where: `backend/src/shared/infrastructure/queue/job-worker-log.ts`,
  `backend/src/shared/infrastructure/logging/tool-log.ts`,
  `backend/src/shared/infrastructure/service/service-start.ts`,
  `backend/src/shared/infrastructure/queue/job-handlers.ts`.

### The service makes the image of the generator, and never looks for one

- The default image of the generator is built by the service from the
  file it ships: Node and the CLI at the version the command line was
  measured with. A public image was weighed and refused: none comes from
  the maker of the CLI, the container is given the credential of the
  generator, and the version would move with its publisher. A person who
  names another image in the setting gets that image and no build.
- Before the first command in an image the sandbox asks the engine for
  it. An image the service builds is built when it is missing or was
  built from another file, which a label with the digest of the file
  tells. Any other image is pulled when it is missing. Every run then
  tells the engine not to pull, so a name that exists nowhere fails with
  words that say so. One mechanism serves both sandboxes.
- The preparation starts in the background once the service listens, so
  a build does not use the time of a generation. A command that comes
  meanwhile waits for the same preparation, a failure is not kept, and a
  service that stops cuts the build short.
- The engine is given a new empty folder beside the file, since the file
  copies nothing and its own folder holds the code of the service.
- A test holds the version in the file to the tag of the default image.
- Where: `backend/src/shared/infrastructure/sandbox/generator.Dockerfile`,
  `backend/src/shared/infrastructure/sandbox/image-preparation.ts`,
  `backend/src/shared/infrastructure/sandbox/sandbox-images.ts`,
  `backend/src/composition/image-start.ts`.

### What the first real engine showed

- The service built the image of the generator on a real engine: a pull
  of the base in 4 seconds, a build in 16, an image of 932 MB. The label
  is read back, an image with no label at all answers with an empty
  line and no error, a run of a name the engine does not have fails at
  once, and the CLI answers as a user that is not root, on a root that
  is read-only, with no network. A second start built nothing.
- A scan of a real project ran in real containers: 97 packages from the
  lockfile in a second, Vitest with the v8 provider in half a second.
  The numbers were right, and a source file no test imports was listed
  with nothing covered. The code host of that run was the stand-in.
- The first build did not end. The helper of the engine that reads the
  passwords of a registry hung. The time limit killed the program of the
  engine alone, the helper kept its streams, and the call ended twelve
  minutes after its start, when the helper was killed by hand, not ten.
  The program of the engine leads a group of its own now, as a tool of
  the host does, and a stop kills the group. A test plays a helper that
  outlives its program.
- One kill of the group is not enough. That test hung once in a full gate
  beside other work: a helper its program was starting while the group
  was killed was not yet in the group, outlived the kill and kept the
  streams. Under load it happened in 35 of 1200 rounds. The group is
  killed again once its leader ended, and that second kill reached the
  helper in every round where one was left.
- Why a test did not find it: the stand-in of the engine started no
  program of its own.
- The CLI logged in inside the container with a token of a subscription
  and answered one turn in under a second. The token was in no line of
  the log.
- The first real improvement ended as `mutation_unsupported` before the
  generator was called. Each runner of the mutation tool starts only the
  tests related to the mutated file, and a file nobody tested has none,
  so the tool ran no test and stopped. Seen with Vitest 4 and with
  Jest 30. The configuration tells both runners to run every test now.
- The mutation tool ends its test runners through `ps`, and the default
  image of a sandbox had none. A run that got past its first test run
  ended there with no report. An image with `ps` in it passed, and the
  service now builds one, as the next entry says.
- Where: `backend/src/shared/infrastructure/processes/kill-group.ts`,
  `backend/src/shared/infrastructure/sandbox/engine-process.ts`,
  `backend/src/modules/verification/infrastructure/mutation/stryker-configuration.ts`.

### The service makes the image of the commands as well

- The default image of the commands of a repository is
  `coverage-autopilot-sandbox:26`: `node:26-slim` and the `procps`
  package, which holds `ps`. The slim image of Node leaves `ps` out, and
  the mutation tool cannot end its test runners without it. The service
  builds the image from the file it ships, as it builds the image of the
  generator. This replaces the default `node:26-slim` that "A sandboxed
  command runs as the user of the service" names.
- One function gives each sandbox the build of its image when the sandbox
  names an image the service makes, from the file of that image. Any
  other name is taken as the engine has it, or pulled. The preparation
  after the start, the wait of a command, the limits and the errors are
  the same code for both sandboxes.
- The tag of the image is the version of Node of its base. A test holds
  the file to that base, to the base of the file of the generator, and to
  `procps`.
- The stand-ins of the engine answer each image with the label of its
  own file, so a test of the whole service builds nothing unless it says
  so. The end-to-end journey checks that no image was built or pulled.
- Owed: the service has not yet built this image on a real engine, and
  `.env.example` still names `node:26-slim` as the default.
- Where: `backend/src/shared/infrastructure/sandbox/sandbox.Dockerfile`,
  `backend/src/shared/infrastructure/config/shipped-images.ts`,
  `backend/src/main.ts`.

### A mirror takes one fetch at a time

- Every repository has one mirror, and a request that asks for an
  improvement fetches its branch into it, as a job does before it makes a
  copy. git moves a branch under a lock and only from the commit it read
  first, so two fetches into one mirror after the branch moved made one of
  them fail, and the request answered 500.
- Each change of a mirror now waits for its turn: the fetch of the branch,
  and a fetch by hash with the checks around it. The turns live in one
  object of the module, shared by the adapter of git and that of the
  working copies, so a request and a job wait for each other too. A read
  of a mirror takes no turn.
- The turns hold within one service, which is all there is: a start takes
  the lock of its instance, and no other process changes its mirrors.
- Where: `backend/src/modules/repositories/infrastructure/git/mirror-turns.ts`,
  `backend/src/modules/repositories/infrastructure/git/git-mirror.ts`.

### A repository keeps a threshold of its own

- The default of the service is `AUTOPILOT_COVERAGE_THRESHOLD`, a whole
  percent of lines from 1 to 100, and 80 when it is not set. The 80 is
  written once, as the fallback of the variable. The metric stays lines,
  set where the service is composed. 0 is refused, since it would make
  no file a target.
- A repository may keep a whole percent of its own in
  `repositories.threshold_percentage`, added by migration 0009. Empty
  means the default of the service. The column holds the percent alone,
  and the metric is the one of the service.
- The repositories module owns the threshold. Its contract gives each
  repository the threshold in effect with `isDefault`, and the answer of
  a repository has it as `threshold`. `POST /repositories/:id/threshold`
  with `{ "percentage": 90 }` sets it and `{ "percentage": null }` clears
  it. The answer is the repository as its files are judged from then on.
- The coverage module keeps no threshold in its settings. It asks the
  repositories module each time it judges a file, so `belowThreshold`,
  the split of a snapshot, the next file of the client and the ending
  `threshold_met` of an improvement follow a change at once, for the
  snapshots taken before it too. The port `REPOSITORY_COVERAGE` is given
  the repository as it was read, so the split matches the threshold the
  same answer shows.
- A run of tests in a working copy names no repository, so its files
  carry no `belowThreshold`. The gate compares their numbers with a
  snapshot and never read it.
- A look at the head reads the repository again in its transaction
  before it saves, as the change of a threshold does: both save the
  repository whole, and the host may take seconds to answer.
- The client: `repo threshold <repo> <percent>`, with `default` in place
  of the percent, and `t` on the screen of the repositories. The command
  checks the shape alone and leaves the range to the service. `files`
  prints the percent beside `below`, and the screens write
  `own threshold` for a threshold of its own.
- Owed: `.env.example` does not name the variable yet, since it is a
  file of the policy.
- Where: `backend/src/modules/repositories/application/commands/change-threshold/`,
  `backend/src/modules/repositories/application/dto/repository-dtos.ts`,
  `backend/src/modules/coverage/application/repository-thresholds.ts`,
  `frontend/src/commands/repo-threshold.ts`,
  `frontend/src/screens/repositories/threshold-dialog.tsx`.

### A result goes to a fork when the account may not push

- The access check no longer fails when the account may not push. It
  passes and names the account a fork is in, which `gh api user` reads.
  The check carries where a result goes: `repository`, or `fork` with the
  account. It is known with the last step, as the head is, and is `null`
  until then. A strict object of the contract gained a field, so a client
  of the version before refuses the answer. `CONTRACT_VERSION` was not
  raised here: owed.
- Publishing asks the host again, since the right to push can change
  between the check and the end of the work. Allowed, it publishes as
  before. Denied, it takes the fork route, and never opens a pull request
  in the repository:
  1. `gh api --method=POST repos/<owner>/<name>/forks` answers the fork
     the account has, or makes one. Its address is the `clone_url` of the
     answer, read through `RepositoryUrl`, never a name made from the
     login, since the host names a fork `<name>-1` when the account has a
     repository of that name.
  2. The host makes a new fork in the background. The service looks with
     `git ls-remote --symref` every 2 seconds, for up to 60, until the
     fork names its default branch. The waits go through the alarm and the
     clock.
  3. The fork may be far behind, and the base commit of the work on no
     branch of it. So one atomic push from the clean copy made for
     publishing sends the base commit to the branch
     `coverage-autopilot/base-<full hash>` and the test commit to the
     branch of the improvement. A full hash, so two bases never share a
     name.
  4. `gh pr create` in the fork, from the branch of the improvement into
     that base, so the pull request holds the one commit.
- Each step looks first for what an earlier run made: the fork request
  answers the fork that exists, the push is skipped when the branch is
  there, and the pull request is looked for in the fork before one is
  opened. An end-to-end test kills the service as it opens the pull
  request, and the next start ends with one fork, one pull request and
  one commit.
- A refusal of the host is the outcome `refused` with its words, and the
  improvement fails with them, as before. Two faults may be tried again:
  a fork that git does not reach within 60 seconds (`fork_not_ready`),
  and a host that did not say whether the account may push
  (`permission_not_read`). A `gh` with no login is the fault
  `gh_not_authenticated` of every call but the one that reads the login,
  the new ones included, so publishing without one fails at once, as it
  did. The access check asks for the right to push only once its step
  before found the login.
- Nothing new is stored, so no migration: the route is decided again at
  each publication.
- The client says where a result goes before a run: `repo check` ends with
  a `publishes` line, `improve` checks the access and says it on the
  standard error before it starts, and starts nothing when the check did
  not pass, and the start dialog says it under the choice of publishing.
- Known, and not handled:
  - The host refuses a push that adds or changes a file under
    `.github/workflows/` when the login of `gh` lacks the `workflow`
    scope. A test file is no workflow, so this shows only for a
    repository that keeps its tests there, as a refused push.
  - An owner can forbid forks. The check does not ask, and the refusal
    shows when publishing, with the words of the host.
  - When the right to push changes between a run cut short and the next,
    the next run publishes to the other place, and a branch or a pull
    request may then be in both.
  - The fork the host answers is trusted to be one of the repository: its
    parent is not compared.
  - The base branches stay in the fork once a pull request is closed.
- Not seen on the real host, only on the stand-in: the shape of the fork
  answer beyond `fork` and `clone_url`, the time a new fork takes, an
  atomic push to a fork, and the words of its refusals.
- Where:
  `backend/src/modules/repositories/application/commands/publish-patch/publication-targets.ts`,
  `backend/src/modules/repositories/application/commands/check-access/access-probe.ts`,
  `backend/src/modules/repositories/infrastructure/gh/gh-code-host.adapter.ts`,
  `backend/src/modules/repositories/infrastructure/git/git-working-copies.adapter.ts`,
  `api-contracts/src/repositories.ts`, `frontend/src/commands/start-access.ts`.

### A project of pnpm or yarn is installed with the manager it names

- The manager is the one the `packageManager` field of package.json
  names, or else the one whose lockfile the copy has. The field must name
  an exact version, with or without a hash: a range or an address is
  refused, since the program would not be the one the repository asks
  for. npm stays lenient and is the npm of the image. Two lockfiles and
  no field, a field without its lockfile, bun and workspaces are refused
  as before.
- Corepack, not managers baked into the image. A repository asks for any
  of pnpm 7 to 12, yarn 1, 3 and 4, at an exact version, and a baked
  manager would be the wrong one for most. Corepack 0.36.0 is installed
  into the image at an exact version, since Node 26 ships none. It
  fetches the exact program while the install has the network, and
  checks the hash of the field. Without a hash, its source checks the
  signature the registry gives pnpm and yarn 1, and nothing for yarn 2
  and later, so a yarn 2 or later the service picks carries the hash of
  its program. The program goes to the home folder in memory, a few
  megabytes, and is gone with the container, so no later command can
  start a manager: the network is closed then.
- `COREPACK_NPM_REGISTRY` names the registry of npm, so every program
  comes from it: yarn 2 and later as `@yarnpkg/cli-dist`, not from the
  site of yarn. The hash of a field still holds for that program, seen
  for 4.18.1 and 3.8.7, and a wrong hash failed. `COREPACK_ENV_FILE=0`:
  a `.corepack.env` of the repository sent the download elsewhere in the
  spike. Corepack refuses a manager other than the one the field names,
  and the service never asks for one.
- Without a field, the version comes from the format of the lockfile.
  pnpm: `5.4` is 7.33.7, `6.0` is 8.15.9, `9.0` is 10.34.9. pnpm 9 to 12
  all write `9.0`, 12 in two documents, which 9 refused and 10 read.
  yarn 1 is 1.22.22. yarn 2 and later by `__metadata.version`: 6 is
  3.8.7, 8 is 4.13.0, 9 is 4.14.1, 10 is 4.18.1. Seen: 3.2.4 writes 6,
  4.0.2 to 4.13.0 write 8, 4.14.1 writes 9, 4.15.0 and later write 10,
  and an immutable install by a yarn of another format failed with
  YN0028. The registry of npm and the site of yarn served each of the
  four programs with one hash, and an install with each pinned hash
  passed. A field of yarn 1 with a lockfile of yarn 2 or later, or the
  reverse, is refused.
- The installs, each with the variables of the settings besides:
  - npm: `npm ci --ignore-scripts --no-audit --no-fund --cache <cache>`.
  - pnpm: `corepack pnpm@<v> install --frozen-lockfile --ignore-scripts
    --ignore-pnpmfile --store-dir <cache>
    --config.manage-package-manager-versions=false
    --reporter=append-only`, with `COREPACK_ENV_FILE=0` and
    `COREPACK_NPM_REGISTRY`.
  - yarn 1: `corepack yarn@<v> install --frozen-lockfile
    --ignore-scripts --ignore-engines --non-interactive --cache-folder
    <cache>`, with `YARN_IGNORE_PATH=1` as well. `--ignore-engines`
    installs a package that asks for another Node as npm does.
  - yarn 2 and later: `corepack yarn@<v> install --immutable
    --mode=skip-build`, with `YARN_IGNORE_PATH=1`,
    `YARN_RC_FILENAME=.coverage-autopilot-yarnrc.yml`,
    `YARN_ENABLE_SCRIPTS=0`, `YARN_ENABLE_GLOBAL_CACHE=0`,
    `YARN_ENABLE_MIRROR=0`, `YARN_CACHE_FOLDER=.yarn/cache`,
    `YARN_ENABLE_TELEMETRY=0`, `YARN_CHECKSUM_BEHAVIOR=throw` and
    `YARN_NODE_LINKER=node-modules`.
- yarn 2 and later read settings the service writes: `.yarnrc.yml`
  without `yarnPath`, `plugins` and `enableConstraintsChecks`, the rest
  kept, since package extensions and scopes change how the lockfile
  resolves. An immutable install with a package extension passed with
  the written file. A line the service does not read, such as a mapping
  indented as a whole, a flow mapping or a merge, is refused, since a
  dropped setting could hide in it. The file is written after whatever is
  at its place is removed, and never through a link. A patch adds only
  test files, the generator works in a fresh copy with no install, and a
  publication pushes from a clean copy, so the file reaches none of them.
- Refused with `install_runs_code`, naming what was found: pnpm
  `configDependencies`, whose hooks pnpm runs as it starts; a package
  from git for pnpm, yarn 1 and yarn 2 and later, which each prepares by
  running its scripts; an `exec:` package of yarn, made by a script; a
  `.yarnrc.yml` the service does not read. Refused with
  `plug_and_play`: yarn 2 and later with no `nodeLinker: node-modules`.
  `nodeLinker: pnpm` is refused as an unsupported manager.
- The cache of an install is `node_modules/.cache/coverage-autopilot/install`
  for npm, pnpm and yarn 1: on the disk of the copy, gone with it, never
  shared, and under `node_modules`, where the generator's copy has
  nothing. yarn 2 and later keep theirs in `.yarn/cache`: under
  `node_modules` the linker removed what it had just fetched and failed
  with ENOENT.
- The version of the runner is read from the lockfile of the manager:
  npm by `packages["node_modules/<runner>"]`, pnpm by the dependency of
  the project without its peers, yarn 1 by the entry that lists
  `<runner>@<range>`, yarn 2 and later by the one that lists
  `<runner>@npm:<range>`, the range being the one of the manifest.
- The mutation tool is installed by the npm of the image into a folder
  of its own, `node_modules/.cache/coverage-autopilot/mutation`, with
  its own cache and no peer, so the runner plugin loads the test runner
  of the project. An install among the packages of the project would
  reshape a tree pnpm or yarn laid out. A run gets
  `NODE_PATH=<copy>/node_modules/.pnpm/node_modules`: without it the
  runner of Jest did not find `jest-environment-node` on a project of
  pnpm. The tool ignores `/.yarn/cache`, which it would copy into its
  sandbox. Seen: StrykerJS 10.1.1 with Jest 30.5.2 and Vitest 4.1.12 on
  projects of pnpm 10.34.9, yarn 1.22.22 and yarn 4.18.1 killed every
  mutant, and both runners wrote their coverage reports.
- Spike, on fixtures with a manifest, a lockfile and files that leave a
  mark when they run:
  - pnpm ran `.pnpmfile.cjs` and the root `postinstall` without the
    switches, and nothing with them.
  - yarn 1 ran the program of a `yarn-path` of `.yarnrc` and of a
    `yarnPath` of `.yarnrc.yml` without `YARN_IGNORE_PATH`, and neither
    with it. `ignore-scripts false` in `.yarnrc` or `.npmrc` did not turn
    the scripts back on, and `--cache-folder` won over `.yarnrc`.
  - yarn 4 ran `yarnPath`, a plugin and the root `postinstall`.
    `YARN_ENABLE_SCRIPTS=0` alone still ran the root `postinstall`, and
    `--mode=skip-build` stopped it. `enableConstraintsChecks: true` ran
    `yarn.config.cjs` during the install. yarn 3.8.7 fails an install on
    `YARN_ENABLE_CONSTRAINTS_CHECKS`, a setting it does not know, so the
    setting is dropped from the file instead. A variable won over the
    file for `nodeLinker`.
  - The install the service code decides, run on such fixtures of
    pnpm 10.34.9, yarn 1.22.22, 3.8.7 and 4.18.1, ran nothing of the
    repository, left the manifest and the lockfile as they were, and
    left packages that load.
- Only a real container can show: the build of the image with Corepack,
  the fetch from the registry over the default network of the engine,
  and an install as a user that is not root, on a read-only root, with
  the home folder in the 512 MB memory folder.
- Not looked at: whether npm runs scripts of a package from git, a yarn 1
  offline mirror, which writes the archives it lacks into the copy, and
  the `.env.yarn` file yarn 4 reads. The spike installed no package from
  git and no `exec:` package: those refusals rest on how the managers
  describe them.
- Where: `backend/src/modules/coverage/infrastructure/detection/`,
  `backend/src/shared/infrastructure/sandbox/sandbox.Dockerfile`,
  `backend/src/modules/verification/infrastructure/mutation/stryker-configuration.ts`.

### What the first real fork and the first real installs showed

- A whole improvement ran on a public repository the account may not
  push to, with the real host, the real engine and the real generator.
  One attempt took a file from 3 of 26 lines to 26 of 26 and killed 35 of
  37 mutants. The service made the fork, pushed the base and the tests in
  one push, and opened the pull request inside the fork: one commit, one
  test file, against the branch of the scanned commit. Nothing reached
  the repository itself, and the token was in no line of the log.
- The access check first said that gh is not logged in. An old second
  account with a broken login was in the keyring, and gh fails a status
  that is not asked for the active account alone. The status is asked
  with `--active` now.
- An improvement of another file spent its three attempts on one cause.
  The new test did not start, for a type error of the project that its
  own tests never meet, and the gate told the generator only that the
  tests fail. The generator cannot run a test, so it wrote the same test
  three times. The failure itself must reach the next attempt: owed, and
  in work.
- A repository whose own tests need the network is scanned, with the
  tests that fail, and an improvement of it ends after the analysis with
  `mutation_unsupported`, because the mutation tool refuses a suite that
  fails before it changes anything. No token was spent, but the reason
  names the tool and not the cause. Owed: say that the tests of the
  repository fail in the sandbox, at the scan and at the start of an
  improvement.
- A scan lists every source file, the scripts of an `examples` folder as
  well, so they count as files below the threshold. Whether such folders
  are left out is the owner's call.
- The image of the commands was built anew with Corepack, and seven
  public repositories were scanned on the real engine as they are: pnpm
  10.33, 11.3 and 11.10, the last two with a settings file of pnpm and a
  hash in the manifest; yarn 1.22.22 twice; yarn 4.5.0 twice, both with a
  yarn of their own in the tree, which did not run. Each manager came at
  the version the repository names, as a user that is not root, on a root
  that is read-only.
- Two refusals were right: a lockfile of yarn that takes a package from
  a git repository, and a project of Vitest that declares no provider of
  coverage.
- The engine of this machine cannot mount a folder that was removed and
  made again at the same path: it says that the source of the mount does
  not exist. An instance folder is not made again where one was removed.
