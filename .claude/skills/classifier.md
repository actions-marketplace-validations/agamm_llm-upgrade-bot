# Model Classifier Rules

llm-upgrade-bot scans codebases for outdated LLM model strings and proposes upgrades.
It maintains `data/families.json` — a map of model lineages that gets derived into an
upgrade map. New models appear constantly across 8+ providers.

This skill is loaded by the auto-discovery workflow (`.github/workflows/discover-models.yml`)
when Claude Code Action classifies newly discovered model IDs into families.json.

These rules are the persistent "memory" of the classifier. When a discovery PR has mistakes,
comment `@claude <what was wrong>` on the PR — Claude will update this file with a generic
rule so future runs don't repeat the mistake.

## Inputs
- `data/new-models.txt` — newly discovered model IDs (one per line), written by `scripts/discover-models.ts` which fetches 8 provider APIs and diffs against known models
- `data/families.json` — current model families (source of truth)

## families.json structure
- Keys = family names (e.g. "openai-flagship")
- Outer array = major generations, inner = safe upgrades
- Un-timestamped aliases go LAST in inner arrays
- Date-stamped snapshots share inner array with alias
- Dots for version separators (gpt-4.1 not gpt-4-1)
- Never mix tiers (mini/nano/flagship = separate families)
- Different capabilities = different families (chat ≠ reasoning ≠ search ≠ vision ≠ deep-research ≠ code-specialized)
- Provider-prefixed IDs handled by derivation — don't add them

## Filtering rules
- Skip `-latest` aliases — they're floating pointers stripped at scan time
- Skip colon-tagged models (`:free`, `:nitro`, `:exacto`) — stripped at scan time
- Skip fine-tune IDs (`ft:`, `ft-`, `accounts/`) — not real model releases

## Classification rules
- Classify directly only for obvious cases (dated snapshots of known models)
- WebSearch when unsure whether models are same-capability tiers vs different products
- `-fast`/`-turbo` suffixes are often different models — WebSearch to check, default to separate family
- Models with different param sizes (8B vs 70B) or context sizes (32K vs 128K) are usually different families unless they share a tier name (e.g. llama-small groups 3B→8B→17B)
- Use canonical casing from the provider — don't add lowercase duplicates
- Before adding any model you don't recognize: WebSearch to verify the model ID actually exists as a real API model ID. Don't invent aliases.

## Single-entry families
- Don't create families with only one model and no predecessor/successor — there's no upgrade path to suggest. When a successor appears, the next discovery run will create the family then. The classifier prompt rules (different capabilities = different families) are sufficient to ensure correct placement.

## families.json format
One line per generation (inner array), indented under each key:
```
{
  "family-name": [
    ["model-a","model-b"],
    ["model-c"]
  ],
  "other-family": [
    ["model-x"]
  ]
}
```
This gives readable git diffs per generation. Do NOT use single-line compact JSON.

## Post-classification
After editing families.json, always run:
1. `pnpm tsx scripts/derive-upgrades.ts`
2. `pnpm tsx scripts/validate-variants.ts`
