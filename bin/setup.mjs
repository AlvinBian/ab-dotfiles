#!/usr/bin/env node
/**
 * ab-dotfiles 統一安裝 CLI（config-driven）
 *
 * 流程：
 *   Phase 1: 環境檢查 + 選 targets + mode
 *   Phase 2: 選 repos → Pipeline 分析 → 技術棧/ECC 選擇
 *   Phase 3: 備份 → 生成 → 安裝執行
 *   Phase 4: 驗證 → 報告 → session 保存
 */

import * as p from '@clack/prompts'
import pc from 'picocolors'
import fs from 'fs'
import path from 'path'
import { getDirname } from '../lib/utils/paths.mjs'
import { handleCancel, BACK } from '../lib/ui/prompts.mjs'
import { cleanOldBackups } from '../lib/backup.mjs'
import { loadSession, checkIncompleteSession } from '../lib/session.mjs'
import { env } from '../lib/env.mjs'
import { warmupCli } from '../lib/claude-cli.mjs'

import { runPhaseIntent } from '../lib/phases/phase-intent.mjs'
import { runPhaseAnalysis } from '../lib/phases/phase-analysis.mjs'
import { runPhaseExecute } from '../lib/phases/phase-execute.mjs'
import { runPhaseReport } from '../lib/phases/phase-report.mjs'

const __dirname = getDirname(import.meta)
const REPO = path.resolve(__dirname, '..')
const PREVIEW_DIR = path.join(REPO, 'dist', 'preview')

