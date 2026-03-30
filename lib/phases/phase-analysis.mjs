/**
 * Phase 2：倉庫選擇 + Pipeline 分析 + 技術棧/ECC 選擇
 */

import * as p from '@clack/prompts'
import pc from 'picocolors'
import { BACK } from '../ui/prompts.mjs'
import { interactiveRepoSelect } from '../repo-select.mjs'
import { runAnalysisPipeline } from '../pipeline/pipeline-runner.mjs'
import { showRepoSummary, selectTechStacks } from '../pipeline/tech-select-ui.mjs'
import { selectEcc } from '../pipeline/ecc-select-ui.mjs'
import { generateProfile, showProfile } from '../pipeline/profile-generator.mjs'
import { AI_REPO_MODEL, AI_REPO_EFFORT, AI_REPO_TIMEOUT, AI_REPO_CACHE, AI_REPO_MAX_CATEGORIES, AI_REPO_MAX_TECHS, AI_CONCURRENCY } from '../constants.mjs'

/**
 * @param {Object} opts
 * @param {Object[]} opts.sources - ECC 來源
 * @param {string} opts.baseDir - REPO 根目錄
 * @param {Object|null} opts.prev - 上次 session
 * @param {boolean} opts.flagQuick
 * @returns {Promise<{ selectedRepos, detectedSkills, categorizedTechs, eccSelectedNames, fetchedSources, pipelineResult, repoNpmMap, allLangs }>}
 */
export async function runPhaseAnalysis({ sources, baseDir, prev, flagQuick }) {
  let detectedSkills = []
  let categorizedTechs = new Map()
  let eccSelectedNames = null
  let fetchedSources = { sources: [], localNames: new Set() }
  let selectedRepos = []
  let repoNpmMap = {}
  let allLangs = []
  let pipelineResult = null

  // 選 repos（傳入 session 預選上次的 org + repos）
  p.log.info('連結 GitHub 選擇倉庫')
  selectedRepos = await interactiveRepoSelect(prev)
  if (selectedRepos === BACK) return BACK
  if (selectedRepos.length === 0) { p.log.warn('未選擇倉庫'); process.exit(0) }

  // Pipeline 分析
  const sP = p.spinner()
  let classifyDone = 0
  const repoCount = selectedRepos.length
  let mergeDoneDetail = null

  pipelineResult = await runAnalysisPipeline({
    repos: selectedRepos,
    sources,
    baseDir,
    aiConfig: {
      model: AI_REPO_MODEL,
      effort: AI_REPO_EFFORT,
      timeout: AI_REPO_TIMEOUT,
      maxCategories: AI_REPO_MAX_CATEGORIES,
      maxTechs: AI_REPO_MAX_TECHS,
      cacheEnabled: AI_REPO_CACHE,
      concurrency: AI_CONCURRENCY,
    },
    onPhase: (phase, detail) => {
      if (phase === 'fetch') sP.start(detail.message)
      if (phase === 'fetch-done') sP.stop(`${detail.repoCount} repos 分析完成${detail.eccFileCount ? ` + ECC ${detail.eccFileCount} 個檔案` : ''}`)
      if (phase === 'classify') { classifyDone = 0; sP.start(`Per-repo AI 分類 [0/${repoCount}]...`) }
      if (phase === 'classify-repo-done') {
        classifyDone++
        const tag = detail.fromCache ? 'cache' : 'AI'
        sP.message(`Per-repo AI 分類 [${classifyDone}/${repoCount}] ${pc.dim(detail.repo + ' ' + tag)}`)
      }
      if (phase === 'merge-done') { mergeDoneDetail = detail }
    },
    onRepoProgress: (repo, info) => {
      if (info.done || info.fromCache) return
      const parts = []
      if (info.outputTokens) parts.push(`out:${info.outputTokens}`)
      if (info.costUSD) parts.push(`$${info.costUSD.toFixed(4)}`)
      if (parts.length) sP.message(`Per-repo AI 分類 [${classifyDone}/${repoCount}] ${pc.dim(repo + ' ' + parts.join(' · '))}`)
    },
  })

  categorizedTechs = pipelineResult.categorizedTechs
  repoNpmMap = pipelineResult.repoNpmMap
  allLangs = pipelineResult.allLangs
  if (pipelineResult.eccFetchResult) fetchedSources = pipelineResult.eccFetchResult

  // 合併 merge-done 訊息與 repo 摘要，一次輸出
  const mergeMsg = mergeDoneDetail
    ? `技術棧整合完成：${mergeDoneDetail.totalTechs} 個${mergeDoneDetail.conflicts ? `（${mergeDoneDetail.conflicts} 衝突已仲裁）` : ''}`
    : '技術棧整合完成'
  const repoSummaryText = showRepoSummary(pipelineResult)
  sP.stop(repoSummaryText ? `${mergeMsg}\n${repoSummaryText}` : mergeMsg)

  // 開發者畫像（背景）
  const profilePromise = generateProfile(pipelineResult)

  const profileReady = await Promise.race([profilePromise, new Promise(r => setTimeout(() => r(null), 500))])
  if (profileReady) showProfile(profileReady, p)

  // 技術棧選擇
  const primaryRepo = pipelineResult.repoData[0]?.name
  detectedSkills = await selectTechStacks(categorizedTechs, prev, primaryRepo, pipelineResult.coreCategories)
  if (detectedSkills === BACK) return BACK

  if (!profileReady) {
    const profile = await profilePromise
    showProfile(profile, p)
  }

  // ECC 選擇
  if (sources.length > 0 && pipelineResult.eccFetchResult) {
    p.log.step('載入 ECC 外部資源...')
    eccSelectedNames = await selectEcc({
      eccFetchResult: pipelineResult.eccFetchResult,
      existingNames: fetchedSources.localNames || new Set(),
      detectedSkills,
      allLangs,
      eccAiPromise: pipelineResult.eccAiPromise,
    })
  }

  return { selectedRepos, detectedSkills, categorizedTechs, eccSelectedNames, fetchedSources, pipelineResult, repoNpmMap, allLangs }
}
