# Settings

This guide is for a person who wants the service to behave differently:
pay with an API key, give a large repository more time, run more work at
once or keep the data in another folder. It lists every variable the
service reads, grouped by what it changes, with its default, what it
accepts and when a person would change it. Every variable is also in
[.env.example](../../.env.example), with a comment of its own. How to get
a first run going is in [First run](first-run.md).

## How the service reads its settings

The service reads its variables once, from the environment it is started
in, and never from a file. The `.env` file at the root of the repository
holds the settings of the gate and is not read by the service. A value is
trimmed, and an empty value counts as not set.

1. Export the variables you change in the shell you start the client
   from:

   ```sh
   export AUTOPILOT_LOG_LEVEL=debug
   export AUTOPILOT_QUEUE_CONCURRENCY=1
   ```

2. Check them with a private service that lives for one command. It gets
   the variables of this shell and is removed afterwards:

   ```sh
   npm start -- doctor --isolated
   ```

   With a wrong value it prints `The service did not start.`, the line
   the service wrote, and where the rest of its log is. The line names
   every wrong variable and what it expects, never the value, since a
   value may be a secret, for example:

   ```text
   The service did not start: The service cannot start with its variables. AUTOPILOT_QUEUE_HEARTBEAT_MS: expected a whole number below AUTOPILOT_QUEUE_LEASE_MS, so that a lease is renewed before it runs out.
   ```

3. Open the screens with `npm start`. When no service runs, the client
   starts one with the variables of this shell, and you are done.
4. When a service already runs, it keeps the variables it was started
   with. Press `3` for the Service screen, then `r`. The last line says
   `The service stops, and starts again with the next request.` The next
   request of this client starts the service with the variables of this
   shell. `r` waits while a scan or an improvement runs: the key then says
   `after the running work ends`.

A second instance folder gives a second service with its own data and its
own variables: set `AUTOPILOT_INSTANCE_DIR` before you start the client,
since the client finds the service through it too.

## The instance and the log

| Variable | Default | Accepts | Change it when |
| --- | --- | --- | --- |
| `AUTOPILOT_INSTANCE_DIR` | `~/.coverage-autopilot` | An absolute path; the path of the socket in it, `<folder>/service.sock`, is at most 104 bytes | You want a second service apart from the first, or the data on another disk |
| `AUTOPILOT_LOG_LEVEL` | `info` | `debug`, `info`, `warn` or `error` | You want each program the service starts in the log, with its arguments, exit code and duration: `debug` |

The folder holds the database `service.sqlite`, the lock
`instance.lock`, the socket `service.sock`, the stored output of tools
under `artifacts/` and the working copies under `working-copies/`. A
service the client started appends its log to `service.log` there.

## The sandbox

Every command of a repository runs in a container of the engine. These
limits hold for each container. The generator runs in one with the same
engine, user and limits, its own image and its own output limit.

| Variable | Default | Accepts | Change it when |
| --- | --- | --- | --- |
| `AUTOPILOT_SANDBOX_ENGINE` | `["docker"]` | A JSON list: the program, then its first arguments | The engine program is not `docker` on your `PATH` |
| `AUTOPILOT_SANDBOX_IMAGE` | `coverage-autopilot-sandbox:26` | An image name with no space and no `-` at its start | A project needs an image of your own; see below |
| `AUTOPILOT_SANDBOX_UID` | the user of the service | A whole number above 0 | The service runs as root, which the check refuses: name another user |
| `AUTOPILOT_SANDBOX_GID` | the group of the service | A whole number above 0 | As above, for the group |
| `AUTOPILOT_SANDBOX_MEMORY_MB` | `4096` | A whole number above 0 | The tests of a repository need more memory |
| `AUTOPILOT_SANDBOX_CPUS` | `2` | A number above 0, such as `1.5` | The machine has processors to spare, or too few |
| `AUTOPILOT_SANDBOX_PROCESSES` | `512` | A whole number above 0 | A test runner starts more processes and threads at once |
| `AUTOPILOT_SANDBOX_SCRATCH_MB` | `512` | A whole number above 0 | `/tmp` fills up; it is also the home folder of every command |
| `AUTOPILOT_SANDBOX_OUTPUT_BYTES` | `1048576` | A whole number above 0 | You need more of a long output: the bytes are kept from its end |

The service builds the default image itself from the file it ships, and
builds it again when that file changes. Any other name is used as the
engine has it, or pulled once, and never built. Such an image needs `ps`,
which the mutation tool uses, Corepack for a project of pnpm or yarn, and
git for a trusted project with a package from git.

## The queue

Scans and improvements are jobs of one queue. One job of a repository runs
at a time, and jobs of different repositories run side by side.

