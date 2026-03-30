# ab-dotfiles 架構全覽

## 主流程（3-Step Setup）

```
bin/setup.mjs（Orchestrator）
│
├─ 前置：v1→v2 升級偵測、--quick / --dry-run / session 重入
│        └─ detectV1Installation() / runUpgrade()  ← lib/upgrade.mjs
│
├─ Step 1：選擇倉庫  lib/repo-select.mjs
│  └─ GitHub 帳號 → 組織/個人 → 選 repos
│
├─ 自動分析  lib/phases/phase-analyze.mjs
│  ├─ runAnalysisPipeline()  ← lib/pipeline/pipeline-runner.mjs
│  ├─ detectLocalRepos()     ← lib/repo-detect.mjs（Spotlight）
│  ├─ generateProfile()      ← lib/pipeline/profile-generator.mjs
│  └─ generateInstallPlan()  ← lib/auto-plan.mjs
│
├─ Step 2：確認計畫  lib/phases/phase-plan.mjs
│  ├─ 現有配置偵測（~/.claude/）
│  ├─ p.note 展示完整計畫
│  └─ 安裝全部 / 逐項確認 / 精簡安裝
│
├─ 安裝  lib/phases/phase-execute.mjs（listr2）
│  ├─ [1/7] 備份          ← lib/backup.mjs
│  ├─ [2/7] 全局配置      ← lib/deploy/deploy-global.mjs
│  ├─ [3/7] Claude 安裝   ← lib/install/index.mjs
│  ├─ [4/7] ECC + Stacks  ← lib/source-sync.mjs + bin/scan.mjs
│  ├─ [5/7] Plugin 打包
│  ├─ [6/7] zsh 模組      ← lib/install/install-modules.mjs
│  └─ [7/7] 驗證
│
└─ Step 3：完成  lib/phases/phase-complete.mjs
   ├─ 安裝摘要（列出所有項目）
   ├─ generateReport() HTML ← lib/report.mjs
   └─ saveSession()         ← lib/session.mjs
```

## 模組依賴圖

```
bin/setup.mjs
├── lib/upgrade.mjs
├── lib/phases/phase-analyze.mjs
│   ├── lib/pipeline/pipeline-runner.mjs
│   │   ├── lib/skill-detect.mjs
│   │   ├── lib/source-sync.mjs
│   │   ├── lib/claude-cli.mjs (callClaudeJSON)
│   │   ├── lib/utils/concurrency.mjs (pMap)
│   │   ├── lib/pipeline/repo-analyzer.mjs
│   │   ├── lib/pipeline/merge-dedup.mjs
│   │   └── lib/pipeline/audit-trail.mjs
│   ├── lib/repo-detect.mjs
│   ├── lib/pipeline/profile-generator.mjs
│   └── lib/auto-plan.mjs
├── lib/phases/phase-plan.mjs
│   ├── lib/ui/prompts.mjs (smartSelect, handleCancel, BACK)
│   └── lib/auto-plan.mjs (generateMinimalPlan)
├── lib/phases/phase-execute.mjs
│   ├── lib/backup.mjs
│   ├── lib/deploy/deploy-global.mjs
│   │   └── deploySettings() + deployKeybindings()
│   ├── lib/install/index.mjs
│   │   ├── lib/install/install-claude.mjs
│   │   ├── lib/install/install-modules.mjs
│   │   ├── lib/install/build-plugin.mjs
│   │   └── lib/install/common.mjs
│   └── lib/source-sync.mjs
├── lib/phases/phase-complete.mjs
│   ├── lib/report.mjs
│   └── lib/session.mjs
└── lib/repo-select.mjs → lib/github.mjs
```

## 統一交互模式：smartSelect

所有選擇步驟遵循同一模式：

```
AI/規則預選 → 編號列表摘要 → 確認/調整/跳過/← 上一步
```

`lib/ui/prompts.mjs` 提供：
- `smartSelect()` — 統一的預選→確認→調整流程
- `multiselectWithAll()` — 帶全選的多選（連續滾動，不分頁）
- `handleCancel()` — ESC = BACK 回退, Ctrl+C = 退出
- `BACK` symbol — phase loop 中的回退信號

## 導航

| 按鍵 | 行為 |
|------|------|
| ESC | ← 回退上一步（返回 BACK symbol） |
| Ctrl+C | 直接退出（SIGINT handler） |
| Space | 選擇/取消選項 |
| Enter | 確認 |
| ↑↓ | 滾動列表 |

## matchWhen 條件預選

`lib/ui/preselect.mjs` + `lib/ui/files.mjs (extractMatchWhen)`

Claude 功能檔案的 YAML frontmatter 含 `matchWhen` 條件：

```yaml
---
name: kkday-conventions
matchWhen:
  org: ["kkday"]
  skills: ["vue", "typescript", "php"]
  matchMode: any
---
```

安裝時根據上下文（org, skills, targets）自動計算預選。
`matchWhen` 只控制預選，不限制手動選擇。

## 配置分類：全局 vs 專案

`lib/config-classifier.mjs` 定義兩層配置池：

- **全局**（`~/.claude/`）— 通用工具，任何專案都用（`GLOBAL_COMMANDS`, `GLOBAL_AGENTS`, `GLOBAL_RULES`）
- **專案**（`repo/.claude/`）— 技術棧匹配，按倉庫角色深淺（`PROJECT_COMMANDS`, `PROJECT_AGENTS`, `PROJECT_RULES`）

### 倉庫角色分類

`determineRole(repo)` 依 commit 數決定角色：

| 角色 | 條件 | 配置深度 |
|------|------|----------|
| `main` | commits ≥ 3 | 完整專案配置 |
| `temp` | commits > 0 | 精簡配置 |

`lib/deploy/deploy-project.mjs` 根據角色產出對應的 `.claude/` 結構。
`lib/deploy/generate-claude-md.mjs` 為專案生成 `CLAUDE.md`。

## Settings 合併策略

`lib/deploy/deploy-global.mjs` 部署全局配置時：

- **`settings.json`** — deep merge permissions（合併 allow/deny 陣列，去重），標量欄位（model, effortLevel 等）skip-if-exists
- **`keybindings.json`** — skip-if-exists，不覆蓋用戶已有的按鍵綁定

## AI 模型策略

| 任務 | 模型 | 常量 |
|------|------|------|
| Per-repo 分類 | sonnet | AI_REPO_MODEL |
| ECC 推薦 | 規則匹配（不用 AI） | — |
| ECC 翻譯 | haiku（背景） | AI_ECC_MODEL |
| 技能生成 | haiku | AI_MODEL |
| 開發者畫像 | haiku | AI_PROFILE_MODEL |

## Session 持久化

`lib/session.mjs` → `.cache/last-session.json`

保存：targets, mode, org, repos, techStacks, eccSelections, install
新增：progress（斷點續裝用）

有 session 重入時：
- targets/mode 用上次的
- org 自動選上次的
- repos smartSelect 預選上次的
- 排序步驟跳過

## 快取層

| 快取 | 位置 | 失效 |
|------|------|------|
| Per-repo AI | `.cache/repo-ai/` | deps 改變 |
| Taxonomy | `.cache/taxonomy/` | 手動 rebuild |
| ECC 來源 | `.cache/sources/` | 1h TTL / SHA |
| 翻譯 | `.cache/translations.json` | 手動清除 |
| Session | `.cache/last-session.json` | 每次 setup 覆寫 |
| Stacks | `.cache/stacks/` | 每次 setup 重生 |
| 審計鏈 | `.cache/audit/` | 保留最近 10 次 |
