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
