# ab-dotfiles v2 重構方案

> 目標：統一交互模式、整合 Claude 功能優化、每步驗證、AI 調用最優化

## 一、現狀問題總覽

### 當前互動流程（setup.mjs 386 行單函數）

```
用戶執行 pnpm setup
│
├─ 階段1：意圖收集（3 次互動）
│  ├─ [spinner] ensureEnvironment()
│  ├─ [multiselect] 選 targets ← 有 session 預選 ✓
│  └─ [select] 選 mode（auto/manual）← 每次都問 ✗
│
├─ 階段2：分析（5+ 次互動）
│  ├─ [select] 選帳號/組織 ← 無 session 預選 ✗
│  ├─ [select] 選排序方式 ← 多餘步驟 ✗
│  ├─ [multiselect] 選倉庫 ← 有貢獻預選 ✓
│  ├─ [spinner] Pipeline 分析
│  ├─ [select] 技術棧操作（4 選 1）← 有 skip ✓
│  ├─ [multiselect?] 自訂分類 ← 條件觸發
│  ├─ [multiselect?] 逐分類選技術 ← 條件觸發
│  ├─ [text?] 補充技術棧 ← 條件觸發
│  ├─ [confirm] 確認技術棧 ← 所有路徑都再問一次 ✗
│  ├─ [spinner] ECC AI 推薦
│  ├─ [select] ECC 操作（4 選 1）
│  ├─ [multiselect?] 逐類型選 ECC ← 條件觸發
│  └─ [confirm] 確認 ECC ← 又一次確認 ✗
│
├─ 階段3：安裝（4+ 次互動，per target）
│  ├─ [multiselect] 選 commands ← 每次都問 ✗
│  ├─ [multiselect] 選 agents ← 每次都問 ✗
│  ├─ [multiselect] 選 rules ← 每次都問 ✗
│  ├─ [multiselect] 選 hooks ← 每次都問 ✗
│  └─ [multiselect] 選 modules ← zsh target 才有
│
└─ 階段4：報告
   └─ [confirm] 開瀏覽器？
```

**問題：最多 15+ 次互動，用戶疲勞。**

### 交互不一致

| 位置 | 模式 | 問題 |
|------|------|------|
| repo-select | spinner → select → spinner → select → spinner → multiselect | 6 步才選完 repo |
| tech-select | 先 select 再 multiselect 再 text 再 confirm | 4 步，且 confirm 與 select 的「確認預選」語義重複 |
| ecc-select | 先 select 再 multiselect 再 confirm | 3 步，與 tech-select 模式不同 |
| install-handlers | 直接 multiselect × N | 每個類型單獨問，沒有預覽總覽 |

### 缺失的 Claude 功能

| 類型 | 缺少 |
|------|------|
| Agents | security, migrator, perf-analyzer |
| Commands | tdd, build-fix, simplify, refactor-clean, e2e, test-coverage, multi-frontend |
| Rules | kkday-conventions, testing, performance |
| Hooks | Bash 危險命令攔截, 長任務通知 |

---

## 二、統一交互模式設計

### 核心原則

```
每個選擇步驟 = {
  AI 預選 → 摘要展示 → 一鍵確認 / 調整 / 跳過
}
```

所有選擇步驟遵循同一個 **Smart Select** 模式：

```
┌─────────────────────────────────────────┐
│  📋 {title}（{preCount}/{total}）       │
│                                          │
│  [摘要] 預選項目清單...                  │
│                                          │
│  ❯ ✅ 確認預選 ({preCount})  ← 推薦     │
│    ✏️  調整選擇                          │
│    ⏭  跳過                              │
└─────────────────────────────────────────┘
         │
    ✅ → 直接用預選，下一步
    ✏️ → multiselectWithAll（預選作為 initialValues）
    ⏭ → 返回空，下一步
```

### 提取 `smartSelect()` 通用元件

```javascript
// lib/ui.mjs 新增
export async function smartSelect({
  title,           // 步驟標題
  items,           // { value, label, hint? }[]
  preselected,     // value[] — AI 或 session 預選
  session,         // 上次選擇（二級 fallback）
  required = false,// 是否禁止跳過
  showSummary,     // (selected) => string — 自訂摘要格式
}) {
  const preCount = preselected.length
  const total = items.length

  // 摘要展示
  if (showSummary) p.log.info(showSummary(preselected))
  else if (preCount > 0) {
    p.log.info(`${title}（預選 ${preCount}/${total}）`)
  }

  // 少量項目自動全選
  if (total <= 2 && !required) {
    p.log.success(`${title}：${total} 個（自動全選）`)
    return items.map(i => i.value)
  }

  // 三選一
  const options = []
  if (preCount > 0) options.push({ value: 'accept', label: `確認預選 (${preCount})`, hint: '推薦' })
  options.push({ value: 'edit', label: preCount > 0 ? '調整選擇' : `選擇（${total} 個可選）` })
  if (!required) options.push({ value: 'skip', label: '跳過' })

  const action = handleCancel(await p.select({ message: title, options }))

  if (action === 'skip') return []
  if (action === 'accept') return preselected

  // 調整模式
  const { sortedOptions, initialValues } = applyPreviousSelection(
    items,
    preCount > 0 ? preselected : session
  )
  return multiselectWithAll({ message: title, options: sortedOptions, initialValues })
}
```

