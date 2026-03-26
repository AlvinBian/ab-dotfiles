#!/usr/bin/env node
/**
 * ab-dotfiles 統一安裝 CLI（config-driven）
 *
 * 優化後流程：
 *   1. 環境檢查
 *   2. 選 targets + mode（先知道要裝什麼，再決定分析什麼）
 *   3. 選 repos（只在 claude-dev target 需要）
 *   4. 並行：分析 repos + 取得 ECC（快取）
 *   5. 一次 AI：技術棧分類 + ECC 推薦
 *   6. 用戶選技術棧 + 選 ECC
 *   7. 備份
 *   8. 並行：生成 stacks/ + 寫入 ECC
 *   9. 執行 targets（安裝/打包）
 *  10. 摘要 + 報告 + 瀏覽器
 */

import * as p from '@clack/prompts'
import { spawn } from 'child_process'
import pc from 'picocolors'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

import { CATEGORY_ORDER } from '../lib/npm-classify.mjs'
import { handleCancel, multiselectWithAll } from '../lib/ui.mjs'
import { interactiveRepoSelect } from '../lib/repo-select.mjs'
import { runTarget } from '../lib/install-handlers.mjs'
import { backupIfExists, cleanOldBackups, BACKUP_DIR, BACKUP_TIMESTAMP } from '../lib/backup.mjs'
import { analyzeRepo } from '../lib/skill-detect.mjs'
import { ensureEnvironment } from '../lib/doctor.mjs'
import { BACKUP_MAX_COUNT, GH_REPO_ANALYZE_TIMEOUT } from '../lib/constants.mjs'
import { fetchAllSources, buildSyncResult, writeSyncedFiles } from '../lib/source-sync.mjs'
import { generateReport, saveReport, openInBrowser } from '../lib/report.mjs'
import { callClaudeJSON } from '../lib/claude-cli.mjs'
import { loadSession, saveSession } from '../lib/session.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '..')
const PREVIEW_DIR = path.join(REPO, 'dist', 'preview')

