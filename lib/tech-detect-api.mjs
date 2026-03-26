/**
 * 多生態套件分析 API 客戶端
 *
 * 職責：
 *   查詢各生態的套件 registry，判斷依賴的重要性和分類：
 *   - npm → npms.io batch API（popularity score + keywords 分類）
 *   - PHP → Packagist p2 API（驗證套件存在性 + description）
 *   - Python → PyPI JSON API（驗證套件存在性）
 *   - Go → 本地 go.mod 解析（零網路請求）
 *
 * 被 scan.mjs 使用（批量掃描生成 stacks/）。
 * setup.mjs 有自己的 npms.io 查詢邏輯（因為 UI 流程不同）。
 */

import { extractDeps } from './skill-detect.mjs'
import { gh } from './github.mjs'
import { inferNpmCategory, categoryPriority, PHP_NOISE, NPM_NAME_NOISE } from './npm-classify.mjs'

// ── 常量 ──────────────────────────────────────────────────────────
const NPMS_POPULARITY_THRESHOLD = 0.3  // npms.io popularity 門檻
const NPMS_BATCH_SIZE = 50             // npms.io 單次最多 250，50 足夠
const GITHUB_STARS_THRESHOLD = 500     // GitHub stars 門檻（非 npm 套件）

// ── npm：npms.io batch API ──────────────────────────────────────

/**
 * 批量查詢 npm 套件的 popularity 和分類
 *
 * 使用 npms.io POST /v2/package/mget 批量查詢，
 * 只保留 popularity ≥ 門檻的套件。
 *
 * @param {string[]} depNames - npm 套件名稱列表
 * @param {Object} deps - dependencies（用於判斷是 dep 還是 devDep）
 * @param {Object} devDeps - devDependencies
 * @returns {Promise<Map>} id → { label, priority, category, popularity, detect }
 */