**效果：所有選擇步驟從 2~4 次互動 → 1 次（確認預選）或 2 次（調整）。**

---

## 三、重構後的完整流程

```
pnpm setup [--all] [--manual] [--claude] [--zsh] [--slack]
│
├─ Phase 1：環境 + 意圖（1~2 次互動）
│  ├─ [spinner] ensureEnvironment()
│  └─ [smartSelect] 選 targets + mode
│     預選：session.targets + session.mode
│     ✅ 一鍵確認 → 用上次的 targets + auto mode
│     ✏️ 調整 → multiselect targets + select mode
│
├─ Phase 2：分析（2~3 次互動，原本 8+）
│  ├─ [smartSelect] 選倉庫
│  │  預選：session.org/repos（有 session 時跳過帳號/排序選擇）
│  │  無 session → spinner 取帳號 → select 帳號 → spinner 取 repos → multiselect
│  │  有 session → spinner 驗證 repos 存在 → 確認預選 / 調整
│  │
│  ├─ [spinner] Pipeline 分析（不變，已並行優化）
│  │
│  ├─ [smartSelect] 技術棧
│  │  預選：AI computePreselection() 結果
│  │  ✅ 一鍵確認 → 不需 confirm（smartSelect 已確認）
│  │  ✏️ 調整 → 扁平 multiselect（分類作為 group header，不用兩層）
│  │
│  └─ [smartSelect] ECC 外部資源
│     預選：AI 推薦（eccAiPromise 結果）
│     ✅ 一鍵確認 AI 推薦
│     ✏️ 調整 → multiselect（AI 推薦標 * 號）
│
├─ Phase 3：安裝配置（1 次互動，原本 4+）
│  ├─ [smartSelect] Claude 功能選擇（合併展示）
│  │  ┌──────────────────────────────────┐
│  │  │ Claude 功能（預選 18/26）        │
│  │  │                                  │
│  │  │ Commands (8)                     │
│  │  │   /code-review  /pr-workflow ... │
│  │  │ Agents (10)                      │
│  │  │   @coder  @reviewer  @debugger...│
│  │  │ Rules (3)                        │
│  │  │   code-style  git-workflow ...   │
│  │  │ Hooks (4)                        │
│  │  │   自動格式化  檔案保護 ...       │
│  │  │                                  │
│  │  │ ❯ ✅ 確認預選  ✏️ 調整  ⏭ 跳過  │
│  │  └──────────────────────────────────┘
│  │  預選：matchWhen 條件驅動（見 §4.6）
│  │
│  └─ [smartSelect] zsh 模組（如果選了 zsh target）
│
├─ Phase 4：執行（0 次互動）
│  ├─ [spinner] 備份
│  ├─ [spinner] 生成 stacks/ + 寫入 ECC
│  ├─ [progress] 執行安裝腳本
│  └─ [spinner] 打包 plugin
│
└─ Phase 5：報告 + 驗證（1 次互動）
   ├─ 自動驗證安裝結果 ← 新增
   ├─ [summary] 安裝摘要
   └─ [confirm] 開瀏覽器？
```

**互動次數對比：**

| 場景 | 現在 | 重構後 |
|------|------|--------|
| 全新安裝（無 session） | 15+ 次 | 6~8 次 |
| 重複安裝（有 session） | 12+ 次 | 3~4 次（全部確認預選）|
| `--all` 模式 | 0 次（已有） | 0 次 |

---

## 四、Claude 功能整合到安裝流程

### 4.1 新增 Agent 定義

| Agent | 檔案 | 行數 | model | 用途 |
|-------|------|------|-------|------|
| `security` | `claude/agents/security.md` | ~50 | sonnet | 依賴漏洞掃描、secrets 檢測、OWASP checklist |
| `migrator` | `claude/agents/migrator.md` | ~45 | sonnet | 框架升級、API 遷移、breaking changes |
| `perf-analyzer` | `claude/agents/perf-analyzer.md` | ~40 | sonnet | bundle 分析、render 次數、N+1 查詢 |

### 4.2 新增 Command 定義

| Command | 檔案 | 行數 | 用途 |
|---------|------|------|------|
| `tdd` | `claude/commands/tdd.md` | ~60 | RED→GREEN→REFACTOR 流程 |
| `build-fix` | `claude/commands/build-fix.md` | ~40 | 構建錯誤自動修復 |
| `simplify` | `claude/commands/simplify.md` | ~35 | 代碼複雜度檢查 + 簡化 |
| `refactor-clean` | `claude/commands/refactor-clean.md` | ~40 | 死代碼清理 |
| `e2e` | `claude/commands/e2e.md` | ~50 | E2E 測試生成 + 執行 |
| `test-coverage` | `claude/commands/test-coverage.md` | ~35 | 覆蓋率分析 + 補測試 |
| `multi-frontend` | `claude/commands/multi-frontend.md` | ~45 | 多前端框架開發 |

### 4.3 新增 Rule 定義

