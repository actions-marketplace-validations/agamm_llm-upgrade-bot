import { Command } from 'commander'
import { resolve } from 'node:path'
import { loadUpgradeMap } from '../core/upgrade-map.js'
import { scanDirectory } from '../core/directory-scanner.js'
import { computeEdits, applyFixes } from '../core/fixer.js'
import {
  formatScanReport,
  formatFixReport,
  buildFixEdits,
} from './reporter.js'

export const program = new Command()

program
  .name('llm-upgrade-bot')
  .description(
    'Scan codebases for outdated LLM model strings and propose upgrades',
  )
  .version('0.1.0')

program
  .argument('[directory]', 'directory to scan', '.')
  .option('--fix', 'auto-apply upgrades to files')
  .option('--json', 'output results as JSON')
  .action(async (directory: string, options: { fix?: boolean; json?: boolean }) => {
    const dir = resolve(directory)
    await runScan(dir, options)
  })

async function runScan(
  dir: string,
  options: { fix?: boolean; json?: boolean },
): Promise<void> {
  const mapResult = await loadUpgradeMap()
  if (!mapResult.ok) {
    process.stderr.write(`Error: ${mapResult.error}\n`)
    process.exit(2)
    return
  }

  const upgradeMap = mapResult.data
  const report = await scanDirectory(dir, upgradeMap)

  if (options.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
    process.exit(report.matches.length > 0 ? 1 : 0)
    return
  }

  if (options.fix) {
    const fixEdits = buildFixEdits(report.matches)
    const edits = computeEdits(report.matches)
    const result = await applyFixes(
      edits.map((e) => ({ ...e, file: resolve(dir, e.file) })),
    )
    process.stdout.write(formatFixReport(result, fixEdits))
    process.exit(0)
    return
  }

  // Default: scan report
  process.stdout.write(formatScanReport(report))
  process.exit(report.matches.length > 0 ? 1 : 0)
}

// Run when executed directly (bin entry point or tsx dev)
const isDirectRun =
  process.argv[1] !== undefined &&
  /cli(?:\/index)?(?:\.ts|\.js)$/.test(process.argv[1])

if (isDirectRun) {
  program.parseAsync()
}
