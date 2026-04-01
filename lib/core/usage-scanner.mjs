/**
 * 使用情況掃描器 — 從 Claude session JSONL 提取 command/agent 使用統計
 *
 * 掃描 ~/.claude/projects/ 下所有 .jsonl 檔案（排除 subagents/），
 * 只統計 human 角色的訊息，提取 /command 和 @agent 調用。
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import readline from 'readline'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '../..')
const HOME = process.env.HOME
const PROJECTS_DIR = path.join(HOME, '.claude', 'projects')

/**
 * 掃描所有 JSONL session 檔案，提取使用統計
 *
 * @returns {Promise<{
 *   commands: Map<string, { count: number, lastUsed: string|null }>,
 *   agents: Map<string, { count: number, lastUsed: string|null }>,
 *   sessions: { total: number, byProject: Map<string, number>, dailyCounts: Map<string, number> }
 * }>}
 */
export async function scanUsage() {
  const commands = new Map()
  const agents = new Map()
  const sessions = { total: 0, byProject: new Map(), dailyCounts: new Map() }

  if (!fs.existsSync(PROJECTS_DIR)) return { commands, agents, sessions }

  const projectDirs = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())

  for (const projectDir of projectDirs) {
    const projectPath = path.join(PROJECTS_DIR, projectDir.name)
    const jsonlFiles = fs.readdirSync(projectPath)
      .filter(f => f.endsWith('.jsonl') && !f.includes('subagent'))

    sessions.byProject.set(projectDir.name, jsonlFiles.length)
    sessions.total += jsonlFiles.length

    for (const file of jsonlFiles) {
      const filePath = path.join(projectPath, file)
      await scanJsonlFile(filePath, commands, agents, sessions)
    }
  }

  return { commands, agents, sessions }
}

/**
 * 逐行讀取 JSONL 檔案，提取 /command 和 @agent
 */
async function scanJsonlFile(filePath, commands, agents, sessions) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: fs.createReadStream(filePath, { encoding: 'utf8' }),
      crlfDelay: Infinity,
    })

    rl.on('line', (line) => {
      try {
        const obj = JSON.parse(line)
        // 只統計 human 訊息
        const role = obj.message?.role || obj.role || ''
        if (role !== 'human') return

        const timestamp = obj.timestamp || obj.message?.timestamp || null
        if (timestamp) {
          const day = timestamp.slice(0, 10) // YYYY-MM-DD
          sessions.dailyCounts.set(day, (sessions.dailyCounts.get(day) || 0) + 1)
        }

        // 提取訊息文字
        const texts = extractTexts(obj)
        for (const text of texts) {
          // /command 調用（行首或訊息開頭）
          const cmdMatches = text.match(/(?:^|\n)\s*\/([a-z][-a-z0-9]*)/g)
          if (cmdMatches) {
            for (const m of cmdMatches) {
              const name = m.replace(/^[\s\n]*\//, '')
              const entry = commands.get(name) || { count: 0, lastUsed: null }
              entry.count++
              if (timestamp && (!entry.lastUsed || timestamp > entry.lastUsed)) entry.lastUsed = timestamp
              commands.set(name, entry)
            }
          }

          // @agent 調用
          const agentMatches = text.match(/@([a-z][-a-z0-9]*)/g)
          if (agentMatches) {
            for (const m of agentMatches) {
              const name = m.slice(1) // 去掉 @
              const entry = agents.get(name) || { count: 0, lastUsed: null }
              entry.count++
              if (timestamp && (!entry.lastUsed || timestamp > entry.lastUsed)) entry.lastUsed = timestamp
              agents.set(name, entry)
            }
          }
        }
      } catch { /* skip malformed lines */ }
    })

    rl.on('close', resolve)
    rl.on('error', resolve)
  })
}

/**
 * 從 JSONL 物件中提取所有文字內容
 */
function extractTexts(obj) {
  const texts = []
  const content = obj.message?.content || obj.content
  if (typeof content === 'string') {
    texts.push(content)
  } else if (Array.isArray(content)) {
    for (const item of content) {
      if (typeof item === 'string') texts.push(item)
      else if (item?.text) texts.push(item.text)
    }
  }
  return texts
}

/**
 * 收集完整的配置狀態 + 使用數據（供 HTML 報告和終端展示）
 */
