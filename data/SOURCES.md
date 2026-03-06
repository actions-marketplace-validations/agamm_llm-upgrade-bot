# Model Data Sources

Reference for refreshing `upgrades.json`. Query these daily for new/deprecated models.

## Live API Endpoints

| Source | URL | Notes |
|--------|-----|-------|
| OpenRouter models | `GET https://openrouter.ai/api/v1/models` | Best single source — aggregates all providers. Returns JSON with `id`, `pricing`, `context_length`. No auth needed. |
| OpenAI models | `GET https://api.openai.com/v1/models` | Requires API key. Returns all available model IDs. |
| DeepSeek models | `GET https://api.deepseek.com/models` | Requires API key. |
| Mistral models | `GET https://api.mistral.ai/v1/models` | Requires API key. |
| Cohere models | `GET https://api.cohere.com/v2/models` | Requires API key. |

## Documentation Pages

| Provider | Models page | Deprecations page |
|----------|------------|-------------------|
| OpenAI | https://platform.openai.com/docs/models | https://platform.openai.com/docs/deprecations |
| Anthropic | https://docs.anthropic.com/en/docs/about-claude/models | https://docs.anthropic.com/en/docs/resources/model-deprecations |
| Google Gemini | https://ai.google.dev/gemini-api/docs/models | https://ai.google.dev/gemini-api/docs/deprecations |
| Google Vertex AI | https://cloud.google.com/vertex-ai/generative-ai/docs/learn/models | (same as above) |
| Mistral | https://docs.mistral.ai/getting-started/models | (inline on models page) |
| DeepSeek | https://api-docs.deepseek.com/quick_start/pricing | https://api-docs.deepseek.com/news |
| xAI / Grok | https://docs.x.ai/developers/models | (inline on models page) |
| Cohere | https://docs.cohere.com/docs/models | (inline on models page) |
| AWS Bedrock | https://docs.aws.amazon.com/bedrock/latest/userguide/models-supported.html | (inline) |
| Groq | https://console.groq.com/docs/models | (inline) |
| Together AI | https://docs.together.ai/docs/serverless-models | (inline) |
| Fireworks AI | https://fireworks.ai/models | (inline) |

## Prefixed Variant Conventions

| Platform | Format | Example |
|----------|--------|---------|
| Native | `model-id` | `gpt-4o` |
| OpenRouter | `provider/model-id` | `openai/gpt-4o` |
| AWS Bedrock | `provider.model-id-vN:M` | `anthropic.claude-3-opus-20240229-v1:0` |
| Azure OpenAI | deployment name (user-defined) | `gpt-4o` (same as native) |
| LiteLLM | `provider/model-id` | `bedrock/anthropic.claude-3-opus-20240229-v1:0` |
| Groq | custom aliases | `llama-3.3-70b-versatile` |
| Together AI | `org/Model-Name-Variant` | `meta-llama/Llama-3.3-70B-Instruct-Turbo` |

## Daily Update Strategy

1. **Fetch OpenRouter** — `curl https://openrouter.ai/api/v1/models | jq '.data[].id'` — gives all current model IDs across providers
2. **Diff against upgrades.json** — find new models not yet mapped, and models removed (fully deprecated)
3. **Check deprecation pages** — for each provider, note newly deprecated models and their recommended replacements
4. **Update upgrades.json** — add new entries, update `safe`/`major` targets, remove entries where the source model no longer exists anywhere

## Data Collected: 2026-03-05

Sources queried for this seed:
- OpenRouter API (live fetch)
- OpenAI models + deprecations pages (web search)
- Anthropic models + deprecations pages (web search)
- Google Gemini models + deprecations pages (web search)
- Mistral models page (web search)
- DeepSeek API docs (web search)
- xAI models page (web search)
- Cohere models page (web search)
- AWS Bedrock supported models (web search)