function loadConfig() {
  const cfgPath = path.join(REPO, 'config.json')
  return fs.existsSync(cfgPath) ? JSON.parse(fs.readFileSync(cfgPath, 'utf8')) : { targets: {} }
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
  const sources = config.sources || []
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
  let eccRecommended = null
  let fetchedSources = { sources: [], localNames: new Set() }
  let selectedRepos = []
  let repoNpmMap = {}
  let allLangs = []

  if (needsClaude) {
    // 選 repos
    p.log.info('連結 GitHub 選擇倉庫')
    selectedRepos = await interactiveRepoSelect()
    if (selectedRepos.length === 0) { p.log.warn('未選擇倉庫'); process.exit(0) }

    const repoNames = selectedRepos.map(r => r.split('/')[1])

    // 並行：分析 repos + 取得 ECC
    const s = p.spinner()
    s.start('分析技術棧 + 取得外部 source...')

    // 只做 repo 分析（ECC 不需要預先 fetch，AI 直接知道 repo 內容）
    const analysisResults = await Promise.allSettled(selectedRepos.map(repo =>
      Promise.race([analyzeRepo(repo), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), GH_REPO_ANALYZE_TIMEOUT))])
    ))
    // 列出本地已有的檔案（用於排除）
    fetchedSources = { sources: [], localNames: new Set() }
    for (const sub of ['commands', 'agents', 'rules']) {
      const dir = path.join(REPO, 'claude', sub)
      if (fs.existsSync(dir)) {
        for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.md'))) fetchedSources.localNames.add(f)
      }
    }

    // 收集 deps
    const allNpmDeps = new Set(), allPhpDeps = new Set(), allLanguages = new Set()
    let successCount = 0

    for (let i = 0; i < analysisResults.length; i++) {
      if (analysisResults[i].status !== 'fulfilled') continue
      successCount++
      const { context, languages } = analysisResults[i].value
      const tf = context.techFiles
      const repoNpms = new Set()

      if (tf['package.json']) {
        try {
          const pkg = JSON.parse(tf['package.json'])
          for (const n of [...Object.keys(pkg.dependencies || {}), ...Object.keys(pkg.devDependencies || {})]) {
            if (!n.startsWith('@types/')) { allNpmDeps.add(n); repoNpms.add(n) }
          }
        } catch {}
      }
      if (tf['composer.json']) {
        try {
          const c = JSON.parse(tf['composer.json'])
          for (const n of [...Object.keys(c.require || {}), ...Object.keys(c['require-dev'] || {})]) {
            if (!/^(php$|ext-|lib-|composer\/|psr\/)/.test(n)) allPhpDeps.add(n)
          }
        } catch {}
      }
      for (const lang of Object.keys(languages)) allLanguages.add(lang)
      repoNpmMap[repoNames[i]] = repoNpms
    }
    allLangs = [...allLanguages]

    s.stop(`${successCount} repos 分析完成`)

    // ── 一次 AI：技術棧分類 + ECC 推薦 ──
    // 預篩：送 AI 之前先去掉明顯的噪音（減少 prompt 大小 + 提高 AI 準確度）
    const NOISE_RE = /^(@types\/|@babel\/|@swc\/|@storybook\/|@typescript-eslint\/|babel-|postcss-|eslint-|stylelint-|webpack-|@eslint\/|@postcss\/)/
    const filteredNpm = [...allNpmDeps].filter(n => !NOISE_RE.test(n))
    const allDeps = [...filteredNpm, ...[...allPhpDeps].map(n => `[php] ${n}`)]

    function addTech(cat, id) {
      if (!categorizedTechs.has(cat)) categorizedTechs.set(cat, new Map())
      categorizedTechs.get(cat).set(id, { label: id })
    }

    // 用戶自有的項目名（AI 推薦時排除這些）
    const localItems = [...(fetchedSources.localNames || [])].map(n => n.replace('.md', '')).join(', ')

    const sourceRepos = sources.map(s => `https://github.com/${s.repo}`).join(' ')
    const eccBlock = sources.length > 0 ? ` Also recommend from ${sourceRepos} (exclude user-owned: ${localItems || 'none'}). In "ecc" field return {commands:[{name:"x.md",desc:"<10chars",reason:"why"}],agents:[...],rules:[...]}. 8-15 commands, 3-8 agents, 5-10 rules. Only matching tech stacks.` : ''

    const prompt = `Classify deps into tech stacks (max 30). Deps ([php]=Composer, rest=npm): ${allDeps.join(', ')}. Languages: ${allLangs.join(', ')}.${eccBlock} Return pure JSON (no code block): {"techStacks":{"category":["id"]}${sources.length > 0 ? ',"ecc":{"commands":[{"name":"x.md","desc":"desc","reason":"reason"}],"agents":[...],"rules":[...]}' : ''}}. Rules: only core tech (framework/UI/state/HTTP/ORM/test/build), discard dev tools. PHP id=vendor-package, npm scoped remove @/. Use Traditional Chinese for category names and desc/reason. Max 8 categories, max 30 total.`

    const sAI = p.spinner()
    sAI.start('AI 分析中...')

    try {
      const parsed = await callClaudeJSON(prompt)
      if (parsed) {
        if (parsed.techStacks) {
          let count = 0
          const MAX_TECHS = 30
          for (const [cat, ids] of Object.entries(parsed.techStacks)) {
            if (!Array.isArray(ids)) continue
            for (const id of ids) {
              if (count >= MAX_TECHS) break
              addTech(cat, String(id))
              count++
            }
            if (count >= MAX_TECHS) break
          }
        }
        if (parsed.ecc) eccRecommended = parsed.ecc
      }
    } catch {}

    const totalTechs = [...categorizedTechs.values()].reduce((sum, m) => sum + m.size, 0)
    if (totalTechs > 0) {
      sAI.stop(`AI 精選 ${totalTechs} 個技術棧${eccRecommended ? ' + ECC 推薦' : ''}`)
      // per-repo 摘要
      const allIds = new Set(); for (const m of categorizedTechs.values()) for (const id of m.keys()) allIds.add(id)
      const lines = Object.entries(repoNpmMap).map(([name, deps]) => {
        const matched = [...deps].map(d => d.replace(/^@/, '').replace(/\//g, '-')).filter(id => allIds.has(id))
        const langs = allLangs.map(l => l.toLowerCase()).filter(id => allIds.has(id))
        const all = [...new Set([...matched, ...langs])]
        const txt = all.length > 8 ? all.slice(0, 6).join(', ') + ` … +${all.length - 6}` : all.join(', ')
        return `  ${pc.cyan(name)}  ${txt || pc.dim('—')}`
      }).join('\n')
      if (lines) p.log.message(lines)
    } else {
      sAI.stop('AI 未回應，使用語言偵測')
      allLangs.forEach(l => addTech('語言', l.toLowerCase()))
    }

    // ── 用戶選技術棧 ──
    const sortedCats = [...categorizedTechs.keys()].sort((a, b) => {
      const ia = CATEGORY_ORDER.indexOf(a), ib = CATEGORY_ORDER.indexOf(b)
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib)
    })

    if (sortedCats.length > 0) {
      // label 直接包含內容預覽（不用 hint，避免要 hover 才看到）
      const catOpts = sortedCats.map(cat => {
        const items = [...categorizedTechs.get(cat).keys()]
        return { value: cat, label: `${cat}  ${pc.dim(items.join(' '))}` }
      })
      const selCats = await multiselectWithAll({ message: '選擇技術棧分類', options: catOpts, initialValues: prev?.techCategories || [] })

      const allSel = []
      for (const cat of selCats) {
        const items = [...categorizedTechs.get(cat).keys()].sort().map(id => ({ value: id, label: id }))
        if (items.length <= 3) { allSel.push(...items.map(i => i.value)); continue }
        allSel.push(...await multiselectWithAll({ message: cat, options: items }))
      }
      detectedSkills = allSel
    }

    // 自定義補充
    const custom = handleCancel(await p.text({ message: '自定義補充技術棧（逗號分隔，Enter 跳過）', placeholder: '例如：tailwindcss, prisma', defaultValue: '' }))
    if (custom?.trim()) {
      for (const c of custom.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)) {
        if (!detectedSkills.includes(c)) detectedSkills.push(c)
      }
    }
    if (detectedSkills.length > 0) p.log.success(`技術棧：${detectedSkills.length} 個`)

    // ── 用戶選 ECC（基於 AI 推薦，確認後才下載）──
    let eccSelectedNames = null
    if (eccRecommended && sources.length > 0) {
      const selNames = { commands: new Set(), agents: new Set(), rules: new Set() }

      for (const type of ['commands', 'agents', 'rules']) {
        const items = eccRecommended[type] || []
        if (!items.length) continue
        const label = { commands: 'Commands', agents: 'Agents', rules: 'Rules' }[type]
        const opts = items.map(item => ({
          value: item.name,
          label: `${item.name.replace('.md', '')}  ${pc.dim(item.desc || '')}  ${pc.cyan('✨ ' + (item.reason || ''))}`,
        }))
        const chosen = await multiselectWithAll({
          message: `ECC ${label}（AI 推薦 ${items.length}）`,
          options: opts,
          initialValues: items.map(i => i.name),
        })
        for (const n of chosen) selNames[type].add(n)
      }
      eccSelectedNames = selNames
    }
  }

  // ┌─────────────────────────────────────────────────────────────
  // │ 階段 3：備份 → 並行寫入 → 安裝
  // └─────────────────────────────────────────────────────────────

  // 備份
  const HOME = process.env.HOME
  if (needsClaude) {
    const cd = path.join(HOME, '.claude')
    for (const sub of ['commands', 'agents', 'rules']) await backupIfExists(path.join(cd, sub), `claude/${sub}`)
    await backupIfExists(path.join(cd, 'hooks.json'), 'claude/hooks.json')
    await backupIfExists(path.join(cd, 'settings.json'), 'claude/settings.json')
  }
  if (needsZsh) {
    await backupIfExists(path.join(HOME, '.zshrc'), 'zshrc')
    await backupIfExists(path.join(HOME, '.zsh', 'modules'), 'zsh/modules')
  }

  // 並行：生成 stacks/ + 寫入 ECC + 更新 config.json
  const parallelTasks = []

  // 記錄選擇的 repos（存到快取，不汙染 config.json）
  if (selectedRepos.length > 0) {
    const cacheDir = path.join(REPO, 'dist', 'cache')
    fs.mkdirSync(cacheDir, { recursive: true })
    fs.writeFileSync(path.join(cacheDir, 'repos.json'), JSON.stringify(selectedRepos, null, 2) + '\n')
  }

  // stacks/
  let scanLines = []
  if (detectedSkills.length > 0) {
    parallelTasks.push(runScan(detectedSkills).then(lines => { scanLines = lines }))
  }

  // ECC：確認後才下載 + 寫入
  let syncResult = null
  if (eccSelectedNames && sources.length > 0) {
    parallelTasks.push((async () => {
      // 現在才 fetch ECC（快取有效則瞬間完成）
      const fetched = await fetchAllSources(sources, detectedSkills, REPO, () => {})
      syncResult = buildSyncResult(fetched, eccSelectedNames)
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
  const eccSel = fetchedSources._selectedNames
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
    eccSelections: eccSel ? {
      commands: [...eccSel.commands],
      agents: [...eccSel.agents],
      rules: [...eccSel.rules],
    } : null,
  })
}

main().catch(e => { p.log.error(e.message); process.exit(1) })
