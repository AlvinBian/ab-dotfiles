#!/usr/bin/env node
/**
 * ab-dotfiles 統一安裝 CLI
 * 使用 @clack/prompts 提供美觀的互動式選單
 *
 * 用法：
 *   pnpm run setup              ← 互動式選擇
 *   pnpm run setup -- --all     ← 全部安裝（claude-dev + slack + zsh，非互動）
 *   pnpm run setup -- --claude  ← 只安裝 Claude 開發規則
 *   pnpm run setup -- --slack   ← 只安裝 Slack 格式工具
 *   pnpm run setup -- --zsh     ← 只安裝 zsh 環境模組
 */

import * as p from '@clack/prompts'
import { spawnSync } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '..')

// ── Claude 模組定義 ─────────────────────────────────────────────
const CLAUDE_COMMANDS = [
  { value: 'auto-setup',        label: '/auto-setup',        hint: '專案環境自動檢測與配置推薦' },
  { value: 'code-review',       label: '/code-review',       hint: 'KKday 規範深度審查（Vue/TS/PHP）' },
  { value: 'kkday-conventions', label: '/kkday-conventions', hint: '開發規範查詢' },
  { value: 'pr-workflow',       label: '/pr-workflow',       hint: '分支 → commit → PR 全流程' },
  { value: 'test-gen',          label: '/test-gen',          hint: '自動生成 Vitest / Jest 測試' },
  { value: 'slack-formatting',  label: '/slack-formatting',  hint: 'Slack mrkdwn 格式化' },
  { value: 'draft-slack',       label: '/draft-slack',       hint: '生成結構化 Slack 訊息' },
  { value: 'review-slack',      label: '/review-slack',      hint: '檢查 Slack 訊息格式' },
]

const CLAUDE_AGENTS = [
  { value: 'explorer', label: '@explorer', hint: '快速掃描 codebase（Haiku，省 token）' },
  { value: 'reviewer', label: '@reviewer', hint: '深度程式碼審查（Sonnet）' },
]

const SLACK_COMMANDS = [
  { value: 'draft-slack',      label: '/draft-slack',      hint: '生成結構化 Slack 訊息' },
  { value: 'review-slack',     label: '/review-slack',     hint: '檢查 Slack 訊息格式' },
  { value: 'slack-formatting', label: '/slack-formatting', hint: 'Slack mrkdwn 格式化' },
]

// ── zsh 環境模組定義（10 模組，brew 原生）───────────────────────
const ZSH_MODULES = [
  { value: 'aliases',     label: 'aliases',     hint: '編輯器自動偵測（Kiro/Cursor/VSCode）+ open -e + gh / uv + 通用 aliases' },
  { value: 'completion',  label: 'completion',  hint: 'zsh 補全系統（menu select、大小寫不敏感）' },
  { value: 'fzf',         label: 'fzf',         hint: 'FZF key-bindings（Ctrl+R/T / Alt+C）+ fd + bat 預覽' },
  { value: 'git',         label: 'git',         hint: 'Git aliases + delta diff viewer + lazygit' },
  { value: 'history',     label: 'history',     hint: '歷史記錄（50000 筆，去重、跨 session 共享）' },
  { value: 'keybindings', label: 'keybindings', hint: '按鍵綁定（Alt+←/→、Ctrl+←/→、↑↓前綴搜尋）' },
  { value: 'nvm',         label: 'nvm',         hint: 'Node 版本管理（lazy load，支援 nvm / n，自動讀取 .nvmrc）' },
  { value: 'plugins',     label: 'plugins',     hint: 'autosuggestions + syntax-highlighting（brew）+ starship + IDE' },
  { value: 'pnpm',        label: 'pnpm',        hint: 'PNPM_HOME PATH 設定' },
  { value: 'tools',       label: 'tools',       hint: '現代 CLI（bat / eza / zoxide / fd / ripgrep / tldr）' },
]

