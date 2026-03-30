# ab-dotfiles v2.0 完整方案

> 專案級配置 + Repo 角色分級 + 使用追蹤 + 管理儀表板

## 一、架構總覽

```
ab-dotfiles v2.0
│
├─ 配置分層
│  ├─ 全局（~/.claude/）— 通用工具，任何專案都用
│  └─ 專案級（project/.claude/）— 技術棧匹配，按角色深淺
│
├─ Repo 角色
│  ├─ ⭐ 主力 — 每天開發，完整配置
│  ├─ 🔄 臨時 — 跨組 PR，精簡配置
│  └─ 🔧 工具 — 偶爾維護，最小配置
│
├─ 使用追蹤
│  ├─ Hook 記錄每次 command/agent 調用
│  ├─ 統計報告（CLI + HTML）
│  └─ 智能推薦（推薦常用、提醒未用）
│
└─ 管理儀表板
   ├─ 本地 Web UI（localhost）
   ├─ 查看/搜索所有已安裝功能
   ├─ 一鍵啟用/停用/移除
   └─ 使用數據視覺化
```

## 二、配置分層設計

### 全局配置（~/.claude/）

只放「任何專案都用得到」的通用工具：

```
~/.claude/
├── commands/                    ← 7 個通用 commands
│   ├── code-review.md           # 程式碼審查
│   ├── pr-workflow.md           # PR 全流程
│   ├── tdd.md                   # 測試驅動開發
│   ├── build-fix.md             # 構建修復
│   ├── simplify.md              # 代碼精簡
│   ├── refactor-clean.md        # 死代碼清理
│   └── changeset.md             # 版本變更
├── agents/                      ← 8 個通用 agents
│   ├── coder.md                 # 功能開發
│   ├── reviewer.md              # 程式碼審查
│   ├── tester.md                # 測試
│   ├── debugger.md              # 除錯
│   ├── planner.md               # 規劃
│   ├── deployer.md              # 部署
│   ├── documenter.md            # 文件
│   └── explorer.md              # 探索
├── rules/                       ← 2 個通用 rules
│   ├── code-style.md            # 程式碼風格
│   └── git-workflow.md          # Git 工作流
├── settings.json                ← 通用 hooks（5 個）
└── usage/                       ← 使用追蹤（新增）
    ├── stats.json               # 累計使用統計
    └── daily/                   # 每日明細
```

### 專案級配置（project/.claude/）

按 Repo 角色決定深度，注入到各 repo 本機目錄：

#### ⭐ 主力 repo（完整配置）

```
~/projects/kkday-b2c-web/
├── CLAUDE.md                    ← AI 生成（架構 + 規範 + 技術棧）
├── .claude/
│   ├── commands/                ← 技術棧匹配的 commands
│   │   ├── e2e.md               # Playwright E2E
│   │   ├── multi-frontend.md    # Vue/Nuxt 開發
│   │   └── test-coverage.md     # 覆蓋率分析
│   ├── agents/                  ← 進階 agents
│   │   ├── security.md          # 安全掃描
│   │   ├── migrator.md          # 版本遷移
│   │   ├── perf-analyzer.md     # 效能分析
│   │   ├── monitor.md           # 監控
│   │   └── refactor.md          # 重構
│   ├── rules/                   ← 專案規範
│   │   ├── project-conventions.md  # 專案開發慣例（原 project-conventions）
│   │   ├── testing.md           # 測試規範
│   │   └── performance.md       # 效能規範
│   ├── stacks/                  ← 技能片段
│   │   ├── nuxt/
│   │   ├── vue/
│   │   ├── pinia/
│   │   └── vitest/
│   └── settings.local.json     ← 專案級 hooks
└── src/...
```

#### 🔄 臨時 repo（精簡配置）

```
~/projects/bs-monorepo/
├── CLAUDE.md                    ← 精簡版（技術棧 + 快速上手指引）
├── .claude/
│   └── rules/
│       └── project-conventions.md  # 只放專案慣例
└── src/...
```

#### 🔧 工具 repo（最小配置）

```
~/projects/kkday-web-docker/
├── CLAUDE.md                    ← 最小版（專案描述）
└── docker-compose.yml
```

