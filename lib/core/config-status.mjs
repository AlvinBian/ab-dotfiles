/**
 * 配置狀態掃描
 *
 * 職責：
 *   純 fs 掃描（無網路呼叫），回傳 ConfigStatus 結構，
 *   供 bin/status.mjs 展示 + phase-adjust.mjs 決定是否需要安裝。
 *
 * ConfigStatus 結構：
 *   {
 *     claude:   { expected, installed, missing, extra }
 *     zsh:      { expected, installed, missing }
 *     slack:    { mode, channel }
 *     env:      { aiModel, slackMode }
 *     summary:  { ok, total, pct }
 *   }
 */

import fs from 'fs'
import path from 'path'
import os from 'os'
import { getDirname } from './paths.mjs'
import { ALL_COMMANDS, ALL_AGENTS, ALL_RULES } from '../config/config-classifier.mjs'

const __dirname = getDirname(import.meta)
const REPO = path.resolve(__dirname, '../..')
const CLAUDE_DIR = path.join(os.homedir(), '.claude')
const ZSH_MODULES_DIR = path.join(os.homedir(), '.zsh', 'modules')

const ALL_ZSH_MODULES = [
  'aliases', 'completion', 'fzf', 'git', 'history',
  'keybindings', 'nvm', 'plugins', 'pnpm', 'tools',
]

/**
 * 掃描目錄中的 .md 檔案（去副檔名）
 * @param {string} dir
 * @returns {string[]}
 */
function scanMdFiles(dir) {
  try {
    return fs.readdirSync(dir)
      .filter(f => f.endsWith('.md'))
      .map(f => f.replace(/\.md$/, ''))
  } catch {
    return []
  }
}

/**
 * 掃描目錄中的 .zsh 檔案（去副檔名）
 * @param {string} dir
 * @returns {string[]}
 */
function scanZshFiles(dir) {
  try {
    return fs.readdirSync(dir)
      .filter(f => f.endsWith('.zsh'))
      .map(f => f.replace(/\.zsh$/, ''))
  } catch {
    return []
  }
}

/**
 * 讀取 .env 中的 key=value
 * @returns {Object}
 */
function loadEnvValues() {
  const envPath = path.join(REPO, '.env')
  const result = {}
  try {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n')
    for (const line of lines) {
      const m = line.match(/^([A-Z_]+)=(.*)$/)
      if (m) result[m[1]] = m[2].trim()
    }
  } catch { /* no .env */ }
  return result
}

/**
 * 計算已安裝配置的健康狀態
 *
 * @returns {Object} ConfigStatus
 */
export function getConfigStatus() {
  // ── Claude 配置 ──
  const installedCommands = scanMdFiles(path.join(CLAUDE_DIR, 'commands'))
  const installedAgents   = scanMdFiles(path.join(CLAUDE_DIR, 'agents'))
  const installedRules    = scanMdFiles(path.join(CLAUDE_DIR, 'rules'))

  const claudeExpected = [...ALL_COMMANDS, ...ALL_AGENTS, ...ALL_RULES]
  const claudeInstalled = [...installedCommands, ...installedAgents, ...installedRules]
  const claudeMissing = claudeExpected.filter(x => !claudeInstalled.includes(x))
  const claudeExtra = claudeInstalled.filter(x => !claudeExpected.includes(x))

  // ── ZSH 模組 ──
  const installedZsh = scanZshFiles(ZSH_MODULES_DIR)
  const zshMissing = ALL_ZSH_MODULES.filter(m => !installedZsh.includes(m))

  // ── Slack 配置 ──
  const env = loadEnvValues()
  const slack = {
    mode: env.SLACK_NOTIFY_MODE || null,
    channel: env.SLACK_NOTIFY_CHANNEL || null,
  }

  // ── CLAUDE.md 數量 ──
  let claudeMdCount = 0
  const projectsDir = path.join(CLAUDE_DIR, 'projects')
  const walk = (dir, depth = 0) => {
    if (depth > 5) return
    let entries
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      if (entry.isDirectory()) walk(path.join(dir, entry.name), depth + 1)
      else if (entry.name === 'CLAUDE.md') claudeMdCount++
    }
  }
  walk(projectsDir)

  // ── 摘要 ──
  const total = claudeExpected.length + ALL_ZSH_MODULES.length
  const missing = claudeMissing.length + zshMissing.length
  const ok = total - missing
  const pct = total > 0 ? Math.round(ok / total * 100) : 100

  return {
    claude: {
      expected: claudeExpected,
      installed: claudeInstalled,
      installedCommands,
      installedAgents,
      installedRules,
      missing: claudeMissing,
      extra: claudeExtra,
    },
    claudeMd: { count: claudeMdCount },
    zsh: {
      expected: ALL_ZSH_MODULES,
      installed: installedZsh,
      missing: zshMissing,
    },
    slack,
    env: {
      aiModel: env.AI_REPO_MODEL || null,
      slackMode: env.SLACK_NOTIFY_MODE || null,
    },
    summary: { ok, total, missing, pct },
  }
}