| Rule | 檔案 | 行數 | 用途 |
|------|------|------|------|
| `kkday-conventions` | `claude/rules/kkday-conventions.md` | ~50 | KKday TS/Vue/PHP 開發慣例 |
| `testing` | `claude/rules/testing.md` | ~30 | 測試規範（中文描述、三情境） |
| `performance` | `claude/rules/performance.md` | ~35 | 效能規範（model 選擇、context） |

### 4.4 新增 Hooks

```jsonc
// hooks.json 新增項目
{
  "PreToolUse": [
    {
      "matcher": "Bash",
      "hooks": [{
        "type": "command",
        "command": "CMD=$(echo \"$CLAUDE_TOOL_INPUT\" | jq -r '.command // empty'); for p in 'rm -rf /' 'git push --force main' 'git push --force master' 'DROP TABLE' 'DROP DATABASE'; do echo \"$CMD\" | grep -qi \"$p\" && echo \"Blocked: dangerous command\" >&2 && exit 2; done; exit 0",
        "timeout": 5
      }]
    }
  ],
  "Stop": [
    // 現有的任務完成檢查不變
  ]
}
```

### 4.5 config.json 整合

```jsonc
{
  "targets": {
    "claude-dev": {
      "label": "Claude Code 開發規則",
      "hint": "commands / agents / hooks / rules → ~/.claude/ + plugin",
      "requiresAnalysis": true,  // ← 新增：取代硬編碼判斷
      "steps": [{
        "type": "install-claude",
        "selectable": {
          "commands": { "dir": "claude/commands", "ext": ".md", "selectLabel": "Slash Commands（/xxx）" },
          "agents":   { "dir": "claude/agents",   "ext": ".md", "selectLabel": "Agents（@xxx）" },
          "rules":    { "dir": "claude/rules",     "ext": ".md", "selectLabel": "Rules" }
          // rules 改為 selectable，不再 fixed，用 smartSelect 全預選
        },
        "fixed": { "hooks": true },
        "hooksConfirm": true
      }, {
        "type": "build-plugin",
        // ... 不變
      }]
    }
    // slack, zsh 不變
  }
}
```

**關鍵改動：rules 從 `fixed` 移到 `selectable`，用 `smartSelect` + `matchWhen` 條件預選。**

### 4.6 matchWhen 條件預選機制

**問題：** kkday-conventions 等規範如果技術棧不符合，不應該被預選。全預選會讓非 KKday 用戶困惑。

**解法：** 在每個 Claude 功能檔案的 YAML frontmatter 加入 `matchWhen` 條件，安裝時由數據驅動預選。

#### Frontmatter 格式

```yaml
---
name: kkday-conventions
matchWhen:
  org: ["kkday"]                       # GitHub 組織名
  skills: ["vue", "typescript", "php", "nuxt"]  # 偵測到的技術棧
  matchMode: any                       # any = 任一條件符合即預選; all = 全部符合
---
```

#### 各功能的 matchWhen 設定

| 功能 | matchWhen | 說明 |
|------|-----------|------|
| **Rules** | | |
| code-style | `always: true` | 通用，永遠預選 |
| git-workflow | `always: true` | 通用 |
| slack-mrkdwn | `targets: ["slack"]` | 選了 slack target 才預選 |
| kkday-conventions | `org: ["kkday"], skills: ["vue","typescript","php"], matchMode: any` | KKday org 或有 Vue/TS/PHP |
| testing | `skills: ["vitest","jest","phpunit","pytest","go"]` | 有測試框架才預選 |
| performance | `always: true` | 通用 |
| **Commands** | | |
| tdd | `skills: ["vitest","jest","phpunit","pytest"]` | 有測試框架 |
| build-fix | `always: true` | 通用 |
| draft-slack | `targets: ["slack"]` | slack target |
| review-slack | `targets: ["slack"]` | slack target |
| slack-formatting | `targets: ["slack"]` | slack target |
| 其他 commands | `always: true` | 通用 |
| **Agents** | | |
| 全部 agents | `always: true` | agent 是通用能力，全預選 |
| **Hooks** | | |
| PostToolUse:Edit\|Write (格式化) | `skills: ["prettier","eslint","php"]` | 有格式化工具才預選 |
| PreToolUse:Edit\|Write (保護) | `always: true` | 通用 |
| PreToolUse:Bash (攔截) | `always: true` | 通用 |
| SessionStart:compact | `always: true` | 通用 |
| Stop (完成檢查) | `always: true` | 通用 |

#### 預選引擎實作

```javascript
// lib/ui/preselect.mjs
export function computePreselection(items, context) {
  // context = { org, skills, targets, repos }
  return items.filter(item => {
    const mw = item.matchWhen
    if (!mw || mw.always) return true

    const checks = []
    if (mw.org) checks.push(mw.org.includes(context.org))
    if (mw.skills) checks.push(mw.skills.some(s => context.skills.includes(s)))
    if (mw.targets) checks.push(mw.targets.some(t => context.targets.includes(t)))
    if (mw.repos) checks.push(mw.repos.some(r => context.repos.includes(r)))

    if (checks.length === 0) return true
    return mw.matchMode === 'all' ? checks.every(Boolean) : checks.some(Boolean)
  }).map(item => item.value)
}
```

