/**
 * matchWhen 條件預選引擎
 *
 * 根據 frontmatter 中的 matchWhen 條件，計算哪些項目應被預選。
 * matchWhen 只控制預選，不限制用戶手動選擇。
 */

/**
 * 計算預選列表
 *
 * @param {Array<{value: string, matchWhen?: Object}>} items - 帶 matchWhen 的項目
 * @param {Object} context - 當前安裝上下文
 * @param {string} [context.org] - GitHub 組織名
 * @param {string[]} [context.skills] - 偵測到的技術棧
 * @param {string[]} [context.targets] - 選中的安裝目標
 * @param {string[]} [context.repos] - 選中的倉庫
 * @returns {string[]} 應被預選的 value 列表
 */
export function computeMatchWhenPreselection(items, context = {}) {
  return items.filter(item => {
    const mw = item.matchWhen
    if (!mw || mw.always) return true

    const checks = []
    if (mw.org && context.org) {
      checks.push(mw.org.includes(context.org))
    }
    if (mw.skills && context.skills?.length) {
      checks.push(mw.skills.some(s => context.skills.includes(s)))
    }
    if (mw.targets && context.targets?.length) {
      checks.push(mw.targets.some(t => context.targets.includes(t)))
    }
    if (mw.repos && context.repos?.length) {
      checks.push(mw.repos.some(r => context.repos.includes(r)))
    }

    if (checks.length === 0) return true
    return mw.matchMode === 'all'
      ? checks.every(Boolean)
      : checks.some(Boolean) // 預設 any
  }).map(item => item.value)
}
