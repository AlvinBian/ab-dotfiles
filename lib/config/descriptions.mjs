/**
 * 配置項描述
 *
 * ab-dotfiles 管理的項目：硬編碼中文描述（穩定）
 * ECC/第三方 + 技術棧：AI 生成 → 快取到 .cache/descriptions.json
 * 快取一次生成，後續直接讀取
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { execFileSync } from 'child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '../..')

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
  // Hooks
  'PostToolUse:Edit|Write (prettier)': '寫檔後 prettier 格式化',
  'PostToolUse:Edit|Write (eslint)': '寫檔後 eslint 檢查',
  'PreToolUse:Edit|Write (檔案保護)': '阻止修改 .env/lock 等',
  'PreToolUse:Bash (危險命令攔截)': '阻止 rm -rf / force push',
  'SessionStart:compact (壓縮提示)': '壓縮時保留重要資訊',
  'Stop (任務完成檢查)': '停止前確認任務完成',
  'Notification (macOS 通知)': '任務完成系統通知',
  'UserPromptSubmit (空提示檢查)': '阻止發送空白提示',

  // ── ECC Commands ──
  'aside': '快速插入問答，不中斷當前任務',
  'claw': 'ECC 持久 REPL 環境',
  'context-budget': 'Context 用量分析與優化',
  'devfleet': '多 Agent 並行編排',
  'docs': '查詢第三方函式庫文檔',
  'evolve': '分析 instinct 並建議進化',
  'gradle-build': 'Android/KMP Gradle 構建修復',
  'harness-audit': 'Claude Code 配置審計',
  'instinct-export': '匯出 instinct 到檔案',
  'instinct-import': '從檔案匯入 instinct',
  'instinct-status': '顯示已學習的 instinct',
  'learn-eval': '提取可複用模式並自我評估',
  'learn': '提取可複用模式',
  'loop-start': '啟動循環任務',
  'loop-status': '查看循環任務狀態',
  'model-route': '模型路由切換',
  'multi-backend': '後端多框架開發輔助',
  'multi-execute': '多模型協作執行',
  'multi-plan': '多模型協作規劃',
  'multi-workflow': '多模型協作工作流',
  'orchestrate': '順序/並行 Agent 編排指南',
  'plan': '需求分析與實作計畫',
  'projects': '列出已知專案與統計',
  'promote': '將專案 instinct 提升為全局',
  'prompt-optimize': '提示詞優化分析',
  'prune': '清理過期未提升的 instinct',
  'quality-gate': '品質門檻檢查',
  'resume-session': '載入上次 session 繼續工作',
  'save-session': '保存 session 供下次恢復',
  'sessions': 'Session 歷史與 alias 管理',
  'setup-pm': '配置套件管理器偏好',
  'skill-health': '技能庫健康度儀表板',
  'update-codemaps': '更新代碼映射',
  'update-docs': '更新文檔',
  'verify': '驗證指令',
  'pm2': 'PM2 進程管理初始化',
  'kkday-conventions': 'TypeScript/Vue/PHP 開發規範',
  // ── ECC Agents ──
  'architect': '軟體架構設計',
  'build-error-resolver': '構建/TypeScript 錯誤修復',
  'chief-of-staff': '溝通協調助理',
  'code-reviewer': '代碼審查專家',
  'database-reviewer': 'PostgreSQL 資料庫審查',
  'doc-updater': '文檔與 codemap 更新',
  'docs-lookup': '查詢使用方式與文檔',
  'e2e-runner': '端對端測試執行',
  'flutter-reviewer': 'Flutter/Dart 審查',
  'harness-optimizer': 'Claude Code 配置優化',
  'loop-operator': '循環任務操作管理',
  'pytorch-build-resolver': 'PyTorch/CUDA 構建修復',
  'refactor-cleaner': '死代碼清理與整合',
  'security-reviewer': '安全漏洞偵測',
  'tdd-guide': '測試驅動開發引導',
  'typescript-reviewer': 'TypeScript/JS 型別審查',
  // ── ECC Rules ──
  'agents': 'Agent 使用規範',
  'coding-style': '編碼風格規範',
  'development-workflow': '開發工作流程',
  'hooks': 'Hooks 配置規範',
  'patterns': '設計模式規範',

  // ── ZSH 模組 ──
  'aliases': '編輯器偵測 + 通用命令縮寫',
  'completion': 'zsh 自動補全（menu select）',
  'fzf': '模糊搜尋（Ctrl+R 歷史 / Ctrl+T 檔案）',
  'git': 'Git aliases + delta + lazygit 整合',
  'history': '歷史記錄（50K + 去重 + 專案分離）',
  'keybindings': 'Alt/Ctrl 方向鍵快捷操作',
  'nvm': 'Node 版本管理（lazy load 加速啟動）',
  'plugins': 'autosuggestions + syntax-highlighting',
  'pnpm': 'PNPM PATH 設定',
  'tools': 'bat/eza/zoxide/fd/ripgrep/tldr 工具集',
}

// ── 快取（ECC/第三方描述，setup 時建立）──

// 快取檔案位於專案根目錄下的 .cache/descriptions.json
const CACHE_PATH = path.join(REPO_ROOT, '.cache', 'descriptions.json')
let _descCache = null

/**
 * 載入描述快取（記憶體優先，只讀一次）
 *
 * @returns {Object} 快取物件（key 為 'type/name' 或 name，value 為描述字串）
 */
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

