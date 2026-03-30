/**
 * 舊配置偵測與清理
 *
 * 偵測舊版安裝痕跡，自動清理。
 */

import fs from 'fs'
import path from 'path'
import * as p from '@clack/prompts'
import pc from 'picocolors'
import { GLOBAL_COMMANDS, GLOBAL_AGENTS, GLOBAL_RULES, LEGACY_PROJECT_COMMANDS, LEGACY_PROJECT_AGENTS, LEGACY_PROJECT_RULES } from './config-classifier.mjs'
import { handleCancel, BACK } from '../cli/prompts.mjs'
import { backupIfExists } from '../core/backup.mjs'
import { descBullet } from './descriptions.mjs'

const HOME = process.env.HOME
const CLAUDE_DIR = path.join(HOME, '.claude')

// ab-dotfiles 管理的所有配置名稱（所有版本）
const ALL_MANAGED = {
  commands: new Set([...GLOBAL_COMMANDS, ...LEGACY_PROJECT_COMMANDS]),
  agents: new Set([...GLOBAL_AGENTS, ...LEGACY_PROJECT_AGENTS]),
  rules: new Set([...GLOBAL_RULES, ...LEGACY_PROJECT_RULES, 'kkday-conventions']),
}

/**
 * 偵測是否有舊版安裝痕跡
 *
 * 判斷依據：
 * 1. 專案級配置出現在全局目錄（舊版不分層）
 * 2. 舊的 kkday-conventions（已重命名）
 * 3. settings.json 缺少 新版的 permissions/keybindings
 * 4. hooks.json 缺少 新版的 hooks
 */
