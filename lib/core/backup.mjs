/**
 * 備份 / 還原工具（準備未來 @ab-flash/libs 提取）
 *
 * 提供檔案備份、舊備份清理、目錄遞迴複製等功能。
 */

import fs from 'fs'
import path from 'path'
import pc from 'picocolors'
import * as p from '@clack/prompts'
import { getDirname } from './paths.mjs'
import { BACKUP_MAX_COUNT } from './constants.mjs'

const __dirname = getDirname(import.meta)
const REPO = path.resolve(__dirname, '../..')
const DIST_DIR = path.join(REPO, 'dist')

const BACKUP_BASE = path.join(DIST_DIR, 'backup')
export const BACKUP_TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
export const BACKUP_DIR = path.join(BACKUP_BASE, BACKUP_TIMESTAMP)

// ── 清理舊備份（保留最近 BACKUP_MAX_COUNT 次）──────────────────
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

// ── 備份現有檔案/目錄 ─────────────────────────────────────────
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

// ── 遞迴複製目錄 ─────────────────────────────────────────────
export function cpDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name)
    const d = path.join(dest, entry.name)
    entry.isDirectory() ? cpDir(s, d) : fs.copyFileSync(s, d)
  }
}
