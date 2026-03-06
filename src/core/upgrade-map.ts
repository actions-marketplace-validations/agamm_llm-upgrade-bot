import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { UpgradeEntry, UpgradeMap, Result } from './types.js'

function resolveDefaultPath(): string[] {
  // ESM: use import.meta.url to derive the directory
  // CJS: tsup rewrites to __dirname at build time
  const dir =
    typeof __dirname !== 'undefined'
      ? __dirname
      : dirname(fileURLToPath(import.meta.url))
  // When running from src/core/, go up two levels to project root.
  // When bundled into dist/, go up one level to project root.
  return [
    join(dir, '..', '..', 'data', 'upgrades.json'),
    join(dir, '..', 'data', 'upgrades.json'),
  ]
}

const DEFAULT_FALLBACK_PATHS = resolveDefaultPath()

interface LoadOptions {
  url?: string
  fallbackPath?: string
}

function parseUpgradeMap(text: string): Result<UpgradeMap> {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, error: 'Failed to parse JSON: invalid syntax' }
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, error: 'Failed to parse JSON: expected an object' }
  }

  return { ok: true, data: parsed as UpgradeMap }
}

async function loadFromFile(path: string): Promise<Result<UpgradeMap>> {
  let text: string
  try {
    text = await readFile(path, 'utf-8')
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Unknown file read error'
    return { ok: false, error: `Failed to read file: ${message}` }
  }
  return parseUpgradeMap(text)
}

async function loadFromUrl(url: string): Promise<Result<UpgradeMap>> {
  let response: Response
  try {
    response = await fetch(url)
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Unknown fetch error'
    return { ok: false, error: `Failed to fetch URL: ${message}` }
  }

  if (!response.ok) {
    return {
      ok: false,
      error: `Failed to fetch URL: HTTP ${String(response.status)}`,
    }
  }

  const text = await response.text()
  return parseUpgradeMap(text)
}

async function loadFromPaths(
  paths: string[],
): Promise<Result<UpgradeMap>> {
  let lastError = 'No fallback paths configured'
  for (const path of paths) {
    const result = await loadFromFile(path)
    if (result.ok) return result
    lastError = result.error
  }
  return { ok: false, error: lastError }
}

export async function loadUpgradeMap(
  options?: LoadOptions,
): Promise<Result<UpgradeMap>> {
  const fallbackPaths = options?.fallbackPath
    ? [options.fallbackPath]
    : DEFAULT_FALLBACK_PATHS
  const url = options?.url

  if (url) {
    const urlResult = await loadFromUrl(url)
    if (urlResult.ok) return urlResult

    // Fall back to file(s)
    return loadFromPaths(fallbackPaths)
  }

  return loadFromPaths(fallbackPaths)
}

export function lookupModel(
  map: UpgradeMap,
  modelId: string,
): UpgradeEntry | undefined {
  return map[modelId]
}