#### 用戶體驗

```
場景 1：KKday 工程師，選了 kkday org + Vue 專案
→ kkday-conventions ✓ 預選 | testing ✓ | tdd ✓ | 格式化 hook ✓

場景 2：個人 Go 專案
→ kkday-conventions ✗ 不預選（列表中可見，用戶可手動勾選）
→ testing ✓（Go 有 test 框架）| tdd ✗ | 格式化 hook ✗

場景 3：用戶在「調整」中手動勾選了 kkday-conventions
→ 正常安裝，不阻擋。matchWhen 只控制預選，不限制選擇。
```

---

## 五、檔案拆分方案

### 5.1 setup.mjs（386 → ~80 行 orchestrator + 5 個 phase 模組）

```
bin/setup.mjs              (~80)  — main() orchestrator，只含 phase 調用
lib/phases/
├── phase-intent.mjs       (~60)  — targets + mode 選擇
├── phase-analysis.mjs     (~80)  — repo 選擇 + pipeline + tech + ECC
├── phase-configure.mjs    (~60)  — Claude 功能選擇（合併展示）
├── phase-execute.mjs      (~70)  — 備份 + 生成 + 安裝
└── phase-report.mjs       (~50)  — 驗證 + 報告 + session 保存
```

### 5.2 install-handlers.mjs（400 → 3 個子模組 + 1 個共用）

```
lib/install/
├── common.mjs             (~40)  — selectAndStage() 通用流程
├── install-claude.mjs     (~80)  — Claude 安裝邏輯
├── install-modules.mjs    (~60)  — zsh 模組安裝
├── build-plugin.mjs       (~50)  — plugin 打包
└── index.mjs              (~20)  — runTarget() dispatcher
```

### 5.3 ui.mjs（298 → 3 個子模組）

```
lib/ui/
├── prompts.mjs            (~80)  — handleCancel, smartSelect, multiselectWithAll
├── progress.mjs           (~80)  — runWithProgress, spinner helpers
├── files.mjs              (~50)  — discoverItems, countExisting, countFiles
└── index.mjs              (~10)  — re-export all
```

### 5.4 其他檔案

| 檔案 | 行數 | 拆分 |
|------|------|------|
| source-sync.mjs (377) | → cache.mjs (~60) + fetch.mjs (~80) + sync.mjs (~120) | 三層分離 |
| tech-detect-api.mjs (365) | → detectors/{npm,php,python,go}.mjs + registry.mjs | 語言插件化 |
| report.mjs (337) | → templates/report.css + sections.mjs + report.mjs (~120) | 模板外部化 |

---

## 六、AI 調用最優化

### 現狀

| 調用點 | 模型 | 問題 |
|--------|------|------|
| per-repo AI 分類 | sonnet + effort:low | ✓ 合理 |
| stacks 技能生成 | haiku + effort:low | ✓ 合理 |
| ECC AI 推薦 | 未明確 | 應明確為 haiku |
| 開發者畫像 | 未明確 | 裝飾性功能，haiku 足夠 |

### 優化方案

```javascript
// constants.mjs 新增/調整
// ── AI 模型策略 ──
// 分類任務：需要理解代碼結構 → sonnet + effort:low（準確性優先）
export const AI_REPO_MODEL = env('AI_REPO_MODEL', 'sonnet')
export const AI_REPO_EFFORT = env('AI_REPO_EFFORT', 'low')

// 推薦任務：基於已有分類做匹配 → haiku（速度優先）
export const AI_ECC_MODEL = env('AI_ECC_MODEL', 'haiku')
export const AI_ECC_EFFORT = env('AI_ECC_EFFORT', 'low')

// 生成任務：模板填充 → haiku（速度優先）
export const AI_GEN_MODEL = env('AI_GEN_MODEL', 'haiku')
export const AI_GEN_EFFORT = env('AI_GEN_EFFORT', 'low')

// 畫像任務：裝飾性摘要 → haiku（最低成本）
export const AI_PROFILE_MODEL = env('AI_PROFILE_MODEL', 'haiku')
export const AI_PROFILE_EFFORT = env('AI_PROFILE_EFFORT', 'low')
```

| 任務類型 | 模型 | effort | 理由 |
|----------|------|--------|------|
| Per-repo 分類 | **sonnet** | low | 需理解代碼結構、依賴關係 |
| ECC 推薦 | **haiku** | low | 匹配已有分類到資源，規則簡單 |
| 技能片段生成 | **haiku** | low | 模板填充，結構固定 |
| 開發者畫像 | **haiku** | low | 裝飾性摘要，不影響核心流程 |
| agent/command 模板 | N/A | N/A | 靜態檔案，不需 AI |

### 並行控制統一

```javascript
// lib/utils/concurrency.mjs 新增
export async function pMap(items, fn, { concurrency = 3, onProgress } = {}) {
  const results = []
  const executing = new Set()
  for (const [i, item] of items.entries()) {
    const task = fn(item, i).then(result => {
      executing.delete(task)
      onProgress?.({ done: i + 1, total: items.length, result })
      return result
    })
    executing.add(task)
    results.push(task)
    if (executing.size >= concurrency) await Promise.race(executing)
  }
  return Promise.all(results)
}
```

