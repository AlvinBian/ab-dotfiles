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
import { orderBy, uniq } from 'lodash-es'
import { ghSync } from '../external/github.mjs'
import { ghAsync } from './skill-detect.mjs'
import { handleCancel, smartSelect, multiselectWithAll, BACK } from '../cli/prompts.mjs'
import { GH_PER_PAGE, GH_CONCURRENCY, DESC_MAX_LENGTH } from '../core/constants.mjs'
import { pMap } from '../core/concurrency.mjs'

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
    p.log.warn(
      `GitHub CLI 未登入，請先執行：\n` +
      `  ${pc.cyan('gh auth login')}          # 互動式（瀏覽器）\n` +
      `  ${pc.cyan('gh auth login --with-token')}  # 貼上 Personal Access Token\n` +
      `完成後重新執行 pnpm setup`
    )
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

  // 支持多選帳號/組織
  let selectedSources
  const prevOrgs = Array.isArray(session?.org) ? session.org : (session?.org ? [session.org] : [])
  if (prevOrgs.length > 0 && prevOrgs.some(o => sources.some(s => s.value === o))) {
    // 有 session → 自動選擇上次的（支持單個或多個）
    selectedSources = prevOrgs.filter(o => sources.some(s => s.value === o))
    if (selectedSources.length > 0) {
      p.log.success(`已連結 ${pc.cyan(selectedSources.join(' + '))}（上次選擇）`)
    }
  }

  if (!selectedSources?.length) {
    const chosen = handleCancel(await p.multiselect({
      message: '選擇 GitHub 帳號/組織（可多選）  Space 切換 · Enter 確認',
      options: sources,
      required: true,
    }))
    if (chosen === BACK) return BACK
    selectedSources = chosen
    p.log.success(`已選擇：${pc.cyan(selectedSources.join(' + '))}`)
  }

  // 4. 載入所有選中帳號的倉庫列表
  const s1 = p.spinner()
  s1.start(`載入 ${selectedSources.join(' + ')} 的倉庫列表...`)

  let allRepos = []
  for (const selectedSource of selectedSources) {
    const isPersonal = selectedSource === username
    const repoJq = isPersonal
      ? '.[] | [.full_name, .description // "", .pushed_at[:10], (.stargazers_count|tostring), (.open_issues_count|tostring), (.size|tostring)] | @tsv'
      : '.[] | select(.archived == false and .fork == false and .size > 0) | [.full_name, .description // "", .pushed_at[:10], (.stargazers_count|tostring), (.open_issues_count|tostring), (.size|tostring)] | @tsv'
    const repoUrl = isPersonal
      ? `user/repos?sort=pushed&per_page=${GH_PER_PAGE}&affiliation=owner`
      : `orgs/${selectedSource}/repos?sort=pushed&per_page=${GH_PER_PAGE}`

    const reposRaw = ghSync(repoUrl, repoJq)
    if (reposRaw) {
      allRepos.push(...reposRaw.split('\n').filter(Boolean).map(line => {
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
      }))
    }
  }
  if (allRepos.length === 0) { s1.stop('無法取得倉庫列表'); return [] }
  s1.stop(`找到 ${pc.green(allRepos.length)} 個倉庫（${selectedSources.join(' + ')}）`)

  // 5. 分析貢獻度（先同步取 commit 搜尋，再異步取詳細計數）
  // 跨多個 org/個人帳號搜尋，不加 org/user qualifier，讓結果涵蓋所有選中的 source
  const quickContribRaw = ghSync(
    `search/commits?q=author:${username}&sort=author-date&per_page=${GH_PER_PAGE}`,
    '.items[].repository.full_name'
  )
  const contributedRepos = uniq((quickContribRaw || '').split('\n').filter(Boolean))

  const s2 = p.spinner()
  s2.start(`分析 ${pc.cyan(username)} 的貢獻度（${contributedRepos.length} 個 repo）...`)

  if (contributedRepos.length > 0) {
    // GitHub API 限流（GH_CONCURRENCY=8），防止 403
    await pMap(contributedRepos, async repo => {
      try {
        const count = await ghAsync(
          `repos/${repo}/contributors?per_page=${GH_PER_PAGE}`,
          `.[] | select(.login=="${username}") | .contributions`
        )
        const match = allRepos.find(x => x.fullName === repo)
        if (match) match.commits = parseInt(count) || 0
      } catch { /* skip failed repos */ }
    }, { concurrency: GH_CONCURRENCY })
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

  // 6. 按組織分組，組內按貢獻度排序
  const repoOrgs = [...new Set(allRepos.map(r => r.fullName.split('/')[0]))]
  const sorted = []
  for (const org of repoOrgs) {
    const orgRepos = orderBy(allRepos.filter(r => r.fullName.startsWith(org + '/')), ['pct', 'commits'], ['desc', 'desc'])
    sorted.push(...orgRepos)
  }

  function repoOpt(r, showOrg) {
    const org = r.fullName.split('/')[0]
    const name = r.fullName.split('/')[1]
    const label = showOrg ? `${pc.dim(org + '/')}${name}` : name
    const parts = []
    if (r.pct > 0) parts.push(`${r.pct}%`)
    if (r.commits > 0) parts.push(`${r.commits} commits`)
    if (r.stars > 0) parts.push(`★${r.stars}`)
    if (r.desc) parts.push(r.desc.slice(0, 30))
    const hint = parts.join(' · ')
    return { value: r.fullName, label, hint }
  }

  // 7. 統一用 smartSelect（有 session 預選上次，無 session 預選有貢獻的）
  const sessionRepoSet = new Set(session?.repos || [])
  const contributed = sorted.filter(r => r.commits > 0)
  const multiOrg = repoOrgs.length > 1

  // 預選：session 有就用 session，否則用有貢獻的
  const preselected = sessionRepoSet.size > 0
    ? session.repos.filter(r => allRepos.some(x => x.fullName === r))
    : contributed.map(r => r.fullName)

  const allItems = sorted.map(r => repoOpt(r, multiOrg))
  const preLabel = sessionRepoSet.size > 0
    ? `上次選了 ${preselected.length} 個`
    : `${contributed.length} 個有貢獻已預選`

  const selectTitle = `選擇倉庫（${allRepos.length} 個，${preLabel}）`

  // preview log：按組織分組顯示，不加序號
  const showSummary = (pre) => {
    const preRepos = pre.map(v => allRepos.find(r => r.fullName === v)).filter(Boolean)
    const lines = []
    for (const org of repoOrgs) {
      const orgPre = preRepos.filter(r => r.fullName.startsWith(org + '/'))
      if (!orgPre.length) continue
      lines.push(`  ${pc.bold(org)}`)
      for (const r of orgPre) {
        const name = r.fullName.split('/')[1]
        const parts = []
        if (r.pct > 0) parts.push(`${r.pct}%`)
        if (r.commits > 0) parts.push(`${r.commits} commits`)
        if (r.stars > 0) parts.push(`★${r.stars}`)
        if (r.desc) parts.push(r.desc.slice(0, 40))
        lines.push(`    ${name}  ${pc.dim(parts.join(' · '))}`)
      }
    }
    return `${selectTitle}（預選 ${pre.length}/${allRepos.length}）：\n${lines.join('\n')}`
  }

  let selected
  if (multiOrg) {
    // 顯示分組預覽
    if (preselected.length > 0) p.log.info(showSummary(preselected))

    // confirm / edit / back
    const preCount = preselected.length
    const actionOpts = []
    if (preCount > 0) actionOpts.push({ value: 'accept', label: `確認預選 (${preCount})`, hint: '推薦' })
    actionOpts.push({ value: 'edit', label: preCount > 0 ? '調整選擇' : `選擇（${allRepos.length} 個可選）` })
    actionOpts.push({ value: 'back', label: `← 上一步  ${pc.dim('ESC 也可以')}` })

    const action = handleCancel(await p.select({ message: selectTitle, options: actionOpts }))
    if (action === BACK || action === 'back') return BACK

    if (action === 'accept') {
      selected = preselected
      p.log.success(`${selectTitle}：${preCount} 個`)
    } else {
      // 每個 org 獨立一輪 multiselect
      const allSelected = []
      for (let oi = 0; oi < repoOrgs.length; oi++) {
        const org = repoOrgs[oi]
        const orgRepos = sorted.filter(r => r.fullName.startsWith(org + '/'))
        const orgPre = preselected.filter(v => v.startsWith(org + '/'))
        const orgItems = orgRepos.map(r => {
          const parts = []
          if (r.pct > 0) parts.push(`${r.pct}%`)
          if (r.commits > 0) parts.push(`${r.commits} commits`)
          if (r.stars > 0) parts.push(`★${r.stars}`)
          if (r.desc) parts.push(r.desc.slice(0, 30))
          return { value: r.fullName, label: r.fullName.split('/')[1], hint: parts.join(' · ') }
        })
        const orgResult = await multiselectWithAll({
          message: `${org}（${oi + 1}/${repoOrgs.length}）`,
          options: orgItems,
          initialValues: orgPre,
          required: false,
        })
        if (orgResult === BACK) return BACK
        allSelected.push(...orgResult)
      }
      selected = allSelected
      if (selected.length > 0) {
        p.log.success(`${selectTitle}：${selected.length} 個`)
      }
    }
  } else {
    // 單一 org — 走原本 smartSelect 流程
    const result = await smartSelect({
      title: selectTitle,
      items: allItems,
      preselected,
      required: true,
      autoSelectThreshold: 0,
      showSummary,
    })
    if (result === BACK) return BACK
    selected = result
  }

  if (!selected || selected.length === 0) { p.log.warn('未選擇倉庫'); return BACK }

  // 返回完整 repo 物件（含 commits/pct/stars），而非純 fullName 字串
  const selectedSet = new Set(selected)
  return allRepos.filter(r => selectedSet.has(r.fullName))
}
