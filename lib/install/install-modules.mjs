/**
 * install-modules 步驟：安裝 ZSH 模組 + brew 工具
 *
 * 職責：
 *   1. 讓用戶選擇要安裝的 ZSH 模組（smartSelect）
 *   2. 生成 dist/preview/zsh/ 預覽檔案
 *   3. 非 manual 模式時執行 zsh/install.sh，將模組部署到 ~/.zsh/modules/
 *
 * 進度解析：
 *   解析 install.sh 的 stdout，識別 brew 工具安裝、模組複製、zshrc 部署等階段。
 */

import * as p from '@clack/prompts'
import pc from 'picocolors'
import { discoverItems } from '../cli/files.mjs'
import { stageModulesPreview } from '../cli/preview.mjs'
import { runWithProgress } from '../cli/progress.mjs'
import { BACK, smartSelect } from '../cli/prompts.mjs'

/**
 * 執行 install-modules 步驟
 *
 * @param {string} repoDir - ab-dotfiles 根目錄
 * @param {string} previewDir - dist/preview 路徑
 * @param {Object} step - config.json 中的 step 定義
 * @param {string} stepLabel - 步驟前綴標籤（如 '[3/3] '）
 * @param {boolean} flagAll - 是否全自動安裝（跳過互動）
 * @param {boolean} [manual=false] - 是否為手動模式（只生成 preview，不部署）
 * @param {Object|null} [session=null] - 上次 session（用於預選模組）
 * @returns {Promise<{ modules: string[] } | undefined>} 已安裝的模組名稱列表
 */
export async function handleInstallModules(repoDir, previewDir, step, stepLabel, flagAll, manual = false, session = null) {
  const def = Object.values(step.selectable)[0]
  const key = Object.keys(step.selectable)[0]
  const items = discoverItems(repoDir, def.dir, def.ext)
  if (items.length === 0) return { modules: [] }

  const selectedModules = flagAll
    ? items.map(i => i.value)
    : await smartSelect({
        title: `${stepLabel}${def.selectLabel || key}`,
        items,
        preselected: items.map(i => i.value),
        session: session?.install?.modules,
      })
  if (selectedModules === BACK) return undefined
  if (selectedModules.length === 0) return

  // 計算 total — 只計腳本實際輸出的進度行
  // brew 工具（11 個）+ ~/.zshrc（1）+ ~/.ripgreprc（1）= 13
  // brew 工具數量（對應 zsh/install.sh 中的 TOOLS 陣列）
  // fzf, zoxide, bat, eza, fd, git-delta, lazygit, tldr, ripgrep,
  // zsh-autosuggestions, zsh-syntax-highlighting
  const BREW_TOOL_COUNT = 11
  const needsBrew = selectedModules.some(m => ['fzf', 'tools', 'git', 'plugins'].includes(m))
  const brewToolCount = needsBrew ? BREW_TOOL_COUNT : 0
  let total = brewToolCount + 1 /* zshrc */ + 1 /* ripgreprc */

  // 生成 preview
  stageModulesPreview(repoDir, previewDir, step, selectedModules)

  const moduleItems = [...selectedModules.map(m => `modules/${m}.zsh`), 'zshrc']
  const fileLines = moduleItems.map((item, i) =>
    `  ${pc.green('✔')} ${pc.dim(`[${i + 1}/${moduleItems.length}]`)} ${item}`
  ).join('\n')
  p.log.info(`${stepLabel}生成 ${selectedModules.length}/${items.length} 個 ${key} → dist/preview/zsh/\n${fileLines}`)

  if (manual) {
    p.log.success(`${stepLabel}✔ 已生成 → dist/preview/zsh/`)
    return
  }

  // 執行安裝
  p.log.info(`${stepLabel}安裝 ${selectedModules.length}/${items.length} 個 ${key} → ~/.zsh/modules/`)
  await runWithProgress(`${step.script} --modules "${selectedModules.join(',')}"`, {
    cwd: repoDir,
    total,
    initStatus: '初始化...',
    parseProgress(line) {
      if (/^\s+[✔▶⚠]\s+\S+\s+已安裝/.test(line)) return `${line.match(/[✔▶⚠]\s+(\S+)/)?.[1] || 'brew'} ✓`
      if (/^\s+[✔▶⚠]\s+\S+\s+(安裝完成|安裝失敗)/.test(line)) return `${line.match(/[✔▶⚠]\s+(\S+)/)?.[1] || 'brew'} 安裝完成`
      if (line.includes('安裝 Homebrew CLI 工具')) return { statusOnly: true, label: '安裝 brew 工具...' }
      if (/^\s+[✔▶⚠]\s+\S+\.zsh(?!\S)/.test(line)) return line.match(/(\S+\.zsh)/)?.[1] ?? 'module'
      if (/✔\s+~\/.zshrc/.test(line)) return '~/.zshrc'
      if (/✔\s+~\/.ripgreprc/.test(line)) return '~/.ripgreprc'
      return null
    },
  })
  p.log.success(`${stepLabel}✔ ${selectedModules.length} 個 ${key} 已安裝：${selectedModules.join('、')}`)
  return { modules: selectedModules }
}