### 分類引擎

```javascript
// lib/config-classifier.mjs

export const GLOBAL = {
  commands: [
    'code-review', 'pr-workflow', 'tdd', 'build-fix',
    'simplify', 'refactor-clean', 'changeset',
  ],
  agents: [
    'coder', 'reviewer', 'tester', 'debugger',
    'planner', 'deployer', 'documenter', 'explorer',
  ],
  rules: ['code-style', 'git-workflow'],
  hooks: ['auto-format', 'file-protect', 'bash-guard', 'compact-hint', 'task-check'],
}

export const PROJECT_POOL = {
  commands: [
    'e2e', 'multi-frontend', 'test-coverage',
    'auto-setup', 'draft-slack', 'review-slack', 'slack-formatting',
  ],
  agents: ['security', 'migrator', 'perf-analyzer', 'monitor', 'refactor'],
  rules: ['project-conventions', 'testing', 'performance', 'slack-mrkdwn'],
}

export function getProjectConfig(role, detectedSkills, repoMeta) {
  switch (role) {
    case 'main':
      return {
        claudeMd: 'full',
        commands: matchBySkills(PROJECT_POOL.commands, detectedSkills),
        agents: PROJECT_POOL.agents,
        rules: matchBySkills(PROJECT_POOL.rules, detectedSkills),
        stacks: detectedSkills,
        hooks: generateProjectHooks(detectedSkills),
      }
    case 'temp':
      return {
        claudeMd: 'concise',
        commands: [],
        agents: [],
        rules: ['project-conventions'],
        stacks: [],
        hooks: null,
      }
    case 'tool':
      return {
        claudeMd: 'minimal',
        commands: [],
        agents: [],
        rules: [],
        stacks: [],
        hooks: null,
      }
  }
}
```

## 三、CLAUDE.md 生成

### ⭐ 主力版模板

```markdown
# {repo-name}

{AI 生成的一句話描述}

## 技術棧
- 框架：{frameworks}
- 狀態管理：{state}
- UI：{ui-libs}
- 測試：{test-frameworks}
- 建構：{build-tools}

## 架構要點
{AI 分析的架構特點，3-5 點}

## 開發規範
- 遵循 .claude/rules/ 中的規範
- Commit 格式：Conventional Commits
- PR base branch：{default-branch}

## 常用指令
- `{dev-command}` — 本地開發
- `{test-command}` — 跑測試
- `{build-command}` — 建構

## 專案結構
{AI 分析的關鍵目錄說明}
```

### 🔄 臨時版模板

```markdown
# {repo-name}

{一句話描述}

## 快速上手
- `{install-command}` — 安裝依賴
- `{dev-command}` — 啟動開發
- 分支命名：`feat/{TICKET}-{desc}`
- PR base：`{default-branch}`

## 技術棧
{技術棧列表，一行}

## 注意事項
{AI 分析的關鍵注意點，2-3 點}
```

### 🔧 工具版模板

```markdown
# {repo-name}

{描述}。使用方式見 README。
```

## 四、Setup 流程（v2.0）

