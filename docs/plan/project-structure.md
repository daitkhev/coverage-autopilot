# Project structure

Author: Valentin Daitkhe

Where code lives and which part may import which, as the code stands. How
the parts work together is in [System design](system-design.md). Every
rule here is held by a tool, described in [Harness](harness.md).

## Repository layout

```text
coverage-autopilot/
├── backend/            the NestJS service
│   ├── src/            main.ts, composition/, modules/, shared/
│   └── tests/          unit/, integration/, e2e/, stress/, support/
├── frontend/           the terminal client, React and Ink
│   ├── src/            main.tsx, composition/, app/, screens/,
│   │                   commands/, components/, hooks/, theme/, api/
│   └── tests/          unit/, integration/, e2e/, support/
├── api-contracts/      Zod schemas of the HTTP API, tests/unit/
├── harness/            the gate, the policy and the hooks
├── docs/               plan/ and implementation/
├── .github/            workflows, CODEOWNERS, dependabot.yml
├── .claude/, .codex/   links to agent settings in harness/
├── AGENTS.md           the rules for whoever changes the tree
└── package.json        the workspaces and the tools
```

- The root `package.json` declares `backend`, `frontend` and
  `api-contracts` as workspaces. The build bundles them with rolldown into
  one package in `dist/`: `bin/client.js` is the command a person runs
  and `bin/service.js` the service it starts. Packages of npm stay
  imports.
- `harness/` is not a workspace. It belongs to the root, no product code
  imports it, and Node runs it as TypeScript with no build.
- The files at the root that configure ESLint, Prettier and Vitest are one
  line each that points into `harness/`, and the root `tsconfig.json`
  extends the base there.

## Backend

```text
backend/src/
├── main.ts           two paths and one call
├── composition/      the root module, module settings, the process
├── modules/
│   ├── repositories/
│   ├── coverage/
│   ├── verification/
│   └── improvement/
└── shared/
    ├── kernel/          errors, id, primitives, time, transaction
    ├── application/     ports: queue, handler, sandbox, store, alarm
    └── infrastructure/  database, queue, sandbox, config, http, ...
```

Every module has the same three layers and a module file:

```text
modules/coverage/
├── domain/           entities/, value-objects/, services/,
│                     errors/, repositories/
├── application/      commands/, queries/, contracts/, ports/,
│                     dto/, errors/
├── infrastructure/   persistence/, http/, errors/, and one folder
│                     per technology, such as runners/ or reports/
└── coverage.module.ts
```

| Layer | Holds | May import |
| --- | --- | --- |
| `domain` | Entities, value objects, domain services, errors, repository interfaces | Its own domain and `shared/kernel`. No framework, no Zod, no package |
| `application` | Use cases as commands and queries, ports, DTOs | Its domain, `shared/kernel`, `shared/application`, and the contracts of modules below it. From NestJS only `Injectable` and `Inject` |
| `application/contracts` | The one surface another module may import | Nothing else of its module, and the kernel |
| `infrastructure` | SQLite repositories, adapters of the ports | Its application and domain, and shared code |
| `infrastructure/http` | NestJS controllers | Its application layer and the kernel. Only the module file imports a route |

- The modules depend one way: `improvement` uses the other three,
  `verification` uses `coverage` and `repositories`, and `coverage` uses
  `repositories`. A cycle is refused.
- `composition/` builds the service from the module files and shared
  code. Only `main.ts` imports it, and it imports no layer of a module.
- `shared/kernel` imports nothing of the project. `shared/application`
  imports the kernel. `shared/infrastructure` imports both and no module.
- The migrations are SQL files in
  `shared/infrastructure/database/migrations/`, beside the code that
  applies them.
- SQL is written only in `infrastructure/persistence/` of a module and in
  `shared/infrastructure/`. There is no ORM and no query builder.
- `Date`, `process.env` and `console` are refused in the service. Time is
  `Temporal` behind a `Clock`, ids come from an `IdGenerator`, and the
  environment is read in the entry file and handed on as values.
- Every error is its own class that extends `DomainError`,
  `ApplicationError` or `InfrastructureError`. An expected outcome is a
  value, never an exception.

## Frontend

| Folder | Holds | May import |
| --- | --- | --- |
| `main.tsx` | The entry: reads the process | `composition/` |
| `composition/` | The choice between the screens and the commands, signals | `app/`, `commands/` |
| `app/` | The app over the screens, navigation, keys that work everywhere | `screens/`, `components/`, `hooks/`, `theme/`, `api/` |
| `screens/<name>/` | Six screens, each in its own folder | `components/`, `hooks/`, `theme/`, `api/` |
| `commands/` | One file per command for scripts | `api/`, `theme/` |
| `components/` | Panels, lists, bars, dialogs | `hooks/`, `theme/` |
| `hooks/` | Keys, focus, selection, size, timers | `theme/` |
| `api/` | The client of the socket, starting the service | Nothing |
| `theme/` | Colour roles, symbols, words for statuses, widths | Nothing |