export async function collectFullStatus() {
  const { getConfigStatus } = await import('./config-status.mjs')
  const { ALL_COMMANDS, ALL_AGENTS, ALL_RULES } = await import('../config/config-classifier.mjs')

  const configStatus = getConfigStatus()
  const usage = await scanUsage()

  // 已安裝的 commands/agents/rules
  const CLAUDE_DIR = path.join(HOME, '.claude')
  const installed = {
    commands: safeReadDir(path.join(CLAUDE_DIR, 'commands')).filter(f => f.endsWith('.md')).map(f => f.replace('.md', '')),
    agents: safeReadDir(path.join(CLAUDE_DIR, 'agents')).filter(f => f.endsWith('.md')).map(f => f.replace('.md', '')),
    rules: safeReadDir(path.join(CLAUDE_DIR, 'rules')).filter(f => f.endsWith('.md')).map(f => f.replace('.md', '')),
    disabledRules: safeReadDir(path.join(CLAUDE_DIR, 'rules')).filter(f => f.endsWith('.md.disabled')).map(f => f.replace('.md.disabled', '')),
  }

  // ECC 資源
  const eccDir = path.join(REPO_ROOT, 'ecc', 'everything-claude-code')
  const ecc = {
    commands: safeReadDir(path.join(eccDir, 'commands')).filter(f => f.endsWith('.md')).map(f => f.replace('.md', '')),
    agents: safeReadDir(path.join(eccDir, 'agents')).filter(f => f.endsWith('.md')).map(f => f.replace('.md', '')),
    rules: safeReadDir(path.join(eccDir, 'rules')).filter(f => f.endsWith('.md')).map(f => f.replace('.md', '')),
  }

  // 分類每個 command/agent/rule 的來源
  const classify = (name, allManaged, eccList) => {
    if (allManaged.includes(name)) return 'core'
    if (eccList.includes(name)) return 'ecc'
    return 'user'
  }

  const commandsDetail = installed.commands.map(name => ({
    name,
    source: classify(name, ALL_COMMANDS, ecc.commands),
    count: usage.commands.get(name)?.count || 0,
    lastUsed: usage.commands.get(name)?.lastUsed || null,
  })).sort((a, b) => b.count - a.count)

  const agentsDetail = installed.agents.map(name => ({
    name,
    source: classify(name, ALL_AGENTS, ecc.agents),
    count: usage.agents.get(name)?.count || 0,
    lastUsed: usage.agents.get(name)?.lastUsed || null,
  })).sort((a, b) => b.count - a.count)

  const rulesDetail = installed.rules.map(name => ({
    name,
    source: classify(name, ALL_RULES, ecc.rules),
    enabled: true,
  })).concat(installed.disabledRules.map(name => ({
    name,
    source: classify(name, ALL_RULES, ecc.rules),
    enabled: false,
  })))

  // Hooks
  const hooksPath = path.join(CLAUDE_DIR, 'hooks.json')
  let hooks = {}
  try { hooks = JSON.parse(fs.readFileSync(hooksPath, 'utf8')).hooks || {} } catch {}
  const hooksDetail = Object.entries(hooks).map(([event, matchers]) => ({
    event,
    subHooks: Array.isArray(matchers) ? matchers.reduce((sum, m) => sum + (m.hooks?.length || 0), 0) : 0,
  }))

  // Permissions
  const settingsPath = path.join(CLAUDE_DIR, 'settings.json')
  let permissions = { allow: [], deny: [] }
  try {
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'))
    permissions = { allow: settings.permissions?.allow || [], deny: settings.permissions?.deny || [] }
  } catch {}

  // settings-template 的 permissions（用來判斷來源）
  const templateSettingsPath = path.join(REPO_ROOT, 'claude', 'settings-template.json')
  let templatePermissions = []
  try {
    const tpl = JSON.parse(fs.readFileSync(templateSettingsPath, 'utf8'))
    templatePermissions = tpl.permissions?.allow || []
  } catch {}

  // CLAUDE.md 項目
  const projectsDir = path.join(CLAUDE_DIR, 'projects')
  const claudeMdProjects = []
  if (fs.existsSync(projectsDir)) {
    const walkProjects = (dir, depth = 0) => {
      if (depth > 5) return
      try {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          if (entry.isDirectory()) walkProjects(path.join(dir, entry.name), depth + 1)
          else if (entry.name === 'CLAUDE.md') {
            const stat = fs.statSync(path.join(dir, entry.name))
            claudeMdProjects.push({ path: dir.replace(HOME, '~'), mtime: stat.mtime.toISOString() })
          }
        }
      } catch {}
    }
    walkProjects(projectsDir)
  }

  // Plugin 構建狀態
  const distDir = path.join(REPO_ROOT, 'dist')
  const plugins = []
  const releaseDir = path.join(distDir, 'release')
  if (fs.existsSync(releaseDir)) {
    for (const f of fs.readdirSync(releaseDir)) {
      if (f.endsWith('.plugin')) {
        const stat = fs.statSync(path.join(releaseDir, f))
        plugins.push({ name: f, mtime: stat.mtime.toISOString() })
      }
    }
  }

  // 備份
  const backupDir = path.join(distDir, 'backup')
  const backups = []
  if (fs.existsSync(backupDir)) {
    for (const d of fs.readdirSync(backupDir, { withFileTypes: true })) {
      if (d.isDirectory()) backups.push(d.name)
    }
  }

  // 磁碟佔用
  const diskUsage = {
    cache: dirSize(path.join(REPO_ROOT, '.cache')),
    dist: dirSize(distDir),
    claudeProjects: dirSize(PROJECTS_DIR),
  }

  // 環境變數健康檢查
  const envTemplatePath = path.join(REPO_ROOT, '.env.template')
  const envPath = path.join(REPO_ROOT, '.env')
  const envHealth = { missing: [], extra: [], empty: [] }
  try {
    const templateVars = parseEnvKeys(fs.readFileSync(envTemplatePath, 'utf8'))
    const envVars = fs.existsSync(envPath) ? parseEnvFile(fs.readFileSync(envPath, 'utf8')) : new Map()
    for (const key of templateVars) {
      if (!envVars.has(key)) envHealth.missing.push(key)
      else if (envVars.get(key) === '') envHealth.empty.push(key)
    }
    for (const key of envVars.keys()) {
      if (!templateVars.has(key) && (key.startsWith('SLACK_') || key.startsWith('CLAUDE_SLACK_'))) continue // runtime 寫入的
      if (!templateVars.has(key)) envHealth.extra.push(key)
    }
  } catch {}

  // ZSH 模組
  const zshModulesDir = path.join(REPO_ROOT, 'zsh', 'modules')
  const zshInstalled = safeReadDir(path.join(HOME, '.zsh', 'modules')).filter(f => f.endsWith('.zsh')).map(f => f.replace('.zsh', ''))
  const zshAvailable = safeReadDir(zshModulesDir).filter(f => f.endsWith('.zsh')).map(f => f.replace('.zsh', ''))

  // Slack 配置
  const { env: envFn } = await import('./env.mjs')
  const slack = {
    mode: envFn('SLACK_NOTIFY_MODE', 'off'),
    channel: envFn('SLACK_NOTIFY_CHANNEL', ''),
    channelName: envFn('SLACK_NOTIFY_CHANNEL_NAME', ''),
  }

  // AI 設定
  const ai = {
    model: envFn('AI_MODEL', 'haiku'),
    effort: envFn('AI_EFFORT', 'low'),
    repoModel: envFn('AI_REPO_MODEL', 'sonnet'),
  }

  // 計算使用率
  const usedCommands = commandsDetail.filter(c => c.count > 0).length
  const usedAgents = agentsDetail.filter(a => a.count > 0).length
  const totalInstalled = installed.commands.length + installed.agents.length + installed.rules.length
  const totalUsed = usedCommands + usedAgents + installed.rules.length // rules 算全部使用

  return {
    overview: {
      healthPct: configStatus.summary.pct,
      totalInstalled,
      totalUsed,
      commandUsageRate: installed.commands.length > 0 ? Math.round(usedCommands / installed.commands.length * 100) : 0,
      agentUsageRate: installed.agents.length > 0 ? Math.round(usedAgents / installed.agents.length * 100) : 0,
    },
    commands: commandsDetail,
    agents: agentsDetail,
    rules: rulesDetail,
    hooks: hooksDetail,
    zsh: { installed: zshInstalled, available: zshAvailable },
    slack,
    ai,
    permissions: { allow: permissions.allow, deny: permissions.deny, templateAllow: templatePermissions },
    claudeMd: claudeMdProjects,
    plugins,
    backups,
    diskUsage,
    envHealth,
    sessions: usage.sessions,
    ecc,
    configStatus,
  }
}

// ── 工具函式 ──

function safeReadDir(dir) {
  try { return fs.readdirSync(dir) } catch { return [] }
}

function dirSize(dir) {
  let total = 0
  try {
    const walk = (d) => {
      for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, entry.name)
        if (entry.isDirectory()) walk(p)
        else try { total += fs.statSync(p).size } catch {}
      }
    }
    walk(dir)
  } catch {}
  return total
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1024 / 1024).toFixed(1) + ' MB'
}

function parseEnvKeys(content) {
  const keys = new Set()
  for (const line of content.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=/)
    if (m) keys.add(m[1])
  }
  return keys
}

function parseEnvFile(content) {
  const map = new Map()
  for (const line of content.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m) map.set(m[1], m[2])
  }
  return map
}

export { formatBytes }