取代 pipeline-runner.mjs:80-115 的手寫並行控制。

---

## 七、每步驗證機制

### 7.1 安裝後自動驗證（Phase 5 新增）

```javascript
// lib/phases/phase-report.mjs
export async function verifyInstallation(installResults, manual) {
  if (manual) return // 手動模式跳過

  const checks = []
  const HOME = process.env.HOME

  // Claude 檔案驗證
  if (installResults.commands?.length) {
    for (const cmd of installResults.commands) {
      const target = path.join(HOME, '.claude/commands', `${cmd}.md`)
      checks.push({ name: `/commands/${cmd}`, ok: fs.existsSync(target) })
    }
  }
  if (installResults.agents?.length) {
    for (const agent of installResults.agents) {
      const target = path.join(HOME, '.claude/agents', `${agent}.md`)
      checks.push({ name: `@agents/${agent}`, ok: fs.existsSync(target) })
    }
  }
  if (installResults.hooks?.length) {
    const hooksPath = path.join(HOME, '.claude/settings.json')
    const exists = fs.existsSync(hooksPath)
    checks.push({ name: 'hooks.json', ok: exists })
    if (exists) {
      try {
        JSON.parse(fs.readFileSync(hooksPath, 'utf8'))
        checks.push({ name: 'hooks.json (valid JSON)', ok: true })
      } catch {
        checks.push({ name: 'hooks.json (valid JSON)', ok: false })
      }
    }
  }

  // zsh 驗證
  if (installResults.modules?.length) {
    for (const mod of installResults.modules) {
      const target = path.join(HOME, '.zsh/modules', `${mod}.zsh`)
      checks.push({ name: `modules/${mod}.zsh`, ok: fs.existsSync(target) })
    }
  }

  // 報告結果
  const passed = checks.filter(c => c.ok).length
  const failed = checks.filter(c => !c.ok)
  if (failed.length === 0) {
    p.log.success(`驗證通過：${passed}/${checks.length} 個檔案就位`)
  } else {
    p.log.warn(`驗證：${passed}/${checks.length} 通過，${failed.length} 個失敗：`)
    p.log.message(failed.map(c => `  ✗ ${c.name}`).join('\n'))
  }
  return { passed, failed, total: checks.length }
}
```

### 7.2 Pipeline 分析驗證

```javascript
// pipeline-runner.mjs 新增
function validatePipelineResult(result) {
  const issues = []
  if (!result.categorizedTechs?.size) issues.push('技術棧為空')
  if (!result.repoData?.length) issues.push('無 repo 數據')
  for (const repo of result.repoData || []) {
    if (!repo.meta?.languages?.length) issues.push(`${repo.name}: 無語言檢測`)
  }
  return issues
}
```

---

## 八、重複代碼消除

### 8.1 `selectWithSession()` — 消除 4 處重複

```javascript
// 現在（install-handlers.mjs 中出現 4 次）
const { sortedOptions, initialValues } = applyPreviousSelection(items, session?.install?.[key])
const selected = flagAll
  ? items.map(i => i.value)
  : await multiselectWithAll({ message, options: sortedOptions, initialValues })

// 重構後（smartSelect 統一處理）
const selected = await smartSelect({
  title: `${stepLabel}${def.selectLabel}`,
  items,
  preselected: items.map(i => i.value), // 全預選
  session: session?.install?.[key],
})
```

### 8.2 `reviewer` + `code-review` 合併

```markdown
<!-- claude/agents/reviewer.md 引用 command -->
---
name: reviewer
tools: ["Read", "Grep", "Glob", "Bash"]
---

你是深度程式碼審查專家。

## 審查流程
<!-- 引用 code-review 的內容，不重複定義 -->
1. 用 `git diff` 或 `gh pr diff` 取得變更
2. 讀取 CLAUDE.md 了解規範
3. 偵測技術棧，逐檔案審查
4. 按 🔴 Critical / 🟡 Warning / 🔵 Suggestion 分級

## 輸出格式
REVIEW: {scope}
Verdict: APPROVED ✅ | NEEDS_CHANGES ❌
🔴: {n} | 🟡: {n} | 🔵: {n}
[檔案:行號] {等級} {問題} → {修改}
```

`code-review.md` command 精簡為觸發器，指向 reviewer agent 的邏輯。

### 8.3 ESM boilerplate 提取

```javascript
// lib/utils/paths.mjs
import path from 'path'
import { fileURLToPath } from 'url'

export const getDirname = (importMeta) => path.dirname(fileURLToPath(importMeta.url))
export const getRepoRoot = (importMeta) => path.resolve(getDirname(importMeta), '..')
```

取代 9 個檔案中的 `const __dirname = path.dirname(fileURLToPath(import.meta.url))`。

---

## 九、你遺漏的、我補充的

### 9.1 `--quick` 快速模式

```bash
pnpm setup --quick  # 等同於：用上次 session 全部確認，0 次互動
```