// ── 工具函式 ────────────────────────────────────────────────────
function run(cmd, { cwd = REPO, stdio = 'inherit' } = {}) {
  const result = spawnSync(cmd, { shell: true, cwd, stdio })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

// 不 exit，失敗時拋出例外供 try/catch 使用
function runSafe(cmd, { cwd = REPO, stdio = 'inherit' } = {}) {
  const result = spawnSync(cmd, { shell: true, cwd, stdio })
  if (result.status !== 0) throw new Error(`exit ${result.status}`)
}

function handleCancel(value) {
  if (p.isCancel(value)) {
    p.cancel('已取消安裝')
    process.exit(0)
  }
  return value
}

/**
 * multiselect 加入「全部選擇」第一項
 * 若使用者選了 __all__，自動展開為所有項目的 value
 */
async function multiselectWithAll({ message, options, required = false }) {
  const ALL_VALUE = '__all__'
  const allOption = { value: ALL_VALUE, label: '全部選擇', hint: '選擇所有項目' }

  const result = handleCancel(await p.multiselect({
    message,
    options: [allOption, ...options],
    required,
  }))

  if (result.includes(ALL_VALUE)) {
    return options.map(o => o.value)
  }
  return result
}

// ── 解析參數 ────────────────────────────────────────────────────
const args = process.argv.slice(2)
const FLAG_ALL    = args.includes('--all')
const FLAG_CLAUDE = args.includes('--claude')
const FLAG_SLACK  = args.includes('--slack')
const FLAG_ZSH    = args.includes('--zsh')

// ── 主程式 ──────────────────────────────────────────────────────
async function main() {
  console.log()
  p.intro(' ab-dotfiles 安裝精靈 ')

  // ── 選擇安裝目標 ─────────────────────────────────────────────
  let targets

  if (FLAG_ALL) {
    targets = ['claude-dev', 'slack', 'zsh']
  } else if (FLAG_CLAUDE) {
    targets = ['claude-dev']
  } else if (FLAG_SLACK) {
    targets = ['slack']
  } else if (FLAG_ZSH) {
    targets = ['zsh']
  } else {
    targets = await multiselectWithAll({
      message: '選擇要安裝的項目',
      options: [
        { value: 'claude-dev', label: 'claude code 開發規則', hint: 'commands / agents / hooks / rules → ~/.claude/ + 生成 ab-claude-dev.plugin' },
        { value: 'slack',      label: 'Slack 格式工具',       hint: 'slack commands / rules → ~/.claude/ + 生成 ab-slack-message.plugin' },
        { value: 'zsh',        label: 'zsh 環境模組',         hint: 'modules → ~/.zsh/modules/ + ~/.zshrc' },
      ],
      required: true,
    })
  }

  // ── Claude 安裝流程 ──────────────────────────────────────────
  if (targets.includes('claude-dev')) {
    const si = targets.indexOf('claude-dev') + 1
    const sn = targets.length
    const sp = sn > 1 ? `[${si}/${sn}] ` : ''

    // 選擇 commands
    const selectedCommands = FLAG_ALL
      ? CLAUDE_COMMANDS.map(c => c.value)
      : await multiselectWithAll({
          message: `${sp}claude code › Slash Commands（/xxx）`,
          options: CLAUDE_COMMANDS,
        })

    // 選擇 agents
    const selectedAgents = FLAG_ALL
      ? CLAUDE_AGENTS.map(a => a.value)
      : await multiselectWithAll({
          message: `${sp}claude code › Agents（@xxx）`,
          options: CLAUDE_AGENTS,
        })

    // 安裝 hooks
    const installHooks = FLAG_ALL
      ? true
      : handleCancel(await p.confirm({
          message: `${sp}claude code › 安裝 Hooks（PostToolUse / PreToolUse / SessionStart / Stop）？`,
          initialValue: true,
        }))

    // 執行安裝
    const s = p.spinner()
    const hooksLabel = installHooks ? ' · hooks' : ''
    s.start(`${sp}[1/2] 安裝 ${selectedCommands.length} commands · ${selectedAgents.length} agents${hooksLabel} · rules → ~/.claude/`)

    const cmdsArg   = selectedCommands.join(',')
    const agentsArg = selectedAgents.join(',')
    const hooksFlag = installHooks ? '--hooks' : ''

    run(`bash scripts/install-claude.sh --commands "${cmdsArg}" --agents "${agentsArg}" --rules "all" ${hooksFlag}`, { stdio: 'pipe' })

    s.stop(`${sp}[1/2] ✔ ${selectedCommands.length} commands · ${selectedAgents.length} agents${hooksLabel} · rules 已安裝`)

    // ── 生成 ab-claude-dev.plugin ─────────────────────────────────
    console.log()
    const s2 = p.spinner()
    s2.start(`${sp}[2/2] 打包 ab-claude-dev.plugin（含 KKday 上下文，需約 30 秒）...`)
    try {
      runSafe('bash scripts/build-claude-dev-plugin.sh', { stdio: 'pipe' })
      s2.stop(`${sp}[2/2] ✔ ab-claude-dev.plugin 打包完成 → dist/ab-claude-dev.plugin`)
    } catch (e) {
      s2.stop(`${sp}[2/2] plugin 打包失敗，略過`)
      p.log.warn(e.message)
    }
  }

  // ── Slack 安裝流程 ────────────────────────────────────────────
  if (targets.includes('slack')) {
    const si = targets.indexOf('slack') + 1
    const sn = targets.length
    const sp = sn > 1 ? `[${si}/${sn}] ` : ''

    const claudeDevAlreadyRan = targets.includes('claude-dev')

    if (!claudeDevAlreadyRan) {
      const installHooksSlack = handleCancel(await p.confirm({
        message: `${sp}Slack › 安裝通用 Hooks（PostToolUse / PreToolUse / SessionStart / Stop）？`,
        initialValue: false,
      }))

      const s = p.spinner()
      const slackHooksLabel = installHooksSlack ? ' · hooks' : ''
      s.start(`${sp}[1/2] 安裝 ${SLACK_COMMANDS.length} Slack commands · slack-mrkdwn rule${slackHooksLabel} → ~/.claude/`)

      const slackCmds = SLACK_COMMANDS.map(c => c.value).join(',')
      const hooksFlag = installHooksSlack ? '--hooks' : ''

      run(`bash scripts/install-claude.sh --commands "${slackCmds}" --rules "slack-mrkdwn" ${hooksFlag}`, { stdio: 'pipe' })

      s.stop(`${sp}[1/2] ✔ ${SLACK_COMMANDS.length} commands · slack-mrkdwn rule${slackHooksLabel} 已安裝`)
    } else {
      p.log.info(`${sp}[1/2] claude-dev 已安裝全部設定，略過 Slack 獨立安裝步驟`)
    }

    // ── 生成 ab-slack-message.plugin ─────────────────────────────
    console.log()
    const s2 = p.spinner()
    s2.start(`${sp}[2/2] 打包 ab-slack-message.plugin...`)
    try {
      runSafe('bash scripts/build-slack-plugin.sh', { stdio: 'pipe' })
      s2.stop(`${sp}[2/2] ✔ ab-slack-message.plugin 打包完成 → dist/ab-slack-message.plugin`)
    } catch (e) {
      s2.stop(`${sp}[2/2] plugin 打包失敗，略過`)
      p.log.warn(e.message)
    }
  }

  // ── Zsh 安裝流程 ─────────────────────────────────────────────
  if (targets.includes('zsh')) {
    const si = targets.indexOf('zsh') + 1
    const sn = targets.length
    const sp = sn > 1 ? `[${si}/${sn}] ` : ''

    const selectedModules = FLAG_ALL
      ? ZSH_MODULES.map(m => m.value)
      : await multiselectWithAll({
          message: `${sp}zsh › 選擇要安裝的環境模組`,
          options: ZSH_MODULES,
        })

    if (selectedModules.length > 0) {
      const s = p.spinner()
      s.start(`${sp}安裝 ${selectedModules.length}/${ZSH_MODULES.length} 個 zsh 模組 → ~/.zsh/modules/`)

      run(`zsh zsh/install.sh --modules "${selectedModules.join(',')}"`, { stdio: 'pipe' })

      s.stop(`${sp}✔ ${selectedModules.length} 個 zsh 模組已安裝（${selectedModules.join('、')}）`)
    }
  }

  // ── 完成 ─────────────────────────────────────────────────────
  const outroMsg = targets.includes('zsh')
    ? '✅ 安裝完成！執行 source ~/.zshrc 讓 zsh 設定生效'
    : '✅ 安裝完成！'
  p.outro(outroMsg)
}

main().catch((e) => {
  p.log.error(e.message)
  process.exit(1)
})
