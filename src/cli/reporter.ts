import pc from 'picocolors'
import type { ScanReport, ScanResult } from '../core/types.js'

/**
 * Format a single scan match for terminal output.
 *
 * Example:
 *   src/api.ts:12  "gpt-4o-2024-05-13"
 *     -> safe:  gpt-4o-2024-08-06
 *     -> major: gpt-4.1
 */
function formatMatch(match: ScanResult): string {
  const location = pc.cyan(`${match.file}:${String(match.line)}`)
  const model = pc.yellow(`"${match.matchedText}"`)
  const lines = [`${location}  ${model}`]

  if (match.safeUpgrade) {
    lines.push(`  ${pc.green('\u2192')} safe:  ${pc.green(match.safeUpgrade)}`)
  }
  if (match.majorUpgrade) {
    lines.push(
      `  ${pc.magenta('\u2192')} major: ${pc.magenta(match.majorUpgrade)}`,
    )
  }

  return lines.join('\n')
}

/**
 * Format a full scan report for terminal output.
 * Includes each match and a summary line.
 */
export function formatScanReport(report: ScanReport, durationMs: number): string {
  const lines: string[] = []

  for (const match of report.matches) {
    lines.push(formatMatch(match))
    lines.push('')
  }

  const count = report.matches.length
  const modelWord = count === 1 ? 'model' : 'models'
  const fileCount = new Set(report.matches.map((m) => m.file)).size
  const fileWord = fileCount === 1 ? 'file' : 'files'

  const summary = `Found ${String(count)} upgradable ${modelWord} in ${String(fileCount)} ${fileWord} (scanned ${String(report.scannedFiles)}/${String(report.totalFiles)} files in ${String(durationMs)}ms)`

  lines.push(pc.bold(summary))
  return lines.join('\n') + '\n'
}

/**
 * Format a markdown PR body from scan matches.
 * Used by `--pr-body` flag and the GitHub Action.
 */
export function formatPrBody(report: ScanReport): string {
  const lines: string[] = ['## LLM Model Upgrades', '']
  lines.push('| File | Line | Model | Upgrade | Tier |')
  lines.push('|------|------|-------|---------|------|')

  for (const m of report.matches) {
    const upgrade = m.safeUpgrade ?? m.majorUpgrade ?? '—'
    const tier = m.safeUpgrade ? 'safe' : m.majorUpgrade ? 'major' : '—'
    lines.push(
      `| \`${m.file}\` | ${String(m.line)} | \`${m.matchedText}\` | \`${upgrade}\` | ${tier} |`,
    )
  }

  lines.push('')
  const count = report.matches.length
  const upgradeWord = count === 1 ? 'upgrade' : 'upgrades'
  const fileCount = new Set(report.matches.map((m) => m.file)).size
  const fileWord = fileCount === 1 ? 'file' : 'files'
  lines.push(`**${String(count)} ${upgradeWord} across ${String(fileCount)} ${fileWord}**`)

  return lines.join('\n') + '\n'
}

interface FixResult {
  applied: number
  files: string[]
}

interface FixEdit {
  file: string
  line: number
  oldText: string
  newText: string
  tier: 'safe' | 'major'
}

/**
 * Build fix edit details from scan matches for display purposes.
 */
export function buildFixEdits(
  matches: ScanResult[],
): FixEdit[] {
  const edits: FixEdit[] = []
  for (const m of matches) {
    const newText = m.safeUpgrade ?? m.majorUpgrade
    if (!newText) continue
    const tier = m.safeUpgrade ? 'safe' : 'major'
    edits.push({
      file: m.file,
      line: m.line,
      oldText: m.matchedText,
      newText,
      tier,
    })
  }
  return edits
}

/**
 * Format a fix report for terminal output.
 *
 * Example:
 *   Fixed 2 models:
 *     src/api.ts:12  "gpt-4o-2024-05-13" -> "gpt-4o-2024-08-06" (safe)
 *     src/config.yaml:5  "claude-3-opus" -> "claude-opus-4-6" (major)
 */
export function formatFixReport(
  result: FixResult,
  edits: FixEdit[],
): string {
  const modelWord = result.applied === 1 ? 'model' : 'models'
  const lines: string[] = []

  lines.push(pc.bold(`Fixed ${String(result.applied)} ${modelWord}:`))

  for (const edit of edits) {
    const location = pc.cyan(`${edit.file}:${String(edit.line)}`)
    const old = pc.red(`"${edit.oldText}"`)
    const arrow = '\u2192'
    const replacement = pc.green(`"${edit.newText}"`)
    const tier = pc.dim(`(${edit.tier})`)
    lines.push(`  ${location}  ${old} ${arrow} ${replacement} ${tier}`)
  }

  return lines.join('\n') + '\n'
}
