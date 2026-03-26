/**
 * GitHub API 封裝（準備未來 @ab-flash/libs 提取）
 *
 * 提供 gh CLI 的異步/同步封裝、檔案內容抓取、目錄掃描、檔案分類等功能。
 */

import { execSync, execFile } from 'child_process'
import { promisify } from 'util'
import { GH_API_TIMEOUT } from './constants.mjs'

const execFileAsync = promisify(execFile)

// ── gh API 封裝（異步，不阻塞 event loop）──────────────────────
export async function gh(apiPath, jqExpr = null) {
  try {
    const args = ['api', apiPath]
    if (jqExpr) args.push('--jq', jqExpr)
    const { stdout } = await execFileAsync('gh', args, { timeout: GH_API_TIMEOUT })
    return stdout.trim()
  } catch { return null }
}

// 同步版本（僅用於 interactiveRepoSelect 等不需要 spinner 的場景）
export function ghSync(apiPath, jqExpr = null) {
  try {
    const jq = jqExpr ? ` --jq '${jqExpr}'` : ''
    return execSync(`gh api "${apiPath}"${jq}`, { encoding: 'utf8', timeout: GH_API_TIMEOUT, stdio: ['pipe', 'pipe', 'pipe'] }).trim()
  } catch { return null }
}

// ── 抓取單一檔案內容（base64 解碼）────────────────────────────
export async function fetchFileContent(repo, branch, filePath) {
  const b64 = await gh(`repos/${repo}/contents/${encodeURIComponent(filePath)}?ref=${branch}`, '.content')
  if (!b64) return null
  try { return Buffer.from(b64, 'base64').toString('utf8') } catch { return null }
}

// ── 遞迴掃描目錄 ─────────────────────────────────────────────
export async function scanDir(repo, branch, dirPath, target, depth = 0) {
  if (depth > 1) return
  const raw = await gh(`repos/${repo}/contents/${dirPath}?ref=${branch}`)
  if (!raw) return
  try {
    const entries = JSON.parse(raw)
    // 並行抓取檔案
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

// ── 自動分類 repo 根目錄（模式匹配，零寫死）────────────────────
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

    // Lint / Config：自動識別 .xxxrc* / xxx.config.* / .editorconfig / .xxxignore / .env*
    if (/\.config\.\w+$/.test(name) ||                      // xxx.config.mjs/js/ts
        (/rc(\.\w+)?$/.test(name) && name.startsWith('.')) || // .eslintrc / .prettierrc.mjs
        /^\.editorconfig$/.test(name) ||
        /^\.browserslistrc$/.test(name) ||
        /^\.nvmrc$/.test(name) ||
        /^\.env(\.|$)/.test(name) ||                         // .env / .env.template
        /ignore$/.test(name) ||                              // .eslintignore / .gitignore
        /^turbo\.json$/.test(name) ||
        /^\.npmrc$/.test(name)) {
      r.lintConfig.push(name)
      continue
    }
  }

  return r
}
