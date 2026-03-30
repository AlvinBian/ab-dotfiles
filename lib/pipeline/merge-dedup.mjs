/**
 * 跨 repo 技術棧整合去重
 *
 * 合併多個 per-repo AI 分類結果，去重 + 衝突仲裁。
 */

import { CATEGORY_ORDER } from '../config/npm-classify.mjs'

/**
 * @param {Array<{ repo, techStacks, reasoning }>} repoResults
 * @returns {{ categorizedTechs: Map, perRepo: Map, conflicts: Array }}
 */
export function mergeRepoResults(repoResults) {
  const categorizedTechs = new Map() // cat → Map<id, { label, repos[] }>
  const perRepo = new Map()          // repoName → { techStacks, reasoning }
  const techCatVotes = new Map()     // techId → Map<cat, count>
  const coreCategories = new Set()   // AI 標記的核心分類（跨 repo 聯集）
  const conflicts = []

  // 第一遍：收集所有分類投票 + 核心分類
  for (const { repo, techStacks, coreCategories: repoCores, reasoning } of repoResults) {
    if (!techStacks) continue
    perRepo.set(repo, { techStacks, reasoning })
    if (Array.isArray(repoCores)) for (const c of repoCores) coreCategories.add(c)
    for (const [cat, ids] of Object.entries(techStacks)) {
      if (!Array.isArray(ids)) continue
      for (const id of ids) {
        const key = String(id).toLowerCase()
        if (!techCatVotes.has(key)) techCatVotes.set(key, new Map())
        const votes = techCatVotes.get(key)
        votes.set(cat, (votes.get(cat) || 0) + 1)
      }
    }
  }

  // 第二遍：仲裁 — 每個技術只歸入得票最多的分類
  const seen = new Set()
  const techToCategory = new Map() // techId → finalCategory

  for (const [techId, votes] of techCatVotes) {
    let bestCat = null, bestCount = 0
    for (const [cat, count] of votes) {
      if (count > bestCount || (count === bestCount && categoryRank(cat) < categoryRank(bestCat))) {
        bestCat = cat
        bestCount = count
      }
    }

    if (votes.size > 1) {
      conflicts.push({
        tech: techId,
        votes: Object.fromEntries(votes),
        resolved: bestCat,
        reason: bestCount > 1 ? '多數決' : 'CATEGORY_ORDER 仲裁',
      })
    }

    techToCategory.set(techId, bestCat)
  }

  // 第三遍：按仲裁結果建構 categorizedTechs，附帶 repos 來源
  for (const { repo, techStacks } of repoResults) {
    if (!techStacks) continue
    for (const [cat, ids] of Object.entries(techStacks)) {
      if (!Array.isArray(ids)) continue
      for (const rawId of ids) {
        const key = String(rawId).toLowerCase()
        const finalCat = techToCategory.get(key)
        if (!finalCat || seen.has(key)) {
          // 已由其他 repo 的結果處理，只追加 repo 來源
          if (seen.has(key)) {
            for (const [, techMap] of categorizedTechs) {
              const entry = techMap.get(key)
              if (entry && !entry.repos.includes(repo)) entry.repos.push(repo)
            }
          }
          continue
        }
        seen.add(key)

        if (!categorizedTechs.has(finalCat)) categorizedTechs.set(finalCat, new Map())
        categorizedTechs.get(finalCat).set(key, {
          label: String(rawId),
          repos: [repo],
        })
      }
    }
  }

  // 補充其他 repo 的 repos 來源（第二遍沒處理到的）
  for (const { repo, techStacks } of repoResults) {
    if (!techStacks) continue
    for (const [, ids] of Object.entries(techStacks)) {
      if (!Array.isArray(ids)) continue
      for (const rawId of ids) {
        const key = String(rawId).toLowerCase()
        for (const [, techMap] of categorizedTechs) {
          const entry = techMap.get(key)
          if (entry && !entry.repos.includes(repo)) entry.repos.push(repo)
        }
      }
    }
  }

  // 合併小分類：只有 1 個技術的分類合入「其他工具」
  const smallCats = []
  for (const [cat, techMap] of categorizedTechs) {
    if (techMap.size <= 1 && !CATEGORY_ORDER.includes(cat)) smallCats.push(cat)
  }
  if (smallCats.length >= 2) {
    const otherCat = '其他工具'
    if (!categorizedTechs.has(otherCat)) categorizedTechs.set(otherCat, new Map())
    const otherMap = categorizedTechs.get(otherCat)
    for (const cat of smallCats) {
      for (const [id, entry] of categorizedTechs.get(cat)) otherMap.set(id, entry)
      categorizedTechs.delete(cat)
    }
    // 如果合併後「其他工具」也只有 1-2 項且有名稱更好的，保留原名
  }

  return { categorizedTechs, perRepo, coreCategories, conflicts }
}

function categoryRank(cat) {
  if (!cat) return 999
  const idx = CATEGORY_ORDER.indexOf(cat)
  return idx === -1 ? 999 : idx
}
