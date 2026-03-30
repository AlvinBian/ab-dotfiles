/**
 * 技術棧選擇互動 UI
 *
 * 流程：
 *   1. 顯示 per-repo 摘要
 *   2. 計算預選（主力 repo + 共用 + 核心分類）
 *   3. 顯示預選摘要 → 三選一（確認/自訂/補充）
 *   4. 只有「自訂」才進入兩層選擇
 */

import * as p from '@clack/prompts'
import pc from 'picocolors'
import { union } from 'lodash-es'
import { CATEGORY_ORDER } from '../config/npm-classify.mjs'
import { handleCancel, multiselectWithAll } from '../cli/prompts.mjs'

/**
 * 顯示 per-repo 技術棧摘要
 */
export function showRepoSummary(pipelineResult) {
  const { categorizedTechs, repoData, repoNpmMap, allLangs, perRepo } = pipelineResult
  const allIds = new Set()
  for (const m of categorizedTechs.values()) for (const id of m.keys()) allIds.add(id)

  const lines = repoData.map((repo, idx) => {
    const { meta } = repo
    const deps = repoNpmMap[repo.name] || new Set()
    const matched = [...deps].map(d => d.replace(/^@/, '').replace(/\//g, '-')).filter(id => allIds.has(id))
    const langs = allLangs.map(l => l.toLowerCase()).filter(id => allIds.has(id))
    const all = union(matched, langs)
    const txt = all.join(', ')
    const infoParts = []
    if (meta.languages?.length) infoParts.push(meta.languages.join('+'))
    if (meta.stars) infoParts.push(`★${meta.stars}`)
    const infoLine = infoParts.length ? `  ${pc.dim(infoParts.join(' · '))}` : ''
    const descLine = meta.description ? `\n     ${pc.dim(meta.description)}` : ''
    const reasoning = perRepo?.get(repo.name)?.reasoning
    const reasonLine = reasoning ? `\n     ${pc.cyan(reasoning)}` : ''
    return `  ${pc.dim(`${idx + 1}.`)} ${pc.cyan(repo.name)}${infoLine}${descLine}${reasonLine}\n     ${txt || pc.dim('—')}`
  }).join('\n')

  return lines || ''
}

/**
 * 計算預選技術
 */
function computePreselection(categorizedTechs, primaryRepo, coreCategories) {
  const coreSet = coreCategories instanceof Set ? coreCategories : new Set(coreCategories || [])
  const preselected = new Set()
  for (const [cat, techMap] of categorizedTechs) {
    const isCoreCategory = coreSet.has(cat)
    for (const [id, entry] of techMap) {
      if (entry.repos.length >= 2 || (primaryRepo && entry.repos.includes(primaryRepo)) || isCoreCategory) {
        preselected.add(id)
      }
    }
  }
  return preselected
}

/**
 * 互動選擇技術棧
 *
 * @param {Map} categorizedTechs
 * @param {Object} prev - 上次 session
 * @param {string} [primaryRepo] - 主力 repo 名稱
 * @param {Set} [coreCategories] - AI 標記的核心分類（動態，不寫死）
 * @returns {Promise<string[]>}
 */
export async function selectTechStacks(categorizedTechs, prev, primaryRepo, coreCategories) {
  const sortedCats = [...categorizedTechs.keys()].sort((a, b) => {
    const ia = CATEGORY_ORDER.indexOf(a), ib = CATEGORY_ORDER.indexOf(b)
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib)
  })

  if (sortedCats.length === 0) return []

  const preselectedTechs = computePreselection(categorizedTechs, primaryRepo, coreCategories)
  const totalTechs = [...categorizedTechs.values()].reduce((s, m) => s + m.size, 0)
  const preCount = preselectedTechs.size
  const skippedCount = totalTechs - preCount

  // 顯示預選摘要（note 區塊，完整可見）
  const previewLines = sortedCats.map((cat, i) => {
    const items = [...categorizedTechs.get(cat).keys()]
    const pre = items.filter(id => preselectedTechs.has(id))
    const skipped = items.filter(id => !preselectedTechs.has(id))
    if (pre.length === 0 && skipped.length === 0) return null
    const preText = pre.join('、')
    const skipText = skipped.length ? `  [未選: ${skipped.join('、')}]` : ''
    return `${i + 1}. ${cat}: ${preText}${skipText}`
  }).filter(Boolean)

  p.log.info(`預選技術棧 (${preCount}/${totalTechs})：\n${previewLines.join('\n')}`)

  // 三選一
  const action = handleCancel(await p.select({
    message: '技術棧操作',
    options: [
      { value: 'accept', label: `確認預選 (${preCount})`, hint: '推薦' },
      { value: 'supplement', label: `確認預選 + 補充`, hint: '預選 + 手動加' },
      { value: 'custom', label: '自訂選擇', hint: '逐分類調整' },
      { value: 'skip', label: '跳過技術棧', hint: '不分析技術棧，直接下一步' },
    ],
  }))

  if (action === 'skip') return []

  let selected = []

  if (action === 'accept') {
    selected = [...preselectedTechs]
  } else if (action === 'supplement') {
    selected = [...preselectedTechs]
    const custom = handleCancel(await p.text({ message: '補充技術棧（逗號分隔）', placeholder: '例如：tailwindcss, prisma', defaultValue: '' }))
    if (custom?.trim()) {
      for (const c of custom.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)) {
        if (!selected.includes(c)) selected.push(c)
      }
    }
  } else {
    // 自訂選擇：兩層
    const catOpts = sortedCats.map(cat => {
      const items = [...categorizedTechs.get(cat).keys()]
      const preN = items.filter(id => preselectedTechs.has(id)).length
      const hint = preN === items.length ? '' : ` ${preN}/${items.length} 預選`
      return { value: cat, label: `${cat}  ${pc.dim(`(${items.length})${hint} ${items.join(', ')}`)}` }
    })

    const preselectedCats = prev?.techCategories?.length > 0
      ? prev.techCategories.filter(c => sortedCats.includes(c))
      : sortedCats.filter(cat => [...categorizedTechs.get(cat).keys()].some(id => preselectedTechs.has(id)))

    const selCats = await multiselectWithAll({
      message: '選擇技術棧分類',
      options: catOpts,
      initialValues: preselectedCats,
    })

    for (const cat of selCats) {
      const techMap = categorizedTechs.get(cat)
      const items = [...techMap.keys()].sort()
      if (items.length <= 3) { selected.push(...items); continue }

      const pre = items.filter(id => preselectedTechs.has(id))
      const itemOpts = items.map(id => {
        const entry = techMap.get(id)
        const tags = []
        if (entry?.repos?.length >= 2) tags.push(`${entry.repos.length} repos`)
        if (primaryRepo && entry?.repos?.includes(primaryRepo)) tags.push('主力')
        const badge = tags.length ? ` ${pc.dim(`(${tags.join(', ')})`)}` : ''
        return { value: id, label: `${id}${badge}` }
      })
      selected.push(...await multiselectWithAll({ message: `${cat} (${items.length})`, options: itemOpts, initialValues: pre }))
    }

    // 自訂模式也可以補充
    const custom = handleCancel(await p.text({ message: '補充（逗號分隔，Enter 跳過）', placeholder: '例如：tailwindcss, prisma', defaultValue: '' }))
    if (custom?.trim()) {
      for (const c of custom.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)) {
        if (!selected.includes(c)) selected.push(c)
      }
    }
  }

  if (selected.length > 0) {
    // 所有路徑最終確認
    p.log.success(`技術棧：${selected.length} 個`)
    const finalOk = handleCancel(await p.confirm({ message: `確認 ${selected.length} 個技術棧？`, initialValue: true }))
    if (!finalOk) return selectTechStacks(categorizedTechs, prev, primaryRepo, coreCategories)
  }
  return selected
}
