# ab-dotfiles 架構全覽

## 主流程（Phase Loop）

```
bin/setup.mjs（Orchestrator, ~140 行）
│
├─ 前置：--quick / --dry-run / 斷點續裝偵測
│
├─ Phase 1：意圖  lib/phases/phase-intent.mjs
│  ├─ ensureEnvironment()  ← lib/doctor.mjs
│  ├─ warmupCli()          ← lib/claude-cli.mjs（背景預熱）
│  ├─ smartSelect: targets ← lib/ui/prompts.mjs
│  └─ select: mode（有 session 跳過）
│
├─ Phase 2：分析  lib/phases/phase-analysis.mjs
│  ├─ interactiveRepoSelect()
│  │  └─ smartSelect（有 session 預選上次 repos）
│  ├─ runAnalysisPipeline()  ← lib/pipeline/pipeline-runner.mjs
│  │  ├─ Tier 1: analyzeRepo() 並行  ← lib/skill-detect.mjs
│  │  ├─ fetchAllSources() 並行      ← lib/source-sync.mjs
│  │  ├─ Tier 2: classifyRepo() 並行 ← lib/pipeline/repo-analyzer.mjs
│  │  │  └─ pMap() 並行控制           ← lib/utils/concurrency.mjs
│  │  ├─ mergeRepoResults()           ← lib/pipeline/merge-dedup.mjs
│  │  └─ 規則匹配 ECC 推薦（即時）
│  ├─ showRepoSummary() + 開發者畫像
│  ├─ smartSelect: 技術棧  ← lib/pipeline/tech-select-ui.mjs
│  └─ smartSelect: ECC     ← lib/pipeline/ecc-select-ui.mjs
│
├─ Phase 3：執行  lib/phases/phase-execute.mjs
│  ├─ backupIfExists() 並行  ← lib/backup.mjs
│  ├─ runScan() 生成 stacks/ ← bin/scan.mjs
│  ├─ writeSyncedFiles() ECC ← lib/source-sync.mjs
│  └─ runTarget() 循環       ← lib/install/index.mjs
│     ├─ handleInstallClaude()  ← smartSelect
│     ├─ handleBuildPlugin()
│     └─ handleInstallModules() ← smartSelect
│
└─ Phase 4：報告  lib/phases/phase-report.mjs
   ├─ verifyInstallation()（自動驗證）
   ├─ generateReport() HTML ← lib/report.mjs
   └─ saveSession()         ← lib/session.mjs
```

## 模組依賴圖

```
bin/setup.mjs
├── lib/phases/phase-intent.mjs
│   ├── lib/doctor.mjs
│   ├── lib/claude-cli.mjs (warmupCli)
│   └── lib/ui/prompts.mjs (smartSelect, handleCancel, BACK)
├── lib/phases/phase-analysis.mjs
│   ├── lib/repo-select.mjs → lib/github.mjs
│   ├── lib/pipeline/pipeline-runner.mjs
│   │   ├── lib/skill-detect.mjs
│   │   ├── lib/source-sync.mjs
│   │   ├── lib/claude-cli.mjs (callClaudeJSON)
│   │   ├── lib/utils/concurrency.mjs (pMap)
│   │   ├── lib/pipeline/repo-analyzer.mjs
│   │   ├── lib/pipeline/merge-dedup.mjs
│   │   └── lib/pipeline/audit-trail.mjs
│   ├── lib/pipeline/tech-select-ui.mjs
│   └── lib/pipeline/ecc-select-ui.mjs
├── lib/phases/phase-execute.mjs
│   ├── lib/backup.mjs
│   ├── lib/install/index.mjs
│   │   ├── lib/install/install-claude.mjs
│   │   ├── lib/install/install-modules.mjs
│   │   ├── lib/install/build-plugin.mjs
│   │   └── lib/install/common.mjs
│   └── lib/source-sync.mjs
└── lib/phases/phase-report.mjs
    ├── lib/report.mjs
    └── lib/session.mjs
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

## AI 模型策略

| 任務 | 模型 | 常量 |
|------|------|------|
| Per-repo 分類 | sonnet | AI_REPO_MODEL |
| ECC 推薦 | 規則匹配（不用 AI） | — |
| ECC 翻譯 | haiku（背景） | AI_ECC_MODEL |
| 技能生成 | haiku | AI_MODEL |
| 開發者畫像 | haiku | AI_PROFILE_MODEL |
| CLI 預熱 | haiku（背景） | — |

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
