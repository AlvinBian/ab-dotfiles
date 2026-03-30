/**
 * 統一快取層（content-addressed）
 *
 * 所有快取都基於內容 hash，輸入不變 → 快取命中。
 * 支援 per-repo AI 分類、整合結果、ECC AI 推薦。
 *
 * 快取目錄結構：
 *   .cache/
 *     {type}/         （如 repo-ai / ecc-ai / merge）
 *       {key}.json
 */

import fs from 'fs'
import path from 'path'
import { createHash } from 'crypto'

const CACHE_BASE = '.cache'

/**
 * 計算字串的 MD5 hash（取前 12 字元作為快取鍵）
 *
 * @param {string} content - 要 hash 的字串內容
 * @returns {string} 12 字元的 hex hash
 */
export function hashKey(content) {
  return createHash('md5').update(content).digest('hex').slice(0, 12)
}

/**
 * 讀取快取資料
 *
 * @param {string} baseDir - 專案根目錄
 * @param {string} type - 快取類型（如 'repo-ai'）
 * @param {string} key - 快取鍵（通常由 hashKey 產生）
 * @returns {Object|null} 快取資料，不存在或解析失敗返回 null
 */
export function readCache(baseDir, type, key) {
  const filePath = path.join(baseDir, CACHE_BASE, type, `${key}.json`)
  if (!fs.existsSync(filePath)) return null
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')) } catch { return null }
}

/**
 * 寫入快取資料
 *
 * @param {string} baseDir - 專案根目錄
 * @param {string} type - 快取類型（如 'repo-ai'）
 * @param {string} key - 快取鍵
 * @param {Object} data - 要快取的資料（會序列化為 JSON）
 * @returns {void}
 */
export function writeCache(baseDir, type, key, data) {
  const dir = path.join(baseDir, CACHE_BASE, type)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, `${key}.json`), JSON.stringify(data), 'utf8')
}

/**
 * 清除指定類型的所有快取
 *
 * @param {string} baseDir - 專案根目錄
 * @param {string} type - 要清除的快取類型
 * @returns {void}
 */
export function clearCacheType(baseDir, type) {
  const dir = path.join(baseDir, CACHE_BASE, type)
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true })
}
