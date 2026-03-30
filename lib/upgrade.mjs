/**
 * v1.x → v2.0 升級偵測與遷移
 *
 * 偵測 v1 安裝痕跡，自動清理/遷移到 v2 分層結構。
 */

import fs from 'fs'
import path from 'path'
import * as p from '@clack/prompts'
import pc from 'picocolors'
import { GLOBAL_COMMANDS, GLOBAL_AGENTS, GLOBAL_RULES, V1_PROJECT_COMMANDS, V1_PROJECT_AGENTS, V1_PROJECT_RULES } from './config-classifier.mjs'
import { handleCancel, BACK } from './ui/prompts.mjs'
import { backupIfExists } from './backup.mjs'

const HOME = process.env.HOME
const CLAUDE_DIR = path.join(HOME, '.claude')

// ab-dotfiles 管理的所有配置名稱（v1 + v2）
const ALL_MANAGED = {
  commands: new Set([...GLOBAL_COMMANDS, ...V1_PROJECT_COMMANDS]),
  agents: new Set([...GLOBAL_AGENTS, ...V1_PROJECT_AGENTS]),
  rules: new Set([...GLOBAL_RULES, ...V1_PROJECT_RULES, 'kkday-conventions']),
}

/**
 * 偵測是否有 v1.x 安裝痕跡
 *
 * 判斷依據：
 * 1. 專案級配置出現在全局目錄（v1 不分層）
 * 2. 舊的 kkday-conventions（已重命名）
 * 3. settings.json 缺少 v2 新增的 permissions/keybindings
 * 4. hooks.json 缺少 v2 新增的 hooks
 */
export function detectV1Installation() {
  const commandsDir = path.join(CLAUDE_DIR, 'commands')
  const agentsDir = path.join(CLAUDE_DIR, 'agents')
  const rulesDir = path.join(CLAUDE_DIR, 'rules')

  // 沒有任何 claude 配置 = 全新安裝，不需要升級
  if (!fs.existsSync(commandsDir) && !fs.existsSync(agentsDir) && !fs.existsSync(rulesDir)) {
    return { hasV1: false }
  }

  const existingCommands = fs.existsSync(commandsDir)
    ? fs.readdirSync(commandsDir).filter(f => f.endsWith('.md')).map(f => f.replace('.md', ''))
    : []
  const existingAgents = fs.existsSync(agentsDir)
    ? fs.readdirSync(agentsDir).filter(f => f.endsWith('.md')).map(f => f.replace('.md', ''))
    : []
  const existingRules = fs.existsSync(rulesDir)
    ? fs.readdirSync(rulesDir).filter(f => f.endsWith('.md')).map(f => f.replace('.md', ''))
    : []

  // 找出應該是專案級但目前在全局的
  const projectCommandsInGlobal = existingCommands.filter(c => V1_PROJECT_COMMANDS.includes(c))
  const projectAgentsInGlobal = existingAgents.filter(a => V1_PROJECT_AGENTS.includes(a))
  const projectRulesInGlobal = existingRules.filter(r => V1_PROJECT_RULES.includes(r))

  // 舊名稱
  const hasOldKkday = existingRules.includes('kkday-conventions')

  // 檢查 settings.json 是否缺少 v2 欄位
  const settingsPath = path.join(CLAUDE_DIR, 'settings.json')
  let settingsNeedsUpgrade = false
  if (fs.existsSync(settingsPath)) {
    try {
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'))
      // v2 新增：permissions.deny、autoMemoryEnabled
      if (!settings.permissions?.deny?.length || settings.autoMemoryEnabled === undefined) {
        settingsNeedsUpgrade = true
      }
    } catch { /* 無法解析也算需要升級 */ }
  }

  // 檢查 hooks.json 是否是 v1 版本（< 8 個 hooks）
  const hooksPath = path.join(CLAUDE_DIR, 'hooks.json')
  let hooksNeedsUpgrade = false
  if (fs.existsSync(hooksPath)) {
    try {
      const hooks = JSON.parse(fs.readFileSync(hooksPath, 'utf8'))
      const hookCount = Object.values(hooks.hooks || {}).reduce((s, m) => s + m.length, 0)
      if (hookCount < 8) hooksNeedsUpgrade = true
    } catch { hooksNeedsUpgrade = true }
  }

  // 找出非 ab-dotfiles 管理的用戶自訂配置
  const userCustomCommands = existingCommands.filter(c => !ALL_MANAGED.commands.has(c))
  const userCustomAgents = existingAgents.filter(a => !ALL_MANAGED.agents.has(a))
  const userCustomRules = existingRules.filter(r => !ALL_MANAGED.rules.has(r))

  const totalProjectItems = projectCommandsInGlobal.length + projectAgentsInGlobal.length + projectRulesInGlobal.length
  const needsUpgrade = totalProjectItems > 0 || hasOldKkday || settingsNeedsUpgrade || hooksNeedsUpgrade

  if (!needsUpgrade) {
    return { hasV1: false }
  }

  return {
    hasV1: true,
    projectCommandsInGlobal,
    projectAgentsInGlobal,
    projectRulesInGlobal,
    hasOldKkday,
    settingsNeedsUpgrade,
    hooksNeedsUpgrade,
    userCustomCommands,
    userCustomAgents,
    userCustomRules,
    totalProjectItems,
  }
}

