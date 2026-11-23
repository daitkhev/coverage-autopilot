# Troubleshooting

This guide is for a person whose scan, improvement or service did not do
what they expected. It starts with where to look, then lists what you may
see, what it means and what to do, for the service, a scan, a project the
service refuses, the start of an improvement and its end. The codes in
the tables are the words the service answers with, and the screens and
the commands show them as they are.

## Where to look first

1. Ask the service how it is:

   ```sh
   npm start -- doctor
   ```

   `service` is up or starting. `versions` names the version of the
   service, the contract it speaks and the contract the client reads.
   `started` says how long ago it started. `generator` names the CLI and
   who pays. `worker` and `running` say whether the queue works and what
   runs. `account` and `limits` say `unknown` and `tools` is empty: the
   service does not report them yet.

2. Read the log. A service the client started writes it to the instance
   folder, one JSON object a line:

   ```sh
   tail -n 50 ~/.coverage-autopilot/service.log
   grep '"level":"error"' ~/.coverage-autopilot/service.log
   ```

   The id of a scan is the id of its job, so `grep <scan id>` finds every
   line of that scan: `A job was taken.`, `A job was put back in the
   queue.` with the code of the fault, `A job was given up: it will not
   run again.` and `A job ended.`

3. Read the stored output. Each command keeps its output in
   `~/.coverage-autopilot/artifacts/<owner>/<label>-<sha256>.txt`. The
   owner is `scan:<id>` or `improvement:<id>`, with `:attempt:<n>` or
   `:baseline` for the runs of an attempt or of the analysis. The label
   names the tool: `install`, `test-run`, `type-check`,
   `generator-output` and those of the mutation tool. The `OUTPUT`
   section of the Improvement screen lists the paths of its files.

   ```sh
   ls ~/.coverage-autopilot/artifacts/
   ```

4. For more, set `AUTOPILOT_LOG_LEVEL=debug` and restart the service as
   [Settings](settings.md) shows. Each program the service starts then
   leaves a line `A program ended.` with its arguments and exit code.

## The service and the client

| What you see | What it means | What to do |
| --- | --- | --- |
| `npm ci` stops with `EBADENGINE` | The Node.js of your shell is not 26 | Install Node.js 26, then `npm ci` again |
| `The service did not start.` and `The service cannot start with its variables. ...` | A variable has a wrong value; the line names each one and what it expects | Fix it in your shell; [Settings](settings.md) lists what each accepts |
| `The service did not start.` and other lines | The service ended before it answered | Read the log the last line names: `The rest is in <log>.` |
| `The service could not be reached.` | Reaching the service ended in a fault, which the next line names | Run `npm run build` so client and service are of one build, then press `enter` to try again |
| `A service of another version runs ..., so it is left as it is.` | A service of another contract has work running, and the client never stops running work | Wait until it ends, then try again: the client then replaces it and says `Stopping the service of another version` |
| After `npm run build` the old behaviour stays | A service of the same contract is used as it is, even when it is older | Check `started` in `doctor`, then press `3` and `r` in the screens |
| `r` on the Service screen says `after the running work ends` | The service refuses to stop while a job runs | Wait, or cancel the work with `c` |

## A scan that failed

The screens do not show why a scan failed: the row goes back to how it
was before. Run the scan from the command line to read the reason:

```sh
npm start -- scan owner/name --wait
```

A failure is printed on standard error as one JSON line, such as
`{"error":"install_failed","message":"The packages of the project could not be installed."}`,
and the command ends with code `1`.

| Code | What it means | What to do |
| --- | --- | --- |
| `unsupported_project` | The service cannot measure this project; the message names why | See the next section |
| `install_failed` | The install ended with an error or ran out of time | Read the `install` output of the scan. A project that needs its install scripts can be trusted; a slow one needs a larger `AUTOPILOT_INSTALL_TIMEOUT_MS` |
| `test_run_timed_out` | The tests ran past the limit, so no file was measured | Raise `AUTOPILOT_TEST_RUN_TIMEOUT_MS` |
| `coverage_report_missing` | The test runner ended and wrote no report | Read the `test-run` output; it says why the runner stopped |
| `retries_exhausted` | A fault ended every run the queue allows, or the repository was removed | Read the lines of the scan in the log; the fault names its code |

A fault that may pass, such as Docker that is not running, puts the scan
back in the queue, and the scan says `queued` until its next run.
After `AUTOPILOT_QUEUE_MAX_RUNS` runs, 3 by default, it fails with
`retries_exhausted`. These are the faults of the engine you may meet:

| Fault in the log | What to do |
| --- | --- |
| `sandbox_engine_not_running`: `No container engine answers. Start it and try again.` | Start Docker, then scan again |
| `sandbox_engine_missing`: the program could not be started | Put `docker` on the `PATH` of the service, or name the program in `AUTOPILOT_SANDBOX_ENGINE` |
| `sandbox_image_build_failed` | Read the build output in the message; a first build needs the network |
| `sandbox_image_pull_failed` | The image you named is not in the engine and could not be pulled: pull or build it yourself |
| `sandbox_container_left` | A container could not be removed. The next start of the service removes it, or `docker rm --force` it by its name, which starts with `coverage-autopilot-` |

