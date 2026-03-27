/**
 * 統一快取層（content-addressed）
 *
 * 所有快取都基於內容 hash，輸入不變 → 快取命中。
 * 支援 per-repo AI 分類、整合結果、ECC AI 推薦。
 */

import fs from 'fs'
import path from 'path'
import { createHash } from 'crypto'

const CACHE_BASE = '.cache'

export function hashKey(content) {
  return createHash('md5').update(content).digest('hex').slice(0, 12)
}

export function readCache(baseDir, type, key) {
  const filePath = path.join(baseDir, CACHE_BASE, type, `${key}.json`)
  if (!fs.existsSync(filePath)) return null
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')) } catch { return null }
}

export function writeCache(baseDir, type, key, data) {
  const dir = path.join(baseDir, CACHE_BASE, type)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, `${key}.json`), JSON.stringify(data), 'utf8')
}

export function clearCacheType(baseDir, type) {
  const dir = path.join(baseDir, CACHE_BASE, type)
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true })
}
