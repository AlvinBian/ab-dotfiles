#!/usr/bin/env node
/**
 * ab-dotfiles 統一安裝 CLI
 * 使用 @clack/prompts 提供美觀的互動式選單
 *
 * 用法：
 *   pnpm run setup              ← 互動式選擇
 *   pnpm run setup -- --all     ← 全部安裝（非互動）
 *   pnpm run setup -- --claude  ← 只安裝 Claude 設定
 *   pnpm run setup -- --zsh     ← 只安裝 Zsh 環境
 */

import * as p from '@clack/prompts'
import { execSync, spawnSync } from 'child_process'
import { existsSync, readdirSync } from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'

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

// ── Zsh 模組定義（Zinit + p10k 架構，10 → 8 模組）──────────────
// plugins / completion / keybindings 已整合進 zinit.zsh
const ZSH_MODULES = [
  { value: 'zinit',   label: 'zinit',   hint: '插件管理 + Powerlevel10k + autosuggestions + fzf-tab + bindkey' },
  { value: 'nvm',     label: 'nvm',     hint: 'Node 版本管理（lazy load，支援 nvm / n）' },
  { value: 'pnpm',    label: 'pnpm',    hint: 'PNPM PATH 設定' },
  { value: 'history', label: 'history', hint: '歷史記錄（50000 筆，去重、跨 session 共享）' },
  { value: 'fzf',     label: 'fzf',     hint: 'FZF 環境設定（fd + bat 整合；key-bindings 由 fzf-tab 接管）' },
  { value: 'tools',   label: 'tools',   hint: '現代 CLI（bat / eza / zoxide / fd / tldr / ripgrep）' },
  { value: 'git',     label: 'git',     hint: 'Git aliases + delta diff viewer + lazygit' },
  { value: 'aliases', label: 'aliases', hint: '編輯器自動偵測（Kiro/Cursor/VSCode）+ gh / uv + 通用 aliases' },
]

// ── 工具函式 ────────────────────────────────────────────────────
function run(cmd, { cwd = REPO, stdio = 'inherit' } = {}) {
  const result = spawnSync(cmd, { shell: true, cwd, stdio })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

function handleCancel(value) {
  if (p.isCancel(value)) {
    p.cancel('已取消安裝')
    process.exit(0)
  }
  return value
}

// ── 解析參數 ────────────────────────────────────────────────────
const args = process.argv.slice(2)
const FLAG_ALL    = args.includes('--all')
const FLAG_CLAUDE = args.includes('--claude')
const FLAG_ZSH    = args.includes('--zsh')

// ── 主程式 ──────────────────────────────────────────────────────
async function main() {
  console.log()
  p.intro(' ab-dotfiles 安裝精靈 ')

  // ── 選擇安裝目標 ─────────────────────────────────────────────
  let targets

  if (FLAG_ALL) {
    targets = ['claude', 'zsh']
  } else if (FLAG_CLAUDE) {
    targets = ['claude']
  } else if (FLAG_ZSH) {
    targets = ['zsh']
  } else {
    targets = handleCancel(await p.multiselect({
      message: '選擇要安裝的項目',
      options: [
        { value: 'claude', label: 'Claude Code 設定', hint: 'commands / agents / hooks → ~/.claude/' },
        { value: 'zsh',    label: 'Zsh 環境模組',     hint: 'modules → ~/.zsh/modules/ + ~/.zshrc' },
      ],
      required: true,
    }))
  }

  // ── Claude 安裝流程 ──────────────────────────────────────────
  if (targets.includes('claude')) {
    p.log.step('Claude Code 設定')
    console.log()

    // 選擇 commands
    const selectedCommands = FLAG_ALL
      ? CLAUDE_COMMANDS.map(c => c.value)
      : handleCancel(await p.multiselect({
          message: 'Slash Commands（/xxx）',
          options: CLAUDE_COMMANDS,
          required: false,
        }))

    // 選擇 agents
    const selectedAgents = FLAG_ALL
      ? CLAUDE_AGENTS.map(a => a.value)
      : handleCancel(await p.multiselect({
          message: 'Agents（@xxx）',
          options: CLAUDE_AGENTS,
          required: false,
        }))

    // 安裝 hooks
    const installHooks = FLAG_ALL
      ? true
      : handleCancel(await p.confirm({
          message: '安裝 Hooks（PostToolUse / PreToolUse / SessionStart / Stop）？',
          initialValue: true,
        }))

    // 執行安裝
    const s = p.spinner()
    s.start('安裝 Claude 設定中...')

    const cmdsArg    = selectedCommands.join(',')
    const agentsArg  = selectedAgents.join(',')
    const hooksFlag  = installHooks ? '--hooks' : ''

    run(`bash scripts/install-claude.sh --commands "${cmdsArg}" --agents "${agentsArg}" ${hooksFlag}`, { stdio: 'pipe' })

    s.stop(`Claude 設定安裝完成（${selectedCommands.length} commands · ${selectedAgents.length} agents${installHooks ? ' · hooks' : ''}）`)
  }

  // ── Zsh 安裝流程 ─────────────────────────────────────────────
  if (targets.includes('zsh')) {
    p.log.step('Zsh 環境模組')
    console.log()

    const selectedModules = FLAG_ALL
      ? ZSH_MODULES.map(m => m.value)
      : handleCancel(await p.multiselect({
          message: '選擇要安裝的 Zsh 模組',
          options: ZSH_MODULES,
          required: false,
        }))

    if (selectedModules.length > 0) {
      const s = p.spinner()
      s.start(`安裝 ${selectedModules.length} 個 Zsh 模組...`)

      run(`zsh zsh/install.sh --modules "${selectedModules.join(',')}"`, { stdio: 'pipe' })

      s.stop(`Zsh 模組安裝完成（${selectedModules.join('、')}）`)
    }
  }

  // ── 完成 ─────────────────────────────────────────────────────
  p.outro('✅ 安裝完成！執行 source ~/.zshrc 讓 Zsh 設定生效')
}

main().catch((e) => {
  p.log.error(e.message)
  process.exit(1)
})
