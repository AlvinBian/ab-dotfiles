/**
 * 備份 / 還原工具（準備未來 @ab-flash/libs 提取）
 *
 * 提供檔案備份、舊備份清理、目錄遞迴複製等功能。
 */

import fs from 'fs'
import path from 'path'
import pc from 'picocolors'
import { BACKUP_MAX_COUNT } from './constants.mjs'
import { getDirname } from './paths.mjs'

const __dirname = getDirname(import.meta)
const REPO = path.resolve(__dirname, '../..')
const DIST_DIR = path.join(REPO, 'dist')

const BACKUP_BASE = path.join(DIST_DIR, 'backup')
// ISO 時間戳：將冒號與點替換為連字號，取前 19 碼（YYYY-MM-DDTHH-MM-SS）作為備份目錄名
export const BACKUP_TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
export const BACKUP_DIR = path.join(BACKUP_BASE, BACKUP_TIMESTAMP)

/**
 * 清理舊備份，只保留最近 BACKUP_MAX_COUNT 次
 *
 * 讀取備份根目錄下的所有子目錄，依名稱降序排列後，
 * 刪除超出保留數量的舊備份目錄。
 *
 * @returns {void}
 */
export function cleanOldBackups() {
  if (!fs.existsSync(BACKUP_BASE)) return
  const dirs = fs.readdirSync(BACKUP_BASE, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
    .sort()
    .reverse()
  // 保留最近 BACKUP_MAX_COUNT 次
  for (const old of dirs.slice(BACKUP_MAX_COUNT)) {
    fs.rmSync(path.join(BACKUP_BASE, old), { recursive: true })
  }
}

/**
 * 備份現有檔案或目錄到本次備份目錄
 *
 * 若目標路徑不存在則直接返回 null。
 * 若為目錄則遞迴複製，若為檔案則直接複製。
 * 備份完成後回傳供顯示的格式化訊息字串。
 *
 * @param {string} targetPath - 要備份的來源路徑（檔案或目錄）
 * @param {string} label - 備份後的目標名稱（相對於備份目錄）
 * @returns {Promise<string|null>} 格式化的備份提示訊息，若來源不存在則為 null
 */
export async function backupIfExists(targetPath, label) {
  if (!fs.existsSync(targetPath)) return null

  fs.mkdirSync(BACKUP_DIR, { recursive: true })
  const backupPath = path.join(BACKUP_DIR, label)

  const stat = fs.statSync(targetPath)
  if (stat.isDirectory()) {
    cpDir(targetPath, backupPath)
  } else {
    fs.copyFileSync(targetPath, backupPath)
  }

  return `  ${pc.dim('💾')} ${pc.yellow(path.basename(targetPath))} → ${pc.dim('dist/backup/' + BACKUP_TIMESTAMP + '/' + label)}`
}

/**
 * 遞迴複製目錄（深度複製）
 *
 * 建立目標目錄後，逐一複製所有子項目；
 * 若子項目為目錄則遞迴處理，否則直接複製檔案。
 *
 * @param {string} src - 來源目錄絕對路徑
 * @param {string} dest - 目標目錄絕對路徑
 * @returns {void}
 */
export function cpDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name)
    const d = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      cpDir(s, d)
    } else {
      // 跳過 broken symlink（目標不存在）
      if (entry.isSymbolicLink() && !fs.existsSync(s)) continue
      fs.copyFileSync(s, d)
    }
  }
}
