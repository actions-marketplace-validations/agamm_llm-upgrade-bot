# llm-upgrade-bot

TypeScript CLI + GitHub Action — scans codebases for outdated LLM model strings and proposes upgrades.

## Commands
- Build: `pnpm build` (tsup)
- Dev: `pnpm dev` (tsx)
- Test: `pnpm test` (vitest)
- Test single: `pnpm test -- path/to/file`
- Lint: `pnpm lint` (eslint)
- Format: `pnpm format` (prettier)
- Typecheck: `pnpm typecheck` (tsc --noEmit)

## Code Style
- Functional-first: pure functions, no classes, data-in/data-out
- Result types for errors: `{ ok: true, data } | { ok: false, error }` — no thrown exceptions in core/
- camelCase functions/variables, PascalCase types/interfaces

## Architecture
- `src/core/` — scanner, upgrade-map, fixer (platform-agnostic, no I/O opinions)
- `src/cli/` — Commander.js commands, terminal output (picocolors + nanospinner)
- `src/action/` — GitHub Action entry point (@actions/core, @actions/github)
- Dependency direction: cli/ → core/, action/ → core/. Core never imports from cli or action.
- `data/upgrades.json` — flat map `{ "old-model": { "safe": "...", "major": "..." } }`

## Guardrails
- **Max file:** 200 lines — refactor before exceeding
- **Max function:** 30 lines — decompose if longer
- **Tests required for:** all core/ functions, CLI integration tests
- **Before adding deps:** check Node.js stdlib first. Justify every new package.
- **Forbidden:** `any` types, inline secrets, `console.log` for user output (use reporter), circular imports between layers
- **Pause for review before:** new files, new npm deps, architecture changes
- **CLAUDE.md updates:** when adding commands, changing architecture, or discovering gotchas

## Key Patterns
- Two-pass scanning: prefix filter (fast) → precise match against upgrade map
- upgrades.json values are objects `{ safe, major }` not plain strings
- Fetch latest upgrades.json from URL at runtime, fall back to bundled
- Exit code: 0 = no upgrades, 1 = upgrades available

## Gotchas
- picocolors uses nesting `pc.bold(pc.red(...))` not chaining
- Commander: use `new Command()` (not global), `parseAsync()` for async, `.exitOverride()` for tests
- pnpm v10+ blocks postinstall scripts by default — use `pnpm.onlyBuiltDependencies`
- tsup: watch `package.json` exports field for ESM/CJS dual output
