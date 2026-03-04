# llm-upgrade-bot Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

## Original Vision

> **Raw user input:** "I want to build **llm-upgrade-bot** — a 'Dependabot for LLM model versions.' It scans a codebase for hardcoded LLM model ID strings (like `"gpt-4"`, `"claude-3-opus-20240229"`, `"gemini-pro"`), checks them against a data source of current/deprecated models, and automatically creates a pull request to upgrade them to newer versions."
>
> "I want to create this Github action that looks at a codebase, figures out all the usages of these models. I want to use regex or AST or whatever to figure that out in a language-agnostic and efficient way. Then I want to create a pull request automatically. I want to check this the same way that Renovate Bot works."

**Goal:** Scan codebases for hardcoded LLM model strings, detect available upgrades, and auto-fix or create PRs.

**Problem:** Developers hardcode model IDs that go stale as providers release newer versions. No tool exists to automate this.

**Platform:** CLI (npm) + GitHub Action

**Scope:** Full system (CLI + Action + data pipeline), build CLI first

**Audience:** Solo devs and engineering teams equally

## Prior Research (confirmed — do not re-research)

- No competing tool exists (exhaustive search: npm, GitHub, Actions marketplace, web)
- Name `llm-upgrade-bot` unclaimed on npm and GitHub
- Closest building blocks: deprecations.info (data feed), llm-info (deprecation mappings), Renovate regex manager (extensible but nobody built it)

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Language | TypeScript | GitHub Actions native, Renovate precedent, npm ecosystem, ast-grep bindings |
| Runtime | Node.js + pnpm | Mature, strict dep isolation, `--frozen-lockfile` in CI |
| Build | tsup | Zero-config, dual ESM+CJS, shebang support |
| Test | vitest | Fast, Jest-compatible, co-locate with source |
| Dev | tsx | Run TS directly |
| CLI | commander | Battle-tested, `new Command()`, `parseAsync()`, `.exitOverride()` |
| Output | picocolors + nanospinner | Lightweight (7KB), auto NO_COLOR |
| Action bundle | @vercel/ncc | Single dist/index.js for Actions |
| Lint | ESLint + Prettier | Standard @typescript-eslint defaults |

### Documentation References
- tsup: https://tsup.egoist.dev/ — use `tsup.config.ts`, `format: ['esm', 'cjs']`, `clean: true`
- vitest: https://vitest.dev/ — parallel by default, `vi.restoreAllMocks()` in `afterEach`
- Commander.js: https://github.com/tj/commander.js
- picocolors: https://github.com/alexeyraspopov/picocolors — nest: `pc.bold(pc.red(...))`
- pnpm: https://pnpm.io/ — set `packageManager` field, v10+ blocks postinstall
- GitHub Actions: https://docs.github.com/en/actions/sharing-automations/creating-actions
- ast-grep (future): https://ast-grep.github.io/guide/api-usage/js-api.html
- OpenRouter API: https://openrouter.ai/docs/api/api-reference/models/get-models

## Data Strategy

### Focus: New model upgrades (NOT deprecations)