| Variable | Default | Accepts | Change it when |
| --- | --- | --- | --- |
| `AUTOPILOT_QUEUE_CONCURRENCY` | `2` | A whole number above 0 | You want more repositories worked on at once, and the machine holds that many more sandboxes; `1` for a small machine |
| `AUTOPILOT_QUEUE_MAX_RUNS` | `3` | A whole number above 0 | A job that stops on a passing fault, such as an engine that is not up, should be tried more or fewer times |
| `AUTOPILOT_QUEUE_LEASE_MS` | `60000` | A whole number above 0 | Rarely: how long a claim holds a job when its service stops answering |
| `AUTOPILOT_QUEUE_HEARTBEAT_MS` | `20000` | A whole number below the lease | Rarely: how often a running job extends its claim |
| `AUTOPILOT_QUEUE_POLL_MS` | `1000` | A whole number above 0 | Rarely: how often the worker looks for a job |

## What a repository is judged and installed by

| Variable | Default | Accepts | Change it when |
| --- | --- | --- | --- |
| `AUTOPILOT_COVERAGE_THRESHOLD` | `80` | A whole percent of lines from 1 to 100 | Most of your repositories aim for another percent |
| `AUTOPILOT_INSTALL` | `sandboxed` | `sandboxed` or `trusted` | You trust every repository you connect to run its install scripts |
| `AUTOPILOT_BASELINE_TESTS` | `may_fail` | `may_fail` or `must_pass` | No improvement should start while a test of the repository fails |

Each is the default for a repository that made no choice of its own.
`repo threshold owner/name 90` and `repo trust owner/name trusted` choose
for one repository, and `default` gives the value of the service back.
What each mode allows is in
[Working with repositories](working-with-repositories.md) and
[Sandbox and secrets](sandbox-and-secrets.md).

## Time limits of the commands

| Variable | Default | Accepts | Change it when |
| --- | --- | --- | --- |
| `AUTOPILOT_INSTALL_TIMEOUT_MS` | `600000` (10 min) | A whole number above 0 | A large lockfile or a slow registry needs longer; it also limits the install of the mutation tool |
| `AUTOPILOT_TEST_RUN_TIMEOUT_MS` | `900000` (15 min) | A whole number above 0 | One run of the tests takes longer; a scan that passes it ends with `test_run_timed_out` |
| `AUTOPILOT_TYPE_CHECK_TIMEOUT_MS` | `300000` (5 min) | A whole number above 0 | The type check of the project takes longer |
| `AUTOPILOT_MUTATION_RUN_TIMEOUT_MS` | `1800000` (30 min) | A whole number above 0 | Rarely: the time left of the budget limits a run as well |
| `AUTOPILOT_MUTATION_CONCURRENCY` | `2` | A whole number above 0 | Test runners the mutation tool starts at once; match it to `AUTOPILOT_SANDBOX_CPUS` |
| `AUTOPILOT_GIT_TIMEOUT_MS` | `600000` (10 min) | A whole number above 0 | A clone of a long history takes longer |
| `AUTOPILOT_GH_TIMEOUT_MS` | `60000` (1 min) | A whole number above 0 | Calls of `gh` time out on a slow network |

## Who the commits are from

| Variable | Default | Accepts | Change it when |
| --- | --- | --- | --- |
| `AUTOPILOT_GIT_AUTHOR_NAME` | `Coverage Autopilot` | A name on one line with no `<` or `>` | The commits should name you or a bot of your own |
| `AUTOPILOT_GIT_AUTHOR_EMAIL` | `autopilot@coverage-autopilot.invalid` | An address with no space, `<` or `>` | As above. The default domain is reserved, so no account is credited |

Both are the author and the committer of each commit the service pushes.

## The generator: subscription or API key

| Variable | Default | Accepts | Change it when |
| --- | --- | --- | --- |
| `AUTOPILOT_GENERATOR` | `claude_code` | `claude_code` only | Not yet: it is the one CLI |
| `AUTOPILOT_GENERATOR_BILLING` | `subscription` | `subscription` or `api_key` | You pay per call with a key |
| `AUTOPILOT_GENERATOR_MODEL` | `sonnet` | A model name the CLI takes, with no space and no `-` at its start | You want another model |
| `AUTOPILOT_GENERATOR_IMAGE` | `coverage-autopilot-generator:2.1.329` | An image name, as for the sandbox | You need another version of the CLI; the image must hold it |
| `AUTOPILOT_GENERATOR_MAX_TURNS` | `20` | A whole number above 0 | Calls end at the limit before they write a test |
| `AUTOPILOT_GENERATOR_TIMEOUT_MS` | `600000` (10 min) | A whole number above 0 | Calls end at the time limit |
| `AUTOPILOT_GENERATOR_OUTPUT_BYTES` | `16777216` | A whole number above 0 | Rarely: the bytes of a call's output that are kept |
| `AUTOPILOT_GENERATOR_MAX_COST_USD` | `1` with a key | A number above 0; refused under a subscription | One call may cost more or less, in US dollars |
| `AUTOPILOT_GENERATOR_LIMIT_WAIT_MS` | `3600000` (1 hour) | A whole number above 0 | The wait for a spent window when the CLI did not say when it opens |

