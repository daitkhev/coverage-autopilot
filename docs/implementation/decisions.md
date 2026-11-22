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

- `build` writes `backend/dist/main.js` with the bundler the test runner
  already brings, and a warning fails it. The file is beside the
  migrations, as the entry file is.
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

### Owed after the wave that starts the service

- The worker should record its last poll, so health can say when it was
  last seen, and should itself refuse two handlers of one kind.
- The end-to-end tests cover the start and the stop of the built file.
  The journey from a repository to a pull request, with stand-ins for the
  engine, the code host and the generator, is the next step.
- git gets `PATH` and `HOME` only. A push that goes through the
  credential helper of `gh` may need the token of the environment: to be
  proven on the first real publication.
- The image of the generator is named in the settings and built by
  nothing in the repository.
- The status of an answer is set in two ways: the improvement module has
  a helper for it and the coverage module sets it in the route. The two
  cancels should also answer an ended one with the same status.
