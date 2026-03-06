import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { loadUpgradeMap, lookupModel } from '../../src/core/upgrade-map.js'
import type { UpgradeMap } from '../../src/core/types.js'

const UPGRADES_PATH = join(
  import.meta.dirname,
  '..',
  '..',
  'data',
  'upgrades.json',
)

describe('loadUpgradeMap', () => {
  it('parses valid JSON file and returns Result with ok:true and typed UpgradeMap', async () => {
    const result = await loadUpgradeMap({ fallbackPath: UPGRADES_PATH })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    // Verify it has the expected structure
    const map = result.data
    expect(map['gpt-4']).toEqual({ safe: null, major: 'gpt-4.1' })
    expect(map['claude-3-opus-20240229']).toEqual({
      safe: null,
      major: 'claude-opus-4-6',
    })
    expect(map['gpt-4o-2024-05-13']).toEqual({
      safe: 'gpt-4o-2024-08-06',
      major: 'gpt-4.1',
    })
  })

  it('rejects malformed JSON and returns ok:false Result', async () => {
    let tempDir: string | undefined
    try {
      tempDir = await mkdtemp(join(tmpdir(), 'upgrade-map-test-'))
      const badFile = join(tempDir, 'bad.json')
      await writeFile(badFile, '{ not valid json!!!', 'utf-8')

      const result = await loadUpgradeMap({ fallbackPath: badFile })

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toMatch(/parse|json|syntax/i)
      }
    } finally {
      if (tempDir) await rm(tempDir, { recursive: true })
    }
  })

  it('handles missing file gracefully and returns ok:false', async () => {
    const result = await loadUpgradeMap({
      fallbackPath: '/nonexistent/path/upgrades.json',
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBeTruthy()
    }
  })

  it('fetches from URL when provided', async () => {
    const fakeMap: UpgradeMap = {
      'test-model': { safe: 'test-model-v2', major: null },
    }

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(JSON.stringify(fakeMap)),
      }),
    )

    const result = await loadUpgradeMap({
      url: 'https://example.com/upgrades.json',
      fallbackPath: UPGRADES_PATH,
    })

    expect(fetch).toHaveBeenCalledWith('https://example.com/upgrades.json')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data['test-model']).toEqual({
        safe: 'test-model-v2',
        major: null,
      })
    }

    vi.unstubAllGlobals()
  })

  it('falls back to bundled file when URL fetch fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('network error')),
    )

    const result = await loadUpgradeMap({
      url: 'https://example.com/upgrades.json',
      fallbackPath: UPGRADES_PATH,
    })

    expect(fetch).toHaveBeenCalledWith('https://example.com/upgrades.json')
    expect(result.ok).toBe(true)
    if (result.ok) {
      // Should have loaded from the bundled file
      expect(result.data['gpt-4']).toEqual({ safe: null, major: 'gpt-4.1' })
    }

    vi.unstubAllGlobals()
  })

  it('falls back to bundled file when URL returns non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        text: () => Promise.resolve('Not Found'),
      }),
    )

    const result = await loadUpgradeMap({
      url: 'https://example.com/upgrades.json',
      fallbackPath: UPGRADES_PATH,
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data['gpt-4']).toEqual({ safe: null, major: 'gpt-4.1' })
    }

    vi.unstubAllGlobals()
  })

  it('returns ok:false when URL returns invalid JSON and fallback also fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('not json'),
      }),
    )

    const result = await loadUpgradeMap({
      url: 'https://example.com/upgrades.json',
      fallbackPath: '/nonexistent/path/upgrades.json',
    })

    expect(result.ok).toBe(false)

    vi.unstubAllGlobals()
  })

  it('loads from default fallback path when no options provided', async () => {
    const result = await loadUpgradeMap()

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data['gpt-4']).toEqual({ safe: null, major: 'gpt-4.1' })
    }
  })
})

describe('lookupModel', () => {
  let map: UpgradeMap

  beforeEach(async () => {
    const raw = await readFile(UPGRADES_PATH, 'utf-8')
    map = JSON.parse(raw) as UpgradeMap
  })

  it('returns correct UpgradeEntry for known model', () => {
    const entry = lookupModel(map, 'gpt-4')
    expect(entry).toEqual({ safe: null, major: 'gpt-4.1' })
  })

  it('returns correct entry for model with safe upgrade', () => {
    const entry = lookupModel(map, 'gpt-4o-2024-05-13')
    expect(entry).toEqual({ safe: 'gpt-4o-2024-08-06', major: 'gpt-4.1' })
  })

  it('returns correct entry for platform-variant model', () => {
    const entry = lookupModel(map, 'openai/gpt-4')
    expect(entry).toEqual({ safe: null, major: 'openai/gpt-4.1' })
  })

  it('returns undefined for unknown model', () => {
    const entry = lookupModel(map, 'nonexistent-model-xyz')
    expect(entry).toBeUndefined()
  })

  it('returns undefined for empty string', () => {
    const entry = lookupModel(map, '')
    expect(entry).toBeUndefined()
  })
})
