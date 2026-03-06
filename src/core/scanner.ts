import type { UpgradeMap, ScanResult } from './types.js'

/**
 * Regex to extract strings from source code.
 * Group 1: double-quoted strings  "model-id"
 * Group 2: single-quoted strings  'model-id'
 * Group 3: backtick strings       `model-id`  (Go raw strings, JS template literals)
 */
const QUOTED_STRING_REGEX = /"([^"]+)"|'([^']+)'/g
const BACKTICK_REGEX = /`([^`]+)`/g

/**
 * Scan file content for hardcoded LLM model strings and look them up
 * in the upgrade map.
 *
 * @param filePath - The file path (used in ScanResult.file)
 * @param content - The file content to scan
 * @param upgradeMap - The upgrade map to look up model IDs
 * @returns Array of ScanResult for each matched model string
 */
/**
 * Try to convert a regex match into a ScanResult by looking up the
 * matched model ID in the upgrade map.
 */
function matchToResult(
  match: RegExpExecArray,
  filePath: string,
  lineOffsets: number[],
  upgradeMap: UpgradeMap,
): ScanResult | undefined {
  const modelId = match[1] ?? match[2]
  if (!modelId) return undefined

  const entry = upgradeMap[modelId]
  if (!entry) return undefined

  const { line, column } = resolvePosition(lineOffsets, match.index)
  return {
    file: filePath,
    line,
    column,
    matchedText: modelId,
    safeUpgrade: entry.safe,
    majorUpgrade: entry.major,
  }
}

/**
 * Run a regex against content and collect ScanResults for model matches.
 */
function collectMatches(
  regex: RegExp,
  content: string,
  filePath: string,
  lineOffsets: number[],
  upgradeMap: UpgradeMap,
): ScanResult[] {
  const results: ScanResult[] = []
  regex.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = regex.exec(content)) !== null) {
    const result = matchToResult(match, filePath, lineOffsets, upgradeMap)
    if (result) results.push(result)
  }
  return results
}

export function scanFile(
  filePath: string,
  content: string,
  upgradeMap: UpgradeMap,
): ScanResult[] {
  const lineOffsets = buildLineOffsets(content)
  const results = collectMatches(
    QUOTED_STRING_REGEX, content, filePath, lineOffsets, upgradeMap,
  )
  results.push(...collectMatches(
    BACKTICK_REGEX, content, filePath, lineOffsets, upgradeMap,
  ))
  return results
}

/**
 * Build an array of byte offsets where each line starts.
 * Index 0 = line 1 starts at offset 0, etc.
 */
function buildLineOffsets(content: string): number[] {
  const offsets: number[] = [0]
  for (let i = 0; i < content.length; i++) {
    if (content[i] === '\n') {
      offsets.push(i + 1)
    }
  }
  return offsets
}

/**
 * Convert a character offset into a 1-based line and 0-based column.
 */
function resolvePosition(
  lineOffsets: number[],
  offset: number,
): { line: number; column: number } {
  // Binary search for the line containing this offset
  let low = 0
  let high = lineOffsets.length - 1

  while (low < high) {
    const mid = Math.ceil((low + high) / 2)
    const midOffset = lineOffsets[mid]
    if (midOffset !== undefined && midOffset <= offset) {
      low = mid
    } else {
      high = mid - 1
    }
  }

  const lineStart = lineOffsets[low] ?? 0
  return {
    line: low + 1, // 1-based
    column: offset - lineStart, // 0-based
  }
}
