/**
 * .env 載入（不依賴 dotenv）
 *
 * 職責：
 *   讀取專案根目錄的 .env 檔案，注入到 process.env。
 *   已存在的環境變數不會被覆蓋。
 *   只載入一次（idempotent）。
 */

import fs from 'fs'
import path from 'path'
import { getDirname } from './utils/paths.mjs'

const __dirname = getDirname(import.meta)
const ENV_PATH = path.resolve(__dirname, '..', '.env')

const TEMPLATE_PATH = path.resolve(__dirname, '..', '.env.template')

let _loaded = false

export function loadEnv() {
  if (_loaded) return
  _loaded = true
  // .env 不存在但 template 存在時，自動從 template 建立
  if (!fs.existsSync(ENV_PATH) && fs.existsSync(TEMPLATE_PATH)) {
    fs.copyFileSync(TEMPLATE_PATH, ENV_PATH)
  }
  if (!fs.existsSync(ENV_PATH)) return
  for (const line of fs.readFileSync(ENV_PATH, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
    if (!process.env[key]) process.env[key] = val
  }
}

/**
 * 讀取環境變數，帶型別轉換
 * @param {string} key
 * @param {*} fallback - 預設值（也決定型別轉換：number → parseInt, boolean → 'true'）
 * @returns {*}
 */
export function env(key, fallback) {
  loadEnv()
  const val = process.env[key]
  if (val === undefined || val === '') return fallback
  if (typeof fallback === 'number') return parseInt(val, 10) || fallback
  if (typeof fallback === 'boolean') return val === 'true' || val === '1'
  return val
}
