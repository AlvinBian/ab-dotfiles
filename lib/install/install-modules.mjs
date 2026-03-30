/**
 * install-modules 步驟：安裝 zsh 模組 + brew 工具
 */

import * as p from '@clack/prompts'
import pc from 'picocolors'
import { smartSelect } from '../ui/prompts.mjs'
import { runWithProgress } from '../ui/progress.mjs'
import { discoverItems } from '../ui/files.mjs'
import { stageModulesPreview } from '../preview.mjs'

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
  if (selectedModules.length === 0) return

  // 計算 total — 只計腳本實際輸出的進度行
  // brew 工具（11 個）+ ~/.zshrc（1）+ ~/.ripgreprc（1）= 13
  const needsBrew = selectedModules.some(m => ['fzf', 'tools', 'git', 'plugins'].includes(m))
  const brewToolCount = needsBrew ? 11 : 0
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
