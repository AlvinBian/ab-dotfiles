/**
 * GitHub 倉庫互動式選擇
 *
 * 職責：
 *   提供完整的互動流程讓用戶選擇 GitHub 倉庫：
 *   1. 檢查 gh CLI 登入狀態
 *   2. 選擇帳號 / 組織（有 session 時預選上次的）
 *   3. 載入倉庫列表（含 stars、issues、size、最近 push 時間）
 *   4. 分析用戶貢獻度（commit 數、佔比）
 *   5. 排序（有 session 時跳過排序選擇，預設貢獻度）
 *   6. 多選倉庫（session repos 排前 + 預選，再加有貢獻的）
 *
 * 依賴：lib/github.mjs（gh API）、lib/ui/prompts.mjs（互動元件）、lib/constants.mjs
 */

import * as p from '@clack/prompts'
import { execSync } from 'child_process'
import pc from 'picocolors'
import { ghSync } from './github.mjs'
import { ghAsync } from './skill-detect.mjs'
import { handleCancel, smartSelect, BACK } from './ui/prompts.mjs'
import { GH_PER_PAGE, DESC_MAX_LENGTH } from './constants.mjs'

/**
 * 互動式選擇 GitHub 倉庫
 *
 * @param {Object} [session] - 上次 session（有則預選 org/repos）
 * @param {string} [session.org] - 上次選的組織
 * @param {string[]} [session.repos] - 上次選的倉庫列表
 * @returns {Promise<string[]>} 選中的倉庫 full_name 陣列
 */
export async function interactiveRepoSelect(session = null) {
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

  // 3. 選擇來源（有 session 且只有一個匹配時自動選）
  const sources = [
    { value: username, label: `${username}  ${pc.dim('個人倉庫')}` },
    ...orgs.map(o => ({ value: o, label: `${o}  ${pc.dim('組織')}` })),
  ]

  let selectedSource
  if (session?.org && sources.some(s => s.value === session.org)) {
    // 有 session 且上次的 org 還存在 → 自動選擇，顯示確認
    selectedSource = session.org
    p.log.success(`GitHub 帳號：${pc.cyan(selectedSource)}（上次選擇）`)
  } else {
    selectedSource = handleCancel(await p.select({
      message: '選擇 GitHub 帳號/組織  ↑↓ 選擇 · Enter 確認',
      options: sources,
    }))
    p.log.success(`已選擇：${pc.cyan(selectedSource)}`)
  }

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
  if (!reposRaw) { p.log.error('無法取得倉庫列表（GitHub API 失敗）'); process.exit(1) }
  const allRepos = reposRaw.split('\n').filter(Boolean).map(line => {
    const [fullName, desc, pushedAt, stars, issues, size] = line.split('\t')
    return {
      fullName,
      desc: desc?.slice(0, DESC_MAX_LENGTH),
      pushedAt,
      stars: parseInt(stars) || 0,
      issues: parseInt(issues) || 0,
      size: parseInt(size) || 0,
      commits: 0,
      pct: 0,
    }
  })
  s1.stop(`找到 ${pc.green(allRepos.length)} 個倉庫`)

  // 5. 分析貢獻度（先同步取 commit 搜尋，再異步取詳細計數）
  const quickContribRaw = ghSync(
    `search/commits?q=author:${username}+org:${selectedSource}&sort=author-date&per_page=${GH_PER_PAGE}`,
    '.items[].repository.full_name'
  )
  const contributedRepos = [...new Set((quickContribRaw || '').split('\n').filter(Boolean))]

  const s2 = p.spinner()
  s2.start(`分析 ${pc.cyan(username)} 的貢獻度（${contributedRepos.length} 個 repo）...`)

  if (contributedRepos.length > 0) {
    const fullCounts = await Promise.allSettled(
      contributedRepos.map(async repo => {
        const count = await ghAsync(
          `repos/${repo}/contributors?per_page=${GH_PER_PAGE}`,
          `.[] | select(.login=="${username}") | .contributions`
        )
        return { repo, count: parseInt(count) || 0 }
      })
    )
    for (const r of fullCounts) {
      if (r.status !== 'fulfilled') continue
      const match = allRepos.find(x => x.fullName === r.value.repo)
      if (match) match.commits = r.value.count
    }
  }

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

  // 6. 排序（貢獻度優先）
  const sorted = [...allRepos].sort((a, b) => b.pct - a.pct || b.commits - a.commits)

  function repoOpt(r) {
    const name = r.fullName.split('/')[1]
    const parts = []
    if (r.pct > 0) parts.push(`${r.pct}%`)
    if (r.commits > 0) parts.push(`${r.commits} commits`)
    if (r.stars > 0) parts.push(`★${r.stars}`)
    if (r.desc) parts.push(r.desc.slice(0, 30))
    const hint = parts.join(' · ')
    return { value: r.fullName, label: name, hint }
  }

  // 7. 統一用 smartSelect（有 session 預選上次，無 session 預選有貢獻的）
  const sessionRepoSet = new Set(session?.repos || [])
  const contributed = sorted.filter(r => r.commits > 0)

  // 預選：session 有就用 session，否則用有貢獻的
  const preselected = sessionRepoSet.size > 0
    ? session.repos.filter(r => allRepos.some(x => x.fullName === r))
    : contributed.map(r => r.fullName)

  const allItems = sorted.map(repoOpt)
  const preLabel = sessionRepoSet.size > 0
    ? `上次選了 ${preselected.length} 個`
    : `${contributed.length} 個有貢獻已預選`

  const selected = await smartSelect({
    title: `選擇倉庫（${allRepos.length} 個，${preLabel}）`,
    items: allItems,
    preselected,
    required: true,
    autoSelectThreshold: 0,
  })

  if (selected === BACK) return BACK
  if (selected.length === 0) { p.log.warn('未選擇倉庫'); process.exit(0) }
  return selected
}
