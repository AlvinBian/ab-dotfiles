/**
 * Phase 3：備份 → 並行生成 → 安裝執行
 */

import * as p from '@clack/prompts'
import pc from 'picocolors'
import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import { backupIfExists } from '../backup.mjs'
import { buildSyncResult, writeSyncedFiles } from '../source-sync.mjs'
import { runTarget } from '../install/index.mjs'
import { updateSessionProgress } from '../session.mjs'

/**
 * 跑 scan.mjs 生成 stacks/
 */
function runScan(skills, repoDir) {
  return new Promise((resolve) => {
    const child = spawn('node', ['bin/scan.mjs', '--init', '--no-ai', '--skills', skills.join(',')], { cwd: repoDir })
    child.stdout.setEncoding('utf8')
    const lines = []
    child.stdout.on('data', chunk => {
      for (const line of chunk.split('\n').filter(l => l.trim())) {
        if (line.includes('🆕') || line.includes('🤖')) lines.push(`  ${line.trim()}`)
      }
    })
    child.on('close', () => resolve(lines))
  })
}

/**
 * @param {Object} opts
 * @returns {Promise<{ installSelections: Object, syncResult: Object|null }>}
 */
export async function runPhaseExecute({
  repoDir, previewDir, targets, selectedTargets, manual, flagAll, flagQuick,
  needsClaude, needsZsh, detectedSkills, eccSelectedNames, fetchedSources,
  selectedRepos, prev,
}) {
  const HOME = process.env.HOME

  // 記錄進度（斷點續裝）
  updateSessionProgress({
    lastPhase: 'phase-3',
    completedTargets: [],
    pendingTargets: selectedTargets,
  })

  // 備份
  const backupTasks = []
  if (needsClaude) {
    const cd = path.join(HOME, '.claude')
    for (const sub of ['commands', 'agents', 'rules']) backupTasks.push(backupIfExists(path.join(cd, sub), `claude/${sub}`))
    backupTasks.push(backupIfExists(path.join(cd, 'hooks.json'), 'claude/hooks.json'))
    backupTasks.push(backupIfExists(path.join(cd, 'settings.json'), 'claude/settings.json'))
  }
  if (needsZsh) {
    backupTasks.push(backupIfExists(path.join(HOME, '.zshrc'), 'zshrc'))
    backupTasks.push(backupIfExists(path.join(HOME, '.zsh', 'modules'), 'zsh/modules'))
  }
  if (backupTasks.length) {
    const sBak = p.spinner()
    sBak.start('備份現有配置...')
    const backupResults = (await Promise.all(backupTasks)).filter(Boolean)
    sBak.stop(`備份完成${backupResults.length ? '\n' + backupResults.join('\n') : ''}`)
  }

  // 並行生成
  const parallelTasks = []

  if (selectedRepos.length > 0) {
    const cacheDir = path.join(repoDir, '.cache')
    fs.mkdirSync(cacheDir, { recursive: true })
    fs.writeFileSync(path.join(cacheDir, 'repos.json'), JSON.stringify(selectedRepos, null, 2) + '\n')
  }

  let scanLines = []
  if (detectedSkills.length > 0) {
    parallelTasks.push(runScan(detectedSkills, repoDir).then(lines => { scanLines = lines }))
  }

  let syncResult = null
  if (eccSelectedNames && fetchedSources.sources?.length > 0) {
    parallelTasks.push((async () => {
      syncResult = buildSyncResult(fetchedSources, eccSelectedNames)
      const claudePreview = path.join(previewDir, 'claude')
      await writeSyncedFiles(syncResult.downloaded, claudePreview)
      if (!manual) await writeSyncedFiles(syncResult.downloaded, path.join(HOME, '.claude'))
    })())
  }

  if (parallelTasks.length > 0) {
    const sBuild = p.spinner()
    sBuild.start('生成技能庫 + 寫入 ECC...')
    await Promise.all(parallelTasks)
    const scanOutput = scanLines.length > 0 ? '\n' + scanLines.join('\n') : ''
    sBuild.stop(`生成完成${scanOutput}`)
    if (syncResult) {
      const added = syncResult.results.reduce((s, r) => s + r.added.commands.length + r.added.agents.length + r.added.rules.length, 0)
      const detail = syncResult.results.map(r => {
        const pts = []; if (r.added.commands.length) pts.push(`${r.added.commands.length} cmd`); if (r.added.agents.length) pts.push(`${r.added.agents.length} agent`); if (r.added.rules.length) pts.push(`${r.added.rules.length} rule`)
        return `  ${pc.cyan(r.source)} (${r.version})  +${pts.join(' · ')}`
      }).join('\n')
      p.log.success(`ECC +${added} 個${detail ? '\n' + detail : ''}`)
    }
  }

  // 執行 targets
  const targetNames = selectedTargets.map(k => targets[k]?.label || k)
  p.log.info(`開始${manual ? '生成' : '安裝'}：${targetNames.join('、')}`)

  const completed = new Set()
  const installSelections = {}
  for (const key of selectedTargets) {
    const result = await runTarget(repoDir, previewDir, key, targets[key], {
      selectedTargets, completed, flagAll: flagAll || flagQuick, manual, skillIds: detectedSkills, session: prev,
    })
    if (result) Object.assign(installSelections, result)
    completed.add(key)
  }

  return { installSelections, syncResult }
}
