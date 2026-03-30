/**
 * Phase: 自動分析
 *
 * Pipeline 分析 + Spotlight 偵測 + 計畫生成
 * 全部自動，不需用戶互動。
 */

import { Listr } from 'listr2'
import { runAnalysisPipeline } from '../pipeline/pipeline-runner.mjs'
import { detectLocalRepos } from '../detect/repo-detect.mjs'
import { generateInstallPlan } from '../config/auto-plan.mjs'
import { generateProfile } from '../pipeline/profile-generator.mjs'
import {
  AI_REPO_MODEL,
  AI_REPO_EFFORT,
  AI_REPO_TIMEOUT,
  AI_REPO_CACHE,
  AI_REPO_MAX_CATEGORIES,
  AI_REPO_MAX_TECHS,
  AI_CONCURRENCY,
} from '../core/constants.mjs'

/**
 * @param {Object} opts
 * @param {Object[]} opts.repos - 含 fullName/commits/pct 的完整 repo 物件陣列
 * @param {Object[]} opts.sources - ECC 來源
 * @param {string} opts.baseDir - ab-dotfiles 根目錄
 * @param {Array} [opts.projectFolders] - 專案文件夾映射
 * @returns {Promise<Object>} plan - 完整安裝計畫
 */
export async function phaseAnalyze({ repos, sources, baseDir, projectFolders }) {
  let pipelineResult = null
  let detectResult = { paths: {}, roleOverrides: {} }
  let profile = null
  let eccResult = { recommended: [] }

  const tasks = new Listr(
    [
      {
        title: 'Repos + ECC fetch',
        task: async (ctx, task) => {
          pipelineResult = await runAnalysisPipeline({
            repos: repos.map(r => r.fullName),
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
            // listr2 管理進度，不需要 onPhase callback
            onPhase: () => {},
            onRepoProgress: () => {},
          })

          // 提取預選技術棧
          const allTechs = [...(pipelineResult.categorizedTechs?.values() || [])].flatMap(m => [...m.keys()])
          pipelineResult.detectedSkills = allTechs
          pipelineResult.preselectedTechs = allTechs

          // ECC 規則匹配（從 pipeline 結果取）
          if (pipelineResult.eccAiPromise) {
            try {
              eccResult = (await pipelineResult.eccAiPromise) || { recommended: [] }
            } catch (e) {
              eccResult = { recommended: [] }
              task.output += ` · ECC 匹配失敗：${e.message?.slice(0, 40) || '未知錯誤'}`
            }
          }

          task.output = `${repos.length} repos · ${allTechs.length} 技術棧 · ${eccResult.recommended?.length || 0} ECC`
        },
      },
      {
        title: '偵測本機路徑',
        task: async (ctx, task) => {
          detectResult = await detectLocalRepos(repos, projectFolders)
          const found = Object.keys(detectResult.paths).length
          const methodLabel = { fd: 'fd + git remote', folder: '文件夾映射', spotlight: 'Spotlight' }
          task.output = `${found}/${repos.length} 找到（${methodLabel[detectResult.method] || 'auto'}）`
        },
      },
      {
        title: '開發者畫像',
        task: async (ctx, task) => {
          if (pipelineResult) {
            profile = await generateProfile(pipelineResult)
            task.output = profile?.role || '分析完成'
          }
        },
      },
      {
        title: '生成安裝計畫',
        task: async (ctx, task) => {
          task.output = '就緒'
        },
      },
    ],
    {
      concurrent: false,
      exitOnError: false,
      rendererOptions: {
        showTimer: true,
        collapseSubtasks: false,
      },
    },
  )

  await tasks.run()

  // 生成計畫
  const plan = generateInstallPlan({
    repos,
    pipelineResult,
    eccResult,
    localPaths: detectResult.paths,
    roleOverrides: detectResult.roleOverrides,
    profile,
  })

  // 附帶 pipelineResult 供後續使用（報告、ECC 等）
  plan._pipelineResult = pipelineResult
  const fetchResult = pipelineResult?.eccFetchResult || null
  // 建立 ECC type map（name → commands/agents/rules）
  if (fetchResult?.sources) {
    const eccTypeMap = {}
    for (const src of fetchResult.sources) {
      for (const f of src.allFiles?.commands || []) eccTypeMap[f.name.replace('.md', '')] = 'commands'
      for (const f of src.allFiles?.agents || []) eccTypeMap[f.name.replace('.md', '')] = 'agents'
      for (const f of src.allFiles?.rules || []) eccTypeMap[f.name.replace('.md', '')] = 'rules'
    }
    if (fetchResult) fetchResult.eccTypeMap = eccTypeMap
  }
  plan._fetchedSources = fetchResult

  return plan
}
