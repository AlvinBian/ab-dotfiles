/**
 * 配置項描述
 *
 * ab-dotfiles 管理的項目：硬編碼中文描述（穩定，不常變）
 * ECC/第三方項目：runtime 從 ~/.claude/ 的 .md frontmatter 讀取
 * 快取：.cache/descriptions.json（setup 時建立，加速後續讀取）
 */

import fs from 'fs'
import path from 'path'

// ── ab-dotfiles 管理的配置描述（穩定）──

const AB_DESCRIPTIONS = {
  // Commands
  'code-review': '發 PR 前深度審查',
  'pr-workflow': '分支→commit→PR 全流程',
  'tdd': '測試驅動開發引導',
  'build-fix': '構建錯誤診斷修復',
  'simplify': '簡化過度複雜代碼',
  'refactor-clean': '死代碼清理重構',
  'changeset': '版本變更日誌生成',
  'e2e': '端對端測試（Playwright）',
  'multi-frontend': '多前端框架協調',
  'test-coverage': '測試覆蓋率分析',
  'auto-setup': '專案環境自動配置',
  'draft-slack': 'Slack 訊息草稿',
  'review-slack': 'Slack 格式審查',
  'slack-formatting': 'Slack mrkdwn 指南',
  'test-gen': '自動生成單元測試',
  // Agents
  'coder': '功能開發實作',
  'reviewer': '深度 code review',
  'tester': '生成測試、跑測試',
  'debugger': '定位修復 bug',
  'planner': '設計方案、拆解任務',
  'deployer': 'PR + Release 流程',
  'documenter': '生成 API 文件',
  'explorer': '快速搜索 codebase',
  'security': '安全漏洞掃描',
  'migrator': '版本遷移升級',
  'perf-analyzer': '效能瓶頸分析',
  'monitor': '日誌分析、效能檢查',
  'refactor': '重構優化代碼',
  // Rules
  'code-style': '格式、命名、函式規範',
  'git-workflow': 'Conventional Commits + 分支',
  'project-conventions': 'API/測試/版控慣例',
  'testing': '測試策略與覆蓋率',
  'performance': 'AI 模型選擇與 Context',
  'slack-mrkdwn': 'Slack 格式規範',

  // ── 技術棧（常見 60+）──
  'vue': 'Vue.js 漸進式前端框架',
  'vue-router': 'Vue 官方路由管理',
  'nuxt': 'Vue 全端框架（SSR/SSG）',
  'vue-demi': 'Vue 2/3 通用相容層',
  'vue3': 'Vue 3 Composition API',
  'vue2.7': 'Vue 2.7 Composition API 向下相容',
  'vuex': 'Vue 狀態管理（舊版）',
  'pinia': 'Vue 狀態管理（新版，推薦）',
  'xstate': '有限狀態機管理',
  'vitepress': 'Vite 驅動的靜態文檔網站',
  'vite': '下一代前端建構工具',
  'webpack': '模組打包工具',
  'typescript': 'JavaScript 超集型別系統',
  'gulp': '任務自動化建構工具',
  'style-dictionary': 'Design Token 跨平台轉換',
  'npm-run-all': '並行/串行執行 npm scripts',
  'swiper': '觸控滑動元件',
  'lottie-web': 'After Effects 動畫播放器',
  'vant': 'Vue 行動端 UI 元件庫',
  'element-plus': 'Vue 3 桌面端 UI 元件庫',
  'axios': 'HTTP 請求客戶端',
  'qs': 'URL 查詢字串解析',
  'got': 'Node.js HTTP 請求庫',
  'socket.io-client': 'WebSocket 即時通訊客戶端',
  'vee-validate': 'Vue 表單驗證',
  'ajv': 'JSON Schema 驗證器',
  'yup': '物件 Schema 驗證',
  'jest': 'JavaScript 測試框架',
  'vitest': 'Vite 原生測試框架',
  'cypress': '端對端測試框架',
  'sass': 'CSS 預處理器',
  'postcss': 'CSS 後處理器',
  'tailwindcss': '原子化 CSS 框架',
  'bootstrap-sass': 'Bootstrap 的 Sass 版本',
  'eslint': 'JavaScript/TypeScript 代碼檢查',
  'pino': '高效能 JSON Logger',
  'winston': 'Node.js 日誌框架',
  'jaeger': '分散式追蹤系統',
  'docker': '容器化平台',
  'docker-compose': '多容器編排工具',
  'nginx': '高效能 Web/反向代理伺服器',
  'postgres': 'PostgreSQL 關聯式資料庫',
  'redis': '記憶體鍵值快取',
  'php-fpm': 'PHP FastCGI 進程管理',
  'pgadmin': 'PostgreSQL 圖形管理工具',
  'redis-commander': 'Redis 圖形管理工具',
  'lodash': 'JavaScript 工具函式庫',
  'dotenv': '環境變數管理',
  'husky': 'Git Hooks 管理工具',
  'shell': 'Shell 腳本',
  'sed': '串流編輯器',
  'mjml': '響應式 Email 模板語言',
  'mailchimp_transactional': 'Mailchimp 交易郵件 API',
  'gulp-html-i18n': 'HTML 國際化插件',
  'vue-i18n': 'Vue 國際化方案',
  'gulp-compile-handlebars': 'Handlebars 模板編譯',
  'gulp-svg-sprite': 'SVG 雪碧圖生成',
  'svg2vectordrawable': 'SVG 轉 Android VectorDrawable',
  'codemirror': '瀏覽器代碼編輯器',
  'cherry-markdown': 'Markdown 編輯器',
  'dexie': 'IndexedDB 封裝庫',
  '@adyen/adyen-web': 'Adyen 金流支付元件',
  '@gtm-support/vue2-gtm': 'Google Tag Manager Vue 整合',
  '@twilio/conversations': 'Twilio 對話 API',
  '@splidejs/splide': '輕量滑動/輪播元件',
  '@kkday/web-design-system': 'KKday Design System',

  // Hooks
  'PostToolUse:Edit|Write (prettier)': '寫檔後 prettier 格式化',
  'PostToolUse:Edit|Write (eslint)': '寫檔後 eslint 檢查',
  'PreToolUse:Edit|Write (檔案保護)': '阻止修改 .env/lock 等',
  'PreToolUse:Bash (危險命令攔截)': '阻止 rm -rf / force push',
  'SessionStart:compact (壓縮提示)': '壓縮時保留重要資訊',
  'Stop (任務完成檢查)': '停止前確認任務完成',
  'Notification (macOS 通知)': '任務完成系統通知',
  'UserPromptSubmit (空提示檢查)': '阻止發送空白提示',
}