export async function analyzeNpmDeps(depNames, deps, devDeps) {
  const techs = new Map()
  const filtered = depNames.filter(n => !NPM_NAME_NOISE.test(n))
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
        const category = inferNpmCategory(keywords, pkg?.collected?.metadata?.description || '')

        techs.set(id, {
          label: name,
          priority: categoryPriority(category),
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

// ── PHP：Packagist p2 API ───────────────────────────────────────

// ── GitHub stars 查詢（跨生態通用 popularity 信號）──────────────

/**
 * 從 URL 提取 GitHub owner/repo
 * 支援格式：
 *   - https://github.com/owner/repo
 *   - https://github.com/owner/repo.git
 *   - git://github.com/owner/repo.git
 *   - github.com/owner/repo（Go module path）
 *
 * @param {string} url - 可能是 GitHub URL 或 Go module path
 * @returns {string|null} 'owner/repo' 或 null
 */
function extractGithubRepo(url) {
  if (!url) return null
  const m = url.match(/github\.com[/:]([^/]+\/[^/.#]+)/)
  return m ? m[1] : null
}

/**
 * 用 gh CLI 查詢 GitHub repo 的 stars 數
 * 利用用戶已有的 gh auth，不需要額外 token
 *
 * @param {string} ownerRepo - 'owner/repo' 格式
 * @returns {Promise<number>} stars 數，失敗返回 0
 */
async function getGithubStars(ownerRepo) {
  const raw = await gh(`repos/${ownerRepo}`, '.stargazers_count')
  return parseInt(raw) || 0
}

// ── PHP：Packagist + GitHub stars ───────────────────────────────

/**
 * 查詢 PHP Composer 套件，用 GitHub stars 篩選重要性
 *
 * 流程：Packagist 取 repo URL → 提取 GitHub owner/repo → 查 stars
 * stars ≥ 門檻才收錄。
 *
 * @param {Object} composerDeps - composer.json 的 require + require-dev
 * @returns {Promise<Map>} id → { label, priority, category, stars, detect }
 */
export async function analyzePhpDeps(composerDeps) {
  const techs = new Map()
  const names = Object.keys(composerDeps).filter(n => !PHP_NOISE.test(n))

  // 第一步：從 Packagist 取 repo URL
  const packagistResults = await Promise.allSettled(
    names.map(async name => {
      try {
        const res = await fetch(`https://repo.packagist.org/p2/${name}.json`, {
          signal: AbortSignal.timeout(5000),
        })
        if (!res.ok) return null
        const data = await res.json()
        const pkg = data?.packages?.[name]?.[0]
        if (!pkg) return null
        const repoUrl = pkg.source?.url || ''
        return { name, repoUrl, description: pkg.description || '' }
      } catch { return null }
    })
  )

  // 第二步：查 GitHub stars（只查有 GitHub repo 的）
  const withRepo = packagistResults
    .filter(r => r.status === 'fulfilled' && r.value)
    .map(r => r.value)

  const starsResults = await Promise.allSettled(
    withRepo.map(async ({ name, repoUrl, description }) => {
      const ghRepo = extractGithubRepo(repoUrl)
      const stars = ghRepo ? await getGithubStars(ghRepo) : 0
      return { name, stars, description }
    })
  )

  for (const r of starsResults) {
    if (r.status !== 'fulfilled') continue
    const { name, stars } = r.value
    if (stars < GITHUB_STARS_THRESHOLD) continue
    const id = name.replace(/\//g, '-')
    techs.set(id, {
      label: name,
      priority: 30,
      category: 'php',
      stars,
      detect: { deps: [name], match: 'any' },
    })
  }
  return techs
}

// ── Python：PyPI + GitHub stars ──────────────────────────────────

/**
 * 查詢 Python 套件，用 GitHub stars 篩選重要性
 *
 * 流程：PyPI 取 project_urls / home_page → 提取 GitHub repo → 查 stars
 *
 * @param {Object} pyDeps - pyproject.toml 解析出的依賴
 * @returns {Promise<Map>} id → { label, priority, category, stars, detect }
 */
export async function analyzePythonDeps(pyDeps) {
  const techs = new Map()
  const names = Object.keys(pyDeps).filter(n => !['python', 'pip', 'setuptools', 'wheel'].includes(n))

  // 第一步：從 PyPI 取 repo URL
  const pypiResults = await Promise.allSettled(
    names.map(async name => {
      try {
        const res = await fetch(`https://pypi.org/pypi/${name}/json`, {
          signal: AbortSignal.timeout(5000),
        })
        if (!res.ok) return null
        const data = await res.json()
        const urls = data?.info?.project_urls || {}
        const repoUrl = urls.Source || urls.Repository || urls.GitHub || urls.Homepage || data?.info?.home_page || ''
        return { name, repoUrl }
      } catch { return null }
    })
  )

  // 第二步：查 GitHub stars
  const withRepo = pypiResults
    .filter(r => r.status === 'fulfilled' && r.value)
    .map(r => r.value)

  const starsResults = await Promise.allSettled(
    withRepo.map(async ({ name, repoUrl }) => {
      const ghRepo = extractGithubRepo(repoUrl)
      const stars = ghRepo ? await getGithubStars(ghRepo) : 0
      return { name, stars }
    })
  )

  for (const r of starsResults) {
    if (r.status !== 'fulfilled') continue
    const { name, stars } = r.value
    if (stars < GITHUB_STARS_THRESHOLD) continue
    techs.set(name, {
      label: name,
      priority: 30,
      category: 'python',
      stars,
      detect: { deps: [name], match: 'any' },
    })
  }
  return techs
}

// ── Go：go.mod 解析 + GitHub stars ──────────────────────────────

/**
 * 分析 Go 依賴，用 GitHub stars 篩選重要性
 *
 * Go module path 格式 github.com/org/repo → 直接查 stars
 * 非 github.com 的模組（如 golang.org/x/*）跳過
 *
 * @param {Object} goDeps - go.mod 解析出的依賴 { module_path: version }
 * @returns {Promise<Map>} id → { label, priority, category, stars, detect }
 */
export async function analyzeGoDeps(goDeps) {
  const techs = new Map()
  const mods = Object.keys(goDeps)

  const results = await Promise.allSettled(
    mods.map(async mod => {
      const ghRepo = extractGithubRepo(mod)
      if (!ghRepo) return null
      const stars = await getGithubStars(ghRepo)
      return { mod, stars }
    })
  )

  for (const r of results) {
    if (r.status !== 'fulfilled' || !r.value) continue
    const { mod, stars } = r.value
    if (stars < GITHUB_STARS_THRESHOLD) continue
    const parts = mod.split('/')
    const id = parts[parts.length - 1]
    if (!id || id.startsWith('internal')) continue
    techs.set(id, {
      label: mod,
      priority: 30,
      category: 'go',
      stars,
      detect: { deps: [mod], match: 'any' },
    })
  }
  return techs
}

// ── 統一入口：多生態分析 ────────────────────────────────────────

/**
 * 分析 repo 的所有 techFiles，自動按生態分派到對應的 API 查詢
 *
 * 流程：
 *   1. 從 techFiles 按檔案名分辨生態（package.json → npm, composer.json → PHP, ...）
 *   2. 並行查詢各生態 API
 *   3. 合併結果 + 從檔案/語言兜底偵測
 *
 * @param {Object} techFiles - { 'package.json': content, 'composer.json': content, ... }
 * @param {string[]} rootFiles - repo 根目錄的檔案名列表
 * @param {Object} languages - GitHub API 返回的語言分佈 { TypeScript: 12345, ... }
 * @returns {Promise<Map>} id → { label, priority, category, detect }
 */
export async function identifySignificantTechs(techFiles, rootFiles, languages) {
  const { deps, devDeps } = extractDeps(techFiles)
  const techs = new Map()

  // 按生態分類 deps
  const npmAllDeps = {}, phpDeps = {}, pyDeps = {}, goDeps = {}
  const hasFile = new Set(Object.keys(techFiles))

  if (hasFile.has('package.json')) {
    try {
      const pkg = JSON.parse(techFiles['package.json'])
      Object.assign(npmAllDeps, pkg.dependencies || {}, pkg.devDependencies || {})
    } catch {}
  }
  if (hasFile.has('composer.json')) {
    try {
      const c = JSON.parse(techFiles['composer.json'])
      Object.assign(phpDeps, c.require || {}, c['require-dev'] || {})
    } catch {}
  }
  if (hasFile.has('pyproject.toml')) {
    for (const m of techFiles['pyproject.toml'].matchAll(/"([a-zA-Z][\w-]*)(?:[><=!~].*)?"/g)) {
      pyDeps[m[1].toLowerCase()] = '*'
    }
  }
  if (hasFile.has('go.mod')) {
    for (const m of techFiles['go.mod'].matchAll(/^\t(\S+)\s+v([\d.]+)/gm)) {
      goDeps[m[1]] = m[2]
    }
  }

  // 並行查詢所有生態（npm + PHP + Python + Go 同時進行）
  const [npmTechs, phpTechs, pyTechs, goTechs] = await Promise.all([
    Object.keys(npmAllDeps).length > 0 ? analyzeNpmDeps(Object.keys(npmAllDeps), deps, devDeps) : new Map(),
    Object.keys(phpDeps).length > 0 ? analyzePhpDeps(phpDeps) : new Map(),
    Object.keys(pyDeps).length > 0 ? analyzePythonDeps(pyDeps) : new Map(),
    Object.keys(goDeps).length > 0 ? analyzeGoDeps(goDeps) : new Map(),
  ])

  // 合併
  for (const source of [npmTechs, phpTechs, pyTechs, goTechs]) {
    for (const [id, meta] of source) {
      if (!techs.has(id)) techs.set(id, meta)
    }
  }

  // 從檔案偵測語言 / 平台（兜底）
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
  const fileSet = new Set(rootFiles)
  for (const [file, meta] of Object.entries(fileSignals)) {
    if (fileSet.has(file) && !techs.has(meta.id)) {
      techs.set(meta.id, { ...meta, detect: { files: [file], ...(meta.languages ? { languages: meta.languages } : {}), match: 'any' } })
    }
  }

  // GitHub Languages
  const langMap = { TypeScript: 'typescript', PHP: 'php', Go: 'go', Python: 'python', Ruby: 'ruby', Swift: 'swift', Kotlin: 'kotlin', Rust: 'rust', Java: 'java', Dart: 'dart' }
  for (const [lang, id] of Object.entries(langMap)) {
    if (languages[lang] && !techs.has(id)) {
      techs.set(id, { label: lang, priority: 10, detect: { languages: [lang], match: 'any' } })
    }
  }

  return techs
}
