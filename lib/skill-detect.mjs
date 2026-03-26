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
import { fileURLToPath } from 'url'
import semver from 'semver'
import { gh, ghSync, fetchFileContent, scanDir, classifyRepoFiles } from './github.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const REPO_DIR = path.resolve(__dirname, '..')
export const STACKS_DIR = path.join(REPO_DIR, 'stacks')

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

// ── 全自動 repo 分析 ─────────────────────────────────────────────
export async function analyzeRepo(repoName) {
  const result = {
    repo: repoName,
    branch: null,
    rootFiles: [],
    languages: {},
    skills: [],
    context: { aiConfig: {}, docs: {}, techFiles: {}, lintConfig: {} },
  }

  // 並行：branch + languages + root listing（3 個 API 同時發）
  const [branchRaw, langRaw, rootRaw] = await Promise.all([
    gh(`repos/${repoName}`, '.default_branch'),
    gh(`repos/${repoName}/languages`),
    null, // placeholder, 需要 branch 先完成
  ])
  result.branch = branchRaw || 'main'
  if (langRaw) try { result.languages = JSON.parse(langRaw) } catch {}

  // 根目錄（需要 branch）
  const rootData = await gh(`repos/${repoName}/contents?ref=${result.branch}`)
  if (!rootData) return result
  let rootEntries
  try { rootEntries = JSON.parse(rootData) } catch { return result }
  result.rootFiles = rootEntries.map(e => e.name)

  const classified = classifyRepoFiles(rootEntries)

  // 並行抓取所有檔案（techDetect + lintConfig + aiConfig + docs + dirs）
  const allFetches = [
    ...classified.techDetect.map(f => fetchFileContent(repoName, result.branch, f).then(c => c ? { type: 'tech', name: f, content: c } : null)),
    ...classified.lintConfig.map(f => fetchFileContent(repoName, result.branch, f).then(c => c ? { type: 'lint', name: f, content: c } : null)),
    ...classified.aiConfig.map(f => fetchFileContent(repoName, result.branch, f).then(c => c ? { type: 'ai', name: f, content: c } : null)),
    ...classified.projectDocs.map(f => fetchFileContent(repoName, result.branch, f).then(c => {
      if (!c) return null
      const lines = c.split('\n')
      return { type: 'doc', name: f, content: lines.length > 100 ? lines.slice(0, 100).join('\n') + '\n...(truncated)' : c }
    })),
  ]

  const fetchResults = await Promise.allSettled(allFetches)
  for (const r of fetchResults) {
    if (r.status !== 'fulfilled' || !r.value) continue
    const { type, name, content } = r.value
    switch (type) {
      case 'tech': result.context.techFiles[name] = content; break
      case 'lint': result.context.lintConfig[name] = content; break
      case 'ai':   result.context.aiConfig[name] = content; break
      case 'doc':  result.context.docs[name] = content; break
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
      if (name === 'package.json') {
        Object.assign(deps, d.dependencies || {})
        Object.assign(devDeps, d.devDependencies || {})
      }
      if (name === 'composer.json') {
        Object.assign(deps, d.require || {})
        Object.assign(devDeps, d['require-dev'] || {})
      }
    } catch {}
    // go.mod
    if (name === 'go.mod') {
      for (const m of content.matchAll(/^\t(\S+)\s+v([\d.]+)/gm)) deps[m[1]] = m[2]
    }
    // pyproject.toml
    if (name === 'pyproject.toml') {
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
