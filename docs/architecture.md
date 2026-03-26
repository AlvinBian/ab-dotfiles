# ab-dotfiles 架構全覽

## 主流程圖（`pnpm run setup`）

```
┌──────────────────────────────────────────────────────────────┐
│                    ab-dotfiles 安裝精靈                        │
│                     bin/setup.mjs                            │
└──────────────────────┬───────────────────────────────────────┘
                       │
                       ▼
         ┌─────────────────────────┐
         │  1. 環境檢查              │  lib/doctor.mjs
         │  Homebrew · nvm · Node   │  ensureEnvironment()
         │  pnpm · gh CLI          │  ← 缺什麼自動安裝
         └────────────┬────────────┘
                      │
                      ▼
         ┌─────────────────────────┐
         │  2. 選擇 GitHub 倉庫      │  lib/repo-select.mjs
         │  ├ gh auth 登入檢查       │  interactiveRepoSelect()
         │  ├ 選帳號/組織            │
         │  ├ 載入倉庫列表           │  lib/github.mjs → gh api
         │  ├ 貢獻度分析             │  search/commits → contributors
         │  ├ 排序（貢獻/活躍/星/大小）│
         │  └ 多選倉庫（有貢獻預選）   │  lib/ui.mjs → multiselectWithAll
         └────────────┬────────────┘
                      │
        ┌─────────────┴─────────────┐
        │           並行             │
        ▼                           ▼
┌───────────────┐         ┌──────────────────┐
│ 3a. 分析 repos │         │ 3b. 取得 ECC      │  lib/source-sync.mjs
│ ├ analyzeRepo │         │ ├ 快取檢查         │  fetchAllSources()
│ │ (GitHub API)│         │ │ ├ TTL < 1hr     │
│ ├ 取 techFiles│         │ │ │ → 直接用快取   │  dist/cache/sources/
│ │ package.json│         │ │ ├ SHA 未變       │
│ │ composer.json│        │ │ │ → 用快取       │
│ └ 收集 deps   │         │ │ └ 需更新         │
│   + 語言      │         │ │   → 下載全量     │  gh api → base64 decode
│               │         │ ├ commands (60)    │
│ lib/skill-    │         │ ├ agents (28)      │
│ detect.mjs    │         │ ├ rules/{lang}     │
│               │         │ └ hooks.json       │
└───────┬───────┘         └─────────┬──────────┘
        │                           │
        └─────────────┬─────────────┘
                      │ 兩者都完成
                      ▼
         ┌─────────────────────────┐
         │  4. 一次 AI 調用          │  claude --print (spawn + stdin)
         │  ├ 輸入：                 │
         │  │  · 所有 deps + 語言    │  npm + [php] composer
         │  │  · ECC 可用項目列表    │  commands/agents/rules
         │  ├ 輸出 JSON：            │
         │  │  · techStacks（分類）   │  { "框架": ["vue", "vitest"], ... }
         │  │  · ecc（推薦+理由）     │  { "commands": [{name, reason}], ...}
         │  └ fallback：語言偵測     │  AI 失敗時退化
         └────────────┬────────────┘
                      │
                      ▼
         ┌─────────────────────────┐
         │  5. 用戶選擇技術棧        │  lib/ui.mjs
         │  ├ 選分類（multiselect）  │  框架、測試、建構工具...
         │  ├ 每分類選具體項目        │  ≤3 個直接全選
         │  └ 自定義補充             │  p.text（逗號分隔）
         └────────────┬────────────┘
                      │
                      ▼
         ┌─────────────────────────┐
         │  6. 用戶選擇 ECC 項目     │  AI 推薦的預選 + 理由作為 hint
         │  ├ ECC Commands          │  ✨ 通用實作規劃工具
         │  ├ ECC Agents            │  ✨ 適合 Vue/TS 專案
         │  └ ECC Rules             │  ✨ TypeScript 安全規範
         └────────────┬────────────┘
                      │
                      ▼
         ┌─────────────────────────┐
         │  7. 生成技能庫 stacks/    │  bin/scan.mjs --skills
         │  ├ stacks/{tech}/        │  lib/ai-generate.mjs
         │  │  detect.json          │  ensureStack()
         │  │  code-review.md       │  ← AI 生成或預設模板
         │  │  test-gen.md          │
         │  │  code-style.md        │
         │  └ 總計 N 個 stacks      │
         └────────────┬────────────┘
                      │
                      ▼
         ┌─────────────────────────┐
         │  8. 選擇安裝目標          │
         │  ├ Claude Code 開發規則   │  commands + agents + rules + hooks
         │  ├ Slack 格式工具         │  slack commands + rules
         │  └ zsh 環境模組           │  modules + brew tools
         └────────────┬────────────┘
                      │
                      ▼
         ┌─────────────────────────┐
         │  9. 選擇安裝模式          │
         │  ├ 自動安裝               │  直接部署 + 打包 plugins
         │  └ 手動模式               │  生成到 dist/preview/
         └────────────┬────────────┘
                      │
                      ▼
         ┌─────────────────────────┐
         │  10. 備份                 │  lib/backup.mjs
         │  ├ ~/.claude/commands/   │  backupIfExists()
         │  ├ ~/.claude/agents/     │  → dist/backup/{timestamp}/
         │  ├ ~/.claude/rules/      │  只備份 ab-dotfiles 管理的
         │  ├ ~/.claude/hooks.json  │  不備份 sessions/cache/downloads
         │  ├ ~/.zshrc              │
         │  └ ~/.zsh/modules/       │
         └────────────┬────────────┘
                      │
                      ▼
         ┌─────────────────────────┐
         │  11. ECC 寫入             │  lib/source-sync.mjs
         │  ├ dist/preview/claude/  │  writeSyncedFiles()
         │  └ ~/.claude/ (自動模式)  │  只寫用戶確認的項目
         └────────────┬────────────┘
                      │
                      ▼
         ┌─────────────────────────┐
         │  12. 依序執行 targets     │  lib/install-handlers.mjs
         │                         │
         │  [1/3] Claude Code      │  handleInstallClaude()
         │  ├ 選 commands/agents   │  lib/ui.mjs → discoverItems
         │  ├ 選 rules             │
         │  ├ hooks 確認           │
         │  ├ 生成 preview         │  lib/preview.mjs
         │  │  ├ 合併 skill 片段   │  mergeSkillFragments()
         │  │  └ dist/preview/     │
         │  └ 自動模式：執行安裝    │  scripts/install-claude.sh
         │    └ spinner 進度       │  lib/ui.mjs → runWithProgress
         │                         │
         │  [1/3] 打包 plugin      │  handleBuildPlugin()
         │  ├ spinner 動畫         │  scripts/build-claude-dev-plugin.sh
         │  └ dist/release/*.plugin│
         │                         │
         │  [2/3] Slack 格式工具    │  skipIf: claude-dev 已安裝
         │  └ 同上流程              │  scripts/build-slack-plugin.sh
         │                         │
         │  [3/3] zsh 環境模組      │  handleInstallModules()
         │  ├ 選模組               │  zsh/modules/*.zsh
         │  ├ brew install 工具    │  fzf, bat, eza, fd, ...
         │  └ 安裝 + .zshrc       │  zsh/install.sh
         └────────────┬────────────┘
                      │
                      ▼
         ┌─────────────────────────┐
         │  13. 完成摘要             │  p.note()
         │  ├ dist/ 結構說明        │
         │  ├ 手動部署指令（手動模式）│
         │  └ 還原指令              │  pnpm run restore
         └────────────┬────────────┘
                      │
                      ▼
         ┌─────────────────────────┐
         │  14. 生成 HTML 報告       │  lib/report.mjs
         │  ├ 總覽卡片              │  generateReport(data)
         │  ├ ECharts 圖表          │
         │  │  ├ 技術棧分類統計      │  柱狀圖
         │  │  ├ 安裝項目分佈        │  圓餅圖
         │  │  └ Source 融合統計     │  堆疊柱狀圖
         │  ├ 倉庫列表              │
         │  ├ 技術棧（按分類）       │
         │  ├ Source 融合詳情        │  新增 / 跳過
         │  ├ 已安裝項目            │
         │  └ 備份路徑              │
         │                         │
         │  → dist/report.html     │  saveReport()
         │  → 瀏覽器打開            │  openInBrowser()
         └─────────────────────────┘
```

