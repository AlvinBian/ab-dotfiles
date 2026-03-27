/**
 * GitHub 倉庫互動式選擇
 *
 * 職責：
 *   提供完整的互動流程讓用戶選擇 GitHub 倉庫：
 *   1. 檢查 gh CLI 登入狀態
 *   2. 選擇帳號 / 組織
 *   3. 載入倉庫列表（含 stars、issues、size、最近 push 時間）
 *   4. 分析用戶貢獻度（commit 數、佔比）
 *   5. 排序（貢獻度 / 活躍度 / 星數 / 大小）
 *   6. 多選倉庫（有貢獻的預選）
 *
 * 依賴：lib/github.mjs（gh API）、lib/ui.mjs（互動元件）、lib/constants.mjs
 */

import * as p from '@clack/prompts'
import { execSync } from 'child_process'
import pc from 'picocolors'
import { ghSync } from './github.mjs'
import { ghAsync } from './skill-detect.mjs'
import { handleCancel, multiselectWithAll } from './ui.mjs'
import { GH_PER_PAGE, DESC_MAX_LENGTH } from './constants.mjs'

/**
 * 互動式選擇 GitHub 倉庫
 *
 * 完整流程：登入檢查 → 選帳號/組織 → 載入倉庫 → 貢獻分析 → 排序 → 多選
 *
 * @returns {Promise<string[]>} 選中的倉庫 full_name 陣列（如 ['org/repo1', 'org/repo2']）
 */
export async function interactiveRepoSelect() {
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

  // 3. 選擇來源（個人 or 組織）
  const sources = [
    { value: username, label: `${username}  ${pc.dim('個人倉庫')}` },
    ...orgs.map(o => ({ value: o, label: `${o}  ${pc.dim('組織')}` })),
  ]

  const selectedSource = handleCancel(await p.select({
    message: '選擇 GitHub 帳號/組織  ↑↓ 選擇 · Enter 確認',
    options: sources,
  }))
  p.log.success(`已選擇：${pc.cyan(selectedSource)}`)

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

  // 5. 分析貢獻度
  const s2 = p.spinner()
  s2.start(`分析 ${pc.cyan(username)} 的貢獻度...`)

  const quickContribRaw = ghSync(
    `search/commits?q=author:${username}+org:${selectedSource}&sort=author-date&per_page=${GH_PER_PAGE}`,
    '.items[].repository.full_name'
  )
  const contributedRepos = [...new Set((quickContribRaw || '').split('\n').filter(Boolean))]

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

  // 計算貢獻佔比
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

  // 6. 選擇排序維度
  const sortMode = handleCancel(await p.select({
    message: '倉庫排序方式  ↑↓ 選擇 · Enter 確認',
    options: [
      { value: 'contribution', label: `貢獻度佔比  ${pc.dim('按你的 commit 佔比排序，有貢獻的預選')}` },
      { value: 'activity',     label: `倉庫活躍度  ${pc.dim('按最近 push 時間排序')}` },
      { value: 'stars',        label: `倉庫星數  ${pc.dim('按 star 數排序')}` },
      { value: 'size',         label: `倉庫大小  ${pc.dim('按程式碼量排序')}` },
    ],
  }))

  const sortLabels = { contribution: '貢獻度佔比', activity: '倉庫活躍度', stars: '倉庫星數', size: '倉庫大小' }
  p.log.success(`排序方式：${pc.cyan(sortLabels[sortMode])}`)

  const sortFns = {
    contribution: (a, b) => b.pct - a.pct || b.commits - a.commits,
    activity: (a, b) => a.pushedAt < b.pushedAt ? 1 : -1,
    stars: (a, b) => b.stars - a.stars,
    size: (a, b) => b.size - a.size,
  }
  const sorted = [...allRepos].sort(sortFns[sortMode])

  // 分組：有貢獻的 vs 其他
  const contributed = sorted.filter(r => r.commits > 0)
  const others = sorted.filter(r => r.commits === 0)

  function repoOpt(r) {
    const parts = []
    if (r.pct > 0) parts.push(`${r.pct}% · ${r.commits} commits`)
    parts.push(r.pushedAt)
    if (r.stars > 0) parts.push(`⭐${r.stars}`)
    if (r.desc) parts.push(r.desc.slice(0, 40))
    return { value: r.fullName, label: `${r.fullName.split('/')[1]}  ${pc.dim(parts.join(' · '))}` }
  }

  // 7a. 先選有貢獻的（數量少，不會爆）
  let selected = []
  if (contributed.length > 0) {
    selected = await multiselectWithAll({
      message: `選擇倉庫（${contributed.length} 個有貢獻）`,
      options: contributed.map(repoOpt),
      initialValues: contributed.map(r => r.fullName),
    })
  }

  // 7b. 是否從其他倉庫補充？（分頁顯示，每頁 20 個）
  if (others.length > 0) {
    const addMore = handleCancel(await p.confirm({
      message: `還有 ${others.length} 個其他倉庫，要補充選擇嗎？`,
      initialValue: false,
    }))

    if (addMore) {
      const PAGE_SIZE = 20
      const pages = Math.ceil(others.length / PAGE_SIZE)

      for (let page = 0; page < pages; page++) {
        const slice = others.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
        const pageLabel = pages > 1 ? ` (${page + 1}/${pages})` : ''
        const extra = await multiselectWithAll({
          message: `其他倉庫${pageLabel}`,
          options: slice.map(repoOpt),
          initialValues: [],
        })
        selected.push(...extra)

        // 還有下一頁時問要不要繼續
        if (page < pages - 1 && extra.length === 0) {
          const more = handleCancel(await p.confirm({ message: '繼續瀏覽下一頁？', initialValue: false }))
          if (!more) break
        }
      }
    }
  }

  if (selected.length === 0) { p.log.warn('未選擇倉庫'); process.exit(0) }

  const repoLines = selected.map((r, i) => {
    const name = r.split('/')[1]
    const info = allRepos.find(x => x.fullName === r)
    const parts = []
    if (info?.pct > 0) parts.push(`${info.pct}%`)
    if (info?.commits > 0) parts.push(`${info.commits} commits`)
    if (info?.desc) parts.push(info.desc.slice(0, 30))
    return `${i + 1}. ${name}${parts.length ? '  ' + parts.join(' · ') : ''}`
  }).join('\n')
  p.log.success(`已選擇 ${selected.length} 個倉庫：`)
  p.log.message(repoLines)
  return selected
}
