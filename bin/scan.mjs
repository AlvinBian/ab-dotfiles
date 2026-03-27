#!/usr/bin/env node
/**
 * 全自動技術棧掃描 & stacks/ 生成（精簡版）
 *
 * 所有邏輯已拆分至 lib/ 模組：
 *   - lib/skill-detect.mjs  — repo 分析、deps 提取、常量（REPO_DIR, STACKS_DIR）
 *   - lib/tech-detect-api.mjs — 多生態套件 API 查詢（npm/PHP/Python/Go）
 *   - lib/ai-generate.mjs    — AI 可用性檢查、skill 內容生成、stack 目錄管理
 *   - lib/npm-classify.mjs   — npm 噪音過濾、分類推斷、優先級
 *
 * 本檔只保留：
 *   1. CLI 參數解析（--init / --no-ai / --org / --top / --skills）
 *   2. getRepos() — 讀取 config.json 或 GitHub org
 *   3. main() — 並行分析 repos → 過濾技術 → 並行生成 stacks → 報告
 *
 * 用法：
 *   pnpm run scan              ← 掃描 config.json，增量更新 stacks/
 *   pnpm run scan -- --init    ← 清空 stacks/ 重新生成
 *   pnpm run scan -- --no-ai   ← 不用 Claude API（預設有 ANTHROPIC_API_KEY 自動生成）
 *   pnpm run scan -- --skills typescript,vue  ← 只生成指定的 stacks
 *   pnpm run scan -- --org kkday-it
 */

import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'

// ── lib 模組匯入 ────────────────────────────────────────────────
// repo 分析引擎：GitHub API 掃描、deps 提取、路徑常量
import { analyzeRepo, parseRepoEntry, REPO_DIR, STACKS_DIR } from '../lib/skill-detect.mjs'
// 多生態技術偵測：整合 npm/PHP/Python/Go API 的統一入口
import { identifySignificantTechs } from '../lib/tech-detect-api.mjs'
// AI 生成：可用性檢查 + stack 目錄建立（含 AI 生成 / 預設模板 fallback）
import { isAIAvailable, ensureStack } from '../lib/ai-generate.mjs'

// ── CLI 參數解析 ────────────────────────────────────────────────
const args = process.argv.slice(2)

// --init：清空 stacks/ 目錄後重新生成
const flagInit = args.includes('--init')

// --no-ai：強制關閉 AI 生成（即使有 API key 也不用）
const flagNoAI = args.includes('--no-ai')

// 判斷 AI 是否可用：排除 --no-ai 後，檢查 API key 或 claude CLI
const canUseAI = !flagNoAI && isAIAvailable()

// --org <name>：掃描 GitHub organization 的所有 repos（取代 config.json）
const flagOrg = args.includes('--org')
const orgName = flagOrg ? args[args.indexOf('--org') + 1] : null

// --top <n>：只掃描前 n 個 repos（除錯用）
const top = parseInt(args[args.indexOf('--top') + 1]) || 0

// --skills <a,b,c>：只生成指定的 stacks（逗號分隔）
const flagSkills = args.includes('--skills')
const onlySkills = flagSkills
  ? (args[args.indexOf('--skills') + 1] || '').split(',').filter(Boolean)
  : null

// ── getRepos：讀取要掃描的 repo 清單 ────────────────────────────
/**
 * 取得要掃描的 repo 列表
 *
 * 兩種來源：
 *   1. --org → gh api 查詢 org 下所有未封存、非 fork、有內容的 repos
 *   2. 預設 → 讀取 config.json 的 repos 欄位
 *
 * @returns {string[]} repo full name 列表（如 'kkday-it/kkday-b2c-web'）
 */