export function detectLegacyInstallation() {
  const commandsDir = path.join(CLAUDE_DIR, 'commands')
  const agentsDir = path.join(CLAUDE_DIR, 'agents')
  const rulesDir = path.join(CLAUDE_DIR, 'rules')

  // 沒有任何 claude 配置 = 全新安裝，不需要升級
  if (!fs.existsSync(commandsDir) && !fs.existsSync(agentsDir) && !fs.existsSync(rulesDir)) {
    return { hasLegacy: false }
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
  const projectCommandsInGlobal = existingCommands.filter(c => LEGACY_PROJECT_COMMANDS.includes(c))
  const projectAgentsInGlobal = existingAgents.filter(a => LEGACY_PROJECT_AGENTS.includes(a))
  const projectRulesInGlobal = existingRules.filter(r => LEGACY_PROJECT_RULES.includes(r))

  // 舊名稱
  const hasOldKkday = existingRules.includes('kkday-conventions')

  // 檢查 settings.json 是否缺少 新版欄位
  const settingsPath = path.join(CLAUDE_DIR, 'settings.json')
  let settingsNeedsUpgrade = false
  if (fs.existsSync(settingsPath)) {
    try {
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'))
      // 新版新增：permissions.deny、autoMemoryEnabled
      if (!settings.permissions?.deny?.length || settings.autoMemoryEnabled === undefined) {
        settingsNeedsUpgrade = true
      }
    } catch { /* 無法解析也算需要升級 */ }
  }

  // 檢查 hooks.json 是否需要更新
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
    return { hasLegacy: false }
  }

  return {
    hasLegacy: true,
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
 * 執行升級遷移（互動式）
 *
 * 顯示需要清理的舊配置詳細清單，讓用戶選擇處理方式：
 *   - upgrade: 備份 → 清理舊配置 → 更新 settings/hooks（推薦）
 *   - keep: 跳過，保留舊配置
 *   - clean: 備份 → 清空 ~/.claude/ → 從零開始
 *
 * @param {Object} legacyInfo - detectLegacyInstallation 返回的偵測結果
 * @returns {Promise<'upgraded'|'cleaned'|'skip'>} 用戶選擇的執行結果
 */
export async function runUpgrade(legacyInfo) {
  // 層級結構展示
  const lines = []
  let idx = 1

  const cd = CLAUDE_DIR
  if (legacyInfo.totalProjectItems > 0) {
    lines.push(`${idx}. 清理全局中的專案級配置`)
    if (legacyInfo.projectCommandsInGlobal.length) {
      lines.push(`   ${idx}.1 Commands（${legacyInfo.projectCommandsInGlobal.length}）`)
      legacyInfo.projectCommandsInGlobal.forEach(c => lines.push(descBullet(c, 'commands', cd)))
    }
    if (legacyInfo.projectAgentsInGlobal.length) {
      lines.push(`   ${idx}.2 Agents（${legacyInfo.projectAgentsInGlobal.length}）`)
      legacyInfo.projectAgentsInGlobal.forEach(a => lines.push(descBullet(a, 'agents', cd)))
    }
    if (legacyInfo.projectRulesInGlobal.length) {
      lines.push(`   ${idx}.3 Rules（${legacyInfo.projectRulesInGlobal.length}）`)
      legacyInfo.projectRulesInGlobal.forEach(r => lines.push(descBullet(r, 'rules', cd)))
    }
    idx++
  }

  if (legacyInfo.hasOldKkday) {
    lines.push(`${idx}. 重命名：kkday-conventions → project-conventions`)
    idx++
  }
  if (legacyInfo.settingsNeedsUpgrade) {
    lines.push(`${idx}. 更新 settings.json（補充權限規則）`)
    idx++
  }
  if (legacyInfo.hooksNeedsUpgrade) {
    lines.push(`${idx}. 更新 hooks.json（舊版 5 個 → 新版 10 個）`)
    idx++
  }

  // 用戶自訂配置（帶序號）
  const customCount = legacyInfo.userCustomCommands.length + legacyInfo.userCustomAgents.length + legacyInfo.userCustomRules.length
  if (customCount > 0) {
    lines.push('')
    lines.push(`${idx}. ⚠ ${customCount} 個非 ab-dotfiles 的自訂配置（不會刪除）`)
    let ci = 1
    if (legacyInfo.userCustomCommands.length) {
      lines.push(`   ${idx}.${ci} Commands（${legacyInfo.userCustomCommands.length}）`)
      legacyInfo.userCustomCommands.forEach(c => lines.push(descBullet(c, 'commands', cd)))
      ci++
    }
    if (legacyInfo.userCustomAgents.length) {
      lines.push(`   ${idx}.${ci} Agents（${legacyInfo.userCustomAgents.length}）`)
      legacyInfo.userCustomAgents.forEach(a => lines.push(descBullet(a, 'agents', cd)))
      ci++
    }
    if (legacyInfo.userCustomRules.length) {
      lines.push(`   ${idx}.${ci} Rules（${legacyInfo.userCustomRules.length}）`)
      legacyInfo.userCustomRules.forEach(r => lines.push(descBullet(r, 'rules', cd)))
    }
  }

  p.log.info(`偵測到舊配置，建議清理後重新安裝：\n${lines.join('\n')}`)

  const action = handleCancel(await p.select({
    message: '舊配置處理',
    options: [
      { value: 'upgrade', label: '清除殘留配置（推薦）', hint: '備份 → 清理舊配置 → 更新 settings/hooks' },
      { value: 'keep', label: '保留不動', hint: '跳過，可能有重複配置' },
      { value: 'clean', label: '全部清除，重新安裝', hint: '備份 → 清空 ~/.claude/ → 從零開始' },
    ],
  }))

  if (action === BACK) return 'skip'

  if (action === 'upgrade') {
    await doUpgrade(legacyInfo)
    return 'upgraded'
  }

  if (action === 'clean') {
    await doClean()
    return 'cleaned'
  }

  return 'skip'
}

/**
 * 執行增量升級：先備份，再移除殘留在全局目錄的舊版專案級配置
 *
 * 只刪除 ab-dotfiles 管理的配置，保留用戶自訂項目。
 * settings.json 不刪除，由後續 deploySettings 做智能合併。
 *
 * @param {Object} legacyInfo - detectLegacyInstallation 返回的偵測結果
 * @returns {Promise<void>}
 */
async function doUpgrade(legacyInfo) {
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
  for (const name of legacyInfo.projectCommandsInGlobal) {
    const filePath = path.join(commandsDir, `${name}.md`)
    if (fs.existsSync(filePath)) { fs.unlinkSync(filePath); removed++ }
  }

  // 移除全局中的專案級 agents
  for (const name of legacyInfo.projectAgentsInGlobal) {
    const filePath = path.join(agentsDir, `${name}.md`)
    if (fs.existsSync(filePath)) { fs.unlinkSync(filePath); removed++ }
  }

  // 移除全局中的專案級 rules
  for (const name of legacyInfo.projectRulesInGlobal) {
    const filePath = path.join(rulesDir, `${name}.md`)
    if (fs.existsSync(filePath)) { fs.unlinkSync(filePath); removed++ }
  }

  // 移除 kkday-conventions（舊名）
  if (legacyInfo.hasOldKkday) {
    const oldPath = path.join(rulesDir, 'kkday-conventions.md')
    if (fs.existsSync(oldPath)) { fs.unlinkSync(oldPath); removed++ }
  }

  // 刪除舊 hooks.json 讓安裝程序重新生成
  if (legacyInfo.hooksNeedsUpgrade) {
    const hooksPath = path.join(CLAUDE_DIR, 'hooks.json')
    if (fs.existsSync(hooksPath)) { fs.unlinkSync(hooksPath); removed++ }
  }

  // settings.json 不刪除 — deploySettings 會智能合併（追加新 permissions）

  const resultLines = [`移除 ${removed} 個全局殘留`]
  if (legacyInfo.settingsNeedsUpgrade) resultLines.push('settings.json 將由安裝程序合併更新')
  if (legacyInfo.hooksNeedsUpgrade) resultLines.push('hooks.json 將重新生成（10 個 hooks）')
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

  p.log.success(`清除完成：移除 ${removed} 個檔案（已備份到 dist/backup/）\n繼續安裝以重新配置，或執行 pnpm run restore 還原備份`)
}
