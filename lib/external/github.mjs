/**
 * GitHub API 封裝（準備未來 @ab-flash/libs 提取）
 *
 * 提供 gh CLI 的異步/同步封裝、檔案內容抓取、目錄掃描、檔案分類等功能。
 *
 * 優化策略：
 *   - 優先使用 native fetch（跳過 gh CLI 進程 spawn 開銷）
 *   - Token 取得一次後快取
 *   - 提供 GraphQL 批次查詢（fetchRepoBundle / fetchFilesBatch）
 *   - gh CLI 保留作為 fallback 和 ghSync 使用
 */

import { execSync, execFile, execFileSync } from 'child_process'
import { promisify } from 'util'
import { GH_API_TIMEOUT } from '../core/constants.mjs'

const execFileAsync = promisify(execFile)

// ── Token 快取 ────────────────────────────────────────────────────
let _token = null

/**
 * 非同步取得 GitHub OAuth token（結果快取，只取一次）
 *
 * @returns {Promise<string|null>} token 字串，失敗返回 null
 */
async function getToken() {
  if (_token) return _token
  try {
    const { stdout } = await execFileAsync('gh', ['auth', 'token'], { timeout: 5000 })
    _token = stdout.trim()
    return _token
  } catch { return null }
}

/**
 * 同步取得 GitHub OAuth token（結果快取，只取一次）
 *
 * @returns {string|null} token 字串，失敗返回 null
 */