- A folder may import itself and what its row names, and nothing else. A
  screen never imports another screen.
- No chain of imports leads from `components/` or `hooks/` to `api/`.
- Any folder may import a type from `api-contracts`. Only `api/` opens the
  socket. The service and the client never import each other.

## Imports

Every import starts with an alias. A relative import is refused, `./`
included.

| Alias | Points to |
| --- | --- |
| `#repositories/*`, `#coverage/*`, `#verification/*`, `#improvement/*` | `backend/src/modules/<module>/*` |
| `#kernel/*`, `#ports/*`, `#infrastructure/*` | `backend/src/shared/kernel`, `shared/application/ports`, `shared/infrastructure` |
| `#composition/*`, `#service/*` | `backend/src/composition/` and the root of `backend/src/`, for the entry |
| `#app/*`, `#screens/*`, `#commands/*`, `#components/*`, `#hooks/*`, `#theme/*`, `#api/*`, `#composition/*`, `#client/*` | The folders of `frontend/src/`, and its root for the entry |
| `#tests/*` | `tests/` of the same workspace |
| `#api-contracts/*` | `api-contracts/src/`, inside that workspace |
| `@coverage-autopilot/api-contracts` | The contracts, from the other workspaces |
| `#harness/*` | `harness/` |

An alias is only a name: the rules of layers and modules still apply to
the file it reaches.

## Naming

Files are kebab-case. `index`, `utils`, `helpers`, `common` and `misc`
are refused as names. A role is a suffix, and the suffix fixes the folder:

| Suffix | Role | Folder |
| --- | --- | --- |
| `.entity.ts`, `.vo.ts`, `.service.ts` | Entity, value object, domain service | `domain/` |
| `.repository.ts` | Repository interface, or its SQLite adapter | `domain/repositories/`, `infrastructure/persistence/` |
| `.command.ts`, `.query.ts`, `.handler.ts` | Use case input and use case | `application/commands/`, `application/queries/` |
| `.port.ts`, `.dto.ts` | Outbound port, DTO | `application/` |
| `.adapter.ts`, `.schema.ts`, `.controller.ts` | Adapter, Zod schema of outside data, route | `infrastructure/` |
| `.error.ts` | One error class | `errors/` of a layer |
| `.module.ts` | NestJS module | The root of a module |
| `.test.ts`, `.test.tsx` | A test of any kind | `tests/` |

An implementation names its technology first, such as
`sqlite-coverage-snapshot.repository.ts`.

## Tests

Vitest runs every test. Tests live in the `tests/` folder of their
workspace, one folder per kind:

| Folder | Tests | May touch |
| --- | --- | --- |
| `unit/` | One class or function, or a screen rendered to text | Memory only. No import chain reaches I/O |
| `integration/` | An adapter against the real thing: SQLite, git, a runner on a fixture, a socket | Local resources |
| `e2e/` | The built package as a process, through its socket | Everything, with the engine, the host and the generator faked |
| `stress/` | The built service flooded with requests, killed at random as it works, or started twice at once | The same as `e2e/`. Only the backend has it |

- A unit test repeats the path of its source file under `tests/unit/`.
  A file of `infrastructure` has integration tests only.
- `tests/support/` holds fakes and builders, such as a fixed clock, and no
  test.
- The outer `describe` names the unit, a nested one a method or a `when`,
  and every `it` starts with `should`.
- Each workspace and the harness hold 95% of statements, branches,
  functions and lines. Rendered screens are kept as snapshot files.

## Known problems of the tools

| Problem | What the project does |
| --- | --- |
| Jest as ES modules keeps every module in memory, and a mutation run of many runners took over 40 GB | The project's own tests run on Vitest |
| StrykerJS starts a runner per processor whatever the memory | The mutation step of the harness counts its runners from the memory it may use |
| A Vitest runner that hits its heap ends the whole mutation run | The mutation step of the harness never gives a runner less than 512 MB |
| Vitest takes the configuration of a folder above a project that has none | The service names the configuration it starts Vitest with |
| A mutation runner only runs tests related to the mutated file, and a file nobody tested has none | The service tells both runners to run every test |
| `jest --json` fails on a thrown value that holds a cycle | The service gives Jest a reporter of its own |
| NestJS needs constructor types that Vitest does not emit | Every class names what it is given with `@Inject` |
