import type { UpgradeMap } from './types.js'

/**
 * Separator characters that delimit provider stems from model names.
 * - `-` for native model IDs (gpt-4, claude-3-*, gemini-pro)
 * - `/` for platform variants (openai/gpt-4, anthropic/claude-3-*)
 * - `.` for Bedrock variants (anthropic.claude-3-*)
 */
const STEM_SEPARATORS = /[-/.]/

/**
 * Extract the provider prefix stem from a model key.
 * The stem is everything up to and including the first separator (`-`, `/`, `.`).
 *
 * Examples:
 *   "gpt-4"                                  -> "gpt-"
 *   "claude-3-opus-20240229"                  -> "claude-"
 *   "openai/gpt-4"                           -> "openai/"
 *   "anthropic.claude-3-opus-20240229-v1:0"  -> "anthropic."
 *   "gemini/gemini-1.5-pro"                  -> "gemini/"
 */
function extractStem(key: string): string | undefined {
  const match = STEM_SEPARATORS.exec(key)
  if (!match || match.index === undefined) return undefined
  return key.slice(0, match.index + 1)
}

/**
 * Escape special regex characters in a string, preserving it for literal matching.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Build a single RegExp that matches any provider stem derived from the
 * upgrade map keys. Used as a fast first-pass filter to skip files that
 * contain no LLM model references.
 *
 * Strategy: for each key, extract the prefix up to and including the first
 * `-`, `/`, or `.`. Deduplicate, escape for regex, and join with `|`.
 */
export function buildPrefixRegex(map: UpgradeMap): RegExp {
  const stems = new Set<string>()

  for (const key of Object.keys(map)) {
    const stem = extractStem(key)
    if (stem) stems.add(stem)
  }

  if (stems.size === 0) {
    // Return a regex that never matches
    return /(?!)/
  }

  const escaped = [...stems].map(escapeRegex)
  return new RegExp(escaped.join('|'))
}

/**
 * Fast check: does this file content contain any provider stem?
 * Returns true if the content matches the prefix regex, false otherwise.
 */
export function fileMatchesPrefixFilter(
  content: string,
  prefixRegex: RegExp,
): boolean {
  return prefixRegex.test(content)
}