// ── 快取（ECC/第三方描述，setup 時建立）──

const CACHE_PATH = path.join(process.cwd(), '.cache', 'descriptions.json')
let _descCache = null

function loadCache() {
  if (_descCache) return _descCache
  try {
    if (fs.existsSync(CACHE_PATH)) {
      _descCache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'))
      return _descCache
    }
  } catch { /* ignore */ }
  _descCache = {}
  return _descCache
}

function saveCache(cache) {
  try {
    const dir = path.dirname(CACHE_PATH)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2))
  } catch { /* ignore */ }
}

// ── Frontmatter 讀取 ──

function readFrontmatterDesc(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8')
    const match = content.match(/^---\n[\s\S]*?description:\s*(.+)/m)
    return match?.[1]?.trim().slice(0, 60) || null
  } catch {
    return null
  }
}

// ── 公開 API ──

/**
 * 取得配置項描述
 * 優先順序：ab-dotfiles 硬編碼 → 快取 → frontmatter → 空
 */
export function getDescription(name, type, claudeDir) {
  // 1. ab-dotfiles 自己的
  if (AB_DESCRIPTIONS[name]) return AB_DESCRIPTIONS[name]

  // 2. 快取
  const cache = loadCache()
  const cacheKey = type ? `${type}/${name}` : name
  if (cache[cacheKey]) return cache[cacheKey]

  // 3. 即時讀 frontmatter
  if (type && claudeDir) {
    const filePath = path.join(claudeDir, type, `${name}.md`)
    const desc = readFrontmatterDesc(filePath)
    if (desc) {
      // 寫入快取，下次不用再讀檔
      cache[cacheKey] = desc
      saveCache(cache)
      return desc
    }
  }

  return ''
}

/**
 * 掃描 ~/.claude/ 下所有 .md 文件，建立描述快取
 * 在 setup 安裝完成後調用一次
 */
export function buildDescriptionCache(claudeDir) {
  const cache = {}
  for (const type of ['commands', 'agents', 'rules']) {
    const dir = path.join(claudeDir, type)
    if (!fs.existsSync(dir)) continue
    for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.md'))) {
      const name = file.replace('.md', '')
      if (AB_DESCRIPTIONS[name]) continue // ab-dotfiles 的用硬編碼
      const desc = readFrontmatterDesc(path.join(dir, file))
      if (desc) cache[`${type}/${name}`] = desc
    }
  }
  _descCache = cache
  saveCache(cache)
  return Object.keys(cache).length
}

/**
 * 格式化帶描述的 bullet 項目
 */
export function descBullet(name, type, claudeDir, indent = '       ') {
  const desc = getDescription(name, type, claudeDir)
  return desc ? `${indent}· ${name} — ${desc}` : `${indent}· ${name}`
}

// Re-export for convenience
export { AB_DESCRIPTIONS as DESCRIPTIONS }