function getRepos() {
  // 來源 1：GitHub org API
  if (orgName) {
    try {
      const raw = execSync(
        `gh api "orgs/${orgName}/repos?sort=pushed&per_page=100" --paginate --jq '.[] | select(.archived == false and .fork == false and .size > 0) | .full_name'`,
        { encoding: 'utf8', timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'] }
      )
      return raw.trim().split('\n').filter(Boolean)
    } catch (e) {
      console.error(`無法取得 ${orgName} repos`)
      process.exit(1)
    }
  }

  // 來源 2：.cache/repos.json（setup 產生的快取）
  const cacheRepos = path.join(REPO_DIR, '.cache', 'repos.json')
  if (fs.existsSync(cacheRepos)) {
    return JSON.parse(fs.readFileSync(cacheRepos, 'utf8'))
      .map(e => parseRepoEntry(e).repo)
  }

  // 來源 3：config.json（向後相容）
  const configPath = path.join(REPO_DIR, 'config.json')
  if (fs.existsSync(configPath)) {
    const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'))
    if (cfg.repos?.length) return cfg.repos.map(e => parseRepoEntry(e).repo)
  }

  console.error('找不到 repos 設定。請先執行 pnpm run setup')
  process.exit(1)
}

// ── main：主程式編排 ────────────────────────────────────────────
async function main() {
  const repos = getRepos()
  const repoList = top > 0 ? repos.slice(0, top) : repos

  console.log(`\n🔍 掃描 ${orgName || 'config.json'} 中的 ${repoList.length} 個 repos...\n`)

  // --init：清空舊的 stacks/ 目錄
  if (flagInit && fs.existsSync(STACKS_DIR)) {
    fs.rmSync(STACKS_DIR, { recursive: true })
    console.log('  🗑  已清空 stacks/\n')
  }
  fs.mkdirSync(STACKS_DIR, { recursive: true })

  // ── 階段 1：並行分析所有 repos（GitHub API + 多生態 API）──────
  console.log(`  ⚡ 並行分析 ${repoList.length} 個 repos...\n`)
  const globalTechs = new Map()

  const analysisResults = await Promise.allSettled(
    repoList.map(async (repoName) => {
      const name = repoName.split('/')[1]
      // analyzeRepo：GitHub API 取得 branch、languages、根目錄、techFiles
      const analysis = await analyzeRepo(repoName)
      // identifySignificantTechs：多生態 API 查詢 + 檔案/語言兜底偵測
      const techs = await identifySignificantTechs(
        analysis.context.techFiles, analysis.rootFiles, analysis.languages
      )
      return {
        repo: repoName,
        name,
        branch: analysis.branch,
        languages: Object.keys(analysis.languages).slice(0, 5),
        techs: [...techs.keys()],
        techMetas: techs,
        aiFiles: Object.keys(analysis.context.aiConfig),
      }
    })
  )

  // 收集結果：合併所有 repo 的技術到 globalTechs
  const results = []
  for (const r of analysisResults) {
    if (r.status === 'fulfilled') {
      const data = r.value
      for (const [id, meta] of data.techMetas) {
        if (!globalTechs.has(id)) globalTechs.set(id, meta)
      }
      delete data.techMetas
      results.push(data)
      console.log(`  ✔ ${data.name.padEnd(30)} ${data.techs.join(', ') || '(none)'}`)
    } else {
      results.push({ repo: '?', name: '?', error: r.reason?.message, techs: [] })
      console.log(`  ⚠ ${r.reason?.message?.slice(0, 50)}`)
    }
  }

  // ── 階段 2：--skills 過濾 + 並行生成 stacks/ ─────────────────
  // --skills 支援自定義添加：即使 repo 沒偵測到，也為其建立 stack
  if (onlySkills) {
    for (const id of onlySkills) {
      if (!globalTechs.has(id)) {
        globalTechs.set(id, { label: id, priority: 50, detect: { match: 'any' } })
      }
    }
  }

  // 若有 --skills，只保留指定的技術；否則全部生成
  const filteredTechs = onlySkills
    ? new Map([...globalTechs].filter(([id]) => onlySkills.includes(id)))
    : globalTechs

  console.log(`\n📦 生成 stacks/（${filteredTechs.size} 個）...\n`)
  let created = 0, kept = 0, aiGen = 0

  // 並行度限制為 3（避免同時太多 AI API 請求）
  const CONCURRENCY = 3
  const entries = [...filteredTechs].sort((a, b) => a[0].localeCompare(b[0]))
  for (let i = 0; i < entries.length; i += CONCURRENCY) {
    const batch = entries.slice(i, i + CONCURRENCY)
    const batchResults = await Promise.allSettled(
      batch.map(([id, meta]) => ensureStack(id, meta, canUseAI))
    )
    for (let j = 0; j < batch.length; j++) {
      const [id] = batch[j]
      const status = batchResults[j].status === 'fulfilled' ? batchResults[j].value : 'error'
      if (status === 'ai-generated') { aiGen++; console.log(`  🤖 ${id.padEnd(20)} (AI 生成)`) }
      else if (status === 'created') { created++; console.log(`  🆕 ${id.padEnd(20)} (模板)`) }
      else if (status === 'kept') { kept++; console.log(`  ✔  ${id.padEnd(20)} (保留)`) }
      else { console.log(`  ⚠  ${id.padEnd(20)} (失敗)`) }
    }
  }

  // ── 階段 3：掃描報告（--skills 模式只顯示統計，完整報告只在獨立執行時）──
  console.log(`\n📁 stacks/：新建 ${created} / AI 生成 ${aiGen} / 保留 ${kept} / 總計 ${filteredTechs.size}`)

  if (!onlySkills) {
    // 完整報告（只在 pnpm run scan 獨立執行時顯示）
    console.log(`\n${'═'.repeat(60)}`)
    console.log(`📊 掃描報告（${results.length} repos → ${filteredTechs.size} 技術棧）`)
    console.log('═'.repeat(60))

    console.log('\n📋 技術棧清單：')
    for (const key of [...filteredTechs.keys()].sort()) {
      const status = fs.existsSync(path.join(STACKS_DIR, key, 'code-review.md')) ? '✔' : '🆕'
      console.log(`  ${status} ${key}`)
    }

    console.log('\n🤖 AI 工具覆蓋：')
    console.log(`  CLAUDE.md      ${results.filter(r => r.aiFiles?.includes('CLAUDE.md')).length}/${results.length}`)
    console.log(`  AGENTS.md      ${results.filter(r => r.aiFiles?.includes('AGENTS.md')).length}/${results.length}`)
    console.log(`  .claude/       ${results.filter(r => r.aiFiles?.some(f => f.startsWith('.claude/'))).length}/${results.length}`)
  }

  if (created > 0 && !canUseAI) {
    console.log(`\n💡 ${created} 個 stack 使用預設模板。設定 ANTHROPIC_API_KEY 後重跑可 AI 生成`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
