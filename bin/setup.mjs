#!/usr/bin/env node
/**
 * ab-dotfiles 統一安裝 CLI（config-driven）
 *
 * 流程：
 *   1. 環境檢查 + 選 targets + mode
 *   2. 選 repos → 並行分析：
 *      - repos fetch + ECC fetch
 *      - per-repo AI 分類（並行，各自快取）
 *      - merge + dedup → 開發者畫像
 *      - ECC AI 推薦（背景）
 *   3. 技術棧確認（確認預選 / 自訂 / 補充）+ ECC 選擇
 *   4. 備份 + 生成 stacks/ + 寫入 ECC
 *   5. 執行 targets → 報告
 */

import * as p from '@clack/prompts'
import { spawn } from 'child_process'
import pc from 'picocolors'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

import { handleCancel, multiselectWithAll } from '../lib/ui.mjs'
import { interactiveRepoSelect } from '../lib/repo-select.mjs'
import { runTarget } from '../lib/install-handlers.mjs'
import { backupIfExists, cleanOldBackups, BACKUP_DIR, BACKUP_TIMESTAMP } from '../lib/backup.mjs'
import { ensureEnvironment } from '../lib/doctor.mjs'
import { BACKUP_MAX_COUNT, AI_REPO_MODEL, AI_REPO_EFFORT, AI_REPO_TIMEOUT, AI_REPO_CACHE, AI_REPO_MAX_CATEGORIES, AI_REPO_MAX_TECHS, AI_CONCURRENCY } from '../lib/constants.mjs'
import { buildSyncResult, writeSyncedFiles } from '../lib/source-sync.mjs'
import { generateReport, saveReport, openInBrowser } from '../lib/report.mjs'
import { loadSession, saveSession } from '../lib/session.mjs'
import { runAnalysisPipeline } from '../lib/pipeline/pipeline-runner.mjs'
import { showRepoSummary, selectTechStacks } from '../lib/pipeline/tech-select-ui.mjs'
import { selectEcc } from '../lib/pipeline/ecc-select-ui.mjs'
import { generateProfile, showProfile } from '../lib/pipeline/profile-generator.mjs'
import { env } from '../lib/env.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '..')
const PREVIEW_DIR = path.join(REPO, 'dist', 'preview')

function loadConfig() {
  const cfgPath = path.join(REPO, 'config.json')
  return fs.existsSync(cfgPath) ? JSON.parse(fs.readFileSync(cfgPath, 'utf8')) : { targets: {} }
}

/**
 * 從 .env ECC_SOURCES 解析 sources，fallback 到 config.json
 * 格式：name|repo|priority（多個用逗號分隔）
 */
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

