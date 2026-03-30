#!/usr/bin/env node
/**
 * ab-dotfiles v2.0 統一安裝 CLI
 *
 * 3 步流程：選 repos → 確認計畫 → 安裝
 */

import * as p from '@clack/prompts'
import pc from 'picocolors'
import fs from 'fs'
import path from 'path'
import { getDirname } from '../lib/utils/paths.mjs'
import { handleCancel, smartSelect, BACK } from '../lib/ui/prompts.mjs'
import { phaseHeader } from '../lib/ui/task-runner.mjs'
import { cleanOldBackups } from '../lib/backup.mjs'
import { loadSession, checkIncompleteSession } from '../lib/session.mjs'
import { env } from '../lib/env.mjs'
import { warmupCli } from '../lib/claude-cli.mjs'
import { ensureEnvironment } from '../lib/doctor.mjs'
import { interactiveRepoSelect } from '../lib/repo-select.mjs'
import { phaseAnalyze } from '../lib/phases/phase-analyze.mjs'
import { phasePlan } from '../lib/phases/phase-plan.mjs'
import { phaseExecute } from '../lib/phases/phase-execute.mjs'
import { phaseComplete } from '../lib/phases/phase-complete.mjs'
import { detectV1Installation, runUpgrade } from '../lib/upgrade.mjs'

const __dirname = getDirname(import.meta)
const REPO = path.resolve(__dirname, '..')
const PREVIEW_DIR = path.join(REPO, 'dist', 'preview')

function loadConfig() {
  const cfgPath = path.join(REPO, 'config.json')
  return fs.existsSync(cfgPath) ? JSON.parse(fs.readFileSync(cfgPath, 'utf8')) : { targets: {} }
}

function loadProjectFolders(config, session) {
  // 優先用 config.json 的 projectFolders，再用 session 保存的
  return config.projectFolders || session?.projectFolders || []
}

function loadSources(configSources) {
  const eccEnv = env('ECC_SOURCES', '')
  if (!eccEnv) return configSources || []
  return eccEnv.split(',').map(entry => {
    const [name, repo, priority] = entry.trim().split('|')
    if (!name || !repo) return null
    return { name, repo, priority: parseInt(priority, 10) || 0, paths: { commands: 'commands', agents: 'agents', rules: 'rules/{lang}', rulesCommon: 'rules/common', hooks: 'hooks/hooks.json' } }
  }).filter(Boolean)
}

cleanOldBackups()