A call that reaches its turns, its price or its time keeps nothing of
what it wrote, and its attempt ends without a patch.

The credential is not one of these variables. The service takes it from
its environment, hands it to the generator's container alone and never
stores it:

- With `subscription`, set `CLAUDE_CODE_OAUTH_TOKEN` to the token that
  `claude setup-token` prints. A subscription has windows instead of a
  price. When the five-hour window is spent, the improvement waits until
  it opens again, and spends none of its budget while it waits. It waits
  twice at most; the third time, and a spent weekly limit, end it with
  `quota_exhausted`. The token limits of a budget and
  `AUTOPILOT_GENERATOR_MAX_COST_USD` are refused: the service does not
  start with them.
- With `api_key`, set `ANTHROPIC_API_KEY`. Each call is limited to
  `AUTOPILOT_GENERATOR_MAX_COST_USD`, and a budget has tokens.

Without the credential the service still starts and scans run. The start
of an improvement is refused with `generator_unavailable`:

```text
The generator has no credential, so no improvement can run. Set CLAUDE_CODE_OAUTH_TOKEN and start the service again.
```

## The budget of an improvement

| Variable | Default | Accepts | Change it when |
| --- | --- | --- | --- |
| `AUTOPILOT_BUDGET_ATTEMPTS` | `3` | A whole number, at most the maximum | Most files need more or fewer tries |
| `AUTOPILOT_BUDGET_MAX_ATTEMPTS` | `10` | A whole number above 0 | A request may ask for more |
| `AUTOPILOT_BUDGET_MINUTES` | `30` | A whole number, at most the maximum | Most improvements need more time |
| `AUTOPILOT_BUDGET_MAX_MINUTES` | `120` | A whole number above 0 | A request may ask for more |
| `AUTOPILOT_BUDGET_TOKENS` | `1000000` with a key | A whole number, at most the maximum; refused under a subscription | You pay with a key and want another default |
| `AUTOPILOT_BUDGET_MAX_TOKENS` | `5000000` with a key | A whole number above 0; refused under a subscription | You pay with a key and want another ceiling |

The defaults fill the start dialog and a request that names no budget.
The maximums are the most the dialog offers and the most
`improve --attempts --minutes --tokens` may ask for; a request above one
is refused with `invalid_request`. The minutes hold the whole
improvement. A wait for a window or for your approval does not count.

## Variables passed on as they are

The service starts three programs on the host, and each gets only what
it needs from the environment of the service:

- The engine program gets `PATH`, `HOME`, `DOCKER_HOST`,
  `DOCKER_CONTEXT`, `DOCKER_CONFIG`, `DOCKER_CERT_PATH`,
  `DOCKER_TLS_VERIFY`, `XDG_RUNTIME_DIR` and `CONTAINER_HOST`. Set them
  as the engine program expects them, before the service starts.
- git gets `PATH` and `HOME`, and the name and address above as its
  author and committer.
- gh gets `PATH`, `HOME`, `GH_TOKEN`, `GITHUB_TOKEN`, `GH_HOST`,
  `GH_CONFIG_DIR`, `XDG_CONFIG_HOME` and `DBUS_SESSION_BUS_ADDRESS`.
  `GH_TOKEN` is the way to give gh a login where it has none, such as in
  CI.

## The client's own variables

- `AUTOPILOT_INSTANCE_DIR` tells the client where the service is.
- `NO_COLOR`, set to any value, switches colour off, as `--no-color`
  does.
- `LC_ALL`, `LC_CTYPE` and `LANG`: the first one that is set decides
  whether the screens use Unicode. Without UTF-8 in it, each symbol is
  drawn in ASCII.

## What no variable changes

- The threshold is a percent of lines.
- A patch passes seven checks, runs the tests three times, and its new
  tests must kill at least half of the mutants they run, as
  [Working with repositories](working-with-repositories.md) explains.
- A patch adds only files that end in `.test.ts` or `.test.tsx`.
- The mutation tool is StrykerJS 10.1.1.
- The generator may only read, write, edit and search files.

The variables of the gate, `HARNESS_MUTATION_WORKERS`,
`HARNESS_MUTATION_MEMORY_MB` and `HARNESS_MUTATION_TIMEOUT_MS`, belong to
the development of this tool and are in [Contributing](contributing.md).