Session 存在時直接 replay，不問任何問題。適合 CI 或重複安裝。

### 9.2 錯誤恢復 — 斷點續裝

```javascript
// session 增加 progress 欄位
saveSession({
  ...selections,
  progress: {
    lastPhase: 'phase-3',
    completedTargets: ['claude-dev'],
    pendingTargets: ['zsh'],
  }
})
```

如果 setup 中途失敗（斷網、Ctrl+C），下次執行時：
```
檢測到未完成的安裝（上次停在 Phase 3 · zsh 模組）
❯ 繼續上次安裝
  重新開始
  取消
```

### 9.3 Dry Run 模式

```bash
pnpm setup --dry-run  # 只顯示會做什麼，不實際執行
```

顯示完整的安裝計畫，但不寫入任何檔案。用於確認配置正確。

### 9.4 Agent 技術棧感知

所有 agent 增加讀取 stacks/ 的步驟：

```markdown
## 上下文載入
1. 讀取 `~/.claude/stacks/` 目錄了解當前技術棧配置
2. 根據技術棧決定最適合的工具和慣例
```

讓 agent 知道用戶用什麼框架，自動調整建議。

### 9.5 hooks 衝突檢測

安裝 hooks 時自動檢查：
- 用戶 `~/.claude/settings.json` 是否已有自定義 hooks
- 如有衝突，顯示 diff 並讓用戶選擇：合併 / 覆蓋 / 跳過

### 9.6 Plugin 版本追蹤

```jsonc
// dist/release/manifest.json（自動生成）
{
  "version": "1.1.0",
  "buildTime": "2026-03-28T10:00:00Z",
  "contents": {
    "commands": 15,
    "agents": 13,
    "rules": 6,
    "hooks": 6,
    "stacks": 25
  },
  "checksum": "sha256:..."
}
```

---

## 十、實作排期

### Phase 1：基礎設施（2 個 PR）

**PR 1.1 — `smartSelect` + 拆 ui.mjs**
- [ ] 提取 `lib/ui/prompts.mjs`（smartSelect, handleCancel, multiselectWithAll）
- [ ] 提取 `lib/ui/progress.mjs`（runWithProgress）
- [ ] 提取 `lib/ui/files.mjs`（discoverItems, countExisting）
- [ ] 提取 `lib/utils/paths.mjs`（getDirname）
- [ ] 提取 `lib/utils/concurrency.mjs`（pMap）
- [ ] `lib/ui/index.mjs` re-export 保持向後兼容
- [ ] 驗證：現有 import 不破壞

**PR 1.2 — 拆 install-handlers.mjs**
- [ ] `lib/install/common.mjs`（selectAndStage 通用流程）
- [ ] `lib/install/install-claude.mjs`
- [ ] `lib/install/install-modules.mjs`
- [ ] `lib/install/build-plugin.mjs`
- [ ] `lib/install/index.mjs`（runTarget dispatcher）
- [ ] 改用 `smartSelect` 取代所有 `applyPreviousSelection + multiselectWithAll`
- [ ] 驗證：`pnpm setup --all` 全流程通過

### Phase 2：流程統一（2 個 PR）

**PR 2.1 — 拆 setup.mjs + 統一互動**
- [ ] `lib/phases/phase-intent.mjs`
- [ ] `lib/phases/phase-analysis.mjs`
- [ ] `lib/phases/phase-configure.mjs`（合併展示 Claude 功能）
- [ ] `lib/phases/phase-execute.mjs`
- [ ] `lib/phases/phase-report.mjs`（含驗證機制）
- [ ] `bin/setup.mjs` 精簡為 orchestrator
- [ ] repo-select 改用 session 預選
- [ ] tech-select-ui 改用 `smartSelect`
- [ ] ecc-select-ui 改用 `smartSelect`
- [ ] config.json rules 從 fixed 改為 selectable
- [ ] 驗證：全新安裝 + 有 session 重複安裝

**PR 2.2 — `--quick` + 斷點續裝 + `--dry-run`**
- [ ] session.mjs 增加 progress 欄位
- [ ] setup.mjs 增加 `--quick` 邏輯
- [ ] setup.mjs 增加 `--dry-run` 邏輯
- [ ] 中斷恢復 UI
- [ ] 驗證：各模式組合測試

### Phase 3：Claude 功能擴充（2 個 PR）

**PR 3.1 — 新增 agents + commands + rules**
- [ ] 新增 3 agents（security, migrator, perf-analyzer）
- [ ] 新增 7 commands（tdd, build-fix, simplify, refactor-clean, e2e, test-coverage, multi-frontend）
- [ ] 新增 3 rules（kkday-conventions, testing, performance）
- [ ] 現有 agent 加厚（coder +技術棧感知, debugger +結構化流程, planner +輸出模板）
- [ ] reviewer + code-review 內容去重
- [ ] 驗證：所有檔案 YAML frontmatter 合法 + 安裝到 ~/.claude/ 後 Claude Code 可識別

**PR 3.2 — Hooks 強化 + 衝突檢測**
- [ ] 新增 `PreToolUse:Bash` 危險命令攔截
- [ ] hooks 安裝時衝突檢測 + 合併 UI
- [ ] Plugin manifest 版本追蹤
- [ ] 驗證：hooks 合併正確 + manifest 生成