### Data Sources
| Source | Models | Access | Use |
|--------|--------|--------|-----|
| LiteLLM JSON | 2600+ | [GitHub MIT](https://github.com/BerriAI/litellm/blob/main/model_prices_and_context_window.json) | Initial seed |
| OpenRouter API | 400+ | Free REST + RSS | Ongoing monitoring |
| Portkey DB | 2300+ | GitHub MIT | Supplementary |

### Data Architecture: Flat Map
Single `upgrades.json` — flat `old → new` map with safe/major tiers:
```json
{
  "gpt-4o-2024-05-13": { "safe": "gpt-4o-2024-08-06", "major": "gpt-4.1" },
  "gpt-4": { "safe": null, "major": "gpt-4.1" },
  "claude-3-opus-20240229": { "safe": null, "major": "claude-opus-4-6" },
  "openai/gpt-4": { "safe": null, "major": "openai/gpt-4.1" },
  "google/gemini-2.0-pro": { "safe": null, "major": "google/gemini-2.5-pro" }
}
```
- `safe`: same model line, newer date/version (null if none)
- `major`: next generation in family (null if already current)
- Models at latest version: not in the map
- Includes platform variants (OpenRouter `openai/`, LiteLLM `gemini/`, Bedrock `anthropic.`, native)
- ~4000+ entries, ~200KB, O(1) lookup

### Model ID Patterns
| Provider | Date Format | Example |
|----------|------------|---------|
| OpenAI (old) | `-MMDD` | `gpt-4-0613` |
| OpenAI (new) | `-YYYY-MM-DD` | `gpt-4o-2024-08-06` |
| Anthropic | `-YYYYMMDD` | `claude-3-opus-20240229` |
| Google | Version numbers | `gemini-2.5-pro` |

### Platform Variants
| Platform | Format | Example |
|----------|--------|---------|
| Native | `{model}` | `gpt-4` |
| OpenRouter | `{provider}/{model}` | `openai/gpt-4` |
| LiteLLM | `{key}/{model}` | `gemini/gemini-2.0-pro` |
| Bedrock | `{provider}.{model}` | `anthropic.claude-3-opus-20240229-v1:0` |

### Code Scanning: Two-Pass Strategy
1. **Pass 1 (fast filter):** Regex with ~15 auto-derived provider stems. Skip files with no matches. Eliminates 95%+ of files.
2. **Pass 2 (precise):** Extract quoted strings from candidate files, look up in flat map.

### String Extraction Details
Model strings appear in multiple quoting contexts:
- **Double quotes:** `"gpt-4"` — most common in JSON, TypeScript, Python, Go, Java
- **Single quotes:** `'gpt-4'` — common in Python, Ruby, YAML
- **Backticks:** `` `gpt-4` `` — JS/TS template literals (rare for model IDs)
- **YAML unquoted values:** `model: gpt-4` — common in config files

MVP regex covers double + single quotes (`/"([^"]+)"|'([^']+)'/g`). YAML unquoted values are a known gap — address post-MVP with a YAML-aware scanner or by matching `key: <known-model-id>` patterns.

### Data Freshness
- Fetch latest `upgrades.json` from URL on each run
- Fall back to bundled version if offline/fetch fails

**Future:** smart parser for date/prefix resolution, ast-grep for context-aware matching

## Data Model

### Core Types
```typescript
interface UpgradeEntry { safe: string | null; major: string | null }
type UpgradeMap = Record<string, UpgradeEntry>

interface ScanResult {
  file: string; line: number; column: number
  matchedText: string
  safeUpgrade: string | null; majorUpgrade: string | null
}

interface ScanReport {
  totalFiles: number; scannedFiles: number
  matches: ScanResult[]; duration: number
}

interface FileEdit {
  file: string; line: number; column: number
  oldText: string; newText: string
}
```

### File Walking
Use `git ls-files` to list tracked files — zero dependencies, respects `.gitignore` by definition, works in any git repo. Filter by supported extensions in-process. For non-git directories, fall back to a recursive walk with the built-in ignore list.

### File Scanning Rules
- **Include:** .py, .ts, .js, .tsx, .jsx, .go, .java, .rb, .rs, .yaml, .yml, .json, .toml, .env, .cfg, .ini
- **Skip:** .gitignore + node_modules, .git, dist, build, vendor, __pycache__, .venv, coverage, .next, .nuxt
- **Comments:** report all matches (no comment detection for MVP)
- **Duplicates:** report each occurrence, fix all

### Fixer Ordering
When `--fix` applies multiple edits to the same file, apply them **bottom-to-top** (highest line/column first). Replacing a string may shift offsets of subsequent matches — reverse order avoids invalidating positions.

## User Flows

### Flow 1: CLI Scan
```
$ npx llm-upgrade-bot .

src/api.ts:12  "gpt-4o-2024-05-13"
  → safe:  gpt-4o-2024-08-06
  → major: gpt-4.1

src/config.yaml:5  "claude-3-opus-20240229"
  → major: claude-opus-4-6

Found 2 upgradable models in 3 files (scanned 45/312 files in 120ms)
```
Exit code: 0 = current, 1 = upgrades available

`scan` is the default command — `llm-upgrade-bot .` and `llm-upgrade-bot scan .` are equivalent.

### Flow 2: CLI Fix
```
$ npx llm-upgrade-bot . --fix

Fixed 2 models:
  src/api.ts:12  "gpt-4o-2024-05-13" → "gpt-4o-2024-08-06" (safe)
  src/config.yaml:5  "claude-3-opus-20240229" → "claude-opus-4-6" (major)
```
Applies safe if available, falls back to major.

### Flow 3: GitHub Action
Runs on schedule/push → scan + fix → create single PR with all upgrades → PR body includes full report

### CLI Flags
- `--fix` — auto-apply upgrades to files
- `--json` — structured JSON output for CI pipelines

### User Stories
1. Scan project for outdated LLM model strings
2. Auto-fix outdated model strings without manual find-and-replace
3. GitHub Action creates upgrade PRs automatically
4. See both safe and major upgrade options
5. Exit code 1 when upgrades available (CI pipeline check)

## Architecture Decisions

- **Renovate-inspired layering** — core logic is platform-agnostic, CLI and Action are thin wrappers. Because this enables reuse and independent testing.
- **Flat map over normalized DB** — O(1) lookup, zero parsing at runtime, simpler code. Because MVP speed matters more than data elegance. Can evolve to smart parser later.
- **Two-pass scanning** — pre-filter by provider stems, then precise match. Because scanning every quoted string in every file against 4000 keys would be wasteful.
- **Safe/major upgrade tiers** — like semver's patch/minor/major. Because users need to choose their risk tolerance.
- **Fetch data at runtime** — always fresh, bundled fallback for offline. Because model data changes independently of CLI version.
- **`git ls-files` for file walking** — zero dependencies, respects .gitignore by definition. Fallback to manual walk for non-git directories.
- **Default command is `scan`** — `llm-upgrade-bot .` works without typing `scan`. Explicit `scan` subcommand also supported for clarity.

## External Integrations

- **OpenRouter API** (`/api/v1/models`): model inventory, RSS for new models. Free, no auth. Fallback: bundled data.
- **LiteLLM GitHub JSON**: initial data seed. MIT licensed. Fallback: manual curation.
- **GitHub API** (via @actions/github): create branches, commits, PRs. Requires GITHUB_TOKEN.

---

## Development Methodology: TDD + Quality Gates

Every implementation phase follows **test-driven development**:
1. **Write failing tests first** — define expected behavior before writing any implementation
2. **Implement until tests pass** — write the minimum code to make tests green
3. **Refactor** — clean up while tests stay green
4. **Quality gate** — at the end of each phase, all tests pass, lint is clean, no `any` types

### Quality Gate Checklist (run at end of every phase)
- [ ] `pnpm test` — all tests pass
- [ ] `pnpm lint` — zero warnings/errors
- [ ] `pnpm typecheck` — no type errors, no `any` types
- [ ] `pnpm build` — clean build succeeds
- [ ] No files exceed 200 lines
- [ ] No functions exceed 30 lines
- [ ] Dependency direction respected (core/ has no imports from cli/ or action/)
- [ ] New code has corresponding tests written BEFORE implementation

---

## Implementation Phases

### Phase 1: Project Setup
- [ ] Initialize with pnpm, TypeScript, tsup, vitest
- [ ] Configure ESLint + Prettier
- [ ] Set up project structure: `src/core/`, `src/cli/`, `data/`
- [ ] Create `tsup.config.ts` with dual ESM+CJS + shebang
- [ ] Create hand-crafted test `data/upgrades.json` with ~20 common models (all providers, platform variants, date-stamped variants)
- [ ] Create test fixtures: small fake repos under `test/fixtures/` with known model strings in .py, .ts, .yaml, .json files
- [ ] Verify `pnpm build && pnpm test` works (empty test suite passes)
- [ ] **Quality gate**

### Phase 2: Core Scanner (TDD)
Tests first, then implementation for each function:

**2a. Upgrade map loading**
- [ ] Write tests: `loadUpgradeMap()` parses valid JSON, rejects malformed JSON, returns typed UpgradeMap
- [ ] Write tests: `loadUpgradeMap()` fetches from URL with fallback to bundled file
- [ ] Implement `src/core/upgrade-map.ts`
- [ ] Tests green

**2b. Prefix filter**
- [ ] Write tests: `buildPrefixFilter()` derives correct stems from map keys (e.g., `gpt-`, `claude-`, `openai/`)
- [ ] Write tests: filter correctly identifies files containing provider stems vs files without
- [ ] Implement `src/core/prefix-filter.ts`
- [ ] Tests green

**2c. File scanner**
- [ ] Write tests: `scanFile()` finds double-quoted model strings, single-quoted, reports correct line/column
- [ ] Write tests: `scanFile()` returns safe + major upgrades from map, returns empty for no-match files
- [ ] Write tests: `scanFile()` handles multiple matches in one file, matches across different quote styles
- [ ] Implement `src/core/scanner.ts`
- [ ] Tests green

**2d. Directory scanner**
- [ ] Write tests: `scanDirectory()` uses `git ls-files`, filters by extension, applies two-pass strategy
- [ ] Write tests: `scanDirectory()` returns correct ScanReport with totalFiles, scannedFiles, matches, duration
- [ ] Write tests: `scanDirectory()` skips files not matching extension list
- [ ] Implement `src/core/directory-scanner.ts`
- [ ] Tests green
- [ ] **Quality gate**

### Phase 3: CLI + Fixer (TDD)

**3a. Fixer**
- [ ] Write tests: `applyFixes()` replaces strings in files, applies safe-first/major-fallback
- [ ] Write tests: multiple edits in same file applied bottom-to-top (no offset corruption)
- [ ] Write tests: fix preserves surrounding quotes and whitespace
- [ ] Implement `src/core/fixer.ts`
- [ ] Tests green

**3b. CLI commands**
- [ ] Write integration tests: `llm-upgrade-bot .` on test fixture → expected output format, exit code 1
- [ ] Write integration tests: `llm-upgrade-bot . --fix` → files modified correctly, exit code 0
- [ ] Write integration tests: `llm-upgrade-bot . --json` → valid JSON output matching ScanReport shape
- [ ] Write integration tests: run on clean repo (no matches) → exit code 0
- [ ] Set up Commander with default `scan` command (also available as explicit subcommand)
- [ ] Implement terminal reporter (formatted output with picocolors)
- [ ] Implement `--fix` mode
- [ ] Implement `--json` output mode
- [ ] Implement exit codes
- [ ] All integration tests green
- [ ] **Quality gate**

### Phase 4: Data Pipeline (seeding script)
- [ ] Write seeding script: fetch LiteLLM JSON → parse → group by family → generate upgrades.json
- [ ] Cross-reference with OpenRouter for platform variants
- [ ] Manual review and curation of upgrade paths
- [ ] Replace hand-crafted test data with real seeded data
- [ ] Re-run full test suite with real data to catch edge cases
- [ ] **Quality gate**

### Phase 5: GitHub Action (TDD)
- [ ] Write tests: action entry point reads inputs, calls core scanner, formats PR body
- [ ] Create `src/action/` entry point using @actions/core + @actions/github
- [ ] Bundle with @vercel/ncc
- [ ] Write `action.yml` metadata
- [ ] Implement: checkout → scan → fix → create branch → commit → open PR
- [ ] Test with a sample repo
- [ ] **Quality gate**

### Phase 6: Polish + Ship
- [ ] npm publish setup (package.json bin field, prepublishOnly script)
- [ ] README with usage examples
- [ ] GitHub Action marketplace listing
- [ ] GitHub Action for data pipeline (poll OpenRouter RSS, propose upgrades.json updates)
- [ ] **Final quality gate: full test suite, lint, typecheck, build, manual smoke test**

---

## Testing Strategy

- **Unit tests (TDD — written first):** All `src/core/` functions — scanner, upgrade-map loading, fixer, prefix filter
- **Integration tests (TDD — written first):** CLI commands — run against fixture directories, verify output format + exit codes + file modifications
- **Fixture files:** Small test repos under `test/fixtures/` with known model strings across .py, .ts, .yaml, .json for deterministic testing
- **No E2E for MVP:** Skip end-to-end GitHub Action testing initially
- **Quality gates:** Every phase ends with: all tests pass, lint clean, typecheck clean, build succeeds

## Known Risks

| Risk | Mitigation |
|------|------------|
| Model naming is chaotic across providers | Flat map handles any string; no parsing assumptions |
| False positives (model strings in comments/docs) | Report all for MVP; add inline ignore comments later |
| OpenRouter API changes or goes down | Bundled fallback data always works offline |
| upgrades.json grows large | 200KB is fine; optimize with smart parser if needed |
| Platform variant coverage gaps | Seed from multiple sources (LiteLLM + OpenRouter + Portkey) |
| YAML unquoted model values not detected | Known MVP gap; add YAML-aware scanner post-MVP |

## Open Questions
- Exact upgrade paths for initial seed (requires manual curation after script generates draft)
- Whether to support `--tier=safe|major` flag for explicit control (deferred post-MVP)
- Config file format when CLI-flags-only becomes limiting (deferred)
- Inline ignore comments syntax (deferred post-MVP)

## Versioning
- **CLI:** semver (start at 0.1.0)
- **upgrades.json:** separate version/timestamp, decoupled from CLI releases
