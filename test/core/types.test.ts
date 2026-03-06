import { describe, it, expect } from 'vitest'
import type { UpgradeMap, UpgradeEntry, Result } from '../../src/core/types.js'

describe('core types', () => {
  it('UpgradeEntry has safe and major fields', () => {
    const entry: UpgradeEntry = { safe: 'gpt-4o-2024-08-06', major: 'gpt-4.1' }
    expect(entry.safe).toBe('gpt-4o-2024-08-06')
    expect(entry.major).toBe('gpt-4.1')
  })

  it('UpgradeEntry allows null values', () => {
    const entry: UpgradeEntry = { safe: null, major: 'gpt-4.1' }
    expect(entry.safe).toBeNull()
  })

  it('UpgradeMap is a record of string to UpgradeEntry', () => {
    const map: UpgradeMap = {
      'gpt-4': { safe: null, major: 'gpt-4.1' },
    }
    expect(map['gpt-4']?.major).toBe('gpt-4.1')
  })

  it('Result type represents success', () => {
    const result: Result<number> = { ok: true, data: 42 }
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data).toBe(42)
  })

  it('Result type represents failure', () => {
    const result: Result<number> = { ok: false, error: 'not found' }
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('not found')
  })
})
