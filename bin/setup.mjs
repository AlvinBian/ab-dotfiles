#!/usr/bin/env node
/**
 * ab-dotfiles 統一安裝 CLI（config-driven）
 * 使用 @clack/prompts 提供美觀的互動式選單
 * 逐步進度顯示
 *
 * 安裝目標由 config.json 的 targets 定義，新增目標不需修改此檔案。
 *
 * 用法：
 *   pnpm run setup              ← 互動式選擇（預設自動安裝）
 *   pnpm run setup -- --all     ← 全部安裝
 *   pnpm run setup -- --manual  ← 手動模式（只生成到 dist/preview/，不自動部署）
 *   pnpm run setup -- --claude  ← 只安裝 Claude 開發規則（由 targets.claude-dev.flag 定義）
 */

import * as p from '@clack/prompts'
import { spawn, execSync } from 'child_process'
import { StringDecoder } from 'string_decoder'
import pc from 'picocolors'
import ora from 'ora'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { mergeSkillFragments, analyzeRepo, extractDeps, parseRepoEntry, listAvailableSkills, ghAsync, STACKS_DIR } from '../lib/skill-detect.mjs'
import { ghSync } from '../lib/github.mjs'
import { backupIfExists, cleanOldBackups, cpDir, BACKUP_DIR, BACKUP_TIMESTAMP } from '../lib/backup.mjs'
import { ensureEnvironment } from '../lib/doctor.mjs'
import { BACKUP_MAX_COUNT, GH_PER_PAGE, GH_REPO_ANALYZE_TIMEOUT, DESC_MAX_LENGTH } from '../lib/constants.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '..')

// ── 載入設定 ──────────────────────────────────────────────────────
function loadConfig() {
  const configPath = path.join(REPO, 'config.json')
  if (fs.existsSync(configPath)) {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'))
  }
  return { targets: {} }
}

// ── GitHub 帳號 + Org + Repo 互動式選擇 ─────────────────────────
async function interactiveRepoSelect() {
  // 1. 檢查 gh 登入
  try {
    execSync('gh auth status', { stdio: ['pipe', 'pipe', 'pipe'] })
  } catch {
    p.log.warn('GitHub CLI 未登入，請先執行 gh auth login')
    process.exit(1)
  }

  // 2. 取得用戶名 + 組織
  const s0 = p.spinner()
  s0.start('取得 GitHub 帳號資訊...')
  const username = ghSync('user', '.login')
  const orgsRaw = ghSync('user/orgs', '.[].login')
  const orgs = orgsRaw ? orgsRaw.split('\n').filter(Boolean) : []
  s0.stop(`已連結 ${pc.cyan(username)}${orgs.length ? ` · ${orgs.length} 個組織` : ''}`)

  // 3. 選擇來源
  const sources = [
    { value: username, label: `${username}（個人）`, hint: '個人倉庫' },
    ...orgs.map(o => ({ value: o, label: o, hint: '組織' })),
  ]

  const selectedSource = handleCancel(await p.select({
    message: `選擇 GitHub 帳號/組織  ↑↓ 選擇 · Enter 確認`,
    options: sources,
  }))
  p.log.success(`已選擇：${pc.cyan(selectedSource)}`)

  // 4. 載入倉庫列表
  const s1 = p.spinner()
  s1.start(`載入 ${selectedSource} 的倉庫列表...`)

  const isPersonal = selectedSource === username
  const repoJq = isPersonal
    ? '.[] | [.full_name, .description // "", .pushed_at[:10], (.stargazers_count|tostring), (.open_issues_count|tostring), (.size|tostring)] | @tsv'
    : '.[] | select(.archived == false and .fork == false and .size > 0) | [.full_name, .description // "", .pushed_at[:10], (.stargazers_count|tostring), (.open_issues_count|tostring), (.size|tostring)] | @tsv'
  const repoUrl = isPersonal
    ? `user/repos?sort=pushed&per_page=${GH_PER_PAGE}&affiliation=owner`
    : `orgs/${selectedSource}/repos?sort=pushed&per_page=${GH_PER_PAGE}`

  const reposRaw = ghSync(repoUrl, repoJq)
  const allRepos = reposRaw.split('\n').filter(Boolean).map(line => {
    const [fullName, desc, pushedAt, stars, issues, size] = line.split('\t')
    return { fullName, desc: desc?.slice(0, DESC_MAX_LENGTH), pushedAt, stars: parseInt(stars) || 0, issues: parseInt(issues) || 0, size: parseInt(size) || 0, commits: 0, pct: 0 }
  })

  s1.stop(`找到 ${pc.green(allRepos.length)} 個倉庫`)

  // 5. 分析貢獻度
  const s2 = p.spinner()
  s2.start(`分析 ${pc.cyan(username)} 的貢獻度...`)

  const quickContribRaw = ghSync(
    `search/commits?q=author:${username}+org:${selectedSource}&sort=author-date&per_page=${GH_PER_PAGE}`,
    '.items[].repository.full_name'
  )
  const contributedRepos = [...new Set(quickContribRaw.split('\n').filter(Boolean))]

  if (contributedRepos.length > 0) {
    const fullCounts = await Promise.allSettled(
      contributedRepos.map(async repo => {
        const count = await ghAsync(`repos/${repo}/contributors?per_page=${GH_PER_PAGE}`,
          `.[] | select(.login=="${username}") | .contributions`)
        return { repo, count: parseInt(count) || 0 }
      })
    )
    for (const r of fullCounts) {
      if (r.status !== 'fulfilled') continue
      const match = allRepos.find(x => x.fullName === r.value.repo)
      if (match) match.commits = r.value.count
    }
  }

  // 計算貢獻佔比
  const totalCommits = allRepos.reduce((sum, r) => sum + r.commits, 0)
  if (totalCommits > 0) {
    allRepos.forEach(r => { r.pct = Math.round(r.commits / totalCommits * 100) })
  }
  const contribCount = allRepos.filter(r => r.commits > 0).length
  s2.stop(`貢獻分析完成：${pc.green(contribCount)} 個有貢獻（共 ${pc.cyan(totalCommits)} commits）`)

  if (allRepos.length === 0) {
    p.log.warn('沒有找到倉庫')
    return []
  }

  // 6. 選擇排序維度
  const sortMode = handleCancel(await p.select({
    message: '倉庫排序方式  ↑↓ 選擇 · Enter 確認',
    options: [
      { value: 'contribution', label: '貢獻度佔比', hint: '按你的 commit 佔比排序，有貢獻的預選' },
      { value: 'activity',     label: '倉庫活躍度', hint: '按最近 push 時間排序' },
      { value: 'stars',        label: '倉庫星數',   hint: '按 star 數排序' },
      { value: 'size',         label: '倉庫大小',   hint: '按程式碼量排序' },
    ],
  }))

  const sortLabels = { contribution: '貢獻度佔比', activity: '倉庫活躍度', stars: '倉庫星數', size: '倉庫大小' }
  p.log.success(`排序方式：${pc.cyan(sortLabels[sortMode])}`)

  // 排序
  const sortFns = {
    contribution: (a, b) => b.pct - a.pct || b.commits - a.commits,
    activity: (a, b) => a.pushedAt < b.pushedAt ? 1 : -1,
    stars: (a, b) => b.stars - a.stars,
    size: (a, b) => b.size - a.size,
  }
  const sorted = [...allRepos].sort(sortFns[sortMode])

  // 預選：有貢獻的
  const preSelected = allRepos.filter(r => r.commits > 0).map(r => r.fullName)

  // 7. 用戶選擇 repos
  const selected = await multiselectWithAll({
    message: `選擇倉庫（${preSelected.length} 個有貢獻已預選）`,
    options: sorted.map(r => {
      const parts = []
      if (r.pct > 0) parts.push(`${r.pct}% · ${r.commits} commits`)
      parts.push(r.pushedAt)
      if (r.stars > 0) parts.push(`⭐${r.stars}`)
      if (r.desc) parts.push(r.desc)
      return { value: r.fullName, label: r.fullName.split('/')[1], hint: parts.join(' · ') }
    }),
    initialValues: preSelected,
  })

  p.log.success(`已選擇 ${selected.length} 個倉庫：${selected.map(r => r.split('/')[1]).join('、')}`)
  return selected
}

