/**
 * AI 技能內容生成
 *
 * 職責：
 *   為每個偵測到的技術棧生成 stacks/{tech}/ 目錄下的 skill 片段：
 *   - code-review.md — 審查 checklist
 *   - test-gen.md — 測試模式和範例
 *   - code-style.md — 命名慣例和格式規範
 *
 * 生成策略（按優先級）：
 *   1. ANTHROPIC_API_KEY → Claude API 直接生成
 *   2. claude CLI → 本地 CLI 生成
 *   3. 預設模板 → 通用的 code review / test / style 模板
 *
 * 被 scan.mjs 使用（pnpm run scan 時批量生成）
 */

import fs from 'fs'
import path from 'path'
import { STACKS_DIR } from '../detect/skill-detect.mjs'
import { callClaude, isClaudeAvailable } from './claude-cli.mjs'

// ── AI 可用性檢查 ──────────────────────────────────────────────

/**
 * 檢查是否有可用的 AI 生成方式
 * 優先 ANTHROPIC_API_KEY，其次 claude CLI
 */
export { isClaudeAvailable as isAIAvailable }

// ── AI 生成 ────────────────────────────────────────────────────

/**
 * 使用 AI 生成技能片段內容
 *
 * 按優先級嘗試：API key → claude CLI → 返回 null（fallback 到模板）
 *
 * @param {string} techId - 技術棧 ID
 * @param {Object} techMeta - 技術元資料 { label, description, category }
 * @returns {Promise<Object|null>} { 'code-review.md': content, ... } 或 null
 */
export async function generateSkillContent(techId, techMeta) {
  const prompt = `為 "${techMeta.label}" 技術生成三個 Markdown 片段，用於程式碼審查和測試輔助。

技術描述：${techMeta.description || techMeta.label}
分類：${techMeta.category || 'general'}

生成三個檔案內容，用 ---FILE_SEPARATOR--- 分隔：

1. code-review.md — 審查 checklist（5-8 條，- [ ] 格式）
2. test-gen.md — 測試模式和範例（含程式碼）
3. code-style.md — 命名慣例和格式規範

要求：繁體中文說明，程式碼英文，每個以 ## 標題開頭，簡潔實用。只輸出三個檔案內容。`

  // 統一用 claude CLI（穩定方式，見 lib/claude-cli.mjs）
  try {
    const result = await callClaude(prompt, { model: 'sonnet', effort: 'low' })
    if (result) return parseAIResponse(result)
  } catch {}
  return null
}

/**
 * 解析 AI 回應，按 ---FILE_SEPARATOR--- 分割為三個檔案
 *
 * @param {string} text - AI 原始回應文字
 * @returns {Object|null} { 'code-review.md': ..., 'test-gen.md': ..., 'code-style.md': ... }
 */
function parseAIResponse(text) {
  const parts = text.split('---FILE_SEPARATOR---').map(p => p.trim())
  if (parts.length < 3) return null
  return {
    'code-review.md': parts[0],
    'test-gen.md': parts[1],
    'code-style.md': parts[2],
  }
}

// ── 預設模板 ──────────────────────────────────────────────────

/**
 * 生成通用的預設模板（不依賴 AI）
 *
 * 當 AI 不可用或生成失敗時使用。
 * 提供有意義的通用內容，而非空白或 TODO。
 *
 * @param {string} id - 技術棧 ID
 * @param {Object} meta - { label, category }
 * @returns {Object} { 'code-review.md': ..., 'test-gen.md': ..., 'code-style.md': ... }
 */
