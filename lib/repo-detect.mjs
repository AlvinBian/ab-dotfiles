/**
 * 本機 repo 路徑偵測 — Spotlight (macOS) + find (fallback)
 *
 * 用 execFileSync 避免 shell 注入。
 */

import { execFileSync } from 'child_process'

/**
 * 偵測 repos 在本機的 clone 路徑
 *
 * @param {Array<{ fullName: string }>} repos
 * @returns {Promise<Object>} { 'org/repo': '/path/to/repo' }
 */
export async function detectLocalRepos(repos) {
  const results = {}

  for (const repo of repos) {
    const name = repo.fullName.split('/')[1]
    if (!name) continue

    // macOS: Spotlight（快，<0.5s）
    if (process.platform === 'darwin') {
      try {
        const query = `kMDItemFSName == '${name}' && kMDItemContentType == public.folder`
        const dirs = execFileSync('mdfind', [query, '-onlyin', process.env.HOME], {
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

    // fallback: find（慢，跨平台）
    if (!results[repo.fullName]) {
      try {
        const stdout = execFileSync('find', [
          process.env.HOME, '-maxdepth', '4', '-name', name, '-type', 'd',
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
