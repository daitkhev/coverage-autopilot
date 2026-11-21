# Agents

This file is for whoever changes this repository: an AI agent of any
maker, or a person. The rules are the same for both. The design is in
[docs/plan](docs/plan/harness.md), and the rules are in `harness/`. A rule
that a tool holds is not repeated here: run the gate and read what it
says.

## Once in a new clone

Git keeps its hooks outside what it clones, so each clone switches them on
with one command:

```sh
git config core.hooksPath harness/git
```

From then on git runs `fast` before a commit and holds the message of the
commit to the rules in `harness/configs/commitlint.json`. Before a push it
refuses a push to `main` and a push that rewrites history, and it runs
`full`.

## The gate

One command judges the tree, and it takes a profile:

```sh
node harness/bin/check.ts fast
```

| Profile | When | What it runs |
| --- | --- | --- |
| `fast` | After each small group of edits | Format, lint, types and the architecture |
| `full` | Before you say that the work is done | `fast`, then the comparison with the last commit, unused code, copy and paste, the tests, coverage, the documents and the search for secrets |
| `ci` | In CI. On a desk only when a person asks | `full`, then the workflows, the runners and the mutation tests, which take minutes |

- A red step is fixed in the code. No check is switched off, no number is
  moved and no rule is edited to get a green gate.
- A step can be run alone by its name, such as `check.ts lint`.
- The hooks are not skipped. An agent is refused a commit or a push with
  `--no-verify`, a forced push, a push to `main`, the merge of a pull
  request, and a change of the place git takes its hooks from.

## The policy

The policy is everything in `harness/` except `baseline.json`, every file
at the root except `README.md` and the lockfile, every `tsconfig`,
`.github/`, `.claude/` and `.codex/`. The list is in
`harness/policy/frozen.json`.

- A change of the policy and a change of anything else do not land
  together.
- A change of the policy is the owner's call. Stop and ask before you make
  one.

## Rules no tool holds

- One level of abstraction inside a method. A handler loads, applies, saves.
- A comment says why, never what.
- A commit is one logical step.
- No abstraction without a second use: no base class, no interface with one
  implementation unless it is a real boundary, no factory for one
  constructor.
- Search, then reuse, then extend, and only then create.
- An expected outcome is a value, and a fault is an exception.
