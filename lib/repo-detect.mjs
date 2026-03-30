/**
 * 本機 repo 路徑偵測
 *
 * 兩種模式：
 * 1. 文件夾映射（快）— 掃描配置的專案文件夾，直接匹配 repo 名稱
 * 2. Spotlight + find（慢）— 逐個搜索，作為 fallback
 *
 * 文件夾映射配置（session 或 config.json）：
 *   projectFolders: [
 *     { path: '~/Kkday/Projects', role: 'auto' },     // 自動判斷角色
 *     { path: '~/Kkday/Projects/kkday-b2c-web', role: 'main' },  // 指定主力
 *     { path: '~/Tools', role: 'tool' },               // 全部工具
 *   ]
 */

import { execFileSync } from 'child_process'
import fs from 'fs'
import path from 'path'

const HOME = process.env.HOME

/**
 * 展開 ~ 路徑
 */
function expandHome(p) {
  return p.startsWith('~') ? path.join(HOME, p.slice(1)) : p
}

/**
 * 從文件夾映射偵測 repos 的本機路徑
 *
 * @param {Array<{ fullName: string }>} repos - GitHub repos
 * @param {Array<{ path: string, role?: string }>} folders - 配置的文件夾
 * @returns {{ paths: Object, roleOverrides: Object }}
 *   paths: { 'org/repo': '/full/path' }
 *   roleOverrides: { 'org/repo': 'main' | 'temp' | 'tool' }
 */
export function detectFromFolders(repos, folders) {
  const paths = {}
  const roleOverrides = {}

  if (!folders?.length) return { paths, roleOverrides }

  for (const folder of folders) {
    const fullPath = expandHome(folder.path)
    if (!fs.existsSync(fullPath)) continue

    const stat = fs.statSync(fullPath)
    if (!stat.isDirectory()) continue

    // 遞歸掃描（最多 3 層），找到 .git 的目錄就匹配
    const scanDir = (dir, depth) => {
      if (depth > 3) return

      // 本身是 repo？
      if (fs.existsSync(path.join(dir, '.git'))) {
        const repoName = path.basename(dir)
        const matched = repos.find(r => r.fullName.split('/')[1] === repoName)
        if (matched && !paths[matched.fullName]) {
          paths[matched.fullName] = dir
          if (folder.role && folder.role !== 'auto') {
            roleOverrides[matched.fullName] = folder.role
          }
        }
        return // 不再往 repo 內部掃
      }

      // 掃子目錄
      let entries
      try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
        scanDir(path.join(dir, entry.name), depth + 1)
      }
    }

    scanDir(fullPath, 0)
  }

  return { paths, roleOverrides }
}

/**
 * Spotlight + find fallback（逐個搜索未找到的 repos）
 *
 * @param {Array<{ fullName: string }>} repos
 * @param {Object} alreadyFound - 已找到的 { fullName: path }
 * @returns {Promise<Object>} { 'org/repo': '/path/to/repo' }
 */
export async function detectWithSpotlight(repos, alreadyFound = {}) {
  const results = { ...alreadyFound }

  for (const repo of repos) {
    if (results[repo.fullName]) continue // 已找到，跳過

    const name = repo.fullName.split('/')[1]
    if (!name) continue

    // macOS: Spotlight
    if (process.platform === 'darwin') {
      try {
        const query = `kMDItemFSName == '${name}' && kMDItemContentType == public.folder`
        const dirs = execFileSync('mdfind', [query, '-onlyin', HOME], {
          encoding: 'utf8',
          timeout: 5000,
        }).trim().split('\n').filter(Boolean)

        for (const dir of dirs) {
          try {
            const remote = execFileSync('git', ['-C', dir, 'remote', 'get-url', 'origin'], {
              encoding: 'utf8',
              timeout: 3000,
            }).trim()
            if (remote.includes(name)) {
              results[repo.fullName] = dir
              break
            }
          } catch {}
        }
      } catch {}
    }

    // fallback: find
    if (!results[repo.fullName]) {
      try {
        const stdout = execFileSync('find', [
          HOME, '-maxdepth', '4', '-name', name, '-type', 'd',
        ], { encoding: 'utf8', timeout: 10000, stdio: ['pipe', 'pipe', 'ignore'] })

        const dirs = stdout.trim().split('\n').filter(Boolean).slice(0, 5)
        for (const dir of dirs) {
          try {
            const remote = execFileSync('git', ['-C', dir, 'remote', 'get-url', 'origin'], {
              encoding: 'utf8',
              timeout: 3000,
            }).trim()
            if (remote.includes(name)) {
              results[repo.fullName] = dir
              break
            }
          } catch {}
        }
      } catch {}
    }
  }

  return results
}

/**
 * 統一偵測入口：先用文件夾映射（快），再用 Spotlight 補漏
 *
 * @param {Array<{ fullName: string }>} repos
 * @param {Array<{ path: string, role?: string }>} [folders] - 文件夾映射配置
 * @returns {Promise<{ paths: Object, roleOverrides: Object }>}
 */
export async function detectLocalRepos(repos, folders) {
  // 1. 文件夾映射（即時）
  const { paths: folderPaths, roleOverrides } = detectFromFolders(repos, folders)

  // 2. Spotlight 補漏（較慢，只搜未找到的）
  const allPaths = await detectWithSpotlight(repos, folderPaths)

  return { paths: allPaths, roleOverrides }
}
