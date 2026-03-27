/**
 * 分析 Pipeline Orchestrator
 *
 * 取代 setup.mjs 中 200+ 行的內聯分析邏輯。
 * 流程：repos fetch + ECC fetch（並行）→ per-repo AI（並行）→ merge → ECC AI 推薦
 */

import { analyzeRepo } from '../skill-detect.mjs'
import { callClaudeJSONStream } from '../claude-cli.mjs'
import { fetchAllSources, filterItems } from '../source-sync.mjs'
import { GH_REPO_ANALYZE_TIMEOUT, AI_CONCURRENCY } from '../constants.mjs'
import { buildRepoSummary, classifyRepo } from './repo-analyzer.mjs'
import { mergeRepoResults } from './merge-dedup.mjs'
import { createAuditTrail } from './audit-trail.mjs'

/**
 * @param {Object} options
 * @param {string[]} options.repos - 選擇的 repo（owner/name 格式）
 * @param {Array} options.sources - ECC sources 配置
 * @param {string} options.baseDir - 專案根目錄
 * @param {Object} options.aiConfig - { model, effort, timeout, maxCategories, maxTechs, cacheEnabled }
 * @param {Function} options.onPhase - (phase, detail) => void
 * @param {Function} options.onRepoProgress - (repo, info) => void
 * @returns {Promise<PipelineResult>}
 */