async function main() {
  const config = loadConfig()
  const targets = config.targets || {}
  const sources = loadSources(config.sources)
  const args = process.argv.slice(2)
  const flagAll = args.includes('--all')
  const flagManual = args.includes('--manual')
  const flagQuick = args.includes('--quick')
  const flagDryRun = args.includes('--dry-run')
  let prev = loadSession()
  let projectFolders = loadProjectFolders(config, prev)

  // Splash
  console.log()
  if (prev) {
    p.intro(` ab-dotfiles v2.0 — 上次：${prev.repos?.length || '?'} repos · ${prev.techStacks?.length || '?'} stacks · ${prev.timestamp?.slice(0, 10) || ''} `)
  } else {
    p.intro(' ab-dotfiles v2.0 安裝精靈 ')
  }

  // v1 → v2 升級偵測
  const v1Info = detectV1Installation()
  if (v1Info.hasV1) {
    const upgradeResult = await runUpgrade(v1Info)
    if (upgradeResult === 'cleaned') {
      prev = null // 清除後不使用舊 session
    }
  }

  // --quick：直接用上次 session 重裝，跳過所有互動
  if (flagQuick) {
    if (!prev) { p.log.error('無歷史記錄，無法 --quick。請先執行 pnpm setup。'); process.exit(1) }
    p.log.info(`Quick 模式：重放上次安裝（${prev.repos?.length} repos）`)

    if (fs.existsSync(PREVIEW_DIR)) fs.rmSync(PREVIEW_DIR, { recursive: true })
    phaseHeader('環境檢查')
    await ensureEnvironment()

    // 用 session 重建 plan
    const repoObjects = (prev.repos || []).map(r => ({
      fullName: r,
      commits: 10, // quick 模式假設都是主力
      pct: 0,
    }))
    phaseHeader('快速分析')
    const plan = await phaseAnalyze({ repos: repoObjects, sources, baseDir: REPO, projectFolders })
    if (flagManual) plan.mode = 'manual'

    phaseHeader('安裝中')
    const { installSelections, syncResult, startTime } = await phaseExecute(plan, {
      repoDir: REPO, previewDir: PREVIEW_DIR, targets, prev,
      pipelineResult: null, fetchedSources: null,
    })

    phaseHeader('完成', 3, 3)
    await phaseComplete(plan, { repoDir: REPO, installSelections, syncResult, startTime, pipelineResult: null, projectFolders })
    return
  }

  // 重入
  if (prev && !flagAll && !flagQuick) {
    const action = handleCancel(await p.select({
      message: `上次安裝：${prev.repos?.length || '?'} repos · ${prev.installMode || 'full'}`,
      options: [
        { value: 'reinstall', label: '重新安裝（用上次設定）', hint: 'Enter 直接裝' },
        { value: 'adjust', label: '調整設定' },
        { value: 'report', label: '查看上次報告' },
      ],
    }))
    if (action === BACK) process.exit(0)
    if (action === 'report') {
      const reportPath = path.join(REPO, 'dist', 'report.html')
      if (fs.existsSync(reportPath)) {
        const { openInBrowser } = await import('../lib/report.mjs')
        await openInBrowser(reportPath)
      } else {
        p.log.warn('找不到上次報告')
      }
      process.exit(0)
    }
    if (action === 'reinstall') {
      // 等同 --quick
      if (fs.existsSync(PREVIEW_DIR)) fs.rmSync(PREVIEW_DIR, { recursive: true })
      phaseHeader('環境檢查')
      await ensureEnvironment()

      const repoObjects = (prev.repos || []).map(r => ({ fullName: r, commits: 10, pct: 0 }))
      phaseHeader('快速分析')
      const plan = await phaseAnalyze({ repos: repoObjects, sources, baseDir: REPO, projectFolders })

      phaseHeader('安裝中')
      const { installSelections, syncResult, startTime } = await phaseExecute(plan, {
        repoDir: REPO, previewDir: PREVIEW_DIR, targets, prev,
        pipelineResult: null, fetchedSources: null,
      })

      phaseHeader('完成', 3, 3)
      await phaseComplete(plan, { repoDir: REPO, installSelections, syncResult, startTime, pipelineResult: null, projectFolders })
      return
    }
  }

  if (fs.existsSync(PREVIEW_DIR)) fs.rmSync(PREVIEW_DIR, { recursive: true })

  // 環境檢查
  phaseHeader('環境檢查')
  await ensureEnvironment()
  warmupCli()

  // ── Phase loop（支持 BACK）──
  let analyzeCache = null

  while (true) {
    // Step 1：選 repos
    phaseHeader('選擇倉庫', 1, 3)
    const repos = await interactiveRepoSelect(prev)
    if (repos === BACK) break

    // 專案文件夾：首次詢問，之後用 session 記憶
    if (!projectFolders.length) {
      const foldersInput = handleCancel(await p.text({
        message: '專案文件夾（逗號分隔，Enter 跳過用 Spotlight 自動搜索）',
        placeholder: '~/Kkday, ~/Projects, ~/Work',
        defaultValue: '',
      }))
      if (foldersInput && foldersInput !== BACK) {
        projectFolders = foldersInput.split(',')
          .map(s => s.trim())
          .filter(Boolean)
          .map(f => ({ path: f, role: 'auto' }))
      }
    }

    // 角色分類：自動預判 + 選單調整（循環直到確認）
    const { determineRole } = await import('../lib/config-classifier.mjs')

    // 初始化角色（自動判定或沿用 session）
    const roles = {} // { fullName: 'main'|'temp'|'tool' }
    for (const r of repos) {
      roles[r.fullName] = prev?.roles?.[r.fullName] || determineRole(r)
    }

    let roleConfirmed = false
    while (!roleConfirmed) {
      const mc = Object.values(roles).filter(v => v === 'main').length
      const tc = Object.values(roles).filter(v => v === 'temp').length
      const toolc = Object.values(roles).filter(v => v === 'tool').length

      // 顯示當前分配
      const summary = repos.map(r => {
        const icon = roles[r.fullName] === 'main' ? '⭐' : roles[r.fullName] === 'tool' ? '🔧' : '🔄'
        return `  ${icon} ${r.fullName.split('/')[1]}`
      }).join('\n')
      p.log.info(`角色分配（${mc} ⭐主力 · ${tc} 🔄臨時${toolc ? ` · ${toolc} 🔧工具` : ''}）\n${summary}`)

      const action = handleCancel(await p.select({
        message: '角色分配',
        options: [
          { value: 'confirm', label: '確認', hint: '繼續安裝' },
          { value: 'main', label: '調整 ⭐主力', hint: '完整 CLAUDE.md + AI 生成' },
          { value: 'temp', label: '調整 🔄臨時', hint: '精簡 CLAUDE.md' },
          { value: 'tool', label: '調整 🔧工具', hint: '最小配置' },
          { value: 'back', label: '← 上一步' },
        ],
      }))

      if (action === BACK || action === 'back') { roleConfirmed = null; break }

      if (action === 'confirm') {
        roleConfirmed = true
        break
      }

      // 調整某個角色：選中 = 歸入該角色，未選 = 保持原角色
      const targetRole = action
      const items = repos.map(r => ({
        value: r.fullName,
        label: r.fullName.split('/')[1],
        hint: r.commits > 0 ? `${r.commits} commits` : '',
      }))
      const currentInRole = repos.filter(r => roles[r.fullName] === targetRole).map(r => r.fullName)
      const icon = targetRole === 'main' ? '⭐' : targetRole === 'tool' ? '🔧' : '🔄'
      const label = targetRole === 'main' ? '主力' : targetRole === 'tool' ? '工具' : '臨時'

      const selected = await smartSelect({
        title: `${icon} ${label} repos`,
        items,
        preselected: currentInRole,
        autoSelectThreshold: 0,
      })
      if (selected === BACK) continue

      // 選中的歸入 targetRole，其餘不動（除非被搶走）
      const selectedSet = new Set(selected)
      for (const r of repos) {
        if (selectedSet.has(r.fullName)) {
          roles[r.fullName] = targetRole
        } else if (roles[r.fullName] === targetRole) {
          // 從該角色中移除的，回到自動判定
          roles[r.fullName] = determineRole(r)
        }
      }
    }

    if (roleConfirmed === null) continue // BACK

    // 寫入角色到 repos
    for (const r of repos) {
      r._roleOverride = roles[r.fullName]
    }

    // 自動分析（快取：repos + 角色沒變就不重跑）
    const reposKey = repos.map(r => `${r.fullName}:${r._roleOverride}`).sort().join(',')
    if (!analyzeCache || analyzeCache.key !== reposKey) {
      phaseHeader('自動分析')
      analyzeCache = {
        key: reposKey,
        plan: await phaseAnalyze({ repos, sources, baseDir: REPO, projectFolders }),
      }
      // 應用用戶角色覆蓋
      for (const r of analyzeCache.plan.repos) {
        const src = repos.find(s => s.fullName === r.fullName)
        if (src?._roleOverride) r.role = src._roleOverride
      }
      // 重算計數
      analyzeCache.plan.mainCount = analyzeCache.plan.repos.filter(r => r.role === 'main').length
      analyzeCache.plan.tempCount = analyzeCache.plan.repos.filter(r => r.role === 'temp').length
      analyzeCache.plan.toolCount = analyzeCache.plan.repos.filter(r => r.role === 'tool').length
      // 更新 projects（只有找到 localPath 的才生成 CLAUDE.md）
      const { getClaudeMdType } = await import('../lib/config-classifier.mjs')
      analyzeCache.plan.projects = analyzeCache.plan.repos
        .filter(r => r.localPath)
        .map(r => ({ repo: r.fullName, role: r.role, localPath: r.localPath, claudeMdType: getClaudeMdType(r.role) }))
    }

    // Step 2：確認計畫
    phaseHeader('確認安裝計畫', 2, 3)
    const confirmedPlan = await phasePlan(analyzeCache.plan)
    if (confirmedPlan === BACK) continue // 回到 Step 1
    if (!confirmedPlan) break

    // --dry-run
    if (flagDryRun) {
      p.log.success(pc.yellow('Dry Run 完成 — 未寫入任何檔案'))
      break
    }

    // --manual
    if (flagManual) confirmedPlan.mode = 'manual'

    // 安裝
    phaseHeader('安裝中')
    const { installSelections, syncResult, startTime } = await phaseExecute(confirmedPlan, {
      repoDir: REPO,
      previewDir: PREVIEW_DIR,
      targets,
      prev,
      pipelineResult: confirmedPlan._pipelineResult || null,
      fetchedSources: confirmedPlan._fetchedSources || null,
    })

    // Step 3：完成
    phaseHeader('完成', 3, 3)
    await phaseComplete(confirmedPlan, {
      repoDir: REPO,
      installSelections,
      syncResult,
      startTime,
      pipelineResult: confirmedPlan._pipelineResult || null,
      projectFolders,
    })

    break
  }
}

main().catch(e => { p.log.error(e.message); process.exit(1) })
