/**
 * 本機 repo 路徑偵測
 *
 * 三種策略（按速度排列）：
 * 1. fd 搜索 .git 目錄 + git remote 匹配（最快，0.1-0.5s，全自動）
 * 2. 文件夾映射掃描（快，配置驅動，支持角色覆蓋）
 * 3. Spotlight / find fallback（慢，最後手段）
 *
 * 全自動，不需要用戶輸入文件夾路徑。
 */

import { execFileSync } from 'child_process'
import fs from 'fs'
import path from 'path'

const HOME = process.env.HOME

/**
 * 將 ~ 開頭的路徑展開為絕對路徑
 *
 * @param {string} p - 可能含 ~ 的路徑
 * @returns {string} 展開後的絕對路徑
 */
function expandHome(p) {
  return p.startsWith('~') ? path.join(HOME, p.slice(1)) : p
}

/**
 * 策略 1：fd + git remote（最快，全自動）
 *
 * 用 fd 搜尋所有 .git 目錄，再透過 git remote get-url 取得 remote URL，
 * 比對 owner/repo 格式（例如 `org/repo`）來判斷是否符合。
 *
 * @param {Array<{fullName: string}>} repos - 要比對的 repo 列表
 * @returns {Object} fullName → localPath 的映射（只包含找到的）
 */
function detectWithFd(repos) {
  const results = {}
  const hasFd = (() => { try { execFileSync('fd', ['--version'], { stdio: 'pipe' }); return true } catch { return false } })()
  if (!hasFd) return results

  try {
    const gitDirs = execFileSync('fd', [
      '-t', 'd', '-H', '^\\.git$', HOME,
      '--max-depth', '5', '--no-ignore',
    ], { encoding: 'utf8', timeout: 10000 }).trim().split('\n').filter(Boolean)

    const remoteMap = {}
    for (const gitDir of gitDirs) {
      const repoDir = path.dirname(gitDir)
      try {
        const remote = execFileSync('git', ['-C', repoDir, 'remote', 'get-url', 'origin'], {
          encoding: 'utf8', timeout: 2000, stdio: ['pipe', 'pipe', 'pipe'],
        }).trim()
        const match = remote.match(/[:/]([^/]+\/[^/.]+?)(?:\.git)?$/)
        if (match) remoteMap[match[1]] = repoDir
      } catch {}
    }

    for (const repo of repos) {
      if (remoteMap[repo.fullName]) results[repo.fullName] = remoteMap[repo.fullName]
    }
  } catch {}

  return results
}

/**
 * 策略 2：文件夾映射（遞歸掃描配置的目錄）
 *
 * 根據 config.json 中配置的 folders 列表，遞迴掃描各目錄，
 * 以目錄名稱匹配 repo name（fullName 的第二段），
 * 並支援 folder.role 欄位覆蓋預設角色判定。
 *
 * @param {Array<{fullName: string}>} repos - 要比對的 repo 列表
 * @param {Array<{path: string, role?: string}>} folders - 配置的搜尋目錄
 * @returns {{ paths: Object, roleOverrides: Object }}
 *   paths: fullName → localPath，roleOverrides: fullName → role
 */
export function detectFromFolders(repos, folders) {
  const paths = {}
  const roleOverrides = {}
  if (!folders?.length) return { paths, roleOverrides }

  for (const folder of folders) {
    const fullPath = expandHome(folder.path)
    if (!fs.existsSync(fullPath)) continue
    if (!fs.statSync(fullPath).isDirectory()) continue

    const scanDir = (dir, depth) => {
      if (depth > 3) return
      if (fs.existsSync(path.join(dir, '.git'))) {
        const repoName = path.basename(dir)
        const matched = repos.find(r => r.fullName.split('/')[1] === repoName)
        if (matched && !paths[matched.fullName]) {
          paths[matched.fullName] = dir
          if (folder.role && folder.role !== 'auto') roleOverrides[matched.fullName] = folder.role
        }
        return
      }
      let entries
      try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === 'node_modules') continue
        scanDir(path.join(dir, entry.name), depth + 1)
      }
    }
    scanDir(fullPath, 0)
  }
  return { paths, roleOverrides }
}

