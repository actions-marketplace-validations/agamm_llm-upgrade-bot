export interface UpgradeEntry {
  safe: string | null
  major: string | null
}

export type UpgradeMap = Record<string, UpgradeEntry>

export interface ScanResult {
  file: string
  line: number
  column: number
  matchedText: string
  safeUpgrade: string | null
  majorUpgrade: string | null
}

export interface ScanReport {
  totalFiles: number
  scannedFiles: number
  matches: ScanResult[]
}

export interface FileEdit {
  file: string
  line: number
  column: number
  oldText: string
  newText: string
}

export type Result<T, E = string> =
  | { ok: true; data: T }
  | { ok: false; error: E }
