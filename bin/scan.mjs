#!/usr/bin/env node
/**
 * 全自動技術棧掃描 & stacks/ 生成
 *
 * 流程：
 *   1. 讀取 config.json repos（或掃描 org）
 *   2. GitHub API 自動分析每個 repo（languages + deps + 根目錄）
 *   3. npm registry 自動分類依賴（framework / testing / tool 等）
 *   4. 自動生成 stacks/{tech}/ 目錄 + detect.json
 *   5. Claude API 自動生成 skill 片段內容（code-review / test-gen / code-style）
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
import { fileURLToPath } from 'url'
import { analyzeRepo, parseRepoEntry, extractDeps, REPO_DIR, STACKS_DIR } from '../lib/skill-detect.mjs'

const args = process.argv.slice(2)
const flagInit = args.includes('--init')
const flagNoAI = args.includes('--no-ai')

// AI 可用性：API key 或 claude CLI
function isAIAvailable() {
  if (process.env.ANTHROPIC_API_KEY) return true
  try {
    execSync('which claude', { stdio: ['pipe', 'pipe', 'pipe'] })
    return true
  } catch { return false }
}
const canUseAI = !flagNoAI && isAIAvailable()
const flagOrg = args.includes('--org')
const orgName = flagOrg ? args[args.indexOf('--org') + 1] : null
const top = parseInt(args[args.indexOf('--top') + 1]) || 0
const flagSkills = args.includes('--skills')
const onlySkills = flagSkills ? (args[args.indexOf('--skills') + 1] || '').split(',').filter(Boolean) : null

// ── 多生態技術偵測（全自動，無白名單）──────────────────────────
// npm       → npms.io batch API（popularity score ≥ 0.3）
// PHP       → Packagist API（下載量 ≥ 10k）
// Python    → PyPI JSON API（有 info 即視為有效套件）
// Go/Rust/iOS/Android → 從 dep 檔解析的 module name 直接作為技術
// 語言/檔案 → 兜底偵測

// 噪音過濾（npm deps 中這些直接跳過）
const NOISE_PATTERNS = /^(@types\/|.*-loader$|.*-plugin$|.*-preset$|.*-transform.*|.*-polyfill|.*-shim|.*-helper|.*-utils?$|.*-compat$|.*-mock.*|.*-adapter$|babel-.*|postcss-.*|stylelint-.*|eslint-.*|webpack-.*)/
// PHP 噪音
const PHP_NOISE = /^(php$|ext-|lib-|composer\/|psr\/)/

// ── npm 生態：npms.io batch API ─────────────────────────────────
const NPMS_POPULARITY_THRESHOLD = 0.3
const NPMS_BATCH_SIZE = 50 // npms.io 單次最多 250，50 足夠

async function analyzeNpmDeps(depNames, deps, devDeps) {
  const techs = new Map()
  const filtered = depNames.filter(n => !n.startsWith('@types/') && !NOISE_PATTERNS.test(n))
  if (filtered.length === 0) return techs

  for (let i = 0; i < filtered.length; i += NPMS_BATCH_SIZE) {
    const batch = filtered.slice(i, i + NPMS_BATCH_SIZE)
    try {
      const res = await fetch('https://api.npms.io/v2/package/mget', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(batch),
        signal: AbortSignal.timeout(10000),
      })
      if (!res.ok) continue
      const data = await res.json()

      for (const [name, pkg] of Object.entries(data)) {
        const popularity = pkg?.score?.detail?.popularity ?? 0
        if (popularity < NPMS_POPULARITY_THRESHOLD) continue

        const id = name.replace(/^@/, '').replace(/\//g, '-')
        if (techs.has(id)) continue

        const keywords = pkg?.collected?.metadata?.keywords || []
        const category = inferCategory(keywords, pkg?.collected?.metadata?.description || '')
        const priority = categoryPriority(category)

        techs.set(id, {
          label: name,
          priority,
          category,
          popularity: Math.round(popularity * 100),
          detect: {
            ...(deps[name] ? { deps: [name] } : { devDeps: [name] }),
            match: 'any',
          },
        })
      }
    } catch {}
  }
  return techs
}

// 從 npms.io keywords + description 自動推斷分類
function inferCategory(keywords, description) {
  const kw = new Set(keywords.map(k => k.toLowerCase()))
  const desc = description.toLowerCase()
  // 優先級從高到低匹配
  if (kw.has('framework') || desc.includes('framework')) return 'framework'
  if (kw.has('test') || kw.has('testing') || desc.includes('test runner') || desc.includes('testing framework')) return 'testing'
  if (kw.has('state-management') || kw.has('state') || desc.includes('state management')) return 'state'
  if (kw.has('css') || kw.has('css-framework') || desc.includes('css framework') || desc.includes('utility-first')) return 'css'
  if (kw.has('ui') || kw.has('component') || kw.has('components') || desc.includes('ui library') || desc.includes('component library')) return 'ui'
  if (kw.has('orm') || kw.has('database') || desc.includes('orm') || desc.includes('object-relational')) return 'orm'
  if (kw.has('http') || kw.has('ajax') || kw.has('fetch') || kw.has('request')) return 'http'
  if (kw.has('graphql')) return 'graphql'
  if (kw.has('websocket') || kw.has('realtime') || kw.has('socket')) return 'realtime'
  if (kw.has('auth') || kw.has('authentication') || kw.has('jwt') || kw.has('oauth')) return 'auth'
  if (kw.has('i18n') || kw.has('internationalization') || kw.has('intl')) return 'i18n'
  if (kw.has('validation') || kw.has('schema') || kw.has('validator')) return 'validation'
  if (kw.has('bundler') || kw.has('build') || desc.includes('bundler') || desc.includes('build tool')) return 'build'
  if (kw.has('router') || kw.has('routing')) return 'router'
  if (kw.has('cli') || kw.has('command-line')) return 'cli'
  return 'library'
}

function categoryPriority(category) {
  const map = { framework: 10, state: 25, testing: 30, css: 30, ui: 30, orm: 30, http: 35, graphql: 30, realtime: 35, auth: 35, i18n: 40, validation: 35, build: 45, router: 35, cli: 50, library: 55 }
  return map[category] || 50
}

// ── PHP 生態：Packagist API ─────────────────────────────────────
const PACKAGIST_DL_THRESHOLD = 10000

async function analyzePhpDeps(composerDeps) {
  const techs = new Map()
  const names = Object.keys(composerDeps).filter(n => !PHP_NOISE.test(n))

  const results = await Promise.allSettled(
    names.map(async name => {
      try {
        const res = await fetch(`https://repo.packagist.org/p2/${name}.json`, {
          signal: AbortSignal.timeout(5000),
        })
        if (!res.ok) return null
        const data = await res.json()
        const pkg = data?.packages?.[name]?.[0]
        if (!pkg) return null
        return { name, description: pkg.description || '' }
      } catch { return null }
    })
  )

  for (const r of results) {
    if (r.status !== 'fulfilled' || !r.value) continue
    const { name, description } = r.value
    const id = name.replace(/\//g, '-')
    techs.set(id, {
      label: name,
      priority: 30,
      category: 'php',
      detect: { deps: [name], match: 'any' },
    })
  }
  return techs
}

// ── Python 生態：PyPI JSON API ──────────────────────────────────
async function analyzePythonDeps(pyDeps) {
  const techs = new Map()
  const names = Object.keys(pyDeps).filter(n => !['python', 'pip', 'setuptools', 'wheel'].includes(n))

  const results = await Promise.allSettled(
    names.map(async name => {
      try {
        const res = await fetch(`https://pypi.org/pypi/${name}/json`, {
          signal: AbortSignal.timeout(5000),
        })
        if (!res.ok) return null
        const data = await res.json()
        return { name, description: data?.info?.summary || '' }
      } catch { return null }
    })
  )

  for (const r of results) {
    if (r.status !== 'fulfilled' || !r.value) continue
    const { name, description } = r.value
    techs.set(name, {
      label: name,
      priority: 30,
      category: 'python',
      detect: { deps: [name], match: 'any' },
    })
  }
  return techs
}

// ── Go 生態：從 go.mod 解析的 module path 提取主要依賴 ──────────
function analyzeGoDeps(goDeps) {
  const techs = new Map()
  for (const mod of Object.keys(goDeps)) {
    // go module path 格式：github.com/org/repo → 取最後一段
    const parts = mod.split('/')
    const id = parts[parts.length - 1]
    if (!id || id.startsWith('internal')) continue
    techs.set(id, {
      label: mod,
      priority: 30,
      category: 'go',
      detect: { deps: [mod], match: 'any' },
    })
  }
  return techs
}

// ── 統一介面：多生態分析 ────────────────────────────────────────
async function identifySignificantTechs(techFiles, rootFiles, languages) {
  const { deps, devDeps } = extractDeps(techFiles)
  const techs = new Map()

  // ── 按生態分類 deps ──
  const npmDeps = [], npmDevDeps = {}, phpDeps = {}, pyDeps = {}, goDeps = {}
  const hasFile = new Set(Object.keys(techFiles))

  // npm (package.json)
  if (hasFile.has('package.json')) {
    try {
      const pkg = JSON.parse(techFiles['package.json'])
      Object.assign(npmDevDeps, pkg.devDependencies || {})
    } catch {}
  }
  const npmAllDeps = {}
  // deps/devDeps 來自 extractDeps，含 package.json + composer.json + go.mod + pyproject.toml
  // 分辨來源：npm deps = package.json 的 deps
  if (hasFile.has('package.json')) {
    try {
      const pkg = JSON.parse(techFiles['package.json'])
      const pkgDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) }
      Object.assign(npmAllDeps, pkgDeps)
    } catch {}
  }

  // PHP (composer.json)
  if (hasFile.has('composer.json')) {
    try {
      const c = JSON.parse(techFiles['composer.json'])
      Object.assign(phpDeps, c.require || {}, c['require-dev'] || {})
    } catch {}
  }

  // Python (pyproject.toml)
  if (hasFile.has('pyproject.toml')) {
    const content = techFiles['pyproject.toml']
    for (const m of content.matchAll(/"([a-zA-Z][\w-]*)(?:[><=!~].*)?"/g)) {
      pyDeps[m[1].toLowerCase()] = '*'
    }
  }

  // Go (go.mod)
  if (hasFile.has('go.mod')) {
    const content = techFiles['go.mod']
    for (const m of content.matchAll(/^\t(\S+)\s+v([\d.]+)/gm)) {
      goDeps[m[1]] = m[2]
    }
  }

  // ── 並行查詢所有生態 ──
  const npmDepNames = Object.keys(npmAllDeps)
  const [npmTechs, phpTechs, pyTechs] = await Promise.all([
    npmDepNames.length > 0 ? analyzeNpmDeps(npmDepNames, deps, devDeps) : new Map(),
    Object.keys(phpDeps).length > 0 ? analyzePhpDeps(phpDeps) : new Map(),
    Object.keys(pyDeps).length > 0 ? analyzePythonDeps(pyDeps) : new Map(),
  ])

  // Go（純本地解析，不需網路）
  const goTechs = Object.keys(goDeps).length > 0 ? analyzeGoDeps(goDeps) : new Map()

  // 合併所有生態結果
  for (const source of [npmTechs, phpTechs, pyTechs, goTechs]) {
    for (const [id, meta] of source) {
      if (!techs.has(id)) techs.set(id, meta)
    }
  }

  // ── 從檔案偵測語言 / 平台（兜底）──
  const fileSet = new Set(rootFiles)
  const fileSignals = {
    'composer.json': { id: 'php', label: 'PHP', priority: 10, languages: ['PHP'] },
    'artisan': { id: 'laravel', label: 'Laravel', priority: 20 },
    'go.mod': { id: 'go', label: 'Go', priority: 10, languages: ['Go'] },
    'Cargo.toml': { id: 'rust', label: 'Rust', priority: 10, languages: ['Rust'] },
    'pyproject.toml': { id: 'python', label: 'Python', priority: 10, languages: ['Python'] },
    'requirements.txt': { id: 'python', label: 'Python', priority: 10, languages: ['Python'] },
    'Gemfile': { id: 'ruby', label: 'Ruby', priority: 10, languages: ['Ruby'] },
    'Package.swift': { id: 'swift', label: 'Swift', priority: 10, languages: ['Swift'] },
    'Podfile': { id: 'swift', label: 'Swift (iOS)', priority: 10, languages: ['Swift'] },
    'pubspec.yaml': { id: 'dart', label: 'Dart/Flutter', priority: 10, languages: ['Dart'] },
    'build.gradle.kts': { id: 'kotlin', label: 'Kotlin', priority: 10, languages: ['Kotlin'] },
  }
  for (const [file, meta] of Object.entries(fileSignals)) {
    if (fileSet.has(file) && !techs.has(meta.id)) {
      techs.set(meta.id, { ...meta, detect: { files: [file], ...(meta.languages ? { languages: meta.languages } : {}), match: 'any' } })
    }
  }

  // 從 GitHub Languages 偵測語言
  const langMap = { 'TypeScript': 'typescript', 'PHP': 'php', 'Go': 'go', 'Python': 'python', 'Ruby': 'ruby', 'Swift': 'swift', 'Kotlin': 'kotlin', 'Rust': 'rust', 'Java': 'java', 'Dart': 'dart' }
  for (const [lang, id] of Object.entries(langMap)) {
    if (languages[lang] && !techs.has(id)) {
      techs.set(id, { label: lang, priority: 10, detect: { languages: [lang], match: 'any' } })
    }
  }

  return techs
}

// ── AI 生成 skill 內容（自動選擇最佳方式）─────────────────────
// 優先級：1. ANTHROPIC_API_KEY → 直接 API  2. claude CLI → 本地生成  3. 模板
async function generateSkillContent(techId, techMeta) {
  const prompt = `為 "${techMeta.label}" 技術生成三個 Markdown 片段，用於程式碼審查和測試輔助。

技術描述：${techMeta.description || techMeta.label}
分類：${techMeta.category || 'general'}

生成三個檔案內容，用 ---FILE_SEPARATOR--- 分隔：

1. code-review.md — 審查 checklist（5-8 條，- [ ] 格式）
2. test-gen.md — 測試模式和範例（含程式碼）
3. code-style.md — 命名慣例和格式規範

要求：繁體中文說明，程式碼英文，每個以 ## 標題開頭，簡潔實用。只輸出三個檔案內容。`

  // 方式 1: ANTHROPIC_API_KEY
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const { default: Anthropic } = await import('@anthropic-ai/sdk')
      const client = new Anthropic()
      const model = process.env.ANTHROPIC_MODEL
      if (!model) throw new Error('ANTHROPIC_MODEL 未設定')
      const msg = await client.messages.create({
        model,
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      })
      return parseAIResponse(msg.content[0].text, techMeta.label)
    } catch (e) {
      // fallthrough to method 2
    }
  }

  // 方式 2: claude CLI（如果已安裝）
  try {
    const which = execSync('which claude', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim()
    if (which) {
      const result = execSync(
        `echo ${JSON.stringify(prompt)} | claude --print 2>/dev/null`,
        { encoding: 'utf8', timeout: 60000, stdio: ['pipe', 'pipe', 'pipe'] }
      )
      return parseAIResponse(result, techMeta.label)
    }
  } catch {}

  return null
}

function parseAIResponse(text, label) {
  const parts = text.split('---FILE_SEPARATOR---').map(p => p.trim())
  if (parts.length < 3) return null
  return {
    'code-review.md': parts[0],
    'test-gen.md': parts[1],
    'code-style.md': parts[2],
  }
}

// ── 預設模板生成（不依賴 AI，提供有意義的內容）─────────────────
function generateDefaultTemplates(id, meta) {
  const label = meta.label
  const cat = meta.category || 'general'

  const codeReview = `## ${label} Code Review Checklist

### 架構與設計
- [ ] 元件 / 模組職責單一，無 God Object
- [ ] 依賴方向正確（上層不依賴下層實作細節）
- [ ] 公開 API 面積最小化，內部實作不暴露

### 效能
- [ ] 無不必要的重複計算或重複渲染
- [ ] 大型資料集有分頁 / 虛擬捲動 / lazy loading
- [ ] 非同步操作有適當的錯誤處理與 timeout

### 安全性
- [ ] 使用者輸入已驗證與消毒（sanitize）
- [ ] 敏感資料不寫入 log 或前端 state
- [ ] 依賴版本無已知 CVE

### 可維護性
- [ ] 命名清晰，不需要註解解釋意圖
- [ ] 重複邏輯已抽取為共用函式 / hook / util
- [ ] 錯誤訊息對除錯有幫助（含 context，不只是 "something went wrong"）
`

  const testGen = `## ${label} 測試模式

### 測試策略
- 單元測試：純邏輯函式、工具函式、資料轉換
- 整合測試：元件互動、API 呼叫、狀態管理流程
- E2E 測試：關鍵使用者流程（登入、結帳、表單提交）

### 測試命名慣例
\`\`\`
describe('模組名稱', () => {
  it('should 預期行為 when 條件', () => { ... })
  it('should throw 錯誤類型 when 異常條件', () => { ... })
})
\`\`\`

### 常見模式
- **Arrange-Act-Assert**：準備資料 → 執行操作 → 驗證結果
- **Given-When-Then**：前置條件 → 觸發事件 → 預期狀態
- **邊界值測試**：空陣列、null、undefined、超長字串、負數

### Mock 原則
- 只 mock 外部依賴（API、資料庫、第三方服務）
- 不 mock 被測模組的內部實作
- 使用 factory function 建立測試資料，避免寫死 magic number
`

  const codeStyle = `## ${label} 程式碼風格

### 命名慣例
| 類型 | 慣例 | 範例 |
|------|------|------|
| 變數 / 函式 | camelCase | \`getUserName\`, \`isActive\` |
| 常數 | UPPER_SNAKE_CASE | \`MAX_RETRY_COUNT\`, \`API_BASE_URL\` |
| 類別 / 型別 | PascalCase | \`UserService\`, \`ApiResponse\` |
| 檔案（元件） | PascalCase | \`UserProfile.vue\`, \`AuthGuard.ts\` |
| 檔案（工具） | kebab-case | \`date-utils.ts\`, \`api-client.ts\` |

### 格式規範
- 縮排：2 spaces（前端）/ 4 spaces（後端 PHP/Python/Go）
- 每行最大長度：100~120 字元
- 檔案結尾保留一個空行
- import 排序：內建 → 第三方 → 本地模組，各組之間空一行

### 最佳實踐
- 函式長度不超過 40 行；超過則拆分
- 避免巢狀超過 3 層（early return 降低複雜度）
- 布林變數以 \`is\` / \`has\` / \`should\` / \`can\` 開頭
- 非同步函式以動詞開頭：\`fetchUser\`, \`createOrder\`, \`validateInput\`
`

  return { 'code-review.md': codeReview, 'test-gen.md': testGen, 'code-style.md': codeStyle }
}

// ── 建立/更新 stack 目錄 ────────────────────────────────────────
async function ensureStack(id, meta, useAI = false) {
  const stackDir = path.join(STACKS_DIR, id)
  const detectPath = path.join(stackDir, 'detect.json')

  // 已有完整檔案 → 跳過
  if (fs.existsSync(detectPath) &&
      fs.existsSync(path.join(stackDir, 'code-review.md')) &&
      fs.existsSync(path.join(stackDir, 'test-gen.md')) &&
      fs.existsSync(path.join(stackDir, 'code-style.md'))) {
    return 'kept'
  }

  fs.mkdirSync(stackDir, { recursive: true })

  // detect.json — 永遠寫入
  const detectJson = { id, label: meta.label, priority: meta.priority || 50, detect: { ...meta.detect, match: 'any' } }
  if (meta.excludes) detectJson.excludes = meta.excludes
  fs.writeFileSync(detectPath, JSON.stringify(detectJson, null, 2) + '\n')

  // skill 內容（嘗試 AI 生成）
  let files = null
  if (useAI) {
    process.stdout.write(`  🤖 `)
    try {
      files = await generateSkillContent(id, meta)
    } catch {
      // AI 失敗 → 使用預設模板
    }
  }

  // 使用有意義的預設模板（不是空的 TODO）
  const defaults = generateDefaultTemplates(id, meta)

  // 寫入片段（AI 生成優先，否則用預設模板）
  for (const [file, defaultContent] of Object.entries(defaults)) {
    const filePath = path.join(stackDir, file)
    fs.writeFileSync(filePath, files?.[file] || defaultContent)
  }

  return files ? 'ai-generated' : 'created'
}

// ── 讀取 repos ──────────────────────────────────────────────────
function getRepos() {
  if (orgName) {
    try {
      const raw = execSync(
        `gh api "orgs/${orgName}/repos?sort=pushed&per_page=100" --paginate --jq '.[] | select(.archived == false and .fork == false and .size > 0) | .full_name'`,
        { encoding: 'utf8', timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'] }
      )
      return raw.trim().split('\n').filter(Boolean)
    } catch (e) { console.error(`無法取得 ${orgName} repos`); process.exit(1) }
  }

  const configPath = path.join(REPO_DIR, 'config.json')
  if (!fs.existsSync(configPath)) { console.error('config.json 不存在'); process.exit(1) }
  return JSON.parse(fs.readFileSync(configPath, 'utf8')).repos?.map(e => parseRepoEntry(e).repo) || []
}

// ── 主程式 ───────────────────────────────────────────────────────
async function main() {
  const repos = getRepos()
  const repoList = top > 0 ? repos.slice(0, top) : repos

  console.log(`\n🔍 掃描 ${orgName || 'config.json'} 中的 ${repoList.length} 個 repos...\n`)

  if (flagInit && fs.existsSync(STACKS_DIR)) {
    fs.rmSync(STACKS_DIR, { recursive: true })
    console.log('  🗑  已清空 stacks/\n')
  }
  fs.mkdirSync(STACKS_DIR, { recursive: true })

  // ── 並行分析所有 repos ──────────────────────────────────────────
  console.log(`  ⚡ 並行分析 ${repoList.length} 個 repos...\n`)
  const globalTechs = new Map()

  // 並行：GitHub API 分析
  const analysisResults = await Promise.allSettled(
    repoList.map(async (repoName) => {
      const name = repoName.split('/')[1]
      const analysis = await analyzeRepo(repoName)
      const techs = await identifySignificantTechs(analysis.context.techFiles, analysis.rootFiles, analysis.languages)
      return { repo: repoName, name, branch: analysis.branch, languages: Object.keys(analysis.languages).slice(0, 5), techs: [...techs.keys()], techMetas: techs, aiFiles: Object.keys(analysis.context.aiConfig) }
    })
  )

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

  // ── 並行生成 stacks/（若指定 --skills 則只生成指定的）─────────
  // --skills 支援自定義添加：即使 repo 沒偵測到，也為其建立 stack
  if (onlySkills) {
    for (const id of onlySkills) {
      if (!globalTechs.has(id)) {
        globalTechs.set(id, { label: id, priority: 50, detect: { match: 'any' } })
      }
    }
  }
  const filteredTechs = onlySkills
    ? new Map([...globalTechs].filter(([id]) => onlySkills.includes(id)))
    : globalTechs

  console.log(`\n📦 生成 stacks/（${filteredTechs.size} 個）...\n`)
  let created = 0, kept = 0, aiGen = 0

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

  // ── 報告 ──────────────────────────────────────────────────────
  console.log(`\n${'═'.repeat(60)}`)
  console.log(`📊 掃描報告（${results.length} repos → ${filteredTechs.size} 技術棧）`)
  console.log('═'.repeat(60))

  console.log('\n📋 技術棧分佈：')
  for (const key of [...filteredTechs.keys()].sort()) {
    const count = results.filter(r => r.techs.includes(key)).length
    const bar = '█'.repeat(Math.max(1, Math.round(count / results.length * 20)))
    const names = results.filter(r => r.techs.includes(key)).map(r => r.name)
    console.log(`  ${key.padEnd(18)} ${bar.padEnd(20)} ${count}/${results.length}  ${names.join(', ')}`)
  }

  console.log('\n🤖 AI 工具覆蓋：')
  console.log(`  CLAUDE.md      ${results.filter(r => r.aiFiles?.includes('CLAUDE.md')).length}/${results.length}`)
  console.log(`  AGENTS.md      ${results.filter(r => r.aiFiles?.includes('AGENTS.md')).length}/${results.length}`)
  console.log(`  .claude/       ${results.filter(r => r.aiFiles?.some(f => f.startsWith('.claude/'))).length}/${results.length}`)

  console.log(`\n📁 stacks/：新建 ${created} / AI 生成 ${aiGen} / 保留 ${kept} / 總計 ${filteredTechs.size}`)

  if (created > 0 && !canUseAI) {
    console.log(`\n💡 ${created} 個 stack 含 TODO 模板。安裝 claude CLI 或設定 ANTHROPIC_API_KEY 後重跑可自動生成`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