// ── 自動發現目錄中的項目 ──────────────────────────────────────────
// .md → 從 YAML frontmatter description 取 hint（第一句）
// .zsh → 從首行 # ── ... ── 註解取 hint
function discoverItems(dir, ext = '.md', filter = null) {
  const fullDir = path.join(REPO, dir)
  if (!fs.existsSync(fullDir)) return []
  let files = fs.readdirSync(fullDir).filter(f => f.endsWith(ext))
  if (filter) {
    const allowed = new Set(filter)
    files = files.filter(f => allowed.has(f.slice(0, -ext.length)))
  }
  return files.map(f => {
    const name = f.slice(0, -ext.length)
    const content = fs.readFileSync(path.join(fullDir, f), 'utf8')
    let hint = name
    if (ext === '.md') {
      const m = content.match(/^description:\s*>?\s*\n?\s*(.+)/m)
      if (m) hint = m[1].trim().split(/[。.]/)[0]
    } else {
      const m = content.match(/^#\s*──\s*(.+?)(?:\s*─|$)/m)
      if (m) hint = m[1].trim()
    }
    const label = ext === '.zsh' ? name : ext === '.md' && dir.includes('agents') ? `@${name}` : `/${name}`
    return { value: name, label, hint }
  })
}

// ── 計算 selected 中實際有對應檔案的數量 ──────────────────────────
function countExisting(dir, names, ext = '.md') {
  try {
    const files = new Set(
      fs.readdirSync(path.join(REPO, dir))
        .filter(f => f.endsWith(ext))
        .map(f => f.slice(0, -ext.length))
    )
    return names.filter(n => files.has(n)).length
  } catch { return 0 }
}

function countFiles(dir, ext = '.md') {
  try {
    return fs.readdirSync(path.join(REPO, dir))
      .filter(f => f.endsWith(ext)).length
  } catch { return 0 }
}

// ── ANSI 清除工具 ─────────────────────────────────────────────────
// 只匹配 ESC[ 開頭的 CSI 序列和 ESC] 開頭的 OSC 序列，不匹配 ESC(B 避免吃掉中文括號
const ANSI_RE = /\x1B\[[0-9;?]*[A-HJKSTfhilmnsu]|\x1B\][^\x07]*\x07/g
const stripAnsi = s => s.replace(ANSI_RE, '').replace(/\r/g, '')

// ── 實時進度執行（每個 item 獨立 spinner）──────────────────────
function runWithProgress(cmd, { cwd = REPO, total, initStatus = '準備中...', parseProgress }) {
  return new Promise((resolve, reject) => {
    let current = 0
    let spinner = ora({ text: `${pc.dim(`[0/${total}]`)} ${initStatus}`, indent: 2 }).start()

    const child = spawn(cmd, { shell: true, cwd })
    let buf = ''
    const stderrChunks = []
    const decoder = new StringDecoder('utf8')

    child.stdout.on('data', chunk => {
      buf += decoder.write(chunk)
      const lines = buf.split('\n')
      buf = lines.pop()
      for (const line of lines) {
        const result = parseProgress(stripAnsi(line))
        if (result === null) continue
        if (typeof result === 'object' && result.statusOnly) {
          spinner.text = `${pc.dim(`[${current}/${total}]`)} ${result.label}`
        } else if (current < total) {
          // 完成當前 item
          current++
          const label = typeof result === 'string' ? result : result.label
          spinner.succeed(`${pc.dim(`[${current}/${total}]`)} ${label}`)
          // 如果還有下一個，開新 spinner
          if (current < total) {
            spinner = ora({ text: `${pc.dim(`[${current}/${total}]`)} ...`, indent: 2 }).start()
          }
        }
      }
    })
    child.stderr.on('data', chunk => { stderrChunks.push(chunk) })

    child.on('close', code => {
      if (code !== 0) {
        spinner.fail(`${pc.dim(`[${current}/${total}]`)} ${pc.red('失敗')}`)
        const stderr = Buffer.concat(stderrChunks).toString().trim()
        reject(new Error(`exit ${code}${stderr ? `\n${stderr}` : ''}`))
      } else {
        if (current < total) {
          spinner.succeed(`${pc.dim(`[${total}/${total}]`)} 完成`)
        }
        resolve()
      }
    })
  })
}

// ── dist 子目錄 ─────────────────────────────────────────────────
const DIST_DIR = path.join(REPO, 'dist')
const PREVIEW_DIR = path.join(DIST_DIR, 'preview')

function stagePreview(targetKey, mapping) {
  // mapping: { 'dest/path': 'source/path', ... }
  const targetDir = path.join(PREVIEW_DIR, targetKey)
  fs.mkdirSync(targetDir, { recursive: true })

  for (const [rel, src] of Object.entries(mapping)) {
    const dest = path.join(targetDir, rel)
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    if (fs.statSync(src).isDirectory()) {
      // copy dir recursively
      cpDir(src, dest)
    } else {
      fs.copyFileSync(src, dest)
    }
  }
  return targetDir
}

// 為 install-claude 類型生成 preview 檔案（支持 skill 合併）
// skillIds: 匹配的技能 ID 列表（可選，用於合併片段到 commands/rules）
function stageClaudePreview(step, selected, installHooks, skillIds = []) {
  const targetDir = path.join(PREVIEW_DIR, 'claude')
  fs.mkdirSync(targetDir, { recursive: true })

  // 複製 commands（合併 skill 片段）
  for (const [key, def] of Object.entries(step.selectable || {})) {
    if (!selected[key]?.length) continue
    for (const name of selected[key]) {
      const src = path.join(REPO, def.dir, `${name}${def.ext}`)
      if (!fs.existsSync(src)) continue
      const subdir = key === 'agents' ? 'agents' : 'commands'
      const destDir = path.join(targetDir, subdir)
      fs.mkdirSync(destDir, { recursive: true })

      let content = fs.readFileSync(src, 'utf8')
      // 合併匹配技能的片段（code-review.md / test-gen.md）
      if (skillIds.length > 0) {
        content = mergeSkillFragments(content, skillIds, `${name}${def.ext}`)
      }
      fs.writeFileSync(path.join(destDir, `${name}${def.ext}`), content)
    }
  }

  // rules（合併 skill 片段）
  if (step.fixed?.rules) {
    const rulesDir = path.join(REPO, 'claude/rules')
    const destRulesDir = path.join(targetDir, 'rules')
    fs.mkdirSync(destRulesDir, { recursive: true })
    if (fs.existsSync(rulesDir)) {
      for (const f of fs.readdirSync(rulesDir).filter(f => f.endsWith('.md'))) {
        if (step.fixed.rules === 'all' || step.fixed.rules.split(',').includes(f.replace('.md', ''))) {
          let content = fs.readFileSync(path.join(rulesDir, f), 'utf8')
          if (skillIds.length > 0) {
            content = mergeSkillFragments(content, skillIds, f)
          }
          fs.writeFileSync(path.join(destRulesDir, f), content)
        }
      }
    }
  }

  // hooks
  if (installHooks) {
    const hooksFile = path.join(REPO, 'claude/hooks.json')
    if (fs.existsSync(hooksFile)) fs.copyFileSync(hooksFile, path.join(targetDir, 'hooks.json'))
  }

  return targetDir
}

// 為 install-modules 類型生成 preview 檔案
function stageModulesPreview(step, selectedModules) {
  const def = Object.values(step.selectable)[0]
  const mapping = {}
  for (const name of selectedModules) {
    const src = path.join(REPO, def.dir, `${name}${def.ext}`)
    if (fs.existsSync(src)) mapping[`modules/${name}${def.ext}`] = src
  }
  // zshrc
  const zshrc = path.join(REPO, 'zsh/zshrc')
  if (fs.existsSync(zshrc)) mapping['zshrc'] = zshrc
  return stagePreview('zsh', mapping)
}

// 初始化時清理舊備份
cleanOldBackups()

// ── npms.io 全自動分類 + 噪音偵測（零硬編碼）──────────────────
// 策略：
//   1. keywords / description 含噪音信號 → devtool（開發工具鏈）
//   2. 無噪音信號 → 按 keywords 自動推斷分類
//   3. popularity ≥ 0.3 → 主技術棧（預設選中）
//   4. 0.05 ≤ popularity < 0.3 且非噪音 → 其他套件（預設不選）
//   5. popularity < 0.05 → 丟棄

// 噪音信號詞（在 keywords 和 description 中偵測）
const NOISE_KEYWORDS = new Set([
  'polyfill', 'ponyfill', 'shim', 'loader', 'preset', 'transpiler',
  'plugin', 'addon', 'extension', 'config', 'configuration',
  'lint', 'linter', 'formatter', 'prettier', 'eslint', 'stylelint',
  'types', 'typings', 'typescript-definitions',
  'wrapper', 'binding', 'bindings', 'adapter',
  'compat', 'compatibility', 'migration',
  'devtool', 'devtools', 'debug', 'debugger',
])
const NOISE_DESC_PATTERNS = [
  /plugin for (webpack|babel|eslint|postcss|stylelint|rollup|vite|prettier)/,
  /loader for (webpack|rollup)/,
  /(eslint|stylelint|prettier) (rule|config|plugin|preset)/,
  /^(babel|postcss|webpack) /,
  /typescript (type )?definitions/,
  /polyfill for/,
]

function isNoisePkg(keywords, desc) {
  const kw = keywords.map(k => k.toLowerCase())
  if (kw.some(k => NOISE_KEYWORDS.has(k))) return true
  for (const pat of NOISE_DESC_PATTERNS) {
    if (pat.test(desc)) return true
  }
  return false
}

function inferNpmCategory(keywords, desc) {
  const kw = new Set(keywords.map(k => k.toLowerCase()))
  // 按信號強度從高到低匹配
  if (kw.has('framework') || /\bframework\b/.test(desc)) return 'framework'
  if (kw.has('test') || kw.has('testing') || /test(ing)?\s+(framework|runner|library)/.test(desc)) return 'testing'
  if (kw.has('state-management') || kw.has('store') || /state management/.test(desc)) return 'state'
  if (kw.has('css-framework') || kw.has('css-in-js') || /css (framework|library)|utility-first/.test(desc)) return 'css'
  if (kw.has('ui') || kw.has('component') || kw.has('components') || kw.has('design-system') || /\b(ui|component) library\b/.test(desc)) return 'ui'
  if (kw.has('orm') || kw.has('database') || kw.has('db') || kw.has('sql') || /\borm\b|object.relational/.test(desc)) return 'orm'
  if (kw.has('http') || kw.has('ajax') || kw.has('fetch') || kw.has('request') || kw.has('api-client')) return 'http'
  if (kw.has('graphql') || /\bgraphql\b/.test(desc)) return 'graphql'
  if (kw.has('websocket') || kw.has('realtime') || kw.has('socket') || kw.has('real-time')) return 'realtime'
  if (kw.has('auth') || kw.has('authentication') || kw.has('authorization') || kw.has('jwt') || kw.has('oauth')) return 'auth'
  if (kw.has('i18n') || kw.has('internationalization') || kw.has('intl') || kw.has('locale') || kw.has('translation')) return 'i18n'
  if (kw.has('validation') || kw.has('schema') || kw.has('validator') || /schema validation/.test(desc)) return 'validation'
  if (kw.has('bundler') || kw.has('build-tool') || /\bbundler\b|build tool/.test(desc)) return 'build'
  if (kw.has('router') || kw.has('routing') || /\brouter\b/.test(desc)) return 'router'
  if (kw.has('cli') || kw.has('command-line') || kw.has('terminal')) return 'cli'
  if (kw.has('animation') || kw.has('motion') || /\banimation\b/.test(desc)) return 'animation'
  if (kw.has('date') || kw.has('time') || kw.has('datetime') || /date.*(format|manipulat|pars)/.test(desc)) return 'date'
  if (kw.has('analytics') || kw.has('tracking') || kw.has('monitoring') || kw.has('observability')) return 'analytics'
  return 'library'
}

const CATEGORY_LABELS = {
  framework: '框架', testing: '測試', state: '狀態管理', css: 'CSS',
  ui: 'UI 元件庫', orm: 'ORM / 資料庫', http: 'HTTP / API', graphql: 'GraphQL',
  realtime: '即時通訊', auth: '驗證 / Auth', i18n: '國際化', validation: '資料驗證',
  build: '建構工具', router: '路由', cli: 'CLI 工具', animation: '動畫',
  date: '日期 / 時間', analytics: '監控 / 分析', library: '工具庫',
  devtool: '開發工具鏈',
}

// ── UI 工具 ─────────────────────────────────────────────────────
function handleCancel(value) {
  if (p.isCancel(value)) {
    p.cancel('已取消安裝')
    process.exit(0)
  }
  return value
}

async function multiselectWithAll({ message, options, required = false, initialValues = [] }) {
  const ALL_VALUE = '__all__'
  const allOption = { value: ALL_VALUE, label: '全部選擇', hint: '選中此項 = 全選' }
  const result = handleCancel(await p.multiselect({
    message: `${message}  Space 選擇 · Enter 確認`,
    options: [allOption, ...options],
    required,
    initialValues: initialValues.length > 0 ? initialValues : undefined,
  }))
  return result.includes(ALL_VALUE) ? options.map(o => o.value) : result
}

// ── install-claude step handler ─────────────────────────────────
async function handleInstallClaude(step, stepLabel, flagAll, manual = false, skillIds = []) {
  const selected = {}   // { commands: [...], agents: [...] }
  let installHooks = false

  // 可選項目（commands / agents）
  for (const [key, def] of Object.entries(step.selectable || {})) {
    const items = discoverItems(def.dir, def.ext, def.filter)
    if (items.length === 0) continue
    selected[key] = flagAll
      ? items.map(i => i.value)
      : await multiselectWithAll({
          message: `${stepLabel}${def.selectLabel || key}`,
          options: items,
        })
  }

  // hooks 確認
  if (step.hooksConfirm && (step.fixed?.hooks || false)) {
    installHooks = flagAll
      ? true
      : handleCancel(await p.confirm({
          message: `${stepLabel}安裝 Hooks？ Y 確認 · n 跳過`,
          initialValue: true,
        }))
  }

  // 計算 total
  let total = 0
  const cmdArgs = []

  if (selected.commands?.length) {
    total += countExisting(step.selectable.commands.dir, selected.commands, step.selectable.commands.ext)
    cmdArgs.push(`--commands "${selected.commands.join(',')}"`)
  }
  if (selected.agents?.length) {
    total += countExisting(step.selectable.agents.dir, selected.agents, step.selectable.agents.ext)
    cmdArgs.push(`--agents "${selected.agents.join(',')}"`)
  }

  // rules 選擇
  if (step.fixed?.rules) {
    let rulesArg = step.fixed.rules
    if (step.fixed.rules === 'all') {
      // 讓用戶選擇 rules
      const ruleItems = discoverItems('claude/rules', '.md')
      if (ruleItems.length > 0 && !flagAll) {
        const selectedRules = await multiselectWithAll({
          message: `${stepLabel}Rules`,
          options: ruleItems,
        })
        rulesArg = selectedRules.join(',')
        total += selectedRules.length
      } else {
        total += countFiles('claude/rules')
      }
    } else {
      total += rulesArg.split(',').length
    }
    cmdArgs.push(`--rules "${rulesArg}"`)
  }

  if (installHooks) {
    cmdArgs.push('--hooks')
    total += 1
  }

  if (total === 0) return

  const hooksLabel = installHooks ? ' · hooks' : ''
  const cmdsLen = selected.commands?.length ?? 0
  const agentsLen = selected.agents?.length ?? 0
  const summaryParts = []
  if (cmdsLen) summaryParts.push(`${cmdsLen} commands`)
  if (agentsLen) summaryParts.push(`${agentsLen} agents`)
  if (step.fixed?.rules) summaryParts.push('rules')

  // 生成 preview 到 dist/
  p.log.info(`${stepLabel}生成 ${summaryParts.join(' · ')}${hooksLabel} → dist/preview/claude/`)
  const previewDir = stageClaudePreview(step, selected, installHooks, skillIds)

  // 逐項顯示生成的檔案
  const allItems = [
    ...(selected.commands || []).map(n => `commands/${n}.md`),
    ...(selected.agents || []).map(n => `agents/${n}.md`),
  ]
  if (step.fixed?.rules) {
    const rulesDir = path.join(REPO, 'claude/rules')
    if (fs.existsSync(rulesDir)) {
      allItems.push(...fs.readdirSync(rulesDir).filter(f => f.endsWith('.md')).map(f => `rules/${f}`))
    }
  }
  if (installHooks) allItems.push('hooks.json')
  if (allItems.length > 0) {
    const lines = allItems.map((item, i) => `  ${pc.green('✔')} ${pc.dim(`[${i + 1}/${allItems.length}]`)} ${item}`).join('\n')
    p.log.message(lines)
  }

  if (manual) {
    p.log.success(`${stepLabel}✔ 已生成 → dist/preview/claude/`)
    return
  }

  p.log.info(`${stepLabel}安裝 ${summaryParts.join(' · ')}${hooksLabel} → ~/.claude/`)

  await runWithProgress(
    `${step.script} ${cmdArgs.join(' ')}`,
    {
      total,
      initStatus: '初始化...',
      parseProgress(line) {
        const m = line.match(/^\s+[✅─⚠]\s+(\S+)/)
        return m ? m[1].trim() : null
      },
    },
  )

  p.log.success(`${stepLabel}✔ ${summaryParts.join(' · ')}${hooksLabel} 已安裝`)
}

// ── build-plugin step handler ───────────────────────────────────
// 根據 phases 陣列自動追蹤進度
async function handleBuildPlugin(step, stepLabel) {
  p.log.info(`${stepLabel}打包 plugin...`)

  const phases = step.phases || []
  const seen = new Set()

  try {
    const child = spawn(step.script, { shell: true, cwd: REPO })
    let buf = ''
    const decoder2 = new StringDecoder('utf8')
    const completedPhases = []

    await new Promise((resolve, reject) => {
      child.stdout.on('data', chunk => {
        buf += decoder2.write(chunk)
        const lines = buf.split('\n')
        buf = lines.pop()
        for (const line of lines) {
          const clean = stripAnsi(line)
          for (const phase of phases) {
            if (seen.has(phase)) continue
            if (phase === '打包完成') {
              if (/✅.*打包完成/.test(clean)) { seen.add(phase) }
            } else if (clean.includes(phase)) {
              seen.add(phase)
              completedPhases.push(phase)
            }
          }
        }
      })
      child.stderr.on('data', () => {})
      child.on('close', code => code !== 0 ? reject(new Error(`exit ${code}`)) : resolve())
    })

    // 一次性輸出所有 phases，避免 clack 在每個 message 間插空行
    if (completedPhases.length > 0) {
      const lines = completedPhases.map(ph => `  ${pc.green('✔')} ${ph}`).join('\n')
      p.log.message(lines)
    }

    p.log.success(`${stepLabel}✔ ${step.successMsg || '打包完成'}`)
  } catch (e) {
    p.log.warn(`${stepLabel}打包失敗：${e.message.slice(0, 60)}`)
  }
}

// ── install-modules step handler ────────────────────────────────
async function handleInstallModules(step, stepLabel, flagAll, manual = false) {
  const def = Object.values(step.selectable)[0]
  const key = Object.keys(step.selectable)[0]
  const items = discoverItems(def.dir, def.ext)
  if (items.length === 0) return

  const selectedModules = flagAll
    ? items.map(i => i.value)
    : await multiselectWithAll({
        message: `${stepLabel}${def.selectLabel || key}`,
        options: items,
      })

  if (selectedModules.length === 0) return

  // 計算 total（brew 工具 + modules + .zshrc + .ripgreprc）
  const extra = step.extraTotal || {}
  const needsBrew = selectedModules.some(m => ['fzf', 'tools', 'git', 'plugins'].includes(m))
  const brewToolCount = needsBrew ? 11 : 0  // BREW_TOOLS 數量（見 zsh/install.sh）
  let total = brewToolCount + selectedModules.length + (extra.base || 0)
  for (const [mod, count] of Object.entries(extra.ifModule || {})) {
    if (selectedModules.includes(mod)) total += count
  }

  // 生成 preview 到 dist/
  p.log.info(`${stepLabel}生成 ${selectedModules.length}/${items.length} 個 ${key} → dist/preview/zsh/`)
  const previewDir = stageModulesPreview(step, selectedModules)

  // 逐項顯示
  const moduleItems = [...selectedModules.map(m => `modules/${m}.zsh`), 'zshrc']
  if (moduleItems.length > 0) {
    const lines = moduleItems.map((item, i) => `  ${pc.green('✔')} ${pc.dim(`[${i + 1}/${moduleItems.length}]`)} ${item}`).join('\n')
    p.log.message(lines)
  }

  if (manual) {
    p.log.success(`${stepLabel}✔ 已生成 → dist/preview/zsh/`)
    return
  }

  p.log.info(`${stepLabel}安裝 ${selectedModules.length}/${items.length} 個 ${key} → ~/.zsh/modules/`)

  await runWithProgress(
    `${step.script} --modules "${selectedModules.join(',')}"`,
    {
      total,
      initStatus: '初始化...',
      parseProgress(line) {
        // brew 工具：區分已安裝 vs 新安裝
        if (/^\s+[✔▶⚠]\s+\S+\s+已安裝/.test(line)) {
          const tool = line.match(/[✔▶⚠]\s+(\S+)/)?.[1] || 'brew'
          return `${tool} ✓`
        }
        if (/^\s+[✔▶⚠]\s+\S+\s+(安裝完成|安裝失敗)/.test(line)) {
          const tool = line.match(/[✔▶⚠]\s+(\S+)/)?.[1] || 'brew'
          return `${tool} 安裝完成`
        }
        if (line.includes('安裝 Homebrew CLI 工具')) {
          return { statusOnly: true, label: '安裝 brew 工具...' }
        }
        // module 檔案
        if (/^\s+[✔▶⚠]\s+\S+\.zsh(?!\S)/.test(line)) {
          return line.match(/(\S+\.zsh)/)?.[1] ?? 'module'
        }
        if (/✔\s+~\/.zshrc/.test(line)) return '~/.zshrc'
        if (/✔\s+~\/.ripgreprc/.test(line)) return '~/.ripgreprc'
        return null
      },
    },
  )

  p.log.success(`${stepLabel}✔ ${selectedModules.length} 個 ${key} 已安裝：${selectedModules.join('、')}`)
}

// ── 通用 target 執行 ────────────────────────────────────────────
async function runTarget(key, def, ctx) {
  const idx = ctx.selectedTargets.indexOf(key) + 1
  const total = ctx.selectedTargets.length
  const targetLabel = def.label || key
  const prefix = total > 1 ? `[${idx}/${total}] ` : ''

  p.log.info(`${prefix}${targetLabel}`)

  for (let si = 0; si < def.steps.length; si++) {
    const step = def.steps[si]

    if (step.skipIf && ctx.completed.has(step.skipIf)) continue

    switch (step.type) {
      case 'install-claude':
        await handleInstallClaude(step, prefix, ctx.flagAll, ctx.manual, ctx.skillIds)
        break
      case 'build-plugin':
        await handleBuildPlugin(step, prefix)
        break
      case 'install-modules':
        await handleInstallModules(step, prefix, ctx.flagAll, ctx.manual)
        break
      default:
        p.log.warn(`  未知的 step type: ${step.type}`)
    }
  }
}

// ── 主程式 ──────────────────────────────────────────────────────
async function main() {
  const config = loadConfig()
  const targets = config.targets || {}
  const args = process.argv.slice(2)
  const flagAll = args.includes('--all')
  const flagManual = args.includes('--manual')

  // 清理上次 preview
  if (fs.existsSync(PREVIEW_DIR)) fs.rmSync(PREVIEW_DIR, { recursive: true })

  console.log()
  p.intro(' ab-dotfiles 安裝精靈 ')

  // ── 環境檢查（自動安裝缺失的依賴）───────────────────────────
  await ensureEnvironment()

  // ── 互動式選擇 repos（每次動態從 GitHub 取得）─────────────────
  p.log.info('連結 GitHub 選擇倉庫')
  const selectedRepos = await interactiveRepoSelect()
  if (selectedRepos.length === 0) {
    p.log.warn('未選擇任何倉庫')
    process.exit(0)
  }

  // ── 技術棧偵測（全 API 驅動，零硬編碼篩選）──────────────────
  // npms.io: popularity 篩選 + keywords 分類 + 噪音偵測
  // Packagist: PHP deps 驗證
  // GitHub Languages: 語言偵測
  let detectedSkills = []
  if (selectedRepos.length > 0) {
    const s = p.spinner()
    const repoNames = selectedRepos.map(r => r.split('/')[1])
    s.start(`分析技術棧：${repoNames.join('、')}`)

    // 並行分析所有 repo
    const analyses = await Promise.allSettled(
      selectedRepos.map(repo => {
        return Promise.race([
          analyzeRepo(repo),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), GH_REPO_ANALYZE_TIMEOUT)),
        ])
      })
    )

    // 收集 deps（唯一硬編碼：過濾 @types/ 和 PHP 內部 ext-）
    const allNpmDeps = new Set()
    const allPhpDeps = new Set()
    const allLanguages = new Set()
    const repoNpmMap = {} // repo → Set<dep name>（用於顯示 per-repo 摘要）
    let successCount = 0

    for (let i = 0; i < analyses.length; i++) {
      if (analyses[i].status !== 'fulfilled') continue
      successCount++
      const { context, languages } = analyses[i].value
      const techFiles = context.techFiles
      const repoNpms = new Set()

      if (techFiles['package.json']) {
        try {
          const pkg = JSON.parse(techFiles['package.json'])
          for (const name of [...Object.keys(pkg.dependencies || {}), ...Object.keys(pkg.devDependencies || {})]) {
            if (!name.startsWith('@types/')) {
              allNpmDeps.add(name)
              repoNpms.add(name)
            }
          }
        } catch {}
      }

      if (techFiles['composer.json']) {
        try {
          const c = JSON.parse(techFiles['composer.json'])
          for (const name of [...Object.keys(c.require || {}), ...Object.keys(c['require-dev'] || {})]) {
            if (!/^(php$|ext-|lib-|composer\/|psr\/)/.test(name)) allPhpDeps.add(name)
          }
        } catch {}
      }

      for (const lang of Object.keys(languages)) allLanguages.add(lang)
      repoNpmMap[repoNames[i]] = repoNpms
    }

    // ── npms.io batch：篩選 + 分類 + 噪音偵測（一步到位）──
    const POPULARITY_MAIN = 0.3   // 主技術棧門檻（分到具體分類）
    const POPULARITY_MIN = 0.15   // 最低收錄門檻（低於此直接丟棄）
    const categorizedTechs = new Map() // category → Map<id, {label, popularity}>
    // 記錄每個 npm dep 被分到哪個分類（用於 per-repo 摘要）
    const npmIdMap = new Map() // dep name → { id, catLabel }

    function addTech(catLabel, id, label, popularity = 0) {
      if (!categorizedTechs.has(catLabel)) categorizedTechs.set(catLabel, new Map())
      if (!categorizedTechs.get(catLabel).has(id)) {
        categorizedTechs.get(catLabel).set(id, { label, popularity })
      }
    }

    if (allNpmDeps.size > 0) {
      const npmBatch = [...allNpmDeps]
      const BATCH_SIZE = 50
      for (let i = 0; i < npmBatch.length; i += BATCH_SIZE) {
        const batch = npmBatch.slice(i, i + BATCH_SIZE)
        try {
          const res = await fetch('https://api.npms.io/v2/package/mget', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(batch),
            signal: AbortSignal.timeout(15000),
          })
          if (!res.ok) continue
          const data = await res.json()
          for (const [name, pkg] of Object.entries(data)) {
            const popularity = pkg?.score?.detail?.popularity ?? 0
            if (popularity < POPULARITY_MIN) continue

            const id = name.replace(/^@/, '').replace(/\//g, '-')
            const keywords = pkg?.collected?.metadata?.keywords || []
            const desc = (pkg?.collected?.metadata?.description || '').toLowerCase()

            // 噪音偵測（用 API 返回的 keywords/desc，不用硬編碼 name pattern）
            const noise = isNoisePkg(keywords, desc)
            let catKey
            if (noise) {
              catKey = 'devtool'
            } else if (popularity < POPULARITY_MAIN) {
              catKey = 'library' // 低 popularity 非噪音 → 其他套件
            } else {
              catKey = inferNpmCategory(keywords, desc)
            }

            const catLabel = CATEGORY_LABELS[catKey] || '工具庫'
            addTech(catLabel, id, name, Math.round(popularity * 100))
            npmIdMap.set(name, { id, catLabel })
          }
        } catch {}
      }
    }

    // PHP: Packagist（驗證存在性 + 取 description）
    if (allPhpDeps.size > 0) {
      const phpResults = await Promise.allSettled(
        [...allPhpDeps].map(async name => {
          try {
            const res = await fetch(`https://repo.packagist.org/p2/${name}.json`, { signal: AbortSignal.timeout(5000) })
            if (!res.ok) return null
            const data = await res.json()
            const desc = data?.packages?.[name]?.[0]?.description || ''
            return { name, description: desc }
          } catch { return null }
        })
      )
      for (const r of phpResults) {
        if (r.status !== 'fulfilled' || !r.value) continue
        const { name } = r.value
        addTech('PHP 套件', name.replace(/\//g, '-'), name)
      }
    }

    // 語言
    for (const lang of allLanguages) addTech('語言', lang.toLowerCase(), lang)

    // 統計
    const totalTechs = [...categorizedTechs.values()].reduce((sum, m) => sum + m.size, 0)

    if (successCount > 0) {
      s.stop(`分析完成（${successCount}/${selectedRepos.length}，${totalTechs} 個技術棧）`)
      // per-repo 摘要（只顯示主技術棧 = popularity ≥ 0.3 的）
      const repoLines = Object.entries(repoNpmMap)
        .map(([name, deps]) => {
          const mainTechs = [...deps]
            .map(d => npmIdMap.get(d))
            .filter(m => m && m.catLabel !== '開發工具鏈' && m.catLabel !== '工具庫')
            .map(m => m.id)
          const langIds = [...allLanguages].map(l => l.toLowerCase())
          const all = [...new Set([...mainTechs, ...langIds])]
          const summary = all.length > 10 ? all.slice(0, 8).join(', ') + ` … +${all.length - 8}` : all.join(', ')
          return `  ${pc.cyan(name)}  ${summary || pc.dim('無匹配')}`
        })
        .join('\n')
      if (repoLines) p.log.message(repoLines)
    } else {
      s.stop('分析超時或失敗 — 使用通用配置')
    }

    // ── 分組選擇 UI（groupMultiselect：一頁搞定，選 group = 全選該組）──
    const categoryOrder = [
      '語言', '框架', '狀態管理', 'UI 元件庫', 'CSS', 'HTTP / API', 'GraphQL',
      '即時通訊', 'ORM / 資料庫', '測試', '資料驗證', '驗證 / Auth', '國際化',
      '路由', '動畫', '日期 / 時間', '監控 / 分析', '建構工具',
      'PHP 套件', 'CLI 工具', '工具庫', '開發工具鏈',
    ]
    const sortedCategories = [...categorizedTechs.keys()].sort((a, b) => {
      const ia = categoryOrder.indexOf(a), ib = categoryOrder.indexOf(b)
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib)
    })

    // 隱藏低價值分類（不進入選擇，用戶可在自定義環節手動加）
    const hiddenCategories = new Set(['工具庫', '開發工具鏈'])
    const visibleCategories = sortedCategories.filter(c => !hiddenCategories.has(c))
    const hiddenCount = sortedCategories
      .filter(c => hiddenCategories.has(c))
      .reduce((sum, c) => sum + categorizedTechs.get(c).size, 0)

    if (visibleCategories.length > 0) {
      const groupOptions = {}
      for (const cat of visibleCategories) {
        const items = [...categorizedTechs.get(cat).entries()]
          .sort(([, a], [, b]) => (b.popularity || 0) - (a.popularity || 0))
          .map(([id, meta]) => ({
            value: id,
            label: id,
            hint: meta.popularity ? `${meta.popularity}%` : undefined,
          }))
        groupOptions[cat] = items
      }

      const selected = handleCancel(await p.groupMultiselect({
        message: `選擇技術棧  Space 切換 · 選分類名 = 全選/取消該組 · Enter 確認${hiddenCount > 0 ? pc.dim(`  （已隱藏 ${hiddenCount} 個低價值套件）`) : ''}`,
        options: groupOptions,
      }))
      detectedSkills = selected.filter(v => typeof v === 'string')
    }

    // 自定義補充技術棧（可選，也可加入被隱藏的套件）
    const customInput = handleCancel(await p.text({
      message: '自定義補充技術棧（逗號分隔，直接 Enter 跳過）',
      placeholder: '例如：tailwindcss, prisma, lodash',
      defaultValue: '',
    }))
    if (customInput.trim()) {
      const customs = customInput.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
      for (const c of customs) {
        if (!detectedSkills.includes(c)) detectedSkills.push(c)
      }
    }

    if (detectedSkills.length > 0) {
      p.log.success(`技術棧：${detectedSkills.length} 個已選擇`)
    }

    // 寫入 config.json 並按需生成 stacks/
    const configPath = path.join(REPO, 'config.json')
    if (fs.existsSync(configPath)) {
      const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'))
      cfg.repos = selectedRepos
      fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2) + '\n')
    }

    if (detectedSkills.length > 0) {
      const s2 = p.spinner()
      s2.start('生成技能庫...')
      await new Promise((resolve) => {
        const scanChild = spawn('node', [
          'bin/scan.mjs', '--init', '--no-ai',
          '--skills', detectedSkills.join(','),
        ], { cwd: REPO })
        scanChild.stdout.setEncoding('utf8')
        const scanLines = []
        scanChild.stdout.on('data', chunk => {
          for (const line of chunk.split('\n').filter(l => l.trim())) {
            if (line.includes('✔') || line.includes('🆕') || line.includes('掃描報告') || line.includes('技術棧')) {
              scanLines.push(`  ${line.trim()}`)
            }
          }
        })
        scanChild.on('close', () => {
          if (scanLines.length > 0) p.log.message(scanLines.join('\n'))
          resolve()
        })
      })
      s2.stop('技能庫生成完成')
    }
  }

  // ── 選擇安裝目標 ───────────────────────────────────────────────
  let selectedTargets

  if (flagAll) {
    selectedTargets = Object.keys(targets)
    p.log.info(`安裝目標：${selectedTargets.map(k => targets[k]?.label || k).join('、')}`)
  } else {
    const flagged = Object.entries(targets)
      .filter(([, def]) => def.flag && args.includes(def.flag))
      .map(([key]) => key)

    if (flagged.length > 0) {
      selectedTargets = flagged
      p.log.success(`安裝目標：${selectedTargets.map(k => targets[k]?.label || k).join('、')}`)
    } else {
      const options = Object.entries(targets).map(([key, def]) => ({
        value: key,
        label: def.label,
        hint: def.hint,
      }))
      selectedTargets = await multiselectWithAll({
        message: '選擇要安裝的項目',
        options,
        required: true,
      })
    }
    p.log.success(`已選擇 ${selectedTargets.length} 個目標：${selectedTargets.map(k => targets[k]?.label || k).join('、')}`)
  }

  // ── 選擇安裝模式 ───────────────────────────────────────────────
  let manual = flagManual
  if (!flagAll && !flagManual) {
    const mode = handleCancel(await p.select({
      message: '安裝模式  ↑↓ 選擇 · Enter 確認',
      options: [
        { value: 'auto',   label: '自動安裝',  hint: '自動部署 + 打包 plugins → dist/release/' },
        { value: 'manual', label: '手動模式',  hint: '生成到 dist/preview/，自行複製部署' },
      ],
    }))
    manual = mode === 'manual'
    p.log.success(`安裝模式：${manual ? pc.cyan('手動') + '（生成到 dist/preview/）' : pc.cyan('自動') + '（直接部署 + 打包）'}`)
  }

  // ── 備份現有配置（安裝/打包前統一備份）────────────────────────
  const backupTargets = []
  if (selectedTargets.includes('claude-dev') || selectedTargets.includes('slack')) {
    backupTargets.push([path.join(process.env.HOME, '.claude'), 'claude'])
  }
  if (selectedTargets.includes('zsh')) {
    backupTargets.push([path.join(process.env.HOME, '.zshrc'), 'zshrc'])
    backupTargets.push([path.join(process.env.HOME, '.zsh'), 'zsh'])
  }
  if (backupTargets.length > 0) {
    for (const [target, label] of backupTargets) {
      await backupIfExists(target, label)
    }
  }

  // ── 依序執行 target ────────────────────────────────────────────
  const targetNames = selectedTargets.map(k => targets[k]?.label || k)
  p.log.info(`開始${manual ? '生成' : '安裝'}：${targetNames.join('、')}`)

  const completed = new Set()
  for (const key of selectedTargets) {
    await runTarget(key, targets[key], { selectedTargets, completed, flagAll, manual, skillIds: detectedSkills })
    completed.add(key)
  }

  // ── 完成摘要 ────────────────────────────────────────────────────
  p.note(
    [
      `${pc.bold('產出目錄')}  dist/`,
      `  preview/   預覽檔案（commands / agents / rules / modules）`,
      `  release/   打包的 plugins（.plugin）`,
      ...(fs.existsSync(BACKUP_DIR) ? [`  backup/    原始配置備份（保留最近 ${BACKUP_MAX_COUNT} 次）`] : []),
      '',
      ...(manual ? [
        `${pc.bold('手動部署指令')}`,
        ...(selectedTargets.includes('claude-dev') || selectedTargets.includes('slack')
          ? ['  cp -r dist/preview/claude/* ~/.claude/'] : []),
        ...(selectedTargets.includes('zsh')
          ? ['  mkdir -p ~/.zsh/modules',
             '  cp dist/preview/zsh/modules/*.zsh ~/.zsh/modules/',
             '  cp dist/preview/zsh/zshrc ~/.zshrc',
             '  source ~/.zshrc'] : []),
      ] : []),
      ...(fs.existsSync(BACKUP_DIR) ? [
        '',
        `${pc.bold('還原')}（如需恢復）`,
        `  pnpm run restore           互動式選擇備份版本`,
        `  pnpm run restore:list      列出所有備份`,
      ] : []),
    ].join('\n'),
    manual ? '📁 手動模式完成' : '✅ 安裝完成'
  )
}

main().catch((e) => {
  p.log.error(e.message)
  process.exit(1)
})
