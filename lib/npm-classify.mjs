/**
 * npm 套件分類與噪音偵測（共用模組）
 *
 * 職責：
 *   1. 噪音偵測 — 判斷一個 npm 套件是否為開發工具鏈（loader/plugin/lint/polyfill 等）
 *   2. 自動分類 — 根據 npms.io 的 keywords + description 推斷套件分類
 *   3. 分類優先級 — 控制各分類在掃描報告中的排序
 *
 * 設計原則：
 *   - 零硬編碼套件名（不維護白名單）
 *   - 分類邏輯完全基於 npms.io 返回的 metadata
 *   - 被 setup.mjs（互動偵測）和 scan.mjs（批量掃描）共用
 */

// ── 噪音信號詞 ─────────────────────────────────────────────────
// 出現在 npm keywords 中表示該套件是「開發工具鏈」而非「技術棧」
export const NOISE_KEYWORDS = new Set([
  // 編譯 / 轉譯
  'polyfill', 'ponyfill', 'shim', 'loader', 'preset', 'transpiler',
  // 外掛 / 配置
  'plugin', 'addon', 'extension', 'config', 'configuration',
  // 程式碼品質
  'lint', 'linter', 'formatter', 'prettier', 'eslint', 'stylelint',
  // 型別定義
  'types', 'typings', 'typescript-definitions',
  // 包裝 / 適配
  'wrapper', 'binding', 'bindings', 'adapter',
  // 相容性
  'compat', 'compatibility', 'migration',
  // 開發工具
  'devtool', 'devtools', 'debug', 'debugger',
])

// description 中的噪音模式（正則匹配）
export const NOISE_DESC_PATTERNS = [
  /plugin for (webpack|babel|eslint|postcss|stylelint|rollup|vite|prettier)/,
  /loader for (webpack|rollup)/,
  /(eslint|stylelint|prettier) (rule|config|plugin|preset)/,
  /^(babel|postcss|webpack) /,
  /typescript (type )?definitions/,
  /polyfill for/,
]

// PHP 套件噪音（內部擴展、語言本身、PSR 標準）
export const PHP_NOISE = /^(php$|ext-|lib-|composer\/|psr\/)/

// npm 套件名噪音（scan.mjs 用的快速前置過濾，在查 npms.io 之前）
export const NPM_NAME_NOISE = /^(@types\/)/

/**
 * 判斷 npm 套件是否為噪音（開發工具鏈）
 *
 * 基於 npms.io 返回的 keywords 和 description，
 * 不依賴套件名稱的 pattern matching。
 *
 * @param {string[]} keywords - npms.io metadata.keywords
 * @param {string} desc - npms.io metadata.description（小寫）
 * @returns {boolean} true = 開發工具鏈，應降級或隱藏
 */
export function isNoisePkg(keywords, desc) {
  const kw = keywords.map(k => k.toLowerCase())
  if (kw.some(k => NOISE_KEYWORDS.has(k))) return true
  for (const pat of NOISE_DESC_PATTERNS) {
    if (pat.test(desc)) return true
  }
  return false
}

/**
 * 從 npms.io keywords + description 自動推斷套件分類
 *
 * 匹配順序按「信號強度」從高到低排列：
 * framework > testing > state > css > ui > orm > http > ...
 *
 * @param {string[]} keywords - npms.io metadata.keywords
 * @param {string} desc - npms.io metadata.description（小寫）
 * @returns {string} 分類 key（對應 CATEGORY_LABELS）
 */