```
pnpm setup
│
├─ Phase 1：意圖（現有）
│  ├─ 環境檢查 + CLI 預熱
│  ├─ 選 targets（Claude / Slack / zsh）
│  └─ 選 mode（auto / manual）
│
├─ Phase 2：分析（現有）
│  ├─ 選 repos + Pipeline 分析
│  ├─ 技術棧選擇
│  └─ ECC 規則匹配推薦
│
├─ Phase 2.5：角色 + 路徑（新增）
│  │
│  ├─ Spotlight 偵測本機 clone 位置
│  │  mdfind 搜索每個 repo name → git remote 驗證
│  │
│  │  掃描本機 repos...
│  │  ✓ kkday-b2c-web → ~/projects/kkday-b2c-web
│  │  ✓ kkday-member-ci → ~/projects/kkday-member-ci
│  │  ✓ bs-monorepo → ~/projects/bs-monorepo
│  │  ✗ kkday-web-docker → 未找到
│  │
│  └─ smartSelect 標記角色
│     Repo 角色（預選 4/5）：
│       1. kkday-b2c-web        ⭐ 主力  70% · 1336 commits
│       2. kkday-member-ci      ⭐ 主力  14% · 265 commits
│       3. web-design-system    ⭐ 主力  Design System
│       4. bs-monorepo          🔄 臨時  跨組 PR
│       5. kkday-web-docker     🔧 工具  Docker 環境（未找到，只生成）
│     ❯ 確認 / 調整角色
│
│     預設規則：
│       有貢獻（commits > 0）→ ⭐ 主力
│       無貢獻但選中 → 🔄 臨時
│       用戶可手動調整任何 repo 的角色
│
├─ Phase 3：部署（改動）
│  │
│  ├─ 3A：全局配置 → ~/.claude/
│  │  ├─ 通用 commands (7) + agents (8) + rules (2)
│  │  ├─ hooks (settings.json)
│  │  └─ 使用追蹤 hook 注入
│  │
│  ├─ 3B：專案配置 → 各 repo 目錄
│  │  ├─ ⭐ 主力：完整配置（CLAUDE.md + commands + agents + rules + stacks + hooks）
│  │  ├─ 🔄 臨時：精簡配置（CLAUDE.md + project-conventions rule）
│  │  ├─ 🔧 工具：最小配置（CLAUDE.md only）
│  │  └─ 未找到：生成到 dist/projects/{org}/{repo}/（稍後手動部署）
│  │
│  ├─ 3C：ECC 外部資源
│  │  └─ 按現有邏輯安裝到全局
│  │
│  ├─ 3D：打包 plugins
│  │
│  └─ 3E：zsh 模組
│
├─ Phase 3.5：安裝後引導（新增）
│  │
│  └─ 🎓 快速上手
│     你最可能用到的 3 個功能：
│       1. /code-review — 發 PR 前自動審查
│       2. @coder — 描述需求，AI 幫你寫
│       3. /pr-workflow — 一鍵建分支、commit、發 PR
│     💡 進入任何已配置的專案目錄，Claude 自動載入專案配置
│     📊 使用 pnpm run dashboard 查看使用統計和管理配置
│
└─ Phase 4：報告（增強）
   ├─ 新增「專案配置」Tab — 每個 repo 部署了什麼
   ├─ 新增「快速上手」section
   └─ 新增 dashboard 入口連結
```

## 五、使用追蹤系統

### 5.1 數據收集

透過 Claude Code 的 `Stop` hook 記錄每次使用：

```jsonc
// claude/hooks.json 新增
{
  "Stop": [{
    "matcher": "",
    "hooks": [{
      "type": "command",
      "command": "node ~/.claude/usage/tracker.mjs \"$CLAUDE_SESSION_ID\" 2>/dev/null; exit 0",
      "timeout": 5
    }]
  }]
}
```

`tracker.mjs` 解析 session 日誌，提取使用的 commands/agents：

```javascript
// ~/.claude/usage/tracker.mjs
import fs from 'fs'
import path from 'path'

const STATS_PATH = path.join(process.env.HOME, '.claude', 'usage', 'stats.json')

// 讀取當前 session 的工具使用記錄
const sessionId = process.argv[2]
const sessionDir = path.join(process.env.HOME, '.claude', 'sessions', sessionId)

// 解析 session 中使用了哪些 skills/agents
const usage = parseSessionUsage(sessionDir)

// 累加到 stats.json
let stats = {}
try { stats = JSON.parse(fs.readFileSync(STATS_PATH, 'utf8')) } catch {}

const today = new Date().toISOString().slice(0, 10)
if (!stats[today]) stats[today] = {}

for (const { type, name } of usage) {
  const key = `${type}:${name}`
  if (!stats[today][key]) stats[today][key] = 0
  stats[today][key]++
}

fs.writeFileSync(STATS_PATH, JSON.stringify(stats, null, 2))
```

### 5.2 數據格式

```jsonc
// ~/.claude/usage/stats.json
{
  "2026-03-28": {
    "command:code-review": 5,
    "command:pr-workflow": 3,
    "command:tdd": 1,
    "agent:coder": 8,
    "agent:reviewer": 4,
    "agent:debugger": 2
  },
  "2026-03-29": {
    "command:code-review": 3,
    "agent:coder": 12
  }
}
```

