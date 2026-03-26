/**
 * Preview / Staging 檔案生成
 *
 * 職責：
 *   在 dist/preview/ 下生成預覽檔案，供用戶查閱或手動部署。
 *   支持 skill 片段合併（將 stacks/{tech}/code-review.md 等嵌入 commands/rules）。
 *
 * 目錄結構：
 *   dist/
 *     preview/
 *       claude/     ← stageClaudePreview 生成
 *         commands/
 *         agents/
 *         rules/
 *         hooks.json
 *       zsh/        ← stageModulesPreview 生成
 *         modules/
 *         zshrc
 *     release/      ← build scripts 生成（不在此模組處理）
 *     backup/       ← backup.mjs 處理
 */

import fs from 'fs'
import path from 'path'
import { cpDir } from './backup.mjs'
import { mergeSkillFragments } from './skill-detect.mjs'

/**
 * 通用 preview staging：按 mapping 複製檔案到 dist/preview/{targetKey}/
 *
 * @param {string} previewDir - dist/preview 的絕對路徑
 * @param {string} targetKey - 子目錄名（如 'zsh'）
 * @param {Object} mapping - { 'dest/relative/path': '/abs/source/path', ... }
 * @returns {string} 生成的目標目錄絕對路徑
 */
export function stagePreview(previewDir, targetKey, mapping) {
  const targetDir = path.join(previewDir, targetKey)
  fs.mkdirSync(targetDir, { recursive: true })

  for (const [rel, src] of Object.entries(mapping)) {
    const dest = path.join(targetDir, rel)
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    if (fs.statSync(src).isDirectory()) {
      cpDir(src, dest)
    } else {
      fs.copyFileSync(src, dest)
    }
  }
  return targetDir
}

/**
 * 為 install-claude 步驟生成 preview 檔案
 *
 * 處理 commands / agents / rules / hooks 的複製，
 * 並將匹配的 skill 片段合併到 commands 和 rules 中。
 *
 * @param {string} repoDir - 專案根目錄
 * @param {string} previewDir - dist/preview 路徑
 * @param {Object} step - config.json 中的 step 定義
 * @param {Object} selected - 用戶選中的項目 { commands: [...], agents: [...] }
 * @param {boolean} installHooks - 是否安裝 hooks
 * @param {string[]} [skillIds=[]] - 要合併的技能 ID 列表
 * @returns {string} 生成的目標目錄
 */
export function stageClaudePreview(repoDir, previewDir, step, selected, installHooks, skillIds = []) {
  const targetDir = path.join(previewDir, 'claude')
  fs.mkdirSync(targetDir, { recursive: true })

  // 複製 commands / agents（合併 skill 片段）
  for (const [key, def] of Object.entries(step.selectable || {})) {
    if (!selected[key]?.length) continue
    for (const name of selected[key]) {
      const src = path.join(repoDir, def.dir, `${name}${def.ext}`)
      if (!fs.existsSync(src)) continue
      const subdir = key === 'agents' ? 'agents' : 'commands'
      const destDir = path.join(targetDir, subdir)
      fs.mkdirSync(destDir, { recursive: true })

      let content = fs.readFileSync(src, 'utf8')
      if (skillIds.length > 0) {
        content = mergeSkillFragments(content, skillIds, `${name}${def.ext}`)
      }
      fs.writeFileSync(path.join(destDir, `${name}${def.ext}`), content)
    }
  }

  // rules（合併 skill 片段）
  if (step.fixed?.rules) {
    const rulesDir = path.join(repoDir, 'claude/rules')
    const destRulesDir = path.join(targetDir, 'rules')
    fs.mkdirSync(destRulesDir, { recursive: true })
    if (fs.existsSync(rulesDir)) {
      for (const f of fs.readdirSync(rulesDir).filter(f => f.endsWith('.md'))) {
        if (step.fixed.rules === 'all' || step.fixed.rules.split(',').includes(f.replace('.md', ''))) {
          let content = fs.readFileSync(path.join(rulesDir, f), 'utf8')
          if (skillIds.length > 0) {
            content = mergeSkillFragments(content, skillIds, f)
          }
          fs.writeFileSync(path.join(destRulesDir, f), content)
        }
      }
    }
  }

  // hooks
  if (installHooks) {
    const hooksFile = path.join(repoDir, 'claude/hooks.json')
    if (fs.existsSync(hooksFile)) {
      fs.copyFileSync(hooksFile, path.join(targetDir, 'hooks.json'))
    }
  }

  return targetDir
}

/**
 * 為 install-modules 步驟生成 preview 檔案
 *
 * 複製選中的 zsh 模組和 zshrc 到 dist/preview/zsh/
 *
 * @param {string} repoDir - 專案根目錄
 * @param {string} previewDir - dist/preview 路徑
 * @param {Object} step - config.json 中的 step 定義
 * @param {string[]} selectedModules - 用戶選中的模組名稱
 * @returns {string} 生成的目標目錄
 */
export function stageModulesPreview(repoDir, previewDir, step, selectedModules) {
  const def = Object.values(step.selectable)[0]
  const mapping = {}
  for (const name of selectedModules) {
    const src = path.join(repoDir, def.dir, `${name}${def.ext}`)
    if (fs.existsSync(src)) mapping[`modules/${name}${def.ext}`] = src
  }
  const zshrc = path.join(repoDir, 'zsh/zshrc')
  if (fs.existsSync(zshrc)) mapping['zshrc'] = zshrc
  return stagePreview(previewDir, 'zsh', mapping)
}
