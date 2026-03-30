/**
 * 全自動技術棧偵測引擎
 *
 * 偵測策略：
 *   1. GitHub API → default_branch + languages + 根目錄掃描
 *   2. 配置檔深度分析 → package.json / composer.json / go.mod 等
 *   3. stacks/detect.json per stack (auto-scanned)
 *   4. npm registry → 未知 dep 自動分類（按 keywords/description）
 *
 * stacks/ 目錄由 `pnpm run scan` 自動生成，無需手動維護
 */

import fs from 'fs'
import path from 'path'
import { getDirname } from './utils/paths.mjs'
import semver from 'semver'
import { gh, ghSync, fetchFileContent, fetchRepoBundle, fetchFilesBatch, scanDir, classifyRepoFiles } from './github.mjs'

const __dirname = getDirname(import.meta)
export const REPO_DIR = path.resolve(__dirname, '..')
export const STACKS_DIR = path.join(REPO_DIR, '.cache', 'stacks')

// ── 自動掃描 stacks/*/detect.json 構建 registry ─────────────────
export function loadRegistry() {
  const skills = []
  if (!fs.existsSync(STACKS_DIR)) return { skills }

  for (const dir of fs.readdirSync(STACKS_DIR, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue
    const detectPath = path.join(STACKS_DIR, dir.name, 'detect.json')
    if (!fs.existsSync(detectPath)) continue
    try {
      const def = JSON.parse(fs.readFileSync(detectPath, 'utf8'))
      def.id = def.id || dir.name
      skills.push(def)
    } catch {}
  }

  skills.sort((a, b) => (a.priority || 99) - (b.priority || 99))
  return { skills }
}

// ── 解析 repos 配置 ─────────────────────────────────────────────
export function parseRepoEntry(entry) {
  if (typeof entry === 'string') return { repo: entry }
  return entry
}

// ── 全自動 repo 分析（GraphQL 批次優先，REST fallback）──────────
export async function analyzeRepo(repoName) {
  const result = {
    repo: repoName,
    branch: null,
    rootFiles: [],
    languages: {},
    skills: [],
    description: '',
    stars: 0,
    topics: [],
    context: { aiConfig: {}, docs: {}, techFiles: {}, lintConfig: {} },
  }

  const [owner, name] = repoName.split('/')

  // ── 第 1 輪：GraphQL 一次取得 branch + languages + 根目錄 + 已知檔案 ──
  // 先用空 filePaths 取得根目錄，分類後再用第 2 輪取檔案
  const bundle = await fetchRepoBundle(owner, name, [])
  if (!bundle) return result

  result.branch = bundle.branch
  result.languages = bundle.languages
  result.description = bundle.description
  result.stars = bundle.stars
  result.topics = bundle.topics
  result.rootFiles = bundle.rootEntries.map(e => e.name)

  const classified = classifyRepoFiles(bundle.rootEntries)
  const allFilePaths = [...classified.techDetect, ...classified.lintConfig, ...classified.aiConfig, ...classified.projectDocs]

  // ── 第 2 輪：GraphQL 批次抓取所有分類檔案（1 次請求）──
  const fileContents = allFilePaths.length > 0
    ? await fetchFilesBatch(owner, name, result.branch, allFilePaths)
    : {}

  // 分配到各 context
  for (const f of classified.techDetect) { if (fileContents[f]) result.context.techFiles[f] = fileContents[f] }
  for (const f of classified.lintConfig) { if (fileContents[f]) result.context.lintConfig[f] = fileContents[f] }
  for (const f of classified.aiConfig) { if (fileContents[f]) result.context.aiConfig[f] = fileContents[f] }
  for (const f of classified.projectDocs) {
    if (!fileContents[f]) continue
    const lines = fileContents[f].split('\n')
    result.context.docs[f] = lines.length > 100 ? lines.slice(0, 100).join('\n') + '\n...(truncated)' : fileContents[f]
  }

  // ── Monorepo：若有 turbo.json / pnpm-workspace.yaml / lerna.json ──
  const isMonorepo = result.rootFiles.some(f => /^(turbo\.json|pnpm-workspace\.yaml|lerna\.json)$/.test(f))
  if (isMonorepo) {
    const workspaceDirs = ['packages', 'apps', 'modules', 'plugins', 'services']
    const existingDirs = bundle.rootEntries.filter(e => e.type === 'dir' && workspaceDirs.includes(e.name)).map(e => e.name)

    // 列出各 workspace 子目錄（並行 REST，GraphQL 不支援動態 tree 遍歷）
    const dirListings = await Promise.allSettled(
      existingDirs.map(dir => gh(`repos/${repoName}/contents/${dir}?ref=${result.branch}`).then(raw => {
        if (!raw) return []
        return JSON.parse(raw).filter(e => e.type === 'dir').map(e => `${dir}/${e.name}`)
      }))
    )
    const subPkgDirs = dirListings.flatMap(r => r.status === 'fulfilled' ? r.value : [])

    // 批次抓取子包 package.json（1 次 GraphQL）
    if (subPkgDirs.length > 0) {
      const pkgPaths = subPkgDirs.map(d => `${d}/package.json`)
      const pkgFiles = await fetchFilesBatch(owner, name, result.branch, pkgPaths)
      for (const [fp, content] of Object.entries(pkgFiles)) {
        result.context.techFiles[fp] = content
      }
    }
  }

  // 偵測技能
  const { deps, devDeps } = extractDeps(result.context.techFiles)
  result.skills = detectSkills({ deps, devDeps, rootFiles: result.rootFiles, languages: result.languages })

  // 並行遞迴掃描目錄
  await Promise.allSettled(
    classified.directories.map(dir => scanDir(repoName, result.branch, dir, result.context.aiConfig))
  )

  return result
}

// ── 從配置檔提取 deps ────────────────────────────────────────────
export function extractDeps(techFiles) {
  const deps = {}, devDeps = {}
  for (const [name, content] of Object.entries(techFiles)) {
    try {
      const d = JSON.parse(content)
      // 根目錄或子包的 package.json（packages/xxx/package.json）
      if (name.endsWith('package.json')) {
        Object.assign(deps, d.dependencies || {})
        Object.assign(devDeps, d.devDependencies || {})
      }
      if (name.endsWith('composer.json')) {
        Object.assign(deps, d.require || {})
        Object.assign(devDeps, d['require-dev'] || {})
      }
    } catch {}
    // go.mod
    if (name.endsWith('go.mod')) {
      for (const m of content.matchAll(/^\t(\S+)\s+v([\d.]+)/gm)) deps[m[1]] = m[2]
    }
    // pyproject.toml
    if (name.endsWith('pyproject.toml')) {
      for (const m of content.matchAll(/"([a-zA-Z][\w-]*)(?:[><=!~].*)?"/g)) deps[m[1].toLowerCase()] = '*'
    }
  }
  return { deps, devDeps }
}

// ── 多策略技能偵測（基於 stacks/*/detect.json）─────────────────
export function detectSkills({ deps = {}, devDeps = {}, rootFiles = [], languages = {} }) {
  const registry = loadRegistry()
  if (registry.skills.length === 0) return []

  const depKeys = new Set(Object.keys(deps).filter(Boolean))
  const devDepKeys = new Set(Object.keys(devDeps).filter(Boolean))
  const fileSet = new Set(rootFiles)
  const langSet = new Set(Object.keys(languages))

  const matched = []
  const excluded = new Set()

  for (const skill of registry.skills) {
    if (excluded.has(skill.id)) continue
    const checks = []

    if (skill.detect.deps) checks.push(skill.detect.deps.some(d => depKeys.has(d)))
    if (skill.detect.devDeps) checks.push(skill.detect.devDeps.some(d => devDepKeys.has(d) || depKeys.has(d)))
    if (skill.detect.files) {
      checks.push(skill.detect.files.some(p => p.includes('*') ? rootFiles.some(f => f.endsWith(p.replace('*', ''))) : fileSet.has(p)))
    }
    if (skill.detect.languages) checks.push(skill.detect.languages.some(l => langSet.has(l)))
    if (skill.detect.semver) {
      checks.push(Object.entries(skill.detect.semver).some(([pkg, range]) => {
        const ver = deps[pkg] || devDeps[pkg]
        if (!ver) return false
        const clean = semver.coerce(ver)
        return clean ? semver.satisfies(clean, range) : false
      }))
    }

    const hit = (skill.detect.match || 'any') === 'all'
      ? checks.length > 0 && checks.every(Boolean)
      : checks.some(Boolean)

    if (hit) {
      matched.push(skill)
      if (skill.excludes) skill.excludes.forEach(e => excluded.add(e))
    }
  }

  matched.sort((a, b) => (a.priority || 99) - (b.priority || 99))
  return matched.map(s => s.id)
}

// ── 合併技能片段到基礎檔案 ──────────────────────────────────────
export function mergeSkillFragments(baseContent, skillIds, fragmentName) {
  const fragments = []
  for (const id of skillIds) {
    const p = path.join(STACKS_DIR, id, fragmentName)
    if (fs.existsSync(p)) fragments.push(fs.readFileSync(p, 'utf8').trim())
  }
  if (fragments.length === 0) return baseContent

  const markers = ['## 輸出格式', '## Step 3']
  let idx = -1
  for (const m of markers) { idx = baseContent.indexOf(m); if (idx > 0) break }

  const joined = '\n\n' + fragments.join('\n\n') + '\n\n'
  return idx > 0 ? baseContent.slice(0, idx) + joined + baseContent.slice(idx) : baseContent.trimEnd() + joined
}

export { ghSync, gh as ghAsync, classifyRepoFiles }

export function listAvailableSkills() {
  return loadRegistry().skills.map(s => ({ id: s.id, label: s.label, priority: s.priority }))
}