### 5.3 CLI 統計指令

```bash
pnpm run stats          # 查看使用統計
pnpm run stats --week   # 過去 7 天
pnpm run stats --month  # 過去 30 天
```

輸出：
```
📊 ab-dotfiles 使用統計（過去 7 天）

  排名  功能                  使用次數  趨勢
  1.   @coder                 42 次    ████████████████ ↑
  2.   /code-review           28 次    ██████████████   ↑
  3.   @reviewer              15 次    ████████         →
  4.   /pr-workflow            12 次    ██████           →
  5.   @debugger               8 次    ████             ↑
  6.   /tdd                    3 次    ██               →
  7.   @planner                2 次    █                ↓

  ⚠️ 未使用（7 天內）：
     /e2e · /multi-frontend · @monitor · @migrator
     💡 要移除嗎？執行 pnpm run dashboard 管理

  📈 總計：110 次調用 · 最活躍：週三（32 次）
```

## 六、管理儀表板

### 6.1 架構

```
pnpm run dashboard
  → 啟動本地 Web Server（localhost:3847）
  → 自動開啟瀏覽器
  → 讀取 ~/.claude/ 配置 + usage/stats.json
  → 提供 Web UI 管理介面
```

### 6.2 技術方案

```
bin/dashboard.mjs              ← CLI 入口
lib/dashboard/
├── server.mjs                 ← 本地 HTTP server（Node http 模組，零依賴）
├── api.mjs                    ← REST API 處理
│   ├── GET  /api/features     ← 列出所有已安裝功能
│   ├── GET  /api/stats        ← 使用統計
│   ├── GET  /api/projects     ← 專案配置列表
│   ├── POST /api/features/:id/toggle  ← 啟用/停用
│   ├── DELETE /api/features/:id       ← 移除
│   └── POST /api/projects/:repo/sync  ← 重新同步專案配置
└── ui.html                    ← 自包含前端（inline CSS/JS，零依賴）
```

### 6.3 儀表板 UI 設計

```
┌─────────────────────────────────────────────────────────┐
│  🛠 ab-dotfiles 管理儀表板                    localhost:3847  │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  [概覽] [功能管理] [專案配置] [使用統計]                    │
│                                                         │
│  ═══ 概覽 ══════════════════════════════════════════     │
│                                                         │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐          │
│  │  15  │ │  13  │ │  6   │ │  5   │ │  3   │          │
│  │ Cmds │ │Agents│ │Rules │ │Hooks │ │Projects│         │
│  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘          │
│                                                         │
│  📈 本週使用：142 次    最常用：@coder (38)              │
│                                                         │
│  ═══ 功能管理 ══════════════════════════════════════     │
│                                                         │
│  🔍 [搜索功能...]                                       │
│                                                         │
│  範圍：[全局] [專案級] [全部]                             │
│  狀態：[啟用中] [已停用] [全部]                           │
│                                                         │
│  ┌─────────────────────────────────────────────┐        │
│  │ ✅ /code-review        全局  28次/週  ██████│ [停用] │
│  │ ✅ /pr-workflow         全局  12次/週  ███  │ [停用] │
│  │ ✅ /tdd                 全局   3次/週  █   │ [停用] │
│  │ ✅ /e2e                 專案   0次/週      │ [移除] │
│  │ ⏸️ /multi-frontend      專案   0次/週      │ [啟用] │
│  │ ✅ @coder               全局  38次/週 █████│        │
│  │ ✅ @reviewer            全局  15次/週  ███ │        │
│  │ ⚠️ @monitor             專案   0次/週      │ [移除] │
│  └─────────────────────────────────────────────┘        │
│                                                         │
│  ═══ 專案配置 ══════════════════════════════════════     │
│                                                         │
│  ┌─ ⭐ kkday-b2c-web ──────────────────────────┐       │
│  │  ~/projects/kkday-b2c-web                    │       │
│  │  Nuxt 3 SSR · Pinia · Vant                  │       │
│  │  Commands: 3 · Agents: 5 · Rules: 3         │       │
│  │  [查看] [重新同步] [變更角色 ▾]              │       │
│  └──────────────────────────────────────────────┘       │
│  ┌─ 🔄 bs-monorepo ────────────────────────────┐       │
│  │  ~/projects/bs-monorepo                      │       │
│  │  Vue 3 · Element Plus                       │       │
│  │  Rules: 1 (project-conventions)             │       │
│  │  [查看] [升級為主力 ⭐]                      │       │
│  └──────────────────────────────────────────────┘       │
│                                                         │
│  ═══ 使用統計 ══════════════════════════════════════     │
│                                                         │
│  [日] [週] [月]     [ECharts 圖表區域]                   │
│                                                         │
│  ┌─ 使用趨勢（折線圖）──────────────────────────┐       │
│  │          ╱╲    ╱╲                            │       │
│  │    ╱╲  ╱    ╲╱    ╲   @coder                │       │
│  │  ╱    ╲             ╲  /code-review          │       │
│  │ ╱                     ╲                      │       │
│  └──────────────────────────────────────────────┘       │
│                                                         │
│  ┌─ 功能使用分佈（圓餅圖）──────────────────────┐       │
│  │                                              │       │
│  └──────────────────────────────────────────────┘       │
│                                                         │
│  ┌─ 未使用功能 ─────────────────────────────────┐       │
│  │  以下功能 30 天未使用，建議移除：              │       │
│  │  ☐ /e2e          ☐ @monitor                  │       │
│  │  ☐ /multi-frontend  ☐ @migrator              │       │
│  │  [批次移除選中] [全部保留]                    │       │
│  └──────────────────────────────────────────────┘       │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 6.4 API 設計

```
GET /api/features
→ {
    global: {
      commands: [{ name, description, enabled, usageWeek, usageMonth }],
      agents: [...],
      rules: [...],
      hooks: [...]
    },
    projects: {
      "kkday-b2c-web": {
        role: "main",
        path: "/Users/alvin/projects/kkday-b2c-web",
        commands: [...],
        agents: [...],
        rules: [...],
      }
    }
  }

