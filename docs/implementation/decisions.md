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