### Phase 4：AI + 深層優化（1 個 PR）

**PR 4.1 — AI 模型策略 + 其他拆分**
- [ ] constants.mjs 新增 AI_ECC_MODEL, AI_PROFILE_MODEL 等
- [ ] pipeline-runner 改用 pMap()
- [ ] source-sync 拆三層
- [ ] tech-detect-api 拆語言插件
- [ ] report.mjs 模板外部化
- [ ] 驗證：AI 調用成本降低 + 全流程 E2E

---

## 十一、檔案結構（重構後）

```
ab-dotfiles/
├── bin/
│   ├── setup.mjs         (~80)   ← 從 386 行精簡
│   ├── scan.mjs          (222)   ← 不變
│   └── restore.mjs       (113)   ← 不變
├── lib/
│   ├── phases/                    ← 新增
│   │   ├── phase-intent.mjs
│   │   ├── phase-analysis.mjs
│   │   ├── phase-configure.mjs
│   │   ├── phase-execute.mjs
│   │   └── phase-report.mjs
│   ├── install/                   ← 從 install-handlers.mjs 拆出
│   │   ├── common.mjs
│   │   ├── install-claude.mjs
│   │   ├── install-modules.mjs
│   │   ├── build-plugin.mjs
│   │   └── index.mjs
│   ├── ui/                        ← 從 ui.mjs 拆出
│   │   ├── prompts.mjs
│   │   ├── progress.mjs
│   │   ├── files.mjs
│   │   └── index.mjs
│   ├── utils/                     ← 新增
│   │   ├── paths.mjs
│   │   └── concurrency.mjs
│   ├── pipeline/                  ← 不變
│   ├── constants.mjs              ← 新增 AI 模型策略
│   ├── session.mjs                ← 新增 progress 欄位
│   └── ...                        ← 其餘不變
├── claude/
│   ├── agents/   (13 個)          ← 從 10 → 13
│   ├── commands/ (15 個)          ← 從 8 → 15
│   ├── rules/    (6 個)           ← 從 3 → 6
│   └── hooks.json                 ← 新增 Bash 攔截
└── config.json                    ← rules 改 selectable + requiresAnalysis
```

---

## 十二、PR Checklist 範本與驗證步驟

### 每個 PR 必須通過的驗證矩陣

```
┌────────────────────────────────────────────────────────┐
│ PR Verification Checklist                              │
├────────────────────────────────────────────────────────┤
│ 1. 靜態驗證                                            │
│    □ 所有 .mjs import 路徑正確（無 broken import）     │
│    □ 所有 .md frontmatter 合法 YAML                    │
│    □ config.json 合法 JSON                             │
│    □ hooks.json 合法 JSON                              │
│                                                        │
│ 2. 功能驗證（4 種模式組合）                            │
│    □ pnpm setup                   （互動，全新安裝）   │
│    □ pnpm setup                   （互動，有 session） │
│    □ pnpm setup --all             （全自動）           │
│    □ pnpm setup --manual          （手動模式）         │
│                                                        │
│ 3. 邊界驗證                                            │
│    □ Ctrl+C 中斷 → 不損壞現有配置                     │
│    □ 無 GitHub 連線 → 優雅降級                         │
│    □ 空 session → 不 crash                             │
│    □ 0 repos 選擇 → 正常退出                          │
│                                                        │
│ 4. 回歸驗證                                            │
│    □ 已安裝的 ~/.claude/ 檔案未被意外刪除              │
│    □ session.json 向後兼容（舊格式不 crash）           │
│    □ config.json 新欄位有 fallback                     │
└────────────────────────────────────────────────────────┘
```

### 自動化驗證腳本（每 PR 執行）

```bash
#!/bin/bash
# scripts/verify.sh — PR 合入前自動驗證

set -e
echo "=== 1. 靜態檢查 ==="

# Import 路徑檢查
node -e "
  const { execSync } = require('child_process');
  const files = execSync('find lib bin -name \"*.mjs\"').toString().trim().split('\n');
  let broken = 0;
  for (const f of files) {
    try { await import('./' + f); }
    catch(e) { if (e.code === 'ERR_MODULE_NOT_FOUND') { console.error('BROKEN:', f, e.message); broken++; } }
  }
  process.exit(broken > 0 ? 1 : 0);
" 2>/dev/null || echo "⚠ 動態 import 檢查需在 ESM 環境執行"

# YAML frontmatter 檢查
for f in claude/agents/*.md claude/commands/*.md claude/rules/*.md; do
  head -1 "$f" | grep -q '^---$' || echo "WARN: $f missing frontmatter"
done

# JSON 合法性
node -e "JSON.parse(require('fs').readFileSync('config.json'))" && echo "✓ config.json"
node -e "JSON.parse(require('fs').readFileSync('claude/hooks.json'))" && echo "✓ hooks.json"

echo "=== 2. 全自動模式測試 ==="
node bin/setup.mjs --all --dry-run 2>&1 | tail -5

echo "=== 驗證完成 ==="
```