export function inferNpmCategory(keywords, desc) {
  const kw = new Set(keywords.map(k => k.toLowerCase()))
  if (kw.has('framework') || /\bframework\b/.test(desc)) return 'framework'
  if (kw.has('test') || kw.has('testing') || /test(ing)?\s+(framework|runner|library)/.test(desc)) return 'testing'
  if (kw.has('state-management') || kw.has('store') || /state management/.test(desc)) return 'state'
  if (kw.has('css-framework') || kw.has('css-in-js') || /css (framework|library)|utility-first/.test(desc)) return 'css'
  if (kw.has('ui') || kw.has('component') || kw.has('components') || kw.has('design-system') || /\b(ui|component) library\b/.test(desc)) return 'ui'
  if (kw.has('orm') || kw.has('database') || kw.has('db') || kw.has('sql') || /\borm\b|object.relational/.test(desc)) return 'orm'
  if (kw.has('http') || kw.has('ajax') || kw.has('fetch') || kw.has('request') || kw.has('api-client')) return 'http'
  if (kw.has('graphql') || /\bgraphql\b/.test(desc)) return 'graphql'
  if (kw.has('websocket') || kw.has('realtime') || kw.has('socket') || kw.has('real-time')) return 'realtime'
  if (kw.has('auth') || kw.has('authentication') || kw.has('authorization') || kw.has('jwt') || kw.has('oauth')) return 'auth'
  if (kw.has('i18n') || kw.has('internationalization') || kw.has('intl') || kw.has('locale') || kw.has('translation')) return 'i18n'
  if (kw.has('validation') || kw.has('schema') || kw.has('validator') || /schema validation/.test(desc)) return 'validation'
  if (kw.has('bundler') || kw.has('build-tool') || /\bbundler\b|build tool/.test(desc)) return 'build'
  if (kw.has('router') || kw.has('routing') || /\brouter\b/.test(desc)) return 'router'
  if (kw.has('cli') || kw.has('command-line') || kw.has('terminal')) return 'cli'
  if (kw.has('animation') || kw.has('motion') || /\banimation\b/.test(desc)) return 'animation'
  if (kw.has('date') || kw.has('time') || kw.has('datetime') || /date.*(format|manipulat|pars)/.test(desc)) return 'date'
  if (kw.has('analytics') || kw.has('tracking') || kw.has('monitoring') || kw.has('observability')) return 'analytics'
  return 'library'
}

/**
 * 根據分類 key 返回排序優先級（數字越小越靠前）
 *
 * @param {string} category - inferNpmCategory 返回的分類 key
 * @returns {number} 0~100 的優先級值
 */
export function categoryPriority(category) {
  const map = {
    framework: 10, state: 25, testing: 30, css: 30, ui: 30,
    orm: 30, http: 35, graphql: 30, realtime: 35, auth: 35,
    i18n: 40, validation: 35, build: 45, router: 35, cli: 50,
    animation: 40, date: 45, analytics: 40, library: 55, devtool: 60,
  }
  return map[category] || 50
}

/**
 * 分類 key → 中文顯示標籤
 * 用於 CLI 的 groupMultiselect 分組標題和掃描報告
 */
export const CATEGORY_LABELS = {
  framework: '框架',
  testing: '測試',
  state: '狀態管理',
  css: 'CSS',
  ui: 'UI 元件庫',
  orm: 'ORM / 資料庫',
  http: 'HTTP / API',
  graphql: 'GraphQL',
  realtime: '即時通訊',
  auth: '驗證 / Auth',
  i18n: '國際化',
  validation: '資料驗證',
  build: '建構工具',
  router: '路由',
  cli: 'CLI 工具',
  animation: '動畫',
  date: '日期 / 時間',
  analytics: '監控 / 分析',
  library: '工具庫',
  devtool: '開發工具鏈',
}

/**
 * groupMultiselect 的分類顯示順序
 * 重要的分類在前（語言、框架），低價值的在後（工具庫、開發工具鏈）
 */
export const CATEGORY_ORDER = [
  '語言', '框架', '狀態管理', 'UI 元件庫', 'CSS', 'HTTP / API', 'GraphQL',
  '即時通訊', 'ORM / 資料庫', '測試', '資料驗證', '驗證 / Auth', '國際化',
  '路由', '動畫', '日期 / 時間', '監控 / 分析', '建構工具',
  'PHP 套件', 'CLI 工具', '工具庫', '開發工具鏈',
]
