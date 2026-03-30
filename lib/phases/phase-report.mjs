/**
 * Phase 4：驗證 + 摘要 + 報告 + session 保存
 */

import * as p from '@clack/prompts'
import pc from 'picocolors'
import fs from 'fs'
import path from 'path'
import { handleCancel } from '../ui/prompts.mjs'
import { generateReport, saveReport, openInBrowser } from '../report.mjs'
import { BACKUP_MAX_COUNT } from '../constants.mjs'
import { BACKUP_DIR } from '../backup.mjs'
import { saveSession, clearSessionProgress } from '../session.mjs'

/**
 * 安裝後自動驗證
 */
export function verifyInstallation(installSelections, manual) {
  if (manual) return { passed: 0, failed: [], total: 0 }

  const checks = []
  const HOME = process.env.HOME

  if (installSelections.commands?.length) {
    for (const cmd of installSelections.commands) {
      const target = path.join(HOME, '.claude/commands', `${cmd}.md`)
      checks.push({ name: `commands/${cmd}`, ok: fs.existsSync(target) })
    }
  }
  if (installSelections.agents?.length) {
    for (const agent of installSelections.agents) {
      const target = path.join(HOME, '.claude/agents', `${agent}.md`)
      checks.push({ name: `agents/${agent}`, ok: fs.existsSync(target) })
    }
  }
  if (installSelections.hooks?.length) {
    const hooksPath = path.join(HOME, '.claude', 'settings.json')
    if (fs.existsSync(hooksPath)) {
      try { JSON.parse(fs.readFileSync(hooksPath, 'utf8')); checks.push({ name: 'hooks (valid JSON)', ok: true }) }
      catch { checks.push({ name: 'hooks (valid JSON)', ok: false }) }
    }
  }
  if (installSelections.modules?.length) {
    for (const mod of installSelections.modules) {
      const target = path.join(HOME, '.zsh/modules', `${mod}.zsh`)
      checks.push({ name: `modules/${mod}.zsh`, ok: fs.existsSync(target) })
    }
  }

  const passed = checks.filter(c => c.ok).length
  const failed = checks.filter(c => !c.ok)

  if (checks.length > 0) {
    if (failed.length === 0) {
      p.log.success(`驗證通過：${passed}/${checks.length} 個檔案就位`)
    } else {
      p.log.warn(`驗證：${passed}/${checks.length} 通過，${failed.length} 個失敗：\n${failed.map(c => `  ✗ ${c.name}`).join('\n')}`)
    }
  }

  return { passed, failed, total: checks.length }
}

/**
 * 摘要 + 報告 + session
 */
export async function runPhaseReport({
  repoDir, manual, needsClaude, needsZsh,
  selectedTargets, selectedRepos, categorizedTechs, detectedSkills,
  pipelineResult, syncResult, installSelections, eccSelectedNames,
}) {
  // 驗證
  verifyInstallation(installSelections, manual)

  // 摘要（合併為一次輸出）
  const summaryLines = [
    '產出目錄  dist/',
    '  preview/   預覽檔案', '  release/   .plugin 檔案',
    ...(fs.existsSync(BACKUP_DIR) ? [`  backup/    備份（保留 ${BACKUP_MAX_COUNT} 次）`] : []),
    ...(manual ? [
      '',
      '手動部署：',
      ...(needsClaude ? ['  cp -r dist/preview/claude/* ~/.claude/'] : []),
      ...(needsZsh ? ['  cp dist/preview/zsh/modules/*.zsh ~/.zsh/modules/', '  cp dist/preview/zsh/zshrc ~/.zshrc', '  source ~/.zshrc'] : []),
    ] : []),
    ...(fs.existsSync(BACKUP_DIR) ? ['', '還原：pnpm run restore'] : []),
  ]
  p.log.success(`${manual ? '手動模式完成' : '安裝完成'}\n${summaryLines.join('\n')}`)

  // 報告
  const { ghSync } = await import('../github.mjs')
  const reportData = {
    username: ghSync('user', '.login') || '',
    org: selectedRepos[0]?.split('/')[0] || '',
    repos: selectedRepos,
    techStacks: Object.fromEntries([...categorizedTechs].map(([k, v]) => [k, [...v.keys()]])),
    perRepoReasoning: pipelineResult?.perRepo ? Object.fromEntries([...pipelineResult.perRepo].map(([k, v]) => [k, { reasoning: v.reasoning, stacks: v.techStacks }])) : {},
    auditSummary: pipelineResult?.audit?.toSummary() || [],
    ecc: syncResult ? { sources: syncResult.results.map(r => ({ name: r.source, repo: r.repo, version: r.version, cached: r.cached, added: r.added, skipped: r.skipped, hooks: r.hooks })) } : null,
    installed: {
      commands: fs.existsSync(path.join(repoDir, 'claude/commands')) ? fs.readdirSync(path.join(repoDir, 'claude/commands')).filter(f => f.endsWith('.md')).map(f => f.replace('.md', '')) : [],
      agents: fs.existsSync(path.join(repoDir, 'claude/agents')) ? fs.readdirSync(path.join(repoDir, 'claude/agents')).filter(f => f.endsWith('.md')).map(f => f.replace('.md', '')) : [],
      rules: fs.existsSync(path.join(repoDir, 'claude/rules')) ? fs.readdirSync(path.join(repoDir, 'claude/rules')).filter(f => f.endsWith('.md')).map(f => f.replace('.md', '')) : [],
      hooks: fs.existsSync(path.join(repoDir, 'claude/hooks.json')),
    },
    stacks: detectedSkills,
    backupDir: fs.existsSync(BACKUP_DIR) ? path.relative(repoDir, BACKUP_DIR) : null,
    mode: manual ? 'manual' : 'auto',
    timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
  }

  const html = generateReport(reportData)
  const reportPath = saveReport(html, path.join(repoDir, 'dist'))
  p.log.success(`報告 → ${path.relative(repoDir, reportPath)}`)

  const shouldOpen = handleCancel(await p.confirm({ message: '瀏覽器打開報告？', initialValue: true }))
  if (shouldOpen) await openInBrowser(reportPath)

  // 保存 session
  clearSessionProgress()
  saveSession({
    targets: selectedTargets,
    mode: manual ? 'manual' : 'auto',
    org: selectedRepos[0]?.split('/')[0] || '',
    repos: selectedRepos,
    techCategories: [...categorizedTechs.keys()].filter(cat => {
      const items = [...categorizedTechs.get(cat).keys()]
      return items.some(id => detectedSkills.includes(id))
    }),
    techStacks: detectedSkills,
    eccSelections: eccSelectedNames ? {
      commands: [...eccSelectedNames.commands],
      agents: [...eccSelectedNames.agents],
      rules: [...eccSelectedNames.rules],
    } : null,
    install: {
      commands: installSelections.commands || [],
      agents: installSelections.agents || [],
      rules: installSelections.rules || [],
      hooks: installSelections.hooks || [],
      modules: installSelections.modules || [],
    },
  })
}