// ── 輔助：跑 scan.mjs 生成 stacks/ ────────────────────────────
function runScan(skills) {
  return new Promise((resolve) => {
    const child = spawn('node', ['bin/scan.mjs', '--init', '--no-ai', '--skills', skills.join(',')], { cwd: REPO })
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

// ══════════════════════════════════════════════════════════════════
async function main() {
  const config = loadConfig()
  const targets = config.targets || {}
  const sources = loadSources(config.sources)
  const args = process.argv.slice(2)
  const flagAll = args.includes('--all')
  const flagManual = args.includes('--manual')
  const prev = loadSession() // 上次的選擇（用作預設值）

  if (fs.existsSync(PREVIEW_DIR)) fs.rmSync(PREVIEW_DIR, { recursive: true })

  console.log()
  p.intro(' ab-dotfiles 安裝精靈 ')

  // ┌─────────────────────────────────────────────────────────────
  // │ 階段 1：環境 + 意圖（先問用戶要裝什麼，再決定分析什麼）
  // └─────────────────────────────────────────────────────────────

  await ensureEnvironment()

  // 選 targets
  let selectedTargets
  if (flagAll) {
    selectedTargets = Object.keys(targets)
    p.log.info(`安裝目標：${selectedTargets.map(k => targets[k]?.label || k).join('、')}`)
  } else {
    const flagged = Object.entries(targets).filter(([, d]) => d.flag && args.includes(d.flag)).map(([k]) => k)
    if (flagged.length > 0) {
      selectedTargets = flagged
    } else {
      selectedTargets = await multiselectWithAll({
        message: '選擇要安裝的項目',
        options: Object.entries(targets).map(([k, d]) => ({ value: k, label: `${d.label}  ${pc.dim(d.hint || '')}` })),
        required: true,
        initialValues: prev?.targets || [],
      })
    }
    p.log.success(`已選擇：${selectedTargets.map(k => targets[k]?.label || k).join('、')}`)
  }

  // 選 mode
  let manual = flagManual
  if (!flagAll && !flagManual) {
    const mode = handleCancel(await p.select({
      message: '安裝模式',
      options: [
        { value: 'auto', label: `自動安裝  ${pc.dim('直接部署 + 打包 plugins')}` },
        { value: 'manual', label: `手動模式  ${pc.dim('生成到 dist/preview/，自行複製')}` },
      ],
    }))
    manual = mode === 'manual'
    p.log.success(`模式：${manual ? pc.cyan('手動') : pc.cyan('自動')}`)
  }

  const needsClaude = selectedTargets.includes('claude-dev') || selectedTargets.includes('slack')
  const needsZsh = selectedTargets.includes('zsh')

  // ┌─────────────────────────────────────────────────────────────
  // │ 階段 2：分析（只在需要 Claude targets 時才跑）
  // └─────────────────────────────────────────────────────────────

  let detectedSkills = []
  let categorizedTechs = new Map()
  let eccSelectedNames = null
  let fetchedSources = { sources: [], localNames: new Set() }
  let selectedRepos = []
  let repoNpmMap = {}
  let allLangs = []
  let pipelineResult = null

  if (needsClaude) {
    // 選 repos
    p.log.info('連結 GitHub 選擇倉庫')
    selectedRepos = await interactiveRepoSelect()
    if (selectedRepos.length === 0) { p.log.warn('未選擇倉庫'); process.exit(0) }

    // ── Pipeline：repos fetch + per-repo AI（並行）+ merge ──
    const sP = p.spinner()
    let classifyDone = 0
    const repoCount = selectedRepos.length

    pipelineResult = await runAnalysisPipeline({
      repos: selectedRepos,
      sources,
      baseDir: REPO,
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
        if (phase === 'merge-done') sP.stop(`技術棧整合完成：${detail.totalTechs} 個${detail.conflicts ? `（${detail.conflicts} 衝突已仲裁）` : ''}`)
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

    // 背景產生開發者畫像（AI，與 repo 摘要顯示並行）
    const profilePromise = generateProfile(pipelineResult)

    // 顯示 per-repo 摘要（不等 AI）
    showRepoSummary(pipelineResult)

    // 等待畫像完成後顯示（加 spinner）
    const sProfile = p.spinner()
    sProfile.start('生成開發者畫像...')
    const profile = await profilePromise
    sProfile.stop('開發者畫像完成')
    showProfile(profile, p)

    // 用戶選技術棧（第一個 repo = 貢獻度最高 = 主力 repo）
    const primaryRepo = pipelineResult.repoData[0]?.name
    detectedSkills = await selectTechStacks(categorizedTechs, prev, primaryRepo, pipelineResult.coreCategories)

    // ECC 外部資源選擇
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
  }

  // ┌─────────────────────────────────────────────────────────────
  // │ 階段 3：備份 → 並行寫入 → 安裝
  // └─────────────────────────────────────────────────────────────

  // 備份（並行）
  const HOME = process.env.HOME
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
  if (backupTasks.length) await Promise.all(backupTasks)

  // 並行：生成 stacks/ + 寫入 ECC + 更新 config.json
  const parallelTasks = []

  // 記錄選擇的 repos（存到快取，不汙染 config.json）
  if (selectedRepos.length > 0) {
    const cacheDir = path.join(REPO, '.cache')
    fs.mkdirSync(cacheDir, { recursive: true })
    fs.writeFileSync(path.join(cacheDir, 'repos.json'), JSON.stringify(selectedRepos, null, 2) + '\n')
  }

  // stacks/
  let scanLines = []
  if (detectedSkills.length > 0) {
    parallelTasks.push(runScan(detectedSkills).then(lines => { scanLines = lines }))
  }

  // ECC：用已取得的資料寫入（不需重新 fetch）
  let syncResult = null
  if (eccSelectedNames && fetchedSources.sources?.length > 0) {
    parallelTasks.push((async () => {
      syncResult = buildSyncResult(fetchedSources, eccSelectedNames)
      const claudePreview = path.join(PREVIEW_DIR, 'claude')
      await writeSyncedFiles(syncResult.downloaded, claudePreview)
      if (!manual) await writeSyncedFiles(syncResult.downloaded, path.join(HOME, '.claude'))
    })())
  }

  if (parallelTasks.length > 0) {
    const sBuild = p.spinner()
    sBuild.start('生成技能庫 + 寫入 ECC...')
    await Promise.all(parallelTasks)
    sBuild.stop('生成完成')
    if (scanLines.length > 0) p.log.message(scanLines.join('\n'))
    if (syncResult) {
      const added = syncResult.results.reduce((s, r) => s + r.added.commands.length + r.added.agents.length + r.added.rules.length, 0)
      const detail = syncResult.results.map(r => {
        const pts = []; if (r.added.commands.length) pts.push(`${r.added.commands.length} cmd`); if (r.added.agents.length) pts.push(`${r.added.agents.length} agent`); if (r.added.rules.length) pts.push(`${r.added.rules.length} rule`)
        return `  ${pc.cyan(r.source)} (${r.version})  +${pts.join(' · ')}`
      }).join('\n')
      p.log.success(`ECC +${added} 個`)
      if (detail) p.log.message(detail)
    }
  }

  // ── 執行 targets ──
  const targetNames = selectedTargets.map(k => targets[k]?.label || k)
  p.log.info(`開始${manual ? '生成' : '安裝'}：${targetNames.join('、')}`)

  const completed = new Set()
  for (const key of selectedTargets) {
    await runTarget(REPO, PREVIEW_DIR, key, targets[key], { selectedTargets, completed, flagAll, manual, skillIds: detectedSkills })
    completed.add(key)
  }

  // ┌─────────────────────────────────────────────────────────────
  // │ 階段 4：摘要 + 報告
  // └─────────────────────────────────────────────────────────────

  p.note([
    `${pc.bold('產出目錄')}  dist/`,
    '  preview/   預覽檔案', '  release/   .plugin 檔案',
    ...(fs.existsSync(BACKUP_DIR) ? [`  backup/    備份（保留 ${BACKUP_MAX_COUNT} 次）`] : []),
    '',
    ...(manual ? [
      `${pc.bold('手動部署')}`,
      ...(needsClaude ? ['  cp -r dist/preview/claude/* ~/.claude/'] : []),
      ...(needsZsh ? ['  cp dist/preview/zsh/modules/*.zsh ~/.zsh/modules/', '  cp dist/preview/zsh/zshrc ~/.zshrc', '  source ~/.zshrc'] : []),
    ] : []),
    ...(fs.existsSync(BACKUP_DIR) ? ['', `${pc.bold('還原')}  pnpm run restore`] : []),
  ].join('\n'), manual ? '📁 手動模式完成' : '✅ 安裝完成')

  // 報告
  const { ghSync } = await import('../lib/github.mjs')
  const reportData = {
    username: ghSync('user', '.login') || '',
    org: selectedRepos[0]?.split('/')[0] || '',
    repos: selectedRepos,
    techStacks: Object.fromEntries([...categorizedTechs].map(([k, v]) => [k, [...v.keys()]])),
    perRepoReasoning: pipelineResult?.perRepo ? Object.fromEntries([...pipelineResult.perRepo].map(([k, v]) => [k, { reasoning: v.reasoning, stacks: v.techStacks }])) : {},
    auditSummary: pipelineResult?.audit?.toSummary() || [],
    ecc: syncResult ? { sources: syncResult.results.map(r => ({ name: r.source, repo: r.repo, version: r.version, cached: r.cached, added: r.added, skipped: r.skipped, hooks: r.hooks })) } : null,
    installed: {
      commands: fs.existsSync(path.join(REPO, 'claude/commands')) ? fs.readdirSync(path.join(REPO, 'claude/commands')).filter(f => f.endsWith('.md')).map(f => f.replace('.md', '')) : [],
      agents: fs.existsSync(path.join(REPO, 'claude/agents')) ? fs.readdirSync(path.join(REPO, 'claude/agents')).filter(f => f.endsWith('.md')).map(f => f.replace('.md', '')) : [],
      rules: fs.existsSync(path.join(REPO, 'claude/rules')) ? fs.readdirSync(path.join(REPO, 'claude/rules')).filter(f => f.endsWith('.md')).map(f => f.replace('.md', '')) : [],
      hooks: fs.existsSync(path.join(REPO, 'claude/hooks.json')),
    },
    stacks: detectedSkills,
    backupDir: fs.existsSync(BACKUP_DIR) ? path.relative(REPO, BACKUP_DIR) : null,
    mode: manual ? 'manual' : 'auto',
    timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
  }

  const html = generateReport(reportData)
  const reportPath = saveReport(html, path.join(REPO, 'dist'))
  p.log.success(`報告 → ${path.relative(REPO, reportPath)}`)

  const shouldOpen = handleCancel(await p.confirm({ message: '瀏覽器打開報告？', initialValue: true }))
  if (shouldOpen) await openInBrowser(reportPath)

  // ── 保存本次所有選擇（下次 setup 作為預設值）──
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
  })
}

main().catch(e => { p.log.error(e.message); process.exit(1) })