/**
 * 將描述快取寫入磁碟
 *
 * @param {Object} cache - 要寫入的快取物件
 * @returns {void}
 */
function saveCache(cache) {
  try {
    const dir = path.dirname(CACHE_PATH)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2))
  } catch { /* ignore */ }
}

// ── Frontmatter 讀取 ──

/**
 * 從 Markdown 檔案的 frontmatter 讀取 description 欄位
 *
 * 比對格式：--- ... description: <text> ...
 * 最多返回 60 個字元。
 *
 * @param {string} filePath - Markdown 檔案的絕對路徑
 * @returns {string|null} description 文字，找不到或出錯返回 null
 */
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
 * 取得配置項的中文描述
 *
 * 優先順序：ab-dotfiles 硬編碼 → 快取 → 即時讀 frontmatter → 空字串
 * frontmatter 讀到後會寫入快取，下次不再讀檔。
 *
 * @param {string} name - 配置項名稱（例如 'code-review'）
 * @param {string|null} type - 類型（'commands' | 'agents' | 'rules'），用於找到對應檔案
 * @param {string|null} claudeDir - ~/.claude/ 目錄路徑，type 非 null 時必填
 * @returns {string} 描述文字，無描述時返回空字串
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
 * 用 AI 批量生成缺失描述（繁體中文，每項 ≤ 15 字）
 *
 * 透過 claude --print 呼叫，以 JSON 格式返回 { name: description } 映射。
 * 使用 haiku 模型節省成本。
 *
 * @param {string[]} items - 需要生成描述的名稱列表
 * @returns {Object} name → description 的映射，失敗時返回空物件
 */
function aiGenerateDescriptions(items) {
  if (!items.length) return {}
  try {
    const prompt = `為以下技術/工具/套件名稱各生成一句繁體中文描述（每項 ≤ 15 字，不含標點）。
回傳 JSON 格式 {"name": "描述", ...}，不要其他文字。

${items.join('\n')}`

    const result = execFileSync('claude', [
      '--print', '--output-format', 'json', '--model', 'haiku',
      '-p', prompt,
    ], { encoding: 'utf8', timeout: 30000, stdio: ['pipe', 'pipe', 'ignore'] })

    const parsed = JSON.parse(result)
    // claude --output-format json 包裹在 { result: "..." } 中
    if (parsed.result) {
      try { return JSON.parse(parsed.result) } catch { return parsed }
    }
    return parsed
  } catch {
    return {}
  }
}

/**
 * 掃描 ~/.claude/ 目錄和技術棧，建立完整描述快取
 *
 * 流程：
 *   1. 掃描 commands/agents/rules 下每個 .md 的 frontmatter description
 *   2. 收集沒有描述的技術棧名稱
 *   3. 一次性呼叫 AI 批量生成所有缺失項（成本控制：只呼叫一次）
 *   4. 寫入快取，後續呼叫 getDescription 直接讀快取
 *
 * @param {string} claudeDir - ~/.claude/ 目錄絕對路徑
 * @param {string[]} [techStacks=[]] - 需要生成描述的技術棧 ID 列表
 * @returns {{ count: number, newItems: string[] }} 快取總數與本次新增項目名稱
 */
export function buildDescriptionCache(claudeDir, techStacks = []) {
  const cache = loadCache()
  const before = new Set(Object.keys(cache))
  const missing = []

  // 1. 掃描 commands/agents/rules 的 frontmatter
  for (const type of ['commands', 'agents', 'rules']) {
    const dir = path.join(claudeDir, type)
    if (!fs.existsSync(dir)) continue
    for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.md'))) {
      const name = file.replace('.md', '')
      const key = `${type}/${name}`
      if (AB_DESCRIPTIONS[name] || cache[key]) continue
      const desc = readFrontmatterDesc(path.join(dir, file))
      if (desc) {
        cache[key] = desc
      } else {
        missing.push(name)
      }
    }
  }

  // 2. 收集沒有描述的技術棧
  for (const tech of techStacks) {
    if (AB_DESCRIPTIONS[tech] || cache[tech]) continue
    missing.push(tech)
  }

  // 3. AI 批量生成（一次呼叫，所有缺失項）
  if (missing.length > 0) {
    const generated = aiGenerateDescriptions(missing)
    for (const [name, desc] of Object.entries(generated)) {
      if (desc && typeof desc === 'string') {
        // 技術棧用名稱作 key，commands/agents/rules 用 type/name
        cache[name] = desc.slice(0, 20)
      }
    }
  }

  _descCache = cache
  saveCache(cache)
  const newItems = Object.keys(cache).filter(k => !before.has(k))
  return { count: Object.keys(cache).length, newItems }
}

/**
 * 格式化帶描述的 bullet 項目
 *
 * 格式為：`{indent}· {name} — {desc}`（有描述時）
 * 或：`{indent}· {name}`（無描述時）
 *
 * @param {string} name - 項目名稱
 * @param {string|null} type - 類型（'commands' | 'agents' | 'rules'）
 * @param {string|null} claudeDir - ~/.claude/ 目錄路徑
 * @param {string} [indent='       '] - 縮排前綴字串
 * @returns {string} 格式化後的 bullet 行
 */
export function descBullet(name, type, claudeDir, indent = '       ') {
  const desc = getDescription(name, type, claudeDir)
  return desc ? `${indent}· ${name} — ${desc}` : `${indent}· ${name}`
}

// Re-export for convenience
export { AB_DESCRIPTIONS as DESCRIPTIONS }
