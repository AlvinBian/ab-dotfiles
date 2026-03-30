/**
 * 分析 Pipeline Orchestrator
 *
 * 取代 setup.mjs 中 200+ 行的內聯分析邏輯。
 * 流程：repos fetch + ECC fetch（並行）→ per-repo AI（並行）→ merge → ECC AI 推薦
 */

import fs from 'fs'
import path from 'path'
import { analyzeRepo } from '../skill-detect.mjs'
import { callClaudeJSON } from '../claude-cli.mjs'
import { fetchAllSources, filterItems } from '../source-sync.mjs'
import { GH_REPO_ANALYZE_TIMEOUT, AI_CONCURRENCY, AI_ECC_MODEL, AI_ECC_EFFORT, AI_ECC_TIMEOUT } from '../constants.mjs'
import { pMap } from '../utils/concurrency.mjs'
import { buildRepoSummary, classifyRepo } from './repo-analyzer.mjs'
import { mergeRepoResults } from './merge-dedup.mjs'
import { createAuditTrail } from './audit-trail.mjs'

/**
 * 從 ECC 檔案內容提取描述（跳過 frontmatter 和標題）
 */
function extractEccDesc(content, fallbackName) {
  if (!content) return fallbackName.replace('.md', '')
  const lines = content.split('\n')
  let inFrontmatter = false
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed === '---') { inFrontmatter = !inFrontmatter; continue }
    if (inFrontmatter) {
      // 從 frontmatter 的 description 取
      const descMatch = trimmed.match(/^description:\s*>?\s*(.+)/)
      if (descMatch) return descMatch[1].trim().split(/[。.]/)[0]
      continue
    }
    if (!trimmed || trimmed.startsWith('#')) continue
    // 第一個非空非標題行
    return trimmed.slice(0, 80)
  }
  return fallbackName.replace('.md', '')
}

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

  const perRepoResults = await pMap(repoData, async (repo) => {
    const result = await classifyRepo(repo.name, repo.summary, {
      baseDir,
      model: aiConfig.model || 'haiku',
      effort: aiConfig.effort || 'low',
      timeoutMs: aiConfig.timeout || 30000,
      maxCategories: aiConfig.maxCategories || 10,
      maxTechs: aiConfig.maxTechs || 30,
      cacheEnabled: aiConfig.cacheEnabled !== false,
      onProgress: (info) => onRepoProgress(repo.name, info),
    })
    audit.record({
      phase: 'classify', repo: repo.name, action: result.fromCache ? 'cache-hit' : 'ai-classify',
      reasoning: result.reasoning,
      tokens: result.tokens,
      output: { categories: Object.keys(result.techStacks).length },
    })
    onPhase('classify-repo-done', { repo: repo.name, fromCache: result.fromCache, result })
    return { repo: repo.name, ...result }
  }, { concurrency: aiConfig.concurrency || AI_CONCURRENCY || 3 })

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
          eccCandidates.push({ type, name: item.name, desc: extractEccDesc(item.content, item.name) })
        }
      }
    }

    // 規則匹配推薦（即時，不需 AI）+ 背景翻譯
    if (eccCandidates.length > 0) {
      // ── 規則匹配 ──
      const techSet = new Set(allDetectedTechs.map(t => t.toLowerCase()))
      const langSet = new Set([...allLangs].map(l => l.toLowerCase()))

      // 通用工具關鍵字：名稱包含這些詞就推薦
      const UNIVERSAL_KEYWORDS = [
        'review', 'test', 'lint', 'format', 'style', 'quality', 'security',
        'debug', 'refactor', 'clean', 'fix', 'plan', 'docs', 'doc',
        'commit', 'git', 'pr', 'changelog', 'ci', 'deploy',
        'performance', 'perf', 'accessibility', 'a11y',
        'tdd', 'coverage', 'mock', 'stub',
      ]

      // 語言專用前綴 → 對應語言
      const LANG_PREFIX = {
        'typescript-': 'typescript', 'ts-': 'typescript',
        'javascript-': 'javascript', 'js-': 'javascript',
        'vue-': 'vue', 'react-': 'react', 'node-': 'node',
        'go-': 'go', 'python-': 'python', 'py-': 'python',
        'php-': 'php', 'rust-': 'rust', 'java-': 'java', 'swift-': 'swift',
      }

      // 技術棧相關關鍵字擴展（tech → 額外匹配詞）
      const TECH_EXPAND = {
        vue: ['vue', 'frontend', 'component', 'ui'],
        nuxt: ['nuxt', 'ssr', 'frontend'],
        typescript: ['typescript', 'ts', 'type'],
        jest: ['jest', 'test', 'spec'],
        vitest: ['vitest', 'test', 'spec'],
        webpack: ['webpack', 'bundle', 'build'],
        vite: ['vite', 'bundle', 'build'],
        docker: ['docker', 'container', 'devops'],
        eslint: ['eslint', 'lint', 'format'],
        sass: ['sass', 'scss', 'css', 'style'],
        postcss: ['postcss', 'css', 'style'],
        pinia: ['pinia', 'store', 'state'],
        vuex: ['vuex', 'store', 'state'],
      }

      // 建立擴展匹配集（硬編碼 + 未知 tech 用名稱本身）
      const expandedKeywords = new Set()
      for (const tech of techSet) {
        expandedKeywords.add(tech)
        const extra = TECH_EXPAND[tech]
        if (extra) {
          extra.forEach(k => expandedKeywords.add(k))
        } else {
          // 未知框架：用名稱拆分作為關鍵字（如 socket.io-client → socket, io, client）
          tech.split(/[-./@ ]/).filter(Boolean).forEach(k => expandedKeywords.add(k.toLowerCase()))
        }
      }
      for (const lang of langSet) expandedKeywords.add(lang)

      const recommended = []
      for (const c of eccCandidates) {
        const name = c.name.replace('.md', '').toLowerCase()

        // 語言專用 → 只在語言匹配時推薦
        let isLangSpecific = false
        for (const [prefix, lang] of Object.entries(LANG_PREFIX)) {
          if (name.startsWith(prefix)) {
            isLangSpecific = true
            if (techSet.has(lang) || langSet.has(lang) || expandedKeywords.has(lang)) {
              recommended.push(c.name)
            }
            break
          }
        }
        if (isLangSpecific) continue

        // 通用關鍵字匹配（名稱包含任一關鍵字）
        if (UNIVERSAL_KEYWORDS.some(kw => name.includes(kw))) {
          recommended.push(c.name)
          continue
        }

        // 名稱包含技術棧或擴展關鍵字
        if ([...expandedKeywords].some(k => name.includes(k))) {
          recommended.push(c.name)
          continue
        }

        // 描述包含技術棧關鍵字
        const descLower = (c.desc || '').toLowerCase()
        if ([...expandedKeywords].some(k => descLower.includes(k))) {
          recommended.push(c.name)
        }
      }

      eccAiPromise = Promise.resolve({ recommended })
      audit.record({ phase: 'ecc', action: 'rule-recommend', output: { count: recommended.length, total: eccCandidates.length } })

      // ── 背景翻譯（僅未翻譯的，不阻塞）──
      const transPath = path.join(baseDir, '.cache', 'translations.json')
      let translations = {}
      try { translations = JSON.parse(fs.readFileSync(transPath, 'utf8')) } catch {}

      const untranslated = eccCandidates.filter(c => {
        const key = c.name.replace('.md', '')
        return !translations[c.type]?.[key]
      })

      if (untranslated.length > 0) {
        const batchList = untranslated.map(c => `[${c.type}] ${c.name.replace('.md', '')} — ${c.desc}`).join('\n')
        const transPrompt = `將以下 Claude Code 外部資源翻譯為繁體中文，格式：「簡短名稱 — 一句話說明功能」。

${batchList}

回傳純 JSON：{"translations":{"type:name":"繁體中文翻譯"}}
例如：{"translations":{"commands:build-fix":"建構修復 — 自動修復建構錯誤"}}`

        // 背景跑，不阻塞
        callClaudeJSON(transPrompt, { model: 'haiku', effort: 'low', timeoutMs: AI_ECC_TIMEOUT, retries: 0 })
          .then(r => {
            if (r?.translations) {
              for (const [key, value] of Object.entries(r.translations)) {
                const [type, name] = key.includes(':') ? key.split(':') : ['commands', key]
                if (!translations[type]) translations[type] = {}
                translations[type][name] = value
              }
              fs.mkdirSync(path.dirname(transPath), { recursive: true })
              fs.writeFileSync(transPath, JSON.stringify(translations, null, 2) + '\n')
              audit.record({ phase: 'ecc', action: 'auto-translate', output: { translated: Object.keys(r.translations).length } })
            }
          })
          .catch(() => {})
      }
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
