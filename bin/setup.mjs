#!/usr/bin/env node
/**
 * ab-dotfiles 統一安裝 CLI
 * 使用 @clack/prompts 提供美觀的互動式選單
 * 使用 cli-progress 提供實時安裝進度條
 *
 * 用法：
 *   pnpm run setup              ← 互動式選擇
 *   pnpm run setup -- --all     ← 全部安裝（claude-dev + slack + zsh，非互動）
 *   pnpm run setup -- --claude  ← 只安裝 Claude 開發規則
 *   pnpm run setup -- --slack   ← 只安裝 Slack 格式工具
 *   pnpm run setup -- --zsh     ← 只安裝 zsh 環境模組
 */

import * as p from '@clack/prompts'
import { spawn } from 'child_process'
import cliProgress from 'cli-progress'
import fs from 'fs'
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

// ── ANSI 清除工具 ─────────────────────────────────────────────────
const ANSI_RE = /\x1B\[[0-9;]*[mGKHF]/g
const stripAnsi = s => s.replace(ANSI_RE, '').replace(/\r/g, '')

// ── 計算 repo 內 rules 數量（用於進度 total）──────────────────────
function countRules() {
  try {
    return fs.readdirSync(path.join(REPO, 'claude/rules'))
      .filter(f => f.endsWith('.md')).length
  } catch { return 0 }
}

// ── 實時進度條執行 ───────────────────────────────────────────────
// parseProgress(cleanLine) 回傳值：
//   string                        → 進度 +1，更新狀態文字
//   { statusOnly: true, label }   → 只更新狀態文字，不計進度（如 brew 安裝）
//   null                          → 略過此行
function runWithProgress(cmd, { cwd = REPO, total, initStatus = '準備中...', parseProgress }) {
  return new Promise((resolve, reject) => {
    const bar = new cliProgress.SingleBar({
      format: '  [{bar}] {percentage}%  {value}/{total}  {status}',
      barCompleteChar: '█',
      barIncompleteChar: '░',
      hideCursor: true,
      clearOnComplete: false,
      stopOnComplete: false,
      barsize: 26,
    })
    bar.start(total, 0, { status: initStatus })

    const child = spawn(cmd, { shell: true, cwd })
    let buf = ''

    child.stdout.on('data', chunk => {
      buf += chunk.toString()
      const lines = buf.split('\n')
      buf = lines.pop()
      for (const line of lines) {
        const result = parseProgress(stripAnsi(line))
        if (result === null) continue
        if (typeof result === 'object' && result.statusOnly) {
          bar.update(bar.value, { status: result.label })
        } else if (bar.value < total) {
          bar.increment(1, { status: typeof result === 'string' ? result : result.label })
        }
      }
    })
    child.stderr.on('data', () => {})

    child.on('close', code => {
      bar.update(total, { status: '✔ 完成' })
      bar.stop()
      process.stdout.write('\n')
      code !== 0 ? reject(new Error(`exit ${code}`)) : resolve()
    })
  })
}

// ── 工具函式 ────────────────────────────────────────────────────
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

    // ── [1/2] install-claude.sh with progress ──────────────────
    const hooksLabel  = installHooks ? ' · hooks' : ''
    const cmdsArg     = selectedCommands.join(',')
    const agentsArg   = selectedAgents.join(',')
    const hooksFlag   = installHooks ? '--hooks' : ''
    const rulesCount  = countRules()
    const installTotal = selectedCommands.length + selectedAgents.length + (installHooks ? 1 : 0) + rulesCount

    console.log()
    p.log.info(`${sp}[1/2] 安裝 ${selectedCommands.length} commands · ${selectedAgents.length} agents${hooksLabel} · rules → ~/.claude/`)

    await runWithProgress(
      `bash scripts/install-claude.sh --commands "${cmdsArg}" --agents "${agentsArg}" --rules "all" ${hooksFlag}`,
      {
        total: installTotal,
        initStatus: '初始化...',
        parseProgress(line) {
          // item lines: `  ✅ /name`, `  ─ name（...）`, `  ⚠ name`
          const m = line.match(/^\s+[✅─⚠]\s+(.+?)(?:[（(]|$)/)
          return m ? m[1].trim() : null
        },
      },
    )

    p.log.success(`${sp}[1/2] ✔ ${selectedCommands.length} commands · ${selectedAgents.length} agents${hooksLabel} · rules 已安裝`)

    // ── [2/2] build-claude-dev-plugin.sh with progress ─────────
    console.log()
    p.log.info(`${sp}[2/2] 打包 ab-claude-dev.plugin（含 KKday 上下文，需約 30 秒）...`)

    const buildPhases = { skills: false, agents: false, hooks: false, rules: false, kkday: false, done: false }

    try {
      await runWithProgress(
        'bash scripts/build-claude-dev-plugin.sh',
        {
          total: 6,
          initStatus: '初始化...',
          parseProgress(line) {
            if (!buildPhases.skills && line.includes('Skills')) { buildPhases.skills = true; return '📦 Skills' }
            if (!buildPhases.agents && line.includes('Agents')) { buildPhases.agents = true; return '🤖 Agents' }
            if (!buildPhases.hooks  && line.includes('Hooks'))  { buildPhases.hooks  = true; return '🪝 Hooks'  }
            if (!buildPhases.rules  && line.includes('Rules'))  { buildPhases.rules  = true; return '📋 Rules'  }
            if (!buildPhases.kkday  && line.includes('KKday'))  { buildPhases.kkday  = true; return '🏢 KKday'  }
            if (!buildPhases.done   && line.includes('╔'))      { buildPhases.done   = true; return '✔ 完成'    }
            return null
          },
        },
      )
      p.log.success(`${sp}[2/2] ✔ ab-claude-dev.plugin 打包完成 → dist/ab-claude-dev.plugin`)
    } catch (e) {
      p.log.warn(`${sp}[2/2] plugin 打包失敗，略過`)
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

      const slackHooksLabel = installHooksSlack ? ' · hooks' : ''
      const slackCmds = SLACK_COMMANDS.map(c => c.value).join(',')
      const hooksFlag = installHooksSlack ? '--hooks' : ''
      // total: commands + 1 rule (slack-mrkdwn) + (hooks ? 1 : 0)
      const slackTotal = SLACK_COMMANDS.length + 1 + (installHooksSlack ? 1 : 0)

      console.log()
      p.log.info(`${sp}[1/2] 安裝 ${SLACK_COMMANDS.length} Slack commands · slack-mrkdwn rule${slackHooksLabel} → ~/.claude/`)

      await runWithProgress(
        `bash scripts/install-claude.sh --commands "${slackCmds}" --rules "slack-mrkdwn" ${hooksFlag}`,
        {
          total: slackTotal,
          initStatus: '初始化...',
          parseProgress(line) {
            const m = line.match(/^\s+[✅─⚠]\s+(.+?)(?:[（(]|$)/)
            return m ? m[1].trim() : null
          },
        },
      )

      p.log.success(`${sp}[1/2] ✔ ${SLACK_COMMANDS.length} commands · slack-mrkdwn rule${slackHooksLabel} 已安裝`)
    } else {
      p.log.info(`${sp}[1/2] claude-dev 已安裝全部設定，略過 Slack 獨立安裝步驟`)
    }

    // ── [2/2] build-slack-message.plugin with progress ──────────
    console.log()
    p.log.info(`${sp}[2/2] 打包 ab-slack-message.plugin...`)

    const slackBuildPhases = { skills: false, rules: false, done: false }

    try {
      await runWithProgress(
        'bash scripts/build-slack-plugin.sh',
        {
          total: 3,
          initStatus: '初始化...',
          parseProgress(line) {
            if (!slackBuildPhases.skills && line.includes('Skills')) { slackBuildPhases.skills = true; return '📦 Skills' }
            if (!slackBuildPhases.rules  && line.includes('Rules'))  { slackBuildPhases.rules  = true; return '📋 Rules'  }
            if (!slackBuildPhases.done   && line.includes('╔'))      { slackBuildPhases.done   = true; return '✔ 完成'    }
            return null
          },
        },
      )
      p.log.success(`${sp}[2/2] ✔ ab-slack-message.plugin 打包完成 → dist/ab-slack-message.plugin`)
    } catch (e) {
      p.log.warn(`${sp}[2/2] plugin 打包失敗，略過`)
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
      // total = modules + 1 (.zshrc) + (tools selected ? 1 : 0) (.ripgreprc)
      const hasTools = selectedModules.includes('tools')
      const zshTotal = selectedModules.length + 1 + (hasTools ? 1 : 0)

      console.log()
      p.log.info(`${sp}安裝 ${selectedModules.length}/${ZSH_MODULES.length} 個 zsh 模組 → ~/.zsh/modules/`)

      await runWithProgress(
        `zsh zsh/install.sh --modules "${selectedModules.join(',')}"`,
        {
          total: zshTotal,
          initStatus: '初始化...',
          parseProgress(line) {
            // brew tool installation (potentially long, show status only)
            if (line.includes('安裝 Homebrew CLI 工具') || /brew install\s/.test(line)) {
              return { statusOnly: true, label: '安裝 brew 工具...' }
            }
            // module .zsh files: `  ✔ aliases.zsh` or `  ▶ aliases.zsh（無變更...）`
            // use (?!\S) to exclude .zshrc
            if (/^\s+[✔▶⚠]\s+\S+\.zsh(?!\S)/.test(line)) {
              return line.match(/(\S+\.zsh)/)?.[1] ?? 'module'
            }
            // .zshrc deployment
            if (/✔\s+~\/.zshrc/.test(line)) return '~/.zshrc'
            // .ripgreprc (only when tools module selected)
            if (/✔\s+~\/.ripgreprc/.test(line)) return '~/.ripgreprc'
            return null
          },
        },
      )

      p.log.success(`${sp}✔ ${selectedModules.length} 個 zsh 模組已安裝（${selectedModules.join('、')}）`)
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