The log also says `The image of a sandbox is not ready. The first command
in it prepares it again.` when the engine could not prepare an image at
the start of the service. Start Docker: the next command prepares the
image again.

## A project the service refuses

`unsupported_project` comes with one of these reasons in its message:

| Reason | What it means | What to do |
| --- | --- | --- |
| `no_package_manifest`, `invalid_package_manifest` | No `package.json` object at the root | The project is out of reach |
| `monorepo` | Workspaces in `package.json`, `pnpm-workspace.yaml` or `lerna.json` | Out of reach: one package per repository |
| `no_lockfile` | The lockfile of its manager is not in the repository | The project must commit its lockfile |
| `unsupported_package_manager` | bun, several lockfiles with no `packageManager`, a `packageManager` without an exact version, or a lockfile format the service does not know | A `packageManager` field with an exact version, such as `pnpm@10.34.9`, settles several lockfiles |
| `install_runs_code` | The install would run code that no switch turns off | `repo trust owner/name trusted`, if you trust it; see [Sandbox and secrets](sandbox-and-secrets.md) |
| `plug_and_play` | yarn keeps the packages out of `node_modules` | Out of reach |
| `no_test_runner`, `other_test_runner` | No Jest or Vitest, or another runner such as mocha | Out of reach |
| `ambiguous_test_runner` | Jest and Vitest both, and the test script names neither alone | The test script must name one |
| `no_coverage_provider` | Vitest without `@vitest/coverage-v8` or `@vitest/coverage-istanbul` | The project must add one |

## The start of an improvement is refused

A refused start spends nothing. The start dialog shows the message, and
the command prints it as `{"error":"<code>","message":"..."}`.

| Code | What it means | What to do |
| --- | --- | --- |
| `generator_unavailable` | `The generator has no credential, so no improvement can run.` | Export `CLAUDE_CODE_OAUTH_TOKEN`, or `ANTHROPIC_API_KEY` with a key, and restart the service |
| `stale_snapshot` | The file changed on the default branch since the snapshot, or its commit left the branch | Scan again, then start again |
| `not_found` | No such snapshot, or the file is not a measured file of it | Pick a file from `files owner/name` |
| `invalid_request` | A limit above the maximum, or tokens under a subscription | Stay within the limits the dialog shows |
| `improvement_in_progress` | The file is improved already | Open that improvement: `enter` in the dialog |
| `work_already_requested` | The same work was asked for already | Open the improvement the message names |
| `request_key_reused` | A request key was used for other work | Open the improvement the message names |

The access check runs before each start, and a failing step stops it:
`Nothing can start until the access check passes.` The step says what is
wrong, such as `gh is not logged in to github.com. Run gh auth login and
check again.`

## An improvement that failed or was skipped

`list` and `status <id>` print the message and the code beside `FAIL` or
`SKIP`, and the Improvement screen shows the headline and what to do.

| Code | Headline | What to do |
| --- | --- | --- |
| `budget_exhausted` | `The budget ran out` | `Request it again with larger limits` gives one step more of each limit |
| `stale_snapshot` | `The file changed since the scan` | Scan again, then start again; it is checked before publishing as well |
| `verification_error` | `The checks could not run` | The fresh measurement or a check ended in a fault; read its output |
| `retries_exhausted` | `The work failed too many times` | Read the log for the improvement id |
| `existing_tests_fail` | `The tests of the repository fail in the sandbox` | Under `AUTOPILOT_BASELINE_TESTS=must_pass`, set `may_fail`. A runner that failed and named no test ends this way in both: read its `test-run` output |
| `mutation_unsupported` | `Mutants cannot be measured in this project` | Read the mutation output of the baseline |
| `quota_exhausted` | `The quota of the generator ran out` | Wait for the quota to open again, then start again |
| `credential_exposed` | `The generator showed a credential` | Make a new token or key and restart the service |
| `generator_unavailable` | `The generator cannot start` | The message names the fault, such as `generator_login_failed` for a token that was refused |
| `publish_failed` | `The pull request could not be opened` | The message says what git or gh refused; `repo check owner/name` |
| `threshold_met` (skip) | `The file is already above the threshold` | Nothing: pick another file with `n` |
| `no_undetected_mutants` (skip) | `The tests already detect every mutant` | Nothing: the mutation check could never pass |

A failure in a step names its fault, as in
`The work of generating stopped on the fault generator_output_truncated: ...`.
For that one, raise `AUTOPILOT_GENERATOR_OUTPUT_BYTES`.

## A spent subscription window

When the five-hour window of a subscription is spent, the improvement
says `Waiting for the limit of the generator`, and `list` says it waits
for `the limit`. It goes on by itself when the window opens, or after
`AUTOPILOT_GENERATOR_LIMIT_WAIT_MS` when the CLI did not say when. The
wait spends none of the budget. The third spent window, and a spent
weekly limit, end the improvement with `quota_exhausted`.

## Approving a patch

| Code | What it means | What to do |
| --- | --- | --- |
| `patch_hash_mismatch` | The hash is not the one of the accepted patch | Read the patch again with `patch <id>` and approve its hash; the screen reloads it |
| `status_conflict` | The improvement does not wait for an approval, or has no accepted patch | Check its status with `status <id>` |