/**
 * 執行升級遷移
 */
export async function runUpgrade(v1Info) {
  // 層級結構展示
  const lines = []
  let idx = 1

  if (v1Info.totalProjectItems > 0) {
    lines.push(`${idx}. 清理全局中的專案級配置`)
    if (v1Info.projectCommandsInGlobal.length) {
      lines.push(`   ${idx}.1 Commands（${v1Info.projectCommandsInGlobal.length}）`)
      v1Info.projectCommandsInGlobal.forEach(c => lines.push(`       · ${c}`))
    }
    if (v1Info.projectAgentsInGlobal.length) {
      lines.push(`   ${idx}.2 Agents（${v1Info.projectAgentsInGlobal.length}）`)
      v1Info.projectAgentsInGlobal.forEach(a => lines.push(`       · ${a}`))
    }
    if (v1Info.projectRulesInGlobal.length) {
      lines.push(`   ${idx}.3 Rules（${v1Info.projectRulesInGlobal.length}）`)
      v1Info.projectRulesInGlobal.forEach(r => lines.push(`       · ${r}`))
    }
    idx++
  }

  if (v1Info.hasOldKkday) {
    lines.push(`${idx}. 重命名：kkday-conventions → project-conventions`)
    idx++
  }
  if (v1Info.settingsNeedsUpgrade) {
    lines.push(`${idx}. 更新 settings.json（補充 v2 權限規則）`)
    idx++
  }
  if (v1Info.hooksNeedsUpgrade) {
    lines.push(`${idx}. 更新 hooks.json（v1: 5 個 → v2: 8 個）`)
    idx++
  }

  // 用戶自訂配置（帶序號）
  const customCount = v1Info.userCustomCommands.length + v1Info.userCustomAgents.length + v1Info.userCustomRules.length
  if (customCount > 0) {
    lines.push('')
    lines.push(`${idx}. ⚠ ${customCount} 個非 ab-dotfiles 的自訂配置（不會刪除）`)
    let ci = 1
    if (v1Info.userCustomCommands.length) {
      lines.push(`   ${idx}.${ci} Commands（${v1Info.userCustomCommands.length}）`)
      v1Info.userCustomCommands.forEach(c => lines.push(`       · ${c}`))
      ci++
    }
    if (v1Info.userCustomAgents.length) {
      lines.push(`   ${idx}.${ci} Agents（${v1Info.userCustomAgents.length}）`)
      v1Info.userCustomAgents.forEach(a => lines.push(`       · ${a}`))
      ci++
    }
    if (v1Info.userCustomRules.length) {
      lines.push(`   ${idx}.${ci} Rules（${v1Info.userCustomRules.length}）`)
      v1Info.userCustomRules.forEach(r => lines.push(`       · ${r}`))
    }
  }

  p.log.info(`偵測到 v1.x 安裝，需要升級到 v2.0：\n${lines.join('\n')}`)

  const action = handleCancel(await p.select({
    message: 'v1 → v2 升級',
    options: [
      { value: 'upgrade', label: '升級（推薦）', hint: '備份 → 清理專案級殘留 → 更新 settings/hooks' },
      { value: 'keep', label: '保留 v1 配置不動', hint: '可能有重複' },
      { value: 'clean', label: '全部清除，重新安裝', hint: '備份 → 清空 ~/.claude/ 重來' },
    ],
  }))

  if (action === BACK) return 'skip'

  if (action === 'upgrade') {
    await doUpgrade(v1Info)
    return 'upgraded'
  }

  if (action === 'clean') {
    await doClean()
    return 'cleaned'
  }

  return 'skip'
}