export function generateDefaultTemplates(id, meta) {
  const label = meta.label

  const codeReview = `## ${label} Code Review Checklist

### 架構與設計
- [ ] 元件 / 模組職責單一，無 God Object
- [ ] 依賴方向正確（上層不依賴下層實作細節）
- [ ] 公開 API 面積最小化，內部實作不暴露

### 效能
- [ ] 無不必要的重複計算或重複渲染
- [ ] 大型資料集有分頁 / 虛擬捲動 / lazy loading
- [ ] 非同步操作有適當的錯誤處理與 timeout

### 安全性
- [ ] 使用者輸入已驗證與消毒（sanitize）
- [ ] 敏感資料不寫入 log 或前端 state
- [ ] 依賴版本無已知 CVE

### 可維護性
- [ ] 命名清晰，不需要註解解釋意圖
- [ ] 重複邏輯已抽取為共用函式 / hook / util
- [ ] 錯誤訊息對除錯有幫助（含 context，不只是 "something went wrong"）
`

  const testGen = `## ${label} 測試模式

### 測試策略
- 單元測試：純邏輯函式、工具函式、資料轉換
- 整合測試：元件互動、API 呼叫、狀態管理流程
- E2E 測試：關鍵使用者流程（登入、結帳、表單提交）

### 測試命名慣例
\`\`\`
describe('模組名稱', () => {
  it('should 預期行為 when 條件', () => { ... })
  it('should throw 錯誤類型 when 異常條件', () => { ... })
})
\`\`\`

### 常見模式
- **Arrange-Act-Assert**：準備資料 → 執行操作 → 驗證結果
- **Given-When-Then**：前置條件 → 觸發事件 → 預期狀態
- **邊界值測試**：空陣列、null、undefined、超長字串、負數

### Mock 原則
- 只 mock 外部依賴（API、資料庫、第三方服務）
- 不 mock 被測模組的內部實作
- 使用 factory function 建立測試資料，避免寫死 magic number
`

  const codeStyle = `## ${label} 程式碼風格

### 命名慣例
| 類型 | 慣例 | 範例 |
|------|------|------|
| 變數 / 函式 | camelCase | \`getUserName\`, \`isActive\` |
| 常數 | UPPER_SNAKE_CASE | \`MAX_RETRY_COUNT\`, \`API_BASE_URL\` |
| 類別 / 型別 | PascalCase | \`UserService\`, \`ApiResponse\` |
| 檔案（元件） | PascalCase | \`UserProfile.vue\`, \`AuthGuard.ts\` |
| 檔案（工具） | kebab-case | \`date-utils.ts\`, \`api-client.ts\` |

### 格式規範
- 縮排：2 spaces（前端）/ 4 spaces（後端 PHP/Python/Go）
- 每行最大長度：100~120 字元
- 檔案結尾保留一個空行
- import 排序：內建 → 第三方 → 本地模組，各組之間空一行

### 最佳實踐
- 函式長度不超過 40 行；超過則拆分
- 避免巢狀超過 3 層（early return 降低複雜度）
- 布林變數以 \`is\` / \`has\` / \`should\` / \`can\` 開頭
- 非同步函式以動詞開頭：\`fetchUser\`, \`createOrder\`, \`validateInput\`
`

  return { 'code-review.md': codeReview, 'test-gen.md': testGen, 'code-style.md': codeStyle }
}

// ── Stack 目錄管理 ──────────────────────────────────────────────

/**
 * 確保 stacks/{id}/ 目錄存在且包含完整的 skill 檔案
 *
 * 如果目錄已存在且完整 → 跳過（'kept'）
 * 如果需要建立 → 先嘗試 AI 生成，失敗則用預設模板
 *
 * @param {string} id - 技術棧 ID
 * @param {Object} meta - 技術元資料 { label, priority, detect, excludes }
 * @param {boolean} [useAI=false] - 是否嘗試 AI 生成
 * @returns {Promise<string>} 'kept' | 'ai-generated' | 'created'
 */
export async function ensureStack(id, meta, useAI = false) {
  const stackDir = path.join(STACKS_DIR, id)
  const detectPath = path.join(stackDir, 'detect.json')

  // 已有完整檔案 → 跳過
  if (fs.existsSync(detectPath) &&
      fs.existsSync(path.join(stackDir, 'code-review.md')) &&
      fs.existsSync(path.join(stackDir, 'test-gen.md')) &&
      fs.existsSync(path.join(stackDir, 'code-style.md'))) {
    return 'kept'
  }

  fs.mkdirSync(stackDir, { recursive: true })

  // detect.json
  const detectJson = {
    id,
    label: meta.label,
    priority: meta.priority || 50,
    detect: { ...meta.detect, match: 'any' },
  }
  if (meta.excludes) detectJson.excludes = meta.excludes
  fs.writeFileSync(detectPath, JSON.stringify(detectJson, null, 2) + '\n')

  // 嘗試 AI 生成
  let files = null
  if (useAI) {
    process.stdout.write('  🤖 ')
    try { files = await generateSkillContent(id, meta) } catch {}
  }

  // 寫入（AI 優先，否則預設模板）
  const defaults = generateDefaultTemplates(id, meta)
  for (const [file, defaultContent] of Object.entries(defaults)) {
    fs.writeFileSync(path.join(stackDir, file), files?.[file] || defaultContent)
  }

  return files ? 'ai-generated' : 'created'
}