GET /api/stats?range=week
→ {
    daily: { "2026-03-28": { "command:code-review": 5, ... } },
    top: [{ name, type, count }],
    unused: [{ name, type, lastUsed }],
    total: 142
  }

POST /api/features/command:e2e/toggle
← { enabled: false }
// 將 e2e.md 移到 ~/.claude/commands/.disabled/

DELETE /api/features/command:e2e
// 刪除 e2e.md

POST /api/projects/kkday-b2c-web/role
← { role: "main" }  // 從臨時升級為主力，重新部署完整配置

POST /api/projects/kkday-b2c-web/sync
// 重新分析技術棧並更新配置
```

## 七、重命名

| 現在 | 改為 | 影響範圍 |
|------|------|---------|
| `project-conventions` | `project-conventions` | claude/rules/、README、architecture.md、config-classifier |

內容保持不變（TypeScript/Vue/PHP 規範），只是名稱和 description 去掉公司名。

matchWhen 改為：
```yaml
---
name: project-conventions
description: >
  TypeScript / Vue / PHP 專案開發規範。
matchWhen:
  skills: ["vue", "typescript", "php", "nuxt"]
  matchMode: any
---
```

## 七B、通用化檢查結果

所有靜態配置已確認為通用型：

| 類型 | 檔案 | 修改 |
|------|------|------|
| rule | project-conventions | 刪除 TS/Vue/PHP 硬編，只留通用 API/測試/版本控制慣例 |
| rule | testing | matchWhen → always: true（測試原則通用） |
| rule | performance | 刪除 Turbopack/SWC 等技術棧建議 |
| hook | PostToolUse:Edit\|Write | 動態偵測 prettier（不硬編副檔名） |
| command | tdd/e2e/test-coverage/multi-frontend/test-gen | matchWhen → always: true |

原則：
- 靜態檔案（rules/commands/agents）= 通用的，任何專案都適用
- 動態生成（stacks/ + CLAUDE.md）= 技術棧特定的，AI 自動分析
- matchWhen 全部 always: true（v2 由角色分級決定部署範圍）

## 八、實作排期

### Phase A：基礎設施（v1.2.0）

| # | 任務 | 新增檔案 | 改動檔案 |
|---|------|---------|---------|
| A1 | 重命名 project-conventions → project-conventions | — | claude/rules/、README、config 相關 |
| A2 | config-classifier.mjs（全局/專案分類引擎）| `lib/config-classifier.mjs` | — |
| A3 | repo-detect.mjs（Spotlight 偵測本機路徑）| `lib/repo-detect.mjs` | — |
| A4 | generate-claude-md.mjs（3 種模板生成）| `lib/deploy/generate-claude-md.mjs` | — |

### Phase B：專案配置部署（v1.3.0）

| # | 任務 | 新增檔案 | 改動檔案 |
|---|------|---------|---------|
| B1 | phase-roles.mjs（Phase 2.5 角色選擇 UI）| `lib/phases/phase-roles.mjs` | — |
| B2 | deploy-global.mjs（全局配置部署）| `lib/deploy/deploy-global.mjs` | — |
| B3 | deploy-project.mjs（專案級配置注入）| `lib/deploy/deploy-project.mjs` | — |
| B4 | setup.mjs 整合 Phase 2.5 + Phase 3 | — | `bin/setup.mjs`、`lib/phases/phase-execute.mjs` |
| B5 | Phase 3.5 安裝後引導 | — | `lib/phases/phase-report.mjs` |

### Phase C：使用追蹤（v1.4.0）

| # | 任務 | 新增檔案 | 改動檔案 |
|---|------|---------|---------|
| C1 | tracker.mjs（session 解析 + 統計累加）| `lib/usage/tracker.mjs` | — |
| C2 | stats.mjs（CLI 統計指令）| `bin/stats.mjs` | `package.json` |
| C3 | Stop hook 注入 tracker | — | `claude/hooks.json` |

### Phase D：管理儀表板（v2.0.0）

| # | 任務 | 新增檔案 | 改動檔案 |
|---|------|---------|---------|
| D1 | server.mjs（本地 HTTP server）| `lib/dashboard/server.mjs` | — |
| D2 | api.mjs（REST API）| `lib/dashboard/api.mjs` | — |
| D3 | ui.html（自包含前端）| `lib/dashboard/ui.html` | — |
| D4 | dashboard.mjs（CLI 入口）| `bin/dashboard.mjs` | `package.json` |
| D5 | 報告增加 dashboard 入口 | — | `lib/report.mjs` |

### 里程碑

```
v1.2.0 — 基礎設施 + 重命名
v1.3.0 — 專案配置部署（核心功能）
v1.4.0 — 使用追蹤 + CLI 統計
v2.0.0 — 管理儀表板 + Web UI
```

## 九、風險與注意事項

| 風險 | 影響 | 緩解 |
|------|------|------|
| Spotlight 找不到 repo | 無法注入專案配置 | fallback 到 dist/projects/ + 手動指引 |
| 專案 .claude/ 被 .gitignore | 其他人看不到 | 生成 .gitignore 提示，讓用戶決定 |
| 使用追蹤 hook 影響效能 | Claude 停止時多 1-2 秒 | tracker 異步執行 + timeout 5s |
| 本地 server 埠號衝突 | dashboard 打不開 | 自動找空閒埠號 |
| CLAUDE.md 覆蓋用戶手寫的 | 丟失自訂內容 | 偵測已有 CLAUDE.md 時 merge 而非覆蓋 |

## 十、與 Sylvia 場景的對應

```
Sylvia 的需求                        v2.0 解決方案
─────────────────────────────────────────────────
「裝這麼多 skill 我不一定用得到」    → 使用統計 + 未使用提醒 + 一鍵移除
「沒時間學習」                       → 安裝後引導 Top 3 + dashboard 搜索
「跨組改別人的專案發 PR」            → 🔄 臨時角色：精簡 CLAUDE.md + 快速上手指引
「哪天 VM 有需求快速配置 bs-monorepo」→ Spotlight 偵測 + 角色選擇 + 注入配置
「commands/skills 無腦全裝嗎」       → 全局/專案分層，主力全裝、臨時精簡
「配置太多資訊量太大」               → dashboard 視覺化管理 + 搜索 + 篩選
```