async function doUpgrade(v1Info) {
  const commandsDir = path.join(CLAUDE_DIR, 'commands')
  const agentsDir = path.join(CLAUDE_DIR, 'agents')
  const rulesDir = path.join(CLAUDE_DIR, 'rules')

  // 先備份
  p.log.info('備份現有配置...')
  await Promise.all([
    backupIfExists(commandsDir, 'upgrade/commands'),
    backupIfExists(agentsDir, 'upgrade/agents'),
    backupIfExists(rulesDir, 'upgrade/rules'),
    backupIfExists(path.join(CLAUDE_DIR, 'hooks.json'), 'upgrade/hooks.json'),
    backupIfExists(path.join(CLAUDE_DIR, 'settings.json'), 'upgrade/settings.json'),
    backupIfExists(path.join(CLAUDE_DIR, 'keybindings.json'), 'upgrade/keybindings.json'),
  ])

  let removed = 0

  // 移除全局中的專案級 commands（只刪 ab-dotfiles 管理的，保留用戶自訂）
  for (const name of v1Info.projectCommandsInGlobal) {
    const filePath = path.join(commandsDir, `${name}.md`)
    if (fs.existsSync(filePath)) { fs.unlinkSync(filePath); removed++ }
  }

  // 移除全局中的專案級 agents
  for (const name of v1Info.projectAgentsInGlobal) {
    const filePath = path.join(agentsDir, `${name}.md`)
    if (fs.existsSync(filePath)) { fs.unlinkSync(filePath); removed++ }
  }

  // 移除全局中的專案級 rules
  for (const name of v1Info.projectRulesInGlobal) {
    const filePath = path.join(rulesDir, `${name}.md`)
    if (fs.existsSync(filePath)) { fs.unlinkSync(filePath); removed++ }
  }

  // 移除 kkday-conventions（舊名）
  if (v1Info.hasOldKkday) {
    const oldPath = path.join(rulesDir, 'kkday-conventions.md')
    if (fs.existsSync(oldPath)) { fs.unlinkSync(oldPath); removed++ }
  }

  // 刪除舊 hooks.json 讓 v2 重新生成
  if (v1Info.hooksNeedsUpgrade) {
    const hooksPath = path.join(CLAUDE_DIR, 'hooks.json')
    if (fs.existsSync(hooksPath)) { fs.unlinkSync(hooksPath); removed++ }
  }

  // settings.json 不刪除 — v2 的 deploySettings 會智能合併（追加新 permissions）

  const resultLines = [`移除 ${removed} 個全局殘留`]
  if (v1Info.settingsNeedsUpgrade) resultLines.push('settings.json 將由安裝程序合併更新')
  if (v1Info.hooksNeedsUpgrade) resultLines.push('hooks.json 將重新生成（8 個 hooks）')
  resultLines.push('專案級配置將由 setup 重新生成到各 repo')
  p.log.success(`升級完成：${resultLines.join('，')}`)
}

async function doClean() {
  // 先備份所有內容
  p.log.info('備份現有配置...')
  await Promise.all([
    backupIfExists(path.join(CLAUDE_DIR, 'commands'), 'clean/commands'),
    backupIfExists(path.join(CLAUDE_DIR, 'agents'), 'clean/agents'),
    backupIfExists(path.join(CLAUDE_DIR, 'rules'), 'clean/rules'),
    backupIfExists(path.join(CLAUDE_DIR, 'hooks.json'), 'clean/hooks.json'),
    backupIfExists(path.join(CLAUDE_DIR, 'settings.json'), 'clean/settings.json'),
    backupIfExists(path.join(CLAUDE_DIR, 'keybindings.json'), 'clean/keybindings.json'),
  ])

  let removed = 0

  // 清除 commands/agents/rules 中的 .md 文件
  for (const dir of ['commands', 'agents', 'rules']) {
    const fullDir = path.join(CLAUDE_DIR, dir)
    if (fs.existsSync(fullDir)) {
      const files = fs.readdirSync(fullDir).filter(f => f.endsWith('.md'))
      for (const f of files) { fs.unlinkSync(path.join(fullDir, f)); removed++ }
    }
  }

  // 清除 hooks.json、settings.json、keybindings.json
  for (const file of ['hooks.json', 'settings.json', 'keybindings.json']) {
    const filePath = path.join(CLAUDE_DIR, file)
    if (fs.existsSync(filePath)) { fs.unlinkSync(filePath); removed++ }
  }

  p.log.success(`清除完成：移除 ${removed} 個檔案（已備份到 dist/backup/），將全部重新安裝`)
}