function getTokenSync() {
  if (_token) return _token
  try {
    _token = execSync('gh auth token', { encoding: 'utf8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] }).trim()
    return _token
  } catch { return null }
}

// ── Native fetch（優先，無進程 spawn）────────────────────────────
/**
 * 用 native fetch 呼叫 GitHub REST API（效能優先，無 gh 進程 spawn 開銷）
 *
 * @param {string} apiPath - API 路徑（例如 'repos/owner/repo'）
 * @returns {Promise<Object|null>} 解析後的 JSON，失敗返回 null
 */
async function ghFetch(apiPath) {
  const token = await getToken()
  if (!token) return null
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), GH_API_TIMEOUT)
    const res = await fetch(`https://api.github.com/${apiPath}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
      signal: controller.signal,
    })
    clearTimeout(timer)
    if (!res.ok) return null
    return await res.json()
  } catch { return null }
}

/**
 * GitHub API 異步封裝
 *
 * 無 jqExpr 時優先用 native fetch（較快），
 * 有 jqExpr 時透過 gh CLI 處理（需要 jq 過濾語法）。
 *
 * @param {string} apiPath - API 路徑（例如 'repos/owner/repo'）
 * @param {string|null} [jqExpr=null] - jq 篩選表達式，例如 '.login'
 * @returns {Promise<string|null>} JSON 字串（無 jqExpr）或 jq 過濾後文字，失敗返回 null
 */
export async function gh(apiPath, jqExpr = null) {
  // 無 jqExpr 時優先用 native fetch
  if (!jqExpr) {
    const json = await ghFetch(apiPath)
    return json ? JSON.stringify(json) : null
  }
  // 有 jqExpr 時仍用 gh CLI（需要 jq 處理）
  try {
    const args = ['api', apiPath, '--jq', jqExpr]
    const { stdout } = await execFileAsync('gh', args, { timeout: GH_API_TIMEOUT })
    return stdout.trim()
  } catch { return null }
}

/**
 * GitHub API 同步封裝
 *
 * 透過 gh CLI 執行同步呼叫，僅用於不需要 spinner 的場景
 * （例如 interactiveRepoSelect 的初始化階段）。
 *
 * @param {string} apiPath - API 路徑
 * @param {string|null} [jqExpr=null] - jq 篩選表達式
 * @returns {string|null} 回應文字（jq 過濾後），失敗返回 null
 */
export function ghSync(apiPath, jqExpr = null) {
  try {
    const args = ['api', apiPath]
    if (jqExpr) args.push('--jq', jqExpr)
    return execFileSync('gh', args, { encoding: 'utf8', timeout: GH_API_TIMEOUT, stdio: ['pipe', 'pipe', 'pipe'] }).trim()
  } catch { return null }
}

/**
 * 抓取 GitHub repo 中單一檔案的原始內容（base64 解碼）
 *
 * @param {string} repo - 'owner/repo' 格式
 * @param {string} branch - 分支名稱（例如 'main'）
 * @param {string} filePath - 相對於 repo 根目錄的路徑
 * @returns {Promise<string|null>} UTF-8 文字內容，失敗返回 null
 */
export async function fetchFileContent(repo, branch, filePath) {
  const json = await ghFetch(`repos/${repo}/contents/${encodeURIComponent(filePath)}?ref=${branch}`)
  if (!json?.content) return null
  try { return Buffer.from(json.content, 'base64').toString('utf8') } catch { return null }
}

// ── GraphQL 批次查詢 ──────────────────────────────────────────────

/**
 * 單次 GraphQL 取得 repo 的 branch + languages + 根目錄 + 指定檔案內容
 *
 * 把原本 analyzeRepo 的 8+ 次 REST 呼叫合併為 1 次 GraphQL。
 *
 * @param {string} owner
 * @param {string} name
 * @param {string[]} filePaths - 要抓內容的檔案路徑（相對 repo 根目錄）
 * @returns {{ branch, languages, rootEntries, files, description, stars, topics }}
 */
export async function fetchRepoBundle(owner, name, filePaths = []) {
  const token = await getToken()
  if (!token) return null

  // 建構檔案查詢別名（GraphQL 欄位名不能有 . / - 等特殊字元）
  const fileAliases = filePaths.map((fp, i) => ({
    alias: `f${i}`,
    path: fp,
    expr: `f${i}: object(expression: ${"\"HEAD:" + fp + "\""}) { ... on Blob { text } }`,
  }))

  const query = `query($owner: String!, $name: String!) {
    repository(owner: $owner, name: $name) {
      description
      stargazerCount
      repositoryTopics(first: 10) { nodes { topic { name } } }
      defaultBranchRef { name }
      languages(first: 20, orderBy: {field: SIZE, direction: DESC}) {
        edges { size node { name } }
      }
      root: object(expression: "HEAD:") {
        ... on Tree {
          entries { name type }
        }
      }
      ${fileAliases.map(a => a.expr).join('\n      ')}
    }
  }`

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), GH_API_TIMEOUT)
    const res = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables: { owner, name } }),
      signal: controller.signal,
    })
    clearTimeout(timer)
    if (!res.ok) return null
    const { data } = await res.json()
    if (!data?.repository) return null

    const repo = data.repository
    const branch = repo.defaultBranchRef?.name || 'main'

    // 語言：轉成 { TypeScript: 12345, ... } 格式（與 REST API 相容）
    const languages = {}
    for (const edge of repo.languages?.edges || []) {
      languages[edge.node.name] = edge.size
    }

    // 根目錄
    const rootEntries = (repo.root?.entries || []).map(e => ({
      name: e.name,
      type: e.type === 'tree' ? 'dir' : 'file',
    }))

    // 檔案內容
    const files = {}
    for (const a of fileAliases) {
      const blob = repo[a.alias]
      if (blob?.text) files[a.path] = blob.text
    }

    const description = repo.description || ''
    const stars = repo.stargazerCount || 0
    const topics = (repo.repositoryTopics?.nodes || []).map(n => n.topic.name)

    return { branch, languages, rootEntries, files, description, stars, topics }
  } catch { return null }
}

/**
 * 用 GraphQL 批次抓取多個檔案（第二輪，用於 monorepo 子包等動態路徑）
 *
 * 動態構建 GraphQL 查詢，以別名方式同時取多個檔案，1 次 API 請求完成。
 *
 * @param {string} owner - GitHub 組織或用戶名
 * @param {string} name - repo 名稱（不含 owner）
 * @param {string} branch - 分支名稱
 * @param {string[]} filePaths - 要抓取的檔案路徑列表（相對 repo 根目錄）
 * @returns {Promise<Object>} filePath → 內容字串 的映射，找不到的跳過
 */
export async function fetchFilesBatch(owner, name, branch, filePaths) {
  if (!filePaths.length) return {}
  const token = await getToken()
  if (!token) return {}

  const aliases = filePaths.map((fp, i) => ({
    alias: `f${i}`,
    path: fp,
    expr: `f${i}: object(expression: "${branch}:${fp}") { ... on Blob { text } }`,
  }))

  const query = `query($owner: String!, $name: String!) {
    repository(owner: $owner, name: $name) {
      ${aliases.map(a => a.expr).join('\n      ')}
    }
  }`

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), GH_API_TIMEOUT)
    const res = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables: { owner, name } }),
      signal: controller.signal,
    })
    clearTimeout(timer)
    if (!res.ok) return {}
    const { data } = await res.json()
    if (!data?.repository) return {}

    const files = {}
    for (const a of aliases) {
      const blob = data.repository[a.alias]
      if (blob?.text) files[a.path] = blob.text
    }
    return files
  } catch { return {} }
}

/**
 * 遞迴掃描 GitHub repo 目錄，收集 .md / .json / .txt 檔案內容
 *
 * 最多遞迴 2 層（depth ≤ 1）以控制 API 呼叫次數。
 * 結果存入 target 物件（key 為完整路徑）。
 *
 * @param {string} repo - 'owner/repo' 格式
 * @param {string} branch - 分支名稱
 * @param {string} dirPath - 目錄路徑（相對 repo 根目錄）
 * @param {Object} target - 結果收集物件（會被直接修改）
 * @param {number} [depth=0] - 當前遞迴深度（超過 1 時停止）
 * @returns {Promise<void>}
 */
export async function scanDir(repo, branch, dirPath, target, depth = 0) {
  if (depth > 1) return
  const json = await ghFetch(`repos/${repo}/contents/${dirPath}?ref=${branch}`)
  if (!json || !Array.isArray(json)) return
  try {
    const entries = json
    const fileEntries = entries.filter(e => e.type === 'file' && /\.(md|json|txt)$/.test(e.name))
    const dirEntries = entries.filter(e => e.type === 'dir')
    const results = await Promise.allSettled(
      fileEntries.map(e => fetchFileContent(repo, branch, `${dirPath}/${e.name}`).then(c => c ? [e.name, c] : null))
    )
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) target[`${dirPath}/${r.value[0]}`] = r.value[1]
    }
    for (const e of dirEntries) {
      await scanDir(repo, branch, `${dirPath}/${e.name}`, target, depth + 1)
    }
  } catch {}
}

/**
 * 自動分類 repo 根目錄的檔案與目錄（模式匹配，零硬編碼檔案名）
 *
 * 將根目錄條目分類為：
 *   - aiConfig: CLAUDE.md、AGENTS.md、.cursorrules 等 AI 配置
 *   - projectDocs: README、CONTRIBUTING 等重要文件
 *   - techDetect: package.json、go.mod、Cargo.toml 等技術偵測用
 *   - lintConfig: .eslintrc、*.config.* 等 lint/工具配置
 *   - directories: 值得遞迴掃描的目錄（.claude、.github 等）
 *
 * @param {Array<{name: string, type: string}>} rootEntries - GraphQL rootEntries（含 name 和 type）
 * @returns {{ aiConfig: string[], projectDocs: string[], techDetect: string[], lintConfig: string[], directories: string[] }}
 */
export function classifyRepoFiles(rootEntries) {
  const r = { aiConfig: [], projectDocs: [], techDetect: [], lintConfig: [], directories: [] }

  for (const e of rootEntries) {
    const name = e.name || e
    const type = e.type || 'file'

    // 目錄：值得遞迴掃描的
    if (type === 'dir') {
      if (name.startsWith('.claude') || name.startsWith('.cursor') || name === '.github' ||
          name === '.husky' || name === '.vscode') {
        r.directories.push(name)
      }
      continue
    }

    // AI 配置檔
    if (/^(CLAUDE|AGENTS)\.md$/i.test(name) || /cursorrules/i.test(name)) {
      r.aiConfig.push(name)
      continue
    }

    // 專案文件：大寫 .md 通常是重要文件
    if (/^(README|CONTRIBUTING|ARCHITECTURE|DESIGN|DEVELOPMENT|CONVENTIONS|CHANGELOG)\.md$/i.test(name)) {
      r.projectDocs.push(name)
      continue
    }

    // 技術偵測：套件管理 + 語言配置
    if (/^(package|composer|Cargo|Gemfile|Podfile|pubspec)\./.test(name) ||
        /^(go\.(mod|sum)|setup\.py|requirements\.txt|Pipfile|pom\.xml)$/.test(name) ||
        /^(tsconfig|jsconfig)/.test(name) ||
        /^build\.gradle/.test(name)) {
      r.techDetect.push(name)
      continue
    }

    // Lint / Config
    if (/\.config\.\w+$/.test(name) ||
        (/rc(\.\w+)?$/.test(name) && name.startsWith('.')) ||
        /^\.editorconfig$/.test(name) ||
        /^\.browserslistrc$/.test(name) ||
        /^\.nvmrc$/.test(name) ||
        /^\.env(\.|$)/.test(name) ||
        /ignore$/.test(name) ||
        /^turbo\.json$/.test(name) ||
        /^\.npmrc$/.test(name)) {
      r.lintConfig.push(name)
      continue
    }
  }

  return r
}
