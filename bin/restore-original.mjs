#!/usr/bin/env node
/**
 * 恢復到 setup 前的原始配置
 *
 * 從 ~/.ab-dotfiles-original/ 恢復：
 *   ~/.zshrc、~/.claude/、~/.zsh/、~/.zsh_history
 */

import fs from 'fs'
import path from 'path'
import * as p from '@clack/prompts'

const HOME = process.env.HOME
const BACKUP_DIR = path.join(HOME, '.ab-dotfiles-original')

async function main() {
  if (!fs.existsSync(BACKUP_DIR)) {
    p.log.error(`找不到原始備份：${BACKUP_DIR}\n首次 setup 前應自動備份。如果未備份，無法恢復。`)
    process.exit(1)
  }

  const timestamp = fs.existsSync(path.join(BACKUP_DIR, '.timestamp'))
    ? fs.readFileSync(path.join(BACKUP_DIR, '.timestamp'), 'utf8').trim()
    : '未知'

  const items = fs.readdirSync(BACKUP_DIR).filter(f => f !== '.timestamp')

  p.intro(' 恢復原始配置 ')
  p.log.info(`備份時間：${timestamp}\n備份內容：${items.join('、')}`)

  const confirm = await p.confirm({
    message: `確定恢復到 setup 前的狀態？這會覆蓋當前 ~/.claude/ 和 ~/.zshrc`,
    initialValue: false,
  })

  if (!confirm || p.isCancel(confirm)) {
    p.log.info('已取消')
    process.exit(0)
  }

  let restored = 0

  const restoreMap = [
    ['zshrc', path.join(HOME, '.zshrc')],
    ['zsh', path.join(HOME, '.zsh')],
    ['claude', path.join(HOME, '.claude')],
    ['zsh_history', path.join(HOME, '.zsh_history')],
  ]

  for (const [name, dest] of restoreMap) {
    const src = path.join(BACKUP_DIR, name)
    if (!fs.existsSync(src)) continue

    // 先刪除現有
    if (fs.existsSync(dest)) {
      fs.rmSync(dest, { recursive: true, force: true })
    }

    const stat = fs.statSync(src)
    if (stat.isDirectory()) {
      fs.cpSync(src, dest, { recursive: true })
    } else {
      fs.copyFileSync(src, dest)
    }
    restored++
    p.log.success(`  ✔ ${name} → ${dest.replace(HOME, '~')}`)
  }

  p.log.success(`恢復完成：${restored} 項\n重啟終端以生效：exec zsh`)
}

main().catch(e => { console.error(e.message); process.exit(1) })