## 產出目錄結構

```
dist/
├── preview/                     ← 預覽（安裝前可查閱）
│   ├── claude/
│   │   ├── commands/*.md        ← ab-dotfiles + ECC 融合
│   │   ├── agents/*.md
│   │   ├── rules/*.md
│   │   └── hooks.json
│   └── zsh/
│       ├── modules/*.zsh
│       └── zshrc
├── release/                     ← 打包的 plugin
│   ├── ab-claude-dev.plugin
│   └── ab-slack-message.plugin
├── backup/                      ← 安裝前自動備份
│   └── {timestamp}/
│       ├── claude/commands/
│       ├── claude/agents/
│       ├── claude/rules/
│       ├── claude/hooks.json
│       ├── claude/settings.json
│       ├── zshrc
│       └── zsh/modules/
├── cache/                       ← Source 快取（避免重複下載）
│   └── sources/
│       └── everything-claude-code/
│           ├── .manifest.json   ← { sha, timestamp }
│           ├── commands/*.md
│           ├── agents/*.md
│           └── rules/*.md
└── report.html                  ← 安裝報告（ECharts 圖表）
```

## 模組依賴圖

```
bin/setup.mjs ─────────── 主流程編排（545 行）
  ├── lib/doctor.mjs ──── 環境檢查（120）
  ├── lib/repo-select.mjs 倉庫選擇（169）
  │   ├── lib/github.mjs   gh API 封裝（114）
  │   ├── lib/ui.mjs       CLI 工具（216）
  │   └── lib/constants.mjs 常量（29）
  ├── lib/skill-detect.mjs 技能偵測引擎（208）
  │   └── lib/github.mjs
  ├── lib/source-sync.mjs  Source 同步 + 快取（366）
  │   └── lib/github.mjs
  ├── lib/npm-classify.mjs 分類/噪音偵測（154）
  ├── lib/install-handlers.mjs 安裝處理器（315）
  │   ├── lib/ui.mjs
  │   └── lib/preview.mjs  預覽生成（138）
  │       ├── lib/backup.mjs 備份工具（61）
  │       └── lib/skill-detect.mjs
  ├── lib/backup.mjs
  ├── lib/report.mjs ───── 報告生成（312）
  └── lib/constants.mjs

bin/scan.mjs ──────────── 批量掃描（215 行）
  ├── lib/skill-detect.mjs
  ├── lib/tech-detect-api.mjs 多生態 API（365）
  │   ├── lib/github.mjs
  │   ├── lib/npm-classify.mjs
  │   └── lib/skill-detect.mjs
  └── lib/ai-generate.mjs  AI 生成（255）
      └── lib/skill-detect.mjs
```