/**
 * 策略 3：Spotlight / find fallback
 *
 * 對尚未找到本地路徑的 repo，在 macOS 上使用 mdfind（Spotlight），
 * 非 macOS 使用 find 命令搜尋。找到目錄後再用 git remote 確認 remote URL 匹配。
 *
 * @param {Array<{fullName: string}>} repos - 完整 repo 列表
 * @param {Object} alreadyFound - 已用前面策略找到的 fullName → localPath 映射
 * @returns {Promise<Object>} 合併後的 fullName → localPath 映射
 */
async function detectFallback(repos, alreadyFound) {
  const results = { ...alreadyFound }
  for (const repo of repos) {
    if (results[repo.fullName]) continue
    const name = repo.fullName.split('/')[1]
    if (!name) continue

    if (process.platform === 'darwin') {
      try {
        const query = `kMDItemFSName == '${name}' && kMDItemContentType == public.folder`
        const dirs = execFileSync('mdfind', [query, '-onlyin', HOME], {
          encoding: 'utf8', timeout: 5000,
        }).trim().split('\n').filter(Boolean)
        for (const dir of dirs) {
          try {
            const remote = execFileSync('git', ['-C', dir, 'remote', 'get-url', 'origin'], {
              encoding: 'utf8', timeout: 3000, stdio: ['pipe', 'pipe', 'pipe'],
            }).trim()
            if (remote.includes(name)) { results[repo.fullName] = dir; break }
          } catch {}
        }
      } catch {}
    }

    if (!results[repo.fullName]) {
      try {
        const stdout = execFileSync('find', [
          HOME, '-maxdepth', '4', '-name', name, '-type', 'd',
        ], { encoding: 'utf8', timeout: 10000, stdio: ['pipe', 'pipe', 'ignore'] })
        for (const dir of stdout.trim().split('\n').filter(Boolean).slice(0, 5)) {
          try {
            const remote = execFileSync('git', ['-C', dir, 'remote', 'get-url', 'origin'], {
              encoding: 'utf8', timeout: 3000, stdio: ['pipe', 'pipe', 'pipe'],
            }).trim()
            if (remote.includes(name)) { results[repo.fullName] = dir; break }
          } catch {}
        }
      } catch {}
    }
  }
  return results
}

/**
 * 統一偵測入口
 *
 * 全自動：fd → 文件夾映射 → Spotlight/find
 * 不需要用戶輸入文件夾路徑。
 *
 * @param {Array<{fullName: string}>} repos - 要尋找的 repo 列表（含 fullName）
 * @param {Array<{path: string, role?: string}>} [folders] - 可選的預設搜尋目錄配置
 * @returns {Promise<{ paths: Object, roleOverrides: Object, method: string }>}
 *   paths: fullName → 本地絕對路徑，
 *   roleOverrides: fullName → 角色覆蓋，
 *   method: 主要偵測策略（'fd' | 'folder' | 'spotlight'）
 */
export async function detectLocalRepos(repos, folders) {
  // 1. fd（全自動，0.1-0.5s）
  const fdResults = detectWithFd(repos)

  // 2. 文件夾映射補充
  const { paths: folderPaths, roleOverrides } = detectFromFolders(repos, folders)
  const merged = { ...fdResults, ...folderPaths }

  // 3. Spotlight/find 補漏
  const remaining = repos.filter(r => !merged[r.fullName])
  let allPaths = merged
  if (remaining.length > 0) {
    allPaths = await detectFallback(repos, merged)
  }

  const method = Object.keys(fdResults).length > 0 ? 'fd' : folders?.length ? 'folder' : 'spotlight'
  return { paths: allPaths, roleOverrides, method }
}