### 各 Phase PR 的具體驗證步驟

#### PR 1.1 — smartSelect + 拆 ui.mjs

| 步驟 | 命令 | 預期結果 |
|------|------|----------|
| import 不破壞 | `node -e "import('./lib/ui/index.mjs')"` | 無 ERR_MODULE_NOT_FOUND |
| 向後兼容 | `grep -r "from.*ui.mjs" lib/ bin/` → 確認都改到新路徑 | 0 個殘留舊路徑 |
| smartSelect 單元 | 準備 mock stdin，測試 accept/edit/skip 三條路徑 | 各路徑返回正確值 |
| 全流程 | `pnpm setup --all` | 通過，輸出與重構前一致 |

#### PR 1.2 — 拆 install-handlers.mjs

| 步驟 | 命令 | 預期結果 |
|------|------|----------|
| dispatcher 正確 | 確認 runTarget 能路由到 install-claude / install-modules / build-plugin | 3 種 step type 都能執行 |
| 安裝結果一致 | `diff <(pnpm setup --all 舊版) <(pnpm setup --all 新版)` | ~/.claude/ 檔案內容完全相同 |
| session 記錄 | 執行後檢查 .cache/last-session.json | install 欄位結構不變 |

#### PR 2.1 — 拆 setup.mjs + 統一互動

| 步驟 | 命令 | 預期結果 |
|------|------|----------|
| 全新安裝 | 刪除 .cache/last-session.json → `pnpm setup` | 完整流程，6~8 次互動 |
| 有 session | 直接 `pnpm setup` | 全確認預選 3~4 次互動 |
| matchWhen | 選非 KKday org → 檢查 kkday-conventions 是否不預選 | 列表中可見但未勾選 |
| 跳過 | 每個 smartSelect 都選「跳過」 | 不 crash，安裝為空 |

#### PR 2.2 — --quick + 斷點續裝 + --dry-run

| 步驟 | 命令 | 預期結果 |
|------|------|----------|
| quick | `pnpm setup --quick` | 0 次互動，直接安裝 |
| quick 無 session | 刪除 session → `pnpm setup --quick` | 提示無歷史記錄，fallback 到正常流程 |
| dry-run | `pnpm setup --dry-run` | 顯示計畫，不寫入任何檔案 |
| 斷點續裝 | 在 Phase 3 Ctrl+C → 重新 `pnpm setup` | 提示繼續/重新開始 |

#### PR 3.1 — 新增 agents + commands + rules

| 步驟 | 命令 | 預期結果 |
|------|------|----------|
| frontmatter | 所有新檔案 `head -1` 為 `---` | 合法 YAML |
| matchWhen | 新 rules 的 matchWhen 條件正確觸發 | 符合條件才預選 |
| 安裝 | `pnpm setup --all` → `ls ~/.claude/{agents,commands,rules}` | 新檔案全部出現 |
| Claude Code 識別 | 進入任意專案 → 輸入 `/tdd` | Claude Code 識別為 skill |

#### PR 3.2 — Hooks 強化

| 步驟 | 命令 | 預期結果 |
|------|------|----------|
| Bash 攔截 | Claude Code 中執行 `rm -rf /` | hook 攔截，不執行 |
| 衝突檢測 | 先手動改 settings.json hooks → `pnpm setup` | 顯示衝突 diff，提供合併/覆蓋/跳過選項 |
| manifest | `cat dist/release/manifest.json` | 包含正確的 version/contents/checksum |

#### PR 4.1 — AI 模型策略

| 步驟 | 命令 | 預期結果 |
|------|------|----------|
| 模型使用 | 檢查 pipeline 日誌中 ECC/profile 用 haiku | 不出現 sonnet 調用 |
| pMap | pipeline-runner 中無手寫 Promise.race 循環 | 改用 pMap() |
| 成本對比 | 同組 repos 跑前後版本，比較 AI token 消耗 | haiku 調用部分成本降低 ~60% |

---

## 十三、決策記錄

| 決策 | 選項 | 選擇 | 理由 |
|------|------|------|------|
| 交互統一方式 | A: 每處單獨優化 / B: smartSelect 通用元件 | **B** | 一致性 + 維護成本低 |
| rules 預選 | A: 全預選 / B: matchWhen 條件驅動 | **B** | 避免不相關規範污染用戶配置 |
| AI 模型 | A: 全 sonnet / B: 分任務選模型 | **B** | 速度+成本，推薦/生成不需 sonnet |
| setup 拆分 | A: 函式拆分 / B: 檔案拆分（phases/） | **B** | 每個 phase 獨立測試 |
| 並行控制 | A: 手寫 / B: pMap / C: p-map 套件 | **B** | 不加依賴，但提取為共用函式 |
| hooks 衝突 | A: 直接覆蓋 / B: 合併 / C: 讓用戶選 | **C** | 用戶可能有自定義 hooks |
| --quick 模式 | A: 不做 / B: replay session | **B** | CI 和重複安裝場景常見 |
| reviewer 重複 | A: 刪 code-review / B: 合併 | **B** | command 作為觸發器，agent 作為邏輯載體 |