## 快取策略

```
                     ┌────────────┐
                     │ 有快取？    │
                     └─────┬──────┘
                      yes  │  no
               ┌───────────┴──────┐
               ▼                  ▼
        ┌──────────┐       ┌───────────┐
        │ TTL < 1hr│       │ 首次下載    │
        └────┬─────┘       │ gh api ×N  │
         yes │ no          │ base64 解碼 │
        ┌────┴────┐        │ 存入快取    │
        ▼         ▼        └───────────┘
   ┌────────┐ ┌───────┐
   │直接用   │ │查 SHA  │ ← 1 個 API 請求
   │零請求   │ │        │
   └────────┘ └───┬────┘
              same│diff
              ┌───┴────┐
              ▼        ▼
         ┌───────┐ ┌────────┐
         │更新 ts │ │重新下載  │
         │用快取  │ │更新快取  │
         └───────┘ └────────┘
```

## AI 調用策略

```
一次 AI 調用 = 技術棧分類 + ECC 推薦

輸入：
  ├ 所有 npm deps（200+）
  ├ 所有 PHP deps（20+）
  ├ 所有語言（12）
  ├ ECC commands（60）
  ├ ECC agents（28）
  └ ECC rules（20+）

輸出 JSON：
  {
    "techStacks": {
      "框架": ["vue", "vitest"],
      "狀態管理": ["vuex"],
      ...
    },
    "ecc": {
      "commands": [{"name": "plan.md", "reason": "通用規劃"}],
      "agents": [{"name": "architect.md", "reason": "架構設計"}],
      "rules": [{"name": "coding-style.md", "reason": "TypeScript 風格"}]
    }
  }

方式：spawn('claude', ['--print']) + stdin pipe
超時：60 秒
Fallback：語言偵測 + ECC 全量顯示
```

## config.json 結構

```json
{
  "targets": {
    "claude-dev": { "label": "...", "steps": [...] },
    "slack":      { "label": "...", "steps": [...] },
    "zsh":        { "label": "...", "steps": [...] }
  },
  "sources": [
    {
      "name": "everything-claude-code",
      "repo": "affaan-m/everything-claude-code",
      "paths": {
        "commands": "commands",
        "agents": "agents",
        "rules": "rules/{lang}",
        "rulesCommon": "rules/common",
        "hooks": "hooks/hooks.json"
      },
      "priority": 10
    }
  ],
  "repos": ["org/repo1", "org/repo2"]
}
```
