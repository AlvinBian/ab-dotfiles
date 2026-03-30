#!/usr/bin/env node
/**
 * 備份還原工具
 *
 * 用法：
 *   pnpm run restore          ← 互動式選擇備份版本還原
 *   pnpm run restore -- --list  ← 列出所有備份
 */

import * as p from '@clack/prompts'
import pc from 'picocolors'
import fs from 'fs'
import path from 'path'
import { getDirname } from '../lib/core/paths.mjs'
import { cpDir } from '../lib/core/backup.mjs'

const __dirname = getDirname(import.meta)
const REPO = path.resolve(__dirname, '..')
const BACKUP_BASE = path.join(REPO, 'dist', 'backup')
const HOME = process.env.HOME

const args = process.argv.slice(2)
const flagList = args.includes('--list')

function getBackups() {
  if (!fs.existsSync(BACKUP_BASE)) return []
  return fs.readdirSync(BACKUP_BASE, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => {
      const dir = path.join(BACKUP_BASE, d.name)
      const contents = fs.readdirSync(dir)
      return { name: d.name, dir, contents }
    })
    .sort((a, b) => b.name.localeCompare(a.name)) // 最新的在前
}

async function main() {
  console.log()
  p.intro(' ab-dotfiles 備份還原 ')

  const backups = getBackups()

  if (backups.length === 0) {
    p.log.warn(`沒有找到任何備份\n  備份目錄：${pc.dim(BACKUP_BASE)}`)
    p.outro('執行 pnpm run setup 會自動建立備份')
    return
  }

  // 列出模式
  if (flagList) {
    const backupLines = backups.map(b => `  ${pc.cyan(b.name)}  ${pc.dim(b.contents.join(', '))}`).join('\n')
    p.log.info(`共 ${backups.length} 個備份：\n${backupLines}`)
    p.outro('')
    return
  }

  // 互動式選擇
  const selected = await p.select({
    message: '選擇要還原的備份版本  ↑↓ 選擇 · Enter 確認',
    options: backups.map(b => ({
      value: b.name,
      label: `${b.name}  ${pc.dim(b.contents.join(', '))}`,
    })),
  })
  if (p.isCancel(selected)) { p.cancel('已取消'); process.exit(0) }

  const backup = backups.find(b => b.name === selected)

  // 確認還原
  const restoreLines = backup.contents.map(item => {
    const targetPath = item === 'zshrc' ? path.join(HOME, '.zshrc') : path.join(HOME, `.${item}`)
    return `  ${pc.yellow(item)} → ${targetPath}`
  }).join('\n')
  p.log.info(`即將還原 ${pc.cyan(selected)}：\n${restoreLines}`)

  const confirm = await p.confirm({
    message: '確認還原？  Y 確認 · n 取消',
    initialValue: false,
  })
  if (p.isCancel(confirm) || !confirm) { p.cancel('已取消'); process.exit(0) }

  // 執行還原
  const s = p.spinner()
  s.start('還原中...')

  for (const item of backup.contents) {
    const src = path.join(backup.dir, item)
    let dest
    if (item === 'zshrc') dest = path.join(HOME, '.zshrc')
    else if (item === 'zsh') dest = path.join(HOME, '.zsh')
    else if (item === 'claude') dest = path.join(HOME, '.claude')
    else dest = path.join(HOME, `.${item}`)

    const stat = fs.statSync(src)
    if (stat.isDirectory()) {
      cpDir(src, dest)
    } else {
      fs.copyFileSync(src, dest)
    }
  }

  const zshHint = (backup.contents.includes('zshrc') || backup.contents.includes('zsh'))
    ? `\n  執行 ${pc.cyan('source ~/.zshrc')} 讓 zsh 設定生效`
    : ''
  s.stop(`已還原備份 ${pc.cyan(selected)}${zshHint}`)
  p.outro('✔ 還原完成')
}

main().catch(e => { console.error(e); process.exit(1) })