function loadConfig() {
  const cfgPath = path.join(REPO, 'config.json')
  return fs.existsSync(cfgPath) ? JSON.parse(fs.readFileSync(cfgPath, 'utf8')) : { targets: {} }
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

// ══════════════════════════════════════════════════════════════════
async function main() {
  const config = loadConfig()
  const targets = config.targets || {}
  const sources = loadSources(config.sources)
  const args = process.argv.slice(2)
  const flagAll = args.includes('--all')
  const flagManual = args.includes('--manual')
  const flagQuick = args.includes('--quick')
  const flagDryRun = args.includes('--dry-run')
  const prev = loadSession()

  // --quick 前置檢查
  if (flagQuick && !prev) {
    p.log.error('無歷史安裝記錄，無法使用 --quick 模式。請先執行 pnpm setup。')
    process.exit(1)
  }
  if (flagQuick) p.log.info(`Quick 模式：重放上次安裝（${prev.timestamp?.slice(0, 19) || '未知時間'}）`)
  if (flagDryRun) p.log.info(pc.yellow('Dry Run 模式：只顯示安裝計畫，不寫入任何檔案'))

  // 斷點續裝
  const incomplete = checkIncompleteSession()
  let resumeMode = false
  if (incomplete.hasIncomplete && !flagAll && !flagQuick) {
    const resume = handleCancel(await p.select({
      message: `偵測到未完成的安裝（上次停在 ${incomplete.lastPhase}，剩餘：${incomplete.pendingTargets.join('、')}）`,
      options: [
        { value: 'resume', label: '繼續上次安裝', hint: '直接跳到執行，推薦' },
        { value: 'restart', label: '重新開始' },
        { value: 'cancel', label: '取消' },
      ],
    }))
    if (resume === 'cancel') process.exit(0)
    resumeMode = resume === 'resume'
  }

  if (fs.existsSync(PREVIEW_DIR)) fs.rmSync(PREVIEW_DIR, { recursive: true })

  console.log()
  p.intro(' ab-dotfiles 安裝精靈 ')

  // ── 續裝模式：跳過 Phase 1+2，用 session 中的選擇直接執行 ──
  if (resumeMode && prev) {
    const selectedTargets = incomplete.pendingTargets
    const manual = prev.mode === 'manual'
    const needsClaude = selectedTargets.includes('claude-dev') || selectedTargets.includes('slack')
    const needsZsh = selectedTargets.includes('zsh')

    p.log.info(`續裝：${selectedTargets.map(k => targets[k]?.label || k).join('、')}（${manual ? '手動' : '自動'}）`)

    const { installSelections, syncResult } = await runPhaseExecute({
      repoDir: REPO, previewDir: PREVIEW_DIR, targets, selectedTargets,
      manual, flagAll: true, flagQuick: false, needsClaude, needsZsh,
      detectedSkills: prev.techStacks || [],
      eccSelectedNames: prev.eccSelections ? {
        commands: new Set(prev.eccSelections.commands || []),
        agents: new Set(prev.eccSelections.agents || []),
        rules: new Set(prev.eccSelections.rules || []),
      } : null,
      fetchedSources: { sources: [], localNames: new Set() },
      selectedRepos: prev.repos || [], prev,
    })

    await runPhaseReport({
      repoDir: REPO, manual, needsClaude, needsZsh,
      selectedTargets, selectedRepos: prev.repos || [],
      categorizedTechs: new Map(),
      detectedSkills: prev.techStacks || [],
      pipelineResult: null, syncResult, installSelections,
      eccSelectedNames: null,
    })
    return
  }

  // ── Phase loop（支持 BACK 回退）──
  let phase = 1
  let intentResult = null
  let analysisResult = null

  while (phase <= 4) {
    if (phase === 1) {
      // Phase 1：意圖
      intentResult = await runPhaseIntent({
        targets, args, flagAll, flagManual, flagQuick, prev,
      })
      // Phase 1 是第一步，不支持回退
      phase = 2
      continue
    }

    if (phase === 2) {
      // Phase 2：分析
      const { needsClaude } = intentResult
      analysisResult = {
        selectedRepos: [], detectedSkills: [], categorizedTechs: new Map(),
        eccSelectedNames: null, fetchedSources: { sources: [], localNames: new Set() },
        pipelineResult: null, repoNpmMap: {}, allLangs: [],
      }
      if (needsClaude) {
        const result = await runPhaseAnalysis({ sources, baseDir: REPO, prev, flagQuick })
        if (result === BACK) { phase = 1; continue }
        analysisResult = result
      }

      // dry-run
      if (flagDryRun) {
        const { selectedTargets, manual } = intentResult
        p.log.info(pc.yellow('=== Dry Run 安裝計畫 ===') + '\n' + [
          `Targets: ${selectedTargets.map(k => targets[k]?.label || k).join('、')}`,
          `Mode: ${manual ? '手動' : '自動'}`,
          `Repos: ${analysisResult.selectedRepos.length} 個`,
          `Tech Stacks: ${analysisResult.detectedSkills.length} 個`,
          `ECC: ${analysisResult.eccSelectedNames ? Object.values(analysisResult.eccSelectedNames).reduce((s, v) => s + v.size, 0) : 0} 個`,
        ].join('\n'))
        p.log.success(pc.yellow('Dry Run 完成 — 未寫入任何檔案'))
        process.exit(0)
      }
      phase = 3
      continue
    }

    if (phase === 3) {
      // Phase 3：執行
      const { selectedTargets, manual, needsClaude, needsZsh } = intentResult
      const { installSelections, syncResult } = await runPhaseExecute({
        repoDir: REPO, previewDir: PREVIEW_DIR, targets, selectedTargets,
        manual, flagAll, flagQuick, needsClaude, needsZsh,
        detectedSkills: analysisResult.detectedSkills,
        eccSelectedNames: analysisResult.eccSelectedNames,
        fetchedSources: analysisResult.fetchedSources,
        selectedRepos: analysisResult.selectedRepos, prev,
      })

      // Phase 4：報告
      await runPhaseReport({
        repoDir: REPO, manual, needsClaude, needsZsh,
        selectedTargets, selectedRepos: analysisResult.selectedRepos,
        categorizedTechs: analysisResult.categorizedTechs,
        detectedSkills: analysisResult.detectedSkills,
        pipelineResult: analysisResult.pipelineResult,
        syncResult, installSelections,
        eccSelectedNames: analysisResult.eccSelectedNames,
      })
      phase = 5 // done
    }
  }
}

main().catch(e => { p.log.error(e.message); process.exit(1) })
