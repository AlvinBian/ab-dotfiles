/**
 * 配置項描述 — 用於 CLI 展示
 */

import fs from 'fs'
import path from 'path'

// ab-dotfiles 管理的配置描述
export const DESCRIPTIONS = {
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

  // ── ECC / 常見第三方 Commands ──
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
  'kkday-conventions': 'TypeScript/Vue/PHP 開發規範',
  'loop-start': '啟動循環任務',
  'loop-status': '查看循環任務狀態',
  'model-route': '模型路由切換',
  'multi-backend': '後端多框架開發輔助',
  'multi-execute': '多模型協作執行',
  'multi-plan': '多模型協作規劃',
  'multi-workflow': '多模型協作工作流',
  'orchestrate': '順序/並行 Agent 編排指南',
  'plan': '需求分析與實作計畫',
  'pm2': 'PM2 進程管理初始化',
  'projects': '列出已知專案與 instinct 統計',
  'promote': '將專案 instinct 提升為全局',
  'prompt-optimize': '提示詞優化分析',
  'prune': '清理過期未提升的 instinct',
  'quality-gate': '品質門檻檢查',
  'save-session': '保存 session 供下次恢復',
  'skill-health': '技能庫健康度儀表板',
  'update-codemaps': '更新代碼映射',
  'update-docs': '更新文檔',
  'verify': '驗證指令',

  // ── ECC / 常見第三方 Agents ──
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
  'pytorch-build-resolver': 'PyTorch/CUDA 構建修復',
  'refactor-cleaner': '死代碼清理與整合',
  'security-reviewer': '安全漏洞偵測',
  'tdd-guide': '測試驅動開發引導',
  'typescript-reviewer': 'TypeScript/JS 型別審查',

  // ── ECC / 常見第三方 Rules ──
  'agents': 'Agent 使用規範',
  'coding-style': '編碼風格規範',
  'development-workflow': '開發工作流程',
  'hooks': 'Hooks 配置規範',
  'patterns': '設計模式規範',
}

/**
 * 從 .md 檔案 frontmatter 讀取 description
 */
function readFrontmatterDesc(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8')
    const match = content.match(/^---\n[\s\S]*?description:\s*(.+)/m)
    return match?.[1]?.trim().slice(0, 50) || null
  } catch {
    return null
  }
}

/**
 * 取得配置項描述
 * 優先用內建映射，其次讀 frontmatter，最後回空
 *
 * @param {string} name - 配置名稱
 * @param {string} [type] - 'commands'|'agents'|'rules'（用於查找檔案）
 * @param {string} [claudeDir] - ~/.claude 路徑
 * @returns {string}
 */
export function getDescription(name, type, claudeDir) {
  if (DESCRIPTIONS[name]) return DESCRIPTIONS[name]
  if (type && claudeDir) {
    const filePath = path.join(claudeDir, type, `${name}.md`)
    const desc = readFrontmatterDesc(filePath)
    if (desc) return desc
  }
  return ''
}

/**
 * 格式化帶描述的 bullet 項目
 */
export function descBullet(name, type, claudeDir, indent = '       ') {
  const desc = getDescription(name, type, claudeDir)
  return desc ? `${indent}· ${name} — ${desc}` : `${indent}· ${name}`
}
