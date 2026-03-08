import { readFile, readdir, stat } from 'node:fs/promises'
import { join, extname, relative, basename } from 'node:path'
import { execSync } from 'node:child_process'
import type { UpgradeMap, ScanReport, ScanResult } from './types.js'
import { buildPrefixRegex, fileMatchesPrefixFilter } from './prefix-filter.js'
import { scanFile } from './scanner.js'

/** File extensions supported for scanning. */
export const SUPPORTED_EXTENSIONS: readonly string[] = Object.freeze([
  '.py', '.ts', '.js', '.tsx', '.jsx', '.rb', '.php', '.lua',
  '.go', '.java', '.rs', '.cs', '.cpp', '.cc', '.c', '.h',
  '.kt', '.kts', '.swift', '.dart', '.scala',
  '.sh', '.bash', '.zsh', '.ex', '.exs', '.r', '.R',
  '.vue', '.svelte', '.md', '.mdx',
  '.yaml', '.yml', '.json', '.toml', '.env', '.cfg', '.ini',
  '.tf', '.hcl',
])

/** Directories always skipped (build artifacts, deps). */
const IGNORED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'vendor',
  '__pycache__', '.venv', 'coverage', '.next', '.nuxt',
])

/** Test directories skipped by default (overridable via --include). */
const TEST_DIRS = new Set([
  'test', 'tests', '__tests__', 'spec', 'specs',
  'test_data', 'testdata', 'test-data',
  'fixtures', '__fixtures__', '__mocks__',
])

/** Test file patterns: *.test.ts, *.spec.js, test_*.py, *_test.go, *Test.java */
const TEST_FILE_PATTERN =
  /\.(?:test|spec)\.\w+$|^test_.*\.py$|_(?:test|spec)\.\w+$|(?:Test|Spec)\.(?:java|kt|scala|swift)$/

export interface ScanOptions {
  extraExtensions?: string[]
  includeGlobs?: string[]
}

function hasSupportedExtension(
  filePath: string,
  extra: string[] = [],
): boolean {
  const ext = extname(filePath)
  return SUPPORTED_EXTENSIONS.includes(ext) || extra.includes(ext)
}

/** List tracked files via `git ls-files`, or null if not a git repo. */
function tryGitLsFiles(dir: string): string[] | null {
  try {
    const output = execSync('git ls-files', {
      cwd: dir,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    const files = output
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)

    // Fall back to walk if git returns no tracked files
    return files.length > 0 ? files : null
  } catch {
    return null
  }
}

async function walkDirectory(dir: string, root: string): Promise<string[]> {
  let names: string[]
  try {
    names = await readdir(dir)
  } catch {
    return []
  }

  const files: string[] = []
  for (const name of names) {
    const fullPath = join(dir, name)
    const fileStat = await stat(fullPath).catch(() => null)
    if (!fileStat) continue

    if (fileStat.isDirectory() && !IGNORED_DIRS.has(name)) {
      files.push(...(await walkDirectory(fullPath, root)))
    } else if (fileStat.isFile()) {
      files.push(relative(root, fullPath))
    }
  }
  return files
}

async function directoryExists(dir: string): Promise<boolean> {
  try {
    const s = await stat(dir)
    return s.isDirectory()
  } catch {
    return false
  }
}

function matchGlob(filePath: string, pattern: string): boolean {
  const regex = new RegExp(
    '^' +
      pattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*\*/g, '{{GLOBSTAR}}')
        .replace(/\*/g, '[^/]*')
        .replace(/{{GLOBSTAR}}/g, '.*') +
      '$',
  )
  return regex.test(filePath) || regex.test(basename(filePath))
}

/**
 * List supported files in a directory using git or fallback walk.
 */
function isTestPath(filePath: string): boolean {
  const segments = filePath.split('/')
  if (segments.some((s) => TEST_DIRS.has(s))) return true
  const file = segments[segments.length - 1] ?? ''
  return TEST_FILE_PATTERN.test(file)
}

async function listSupportedFiles(
  dir: string,
  extra: string[] = [],
  skipTests: boolean = true,
): Promise<string[]> {
  const allFiles = tryGitLsFiles(dir) ?? (await walkDirectory(dir, dir))
  return allFiles.filter((f) =>
    hasSupportedExtension(f, extra) && (!skipTests || !isTestPath(f)),
  )
}

async function twoPassScan(
  dir: string,
  files: string[],
  upgradeMap: UpgradeMap,
  prefixRegex: RegExp,
): Promise<{ scannedFiles: number; matches: ScanResult[] }> {
  const matches: ScanResult[] = []
  let scannedFiles = 0

  for (const filePath of files) {
    const content = await readFileSafe(join(dir, filePath))
    if (content === null) continue

    if (!fileMatchesPrefixFilter(content, prefixRegex)) continue
    scannedFiles++

    matches.push(...scanFile(filePath, content, upgradeMap))
  }

  return { scannedFiles, matches }
}

async function readFileSafe(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf-8')
  } catch {
    return null
  }
}

export async function scanDirectory(
  dir: string,
  upgradeMap: UpgradeMap,
  options?: ScanOptions,
): Promise<ScanReport> {
  const empty: ScanReport = {
    totalFiles: 0, scannedFiles: 0, matches: [],
  }

  if (!(await directoryExists(dir))) return empty

  const extra = options?.extraExtensions ?? []
  const includeGlobs = options?.includeGlobs ?? []
  const skipTests = includeGlobs.length === 0
  let supportedFiles = await listSupportedFiles(dir, extra, skipTests)

  if (includeGlobs.length > 0) {
    supportedFiles = supportedFiles.filter((f) =>
      includeGlobs.some((g) => matchGlob(f, g)),
    )
  }
  const prefixRegex = buildPrefixRegex(upgradeMap)
  const { scannedFiles, matches } = await twoPassScan(
    dir, supportedFiles, upgradeMap, prefixRegex,
  )

  return { totalFiles: supportedFiles.length, scannedFiles, matches }
}