export async function runAnalysisPipeline({
  repos,
  sources = [],
  baseDir,
  aiConfig = {},
  onPhase = () => {},
  onRepoProgress = () => {},
}) {
  const audit = createAuditTrail()
  const repoNames = repos.map(r => r.split('/')[1])
  const hasEcc = sources.length > 0

  // ── TIER 1：repos fetch + ECC fetch（並行）──
  onPhase('fetch', { message: hasEcc ? '分析 repos + 取得 ECC 來源...' : '分析 repos...' })

  const t0 = Date.now()
  const [analysisResults, eccFetchResult] = await Promise.all([
    Promise.allSettled(repos.map(repo =>
      Promise.race([analyzeRepo(repo), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), GH_REPO_ANALYZE_TIMEOUT))])
    )),
    // 廣泛覆蓋常見語言（此時 repo 分析尚未完成，無法用真實語言）
    hasEcc ? fetchAllSources(sources, ['typescript', 'javascript', 'php', 'python', 'golang', 'rust', 'java', 'kotlin', 'swift', 'csharp'], baseDir, () => {}) : null,
  ])

  audit.record({ phase: 'fetch', action: 'repos+ecc', duration: Date.now() - t0, output: { repoCount: analysisResults.filter(r => r.status === 'fulfilled').length, eccSources: eccFetchResult?.sources?.length || 0 } })

  // 處理 fetch 結果
  const repoData = [] // { name, analysis, summary }
  const repoNpmMap = {}
  const allLangs = new Set()

  for (let i = 0; i < analysisResults.length; i++) {
    if (analysisResults[i].status !== 'fulfilled') continue
    const analysis = analysisResults[i].value
    const name = repoNames[i]
    const { summary, meta, npmDeps } = buildRepoSummary(name, analysis)
    repoData.push({ name, fullName: repos[i], analysis, summary, meta })
    repoNpmMap[name] = npmDeps
    for (const lang of meta.languages) allLangs.add(lang)
  }

  const eccFileCount = eccFetchResult
    ? eccFetchResult.sources.reduce((s, src) => s + src.allFiles.commands.length + src.allFiles.agents.length + src.allFiles.rules.length, 0)
    : 0

  onPhase('fetch-done', { repoCount: repoData.length, eccFileCount })

  // ── TIER 2：per-repo AI 分類（並行，AI_CONCURRENCY 控制）──
  onPhase('classify', { total: repoData.length })

  const concurrency = aiConfig.concurrency || AI_CONCURRENCY || 3
  const classifyResults = []
  const executing = new Set()

  for (const repo of repoData) {
    const task = classifyRepo(repo.name, repo.summary, {
      baseDir,
      model: aiConfig.model || 'haiku',
      effort: aiConfig.effort || 'low',
      timeoutMs: aiConfig.timeout || 30000,
      maxCategories: aiConfig.maxCategories || 10,
      maxTechs: aiConfig.maxTechs || 30,
      cacheEnabled: aiConfig.cacheEnabled !== false,
      onProgress: (info) => onRepoProgress(repo.name, info),
    }).then(result => {
      executing.delete(task)
      audit.record({
        phase: 'classify', repo: repo.name, action: result.fromCache ? 'cache-hit' : 'ai-classify',
        reasoning: result.reasoning,
        tokens: result.tokens,
        output: { categories: Object.keys(result.techStacks).length },
      })
      onPhase('classify-repo-done', { repo: repo.name, fromCache: result.fromCache, result })
      return { repo: repo.name, ...result }
    })

    executing.add(task)
    classifyResults.push(task)
    if (executing.size >= concurrency) await Promise.race(executing)
  }

  const perRepoResults = await Promise.all(classifyResults)

  // ── MERGE + DEDUP ──
  onPhase('merge', {})
  const { categorizedTechs, perRepo, coreCategories, conflicts } = mergeRepoResults(perRepoResults)

  audit.record({
    phase: 'merge', action: 'dedup',
    output: {
      totalTechs: [...categorizedTechs.values()].reduce((s, m) => s + m.size, 0),
      categories: categorizedTechs.size,
      conflicts: conflicts.length,
    },
  })

  if (conflicts.length > 0) {
    for (const c of conflicts) {
      audit.record({ phase: 'merge', action: 'conflict-resolved', reasoning: `${c.tech}: ${JSON.stringify(c.votes)} → ${c.resolved} (${c.reason})` })
    }
  }

  onPhase('merge-done', { totalTechs: [...categorizedTechs.values()].reduce((s, m) => s + m.size, 0), conflicts: conflicts.length })

  // Fallback：全部 AI 都沒結果時用語言偵測
  if (categorizedTechs.size === 0) {
    for (const lang of allLangs) {
      if (!categorizedTechs.has('語言')) categorizedTechs.set('語言', new Map())
      categorizedTechs.get('語言').set(lang.toLowerCase(), { label: lang.toLowerCase(), repos: repoNames })
    }
  }

  // ── ECC AI 推薦（背景用，返回 promise）──
  const allDetectedTechs = [...categorizedTechs.values()].flatMap(m => [...m.keys()])
  let eccAiPromise = null

  if (hasEcc && eccFetchResult) {
    const existingNames = eccFetchResult.localNames || new Set()
    const eccCandidates = []

    for (const src of eccFetchResult.sources) {
      const filtered = filterItems(
        { commands: src.allFiles.commands, agents: src.allFiles.agents, rules: src.allFiles.rules },
        allDetectedTechs.length > 0 ? allDetectedTechs : [...allLangs].map(l => l.toLowerCase()),
        existingNames
      )
      for (const type of ['commands', 'agents', 'rules']) {
        for (const item of filtered[type] || []) {
          const firstLine = (item.content || '').split('\n').find(l => l.replace(/^#+\s*/, '').trim()) || ''
          eccCandidates.push({ type, name: item.name, desc: firstLine.replace(/^#+\s*/, '').trim().slice(0, 50) })
        }
      }
    }

    if (eccCandidates.length > 0) {
      const eccList = eccCandidates.map(c => `[${c.type}] ${c.name.replace('.md', '')} — ${c.desc}`).join('\n')
      const eccPrompt = `你是 Claude Code 配置專家。根據技術棧推薦最相關的外部資源。

技術棧：${allDetectedTechs.join(', ')}

可用資源：
${eccList}

規則：只推薦相關度 > 70% 的，通用工具（git、debug、code-review）也推薦。
回傳純 JSON：{"recommended":["file1.md","file2.md"]}`

      eccAiPromise = callClaudeJSONStream(eccPrompt, { model: 'haiku', effort: 'low', timeoutMs: 30000 })
        .then(r => {
          audit.record({ phase: 'ecc', action: 'ai-recommend', output: { count: r?.recommended?.length || 0 } })
          return r
        })
        .catch(() => null)
    }
  }

  // 保存審計鏈
  audit.save(baseDir)

  return {
    categorizedTechs,
    perRepo,
    perRepoResults,
    repoData,
    repoNpmMap,
    allLangs: [...allLangs],
    coreCategories,
    eccFetchResult,
    eccAiPromise,
    conflicts,
    audit,
  }
}
