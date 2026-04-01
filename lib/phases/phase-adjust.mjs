/**
 * 配置快速調整
 *
 * 職責：
 *   提供 5 個獨立調整函式，每個函式：
 *     1. 備份現有配置（可選）
 *     2. 執行安裝/重寫
 *     3. patchSession() 只更新相關欄位
 *
 *   不走完整 phaseAnalyze（無 GitHub API / AI 呼叫），
 *   僅 CLAUDE.md 重新生成時例外（需 AI）。
 */

import * as p from '@clack/prompts'
import fs from 'fs'
import path from 'path'
import os from 'os'
import pc from 'picocolors'
import { execSync } from 'child_process'
import { patchSession, loadSession } from '../core/session.mjs'
import { getDirname } from '../core/paths.mjs'

const __dirname = getDirname(import.meta)
const REPO = path.resolve(__dirname, '../..')
const CLAUDE_DIR = path.join(os.homedir(), '.claude')

function backupIfExists(src, dest) {
  if (fs.existsSync(src)) {
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.cpSync(src, dest, { recursive: true })
  }
}

function run(cmd, cwd = REPO) {
  try {
    execSync(cmd, { stdio: 'inherit', cwd })
    return true
  } catch { return false }
}

const TIMESTAMP = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)

/**
 * 調整 1：重新安裝 Claude commands / agents / rules / hooks
 *
 * @param {Object} opts
 * @param {boolean} opts.flagAll - 跳過互動全選
 * @param {boolean} opts.manual - 只 preview，不部署
 */
export async function adjustClaude({ flagAll = false, manual = false } = {}) {
  const s = p.spinner()
  s.start('🗂️ 備份現有 Claude 配置...')
  const ts = TIMESTAMP()
  backupIfExists(path.join(CLAUDE_DIR, 'commands'), path.join(REPO, 'dist', 'backup', ts, 'claude', 'commands'))
  backupIfExists(path.join(CLAUDE_DIR, 'agents'),   path.join(REPO, 'dist', 'backup', ts, 'claude', 'agents'))
  backupIfExists(path.join(CLAUDE_DIR, 'rules'),    path.join(REPO, 'dist', 'backup', ts, 'claude', 'rules'))
  s.stop('✅ 備份完成')

  const { handleInstallClaude } = await import('../install/install-claude.mjs')
  const session = loadSession()
  const previewDir = path.join(REPO, 'dist', 'preview')
  const step = {
    script: 'bash scripts/install-claude.sh',
    selectable: {
      commands: { dir: 'claude/commands', ext: '.md', dest: `${CLAUDE_DIR}/commands` },
      agents:   { dir: 'claude/agents',   ext: '.md', dest: `${CLAUDE_DIR}/agents` },
      rules:    { dir: 'claude/rules',    ext: '.md', dest: `${CLAUDE_DIR}/rules` },
    },
  }
  const result = await handleInstallClaude(REPO, previewDir, step, '[調整] ', flagAll, manual, [], session)
  if (result) await patchSession({ install: { ...(loadSession()?.install || {}), claude: result } })
}

/**
 * 調整 2：重新套用全局設定（settings.json）
 */
export async function adjustGlobalSettings() {
  const s = p.spinner()
  s.start('⚙️ 套用全局設定...')
  try {
    const { deploySettings } = await import('../deploy/deploy-global.mjs')
    const templatePath = path.join(REPO, 'claude', 'settings-template.json')
    if (!fs.existsSync(templatePath)) { s.stop('settings-template.json 不存在'); return }
    const settingsTemplate = JSON.parse(fs.readFileSync(templatePath, 'utf8'))
    const settingsResult = deploySettings(settingsTemplate)
    s.stop(`全局設定已套用  ${pc.dim(`settings +${settingsResult.permissionsAdded} 規則`)}`)
    await patchSession({ adjustedAt: new Date().toISOString() })
  } catch (err) {
    s.stop(`全局設定套用失敗：${err.message?.slice(0, 60)}`)
  }
}

/**
 * 調整 3：重新設定 Slack 通知
 */
export async function adjustSlack() {
  const { setupSlackNotify } = await import('../slack/slack-setup.mjs')
  const session = loadSession()
  const result = await setupSlackNotify(session?.slack)
  if (result) await patchSession({ slack: { slackChannel: result.channelId, slackMode: result.mode } })
}

/**
 * 調整 4：重新生成 CLAUDE.md（需 AI，會先詢問用戶確認）
 *
 * @param {Object} opts
 * @param {boolean} opts.skipConfirm - 跳過確認提示
 */
export async function adjustClaudeMd({ skipConfirm = false } = {}) {
  if (!skipConfirm) {
    const ok = await p.confirm({
      message: '🤖 重新生成 CLAUDE.md 需要 AI 呼叫（約 30 秒），繼續？  Y 確認 · n 取消',
      initialValue: true,
    })
    if (p.isCancel(ok) || !ok) return
  }

  const session = loadSession()
  if (!session?.repos?.length) {
    p.log.warn('沒有 session repos 資料，請重新執行 pnpm run setup')
    return
  }

  const s = p.spinner()
  s.start('📝 重新生成 CLAUDE.md...')
  const { generateClaudeMd } = await import('../deploy/generate-claude-md.mjs')
  const { deployAllProjectClaudeMd } = await import('../deploy/deploy-project.mjs')

  const items = []
  const skipped = []
  for (const repo of session.repos) {
    const localPath = session.localPaths?.[repo]
    if (!localPath) { skipped.push(repo); continue }
    const role = session.roles?.[repo] || 'main'
    const content = await generateClaudeMd({
      repoName: repo.split('/').pop(),
      role,
      reasoning: '',
      stacks: {},
      meta: { description: '' },
    })
    items.push({ localPath, content, repo })
  }

  const result = deployAllProjectClaudeMd(items)
  const skipMsg = skipped.length ? `  ${pc.dim(`跳過 ${skipped.length} 個無本機路徑的 repo`)}` : ''
  s.stop(`CLAUDE.md 已生成（${result.deployed.length} 個 repo）${skipMsg}`)
  await patchSession({ claudeMdUpdatedAt: new Date().toISOString() })
}

/**
 * 調整 5：重新安裝 ZSH 模組
 *
 * @param {Object} opts
 * @param {boolean} opts.flagAll - 跳過互動全選
 * @param {boolean} opts.manual - 只 preview，不部署
 */
export async function adjustZsh({ flagAll = false, manual = false } = {}) {
  const s = p.spinner()
  s.start('🗂️ 備份現有 zsh 配置...')
  const ts = TIMESTAMP()
  backupIfExists(path.join(os.homedir(), '.zsh', 'modules'), path.join(REPO, 'dist', 'backup', ts, 'zsh', 'modules'))
  s.stop('✅ 備份完成')

  const { handleInstallModules } = await import('../install/install-modules.mjs')
  const session = loadSession()
  const previewDir = path.join(REPO, 'dist', 'preview')
  const step = {
    script: 'zsh zsh/install.sh',
    selectable: {
      modules: { dir: 'zsh/modules', ext: '.zsh', dest: `${os.homedir()}/.zsh/modules` },
    },
  }
  const result = await handleInstallModules(REPO, previewDir, step, '[調整] ', flagAll, manual, session)
  if (result) await patchSession({ install: { ...(loadSession()?.install || {}), modules: result.modules } })
}
