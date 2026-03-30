# ab-dotfiles

開發環境統一管理工具 — AI 驅動的技術棧偵測、Claude Code 技能庫生成、zsh 環境模組。

## 零基礎安裝

什麼都沒裝？從這裡開始。

### macOS（一鍵腳本）

```bash
# 1. 安裝 Homebrew（如果沒有）
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 2. 安裝 nvm + Node.js
brew install nvm
mkdir -p ~/.nvm
echo 'export NVM_DIR="$HOME/.nvm"' >> ~/.zshrc
echo '[ -s "$(brew --prefix nvm)/nvm.sh" ] && . "$(brew --prefix nvm)/nvm.sh"' >> ~/.zshrc
source ~/.zshrc
nvm install 22
nvm use 22

# 3. 安裝 pnpm
corepack enable
corepack prepare pnpm@latest --activate

# 4. 安裝 GitHub CLI
brew install gh
gh auth login

# 5. 安裝 Claude Code CLI
npm install -g @anthropic-ai/claude-code

# 6. clone 並啟動
git clone https://github.com/AlvinBian/ab-dotfiles.git
cd ab-dotfiles
pnpm install
pnpm run setup
```

### 已有 Node.js 環境

```bash
git clone https://github.com/AlvinBian/ab-dotfiles.git
cd ab-dotfiles
pnpm install
pnpm run setup
```

### 環境要求

| 工具        | 最低版本 | 安裝方式                                                     |
| ----------- | -------- | ------------------------------------------------------------ |
| macOS       | —        | —                                                            |
| Homebrew    | —        | `/bin/bash -c "$(curl -fsSL ...)"`                           |
| nvm         | —        | `brew install nvm`                                           |
| Node.js     | 18+      | `nvm install 22`                                             |
| pnpm        | 9+       | `corepack enable && corepack prepare pnpm@latest --activate` |
| gh CLI      | —        | `brew install gh` → `gh auth login`                          |
| Claude Code | —        | `npm install -g @anthropic-ai/claude-code`                   |

`pnpm run doctor` 可檢查以上工具是否就緒。

### 平台支援

目前只支援 **macOS + zsh**。Linux / WSL 尚未測試，歡迎提 issue 或 PR。

---

## 安全說明

setup 會修改以下檔案/目錄，**每次安裝前自動備份**：

| 修改目標                     | 動作                         | 備份位置                                          |
| ---------------------------- | ---------------------------- | ------------------------------------------------- |
| `~/.claude/commands/`        | 寫入 slash commands          | `dist/backup/{timestamp}/claude/commands`         |
| `~/.claude/agents/`          | 寫入 agents                  | `dist/backup/{timestamp}/claude/agents`           |
| `~/.claude/rules/`           | 寫入 rules                   | `dist/backup/{timestamp}/claude/rules`            |
| `~/.claude/hooks.json`       | 寫入 hooks 設定              | `dist/backup/{timestamp}/claude/hooks.json`       |
| `~/.claude/settings.json`    | 合併 permissions + model     | `dist/backup/{timestamp}/claude/settings.json`    |
| `~/.claude/keybindings.json` | 寫入快捷鍵（skip if exists） | `dist/backup/{timestamp}/claude/keybindings.json` |
| `~/.claude/projects/`        | 寫入 CLAUDE.md               | 不備份（可重生）                                  |
| `~/.zshrc`                   | 替換為模組化版本             | `dist/backup/{timestamp}/zshrc`                   |
| `~/.zsh/modules/`            | 寫入 zsh 模組                | `dist/backup/{timestamp}/zsh/modules`             |

不想直接部署？用 `--manual` 模式：

```bash
pnpm run setup -- --manual
# 只生成到 dist/preview/，不動任何系統檔案
# 確認無誤後手動複製：
#   cp -r dist/preview/claude/* ~/.claude/
#   cp dist/preview/zsh/modules/*.zsh ~/.zsh/modules/
```

還原：`pnpm run restore`（互動式選擇備份版本）
完全還原到首次安裝前：`pnpm run restore-original`

---

## 功能概覽

```
pnpm run setup
  │
  ├─ 舊配置偵測（自動清理殘留）
  ├─ 環境檢查 + CLI 預熱
  ├─ 功能選擇（claude / claudemd / ecc / slack / zsh）
  ├─ Step 1：選擇倉庫
  │   ├─ GitHub 帳號 → 組織/個人 → 選 repos
  │   └─ 角色分配（⭐主力 / 🔄臨時 / 🔧工具）
  ├─ 自動分析（Listr2 並行）
  │   ├─ Per-repo AI 技術棧分析（並行，各自快取）
  │   ├─ fd / Spotlight 偵測本機路徑
  │   ├─ 開發者畫像（AI 推斷角色）
  │   ├─ ECC 規則匹配推薦（即時）
  │   └─ 生成安裝計畫
  ├─ Step 2：確認安裝計畫
  │   └─ 全部安裝 / 逐項確認 / 精簡安裝
  ├─ 安裝（listr2 8 步）
  │   ├─ [1/8] 備份現有配置
  │   ├─ [2/8] 全局配置（settings + keybindings + slack-dispatch）
  │   ├─ [3/8] Claude 安裝（commands + agents + rules + hooks）
  │   ├─ [4/8] ECC 融合 + Stacks 生成
  │   ├─ [5/8] CLAUDE.md 生成（~/.claude/projects/）
  │   ├─ [6/8] Plugin 打包
  │   ├─ [7/8] zsh 模組
  │   └─ [8/8] 驗證安裝完整性
  └─ Step 3：完成
      ├─ 安裝摘要 + 快速上手引導
      ├─ HTML 報告（5 Tab + ECharts）
      └─ Slack DM 通知（可選）
```

---

## 指令

| 指令                          | 說明                               |
| ----------------------------- | ---------------------------------- |
| `pnpm run setup`              | 互動式安裝精靈                     |
| `pnpm run setup -- --all`     | 全部自動安裝                       |
| `pnpm run setup -- --manual`  | 手動模式（只生成到 dist/preview/） |
| `pnpm run setup -- --quick`   | 用上次選擇快速安裝（0 次互動）     |
| `pnpm run setup -- --dry-run` | 只顯示安裝計畫，不寫入檔案         |
| `pnpm run scan`               | 技術棧掃描，生成 .cache/stacks/    |
| `pnpm run restore`            | 從備份還原（互動式選擇版本）       |
| `pnpm run restore-original`   | 還原到首次 setup 前的原始狀態      |
| `pnpm run uninstall`          | 移除 ab-dotfiles 管理的所有配置    |
| `pnpm run hooks`              | 互動式管理個別 hook 啟用/停用      |
| `pnpm run doctor`             | 環境健康檢查                       |
| `pnpm run workspace`          | 生成 .code-workspace               |
| `pnpm run taxonomy:build`     | 重建 awesome-* 分類索引            |

### 互動導航

| 按鍵   | 行為          |
| ------ | ------------- |
| ESC    | ← 回退上一步  |
| Ctrl+C | 退出安裝      |
| Space  | 選擇/取消選項 |
| Enter  | 確認          |
| ↑↓     | 滾動列表      |

---

## 目錄結構

```
ab-dotfiles/
├── bin/
│   ├── setup.mjs                # 安裝精靈入口
│   ├── scan.mjs                 # 技術棧掃描 & stacks/ 生成
│   ├── restore.mjs              # 備份還原
│   ├── restore-original.mjs     # 還原到首次安裝前
│   ├── backup-original.mjs      # 首次安裝前備份原始配置
│   ├── hooks.mjs                # hooks 互動式管理
│   └── uninstall.mjs            # 卸載工具
│
├── lib/
│   ├── pipeline/                # 分析 Pipeline
│   │   ├── pipeline-runner.mjs  # Orchestrator（並行 fetch + AI 分類 + ECC）
│   │   ├── repo-analyzer.mjs    # Per-repo AI 技術棧分類
│   │   ├── merge-dedup.mjs      # 跨 repo 整合去重（多數決仲裁）
│   │   ├── tech-select-ui.mjs   # 技術棧選擇互動 UI
│   │   ├── ecc-select-ui.mjs    # ECC 外部資源選擇 UI
│   │   ├── profile-generator.mjs # 開發者畫像（AI 推斷）
│   │   ├── audit-trail.mjs      # 決策審計鏈（JSONL）
│   │   └── pipeline-cache.mjs   # 統一快取層（content-addressed）
│   │
│   ├── taxonomy/                # 分類引擎
│   │   ├── classify.mjs         # 查表分類（零 AI，1373 套件）
│   │   ├── build.mjs            # 從 awesome-* 建構索引
│   │   ├── categories.json      # 標準分類定義
│   │   └── _generated/          # CI 預建索引（node/php 套件）
│   │
│   ├── cli/                     # 互動 UI 元件
│   │   ├── prompts.mjs          # handleCancel / smartSelect / multiselectWithAll
│   │   ├── progress.mjs         # runWithProgress / stripAnsi
│   │   ├── files.mjs            # discoverItems / extractMatchWhen
│   │   ├── preselect.mjs        # matchWhen 條件預選引擎
│   │   ├── preview.mjs          # dist/preview/ staging
│   │   └── task-runner.mjs      # Listr2 封裝（createTaskList）
│   │
│   ├── config/                  # 配置決策層
│   │   ├── auto-plan.mjs        # 自動決策引擎（generateInstallPlan）
│   │   ├── config-classifier.mjs # 角色判定 / 路徑編碼 / 常量
│   │   ├── descriptions.mjs     # 配置項中文描述（硬編碼 + AI 快取）
│   │   ├── npm-classify.mjs     # npm 噪音過濾 / 分類推斷
│   │   └── upgrade.mjs          # 舊配置偵測與清理
│   │
│   ├── core/                    # 基礎工具
│   │   ├── backup.mjs           # 備份 / 還原 / 清理
│   │   ├── concurrency.mjs      # pMap 並行控制
│   │   ├── constants.mjs        # 全域常量（從 .env 讀取）
│   │   ├── env.mjs              # .env 載入（不依賴 dotenv）
│   │   ├── paths.mjs            # ESM __dirname 工具
│   │   └── session.mjs          # Session 持久化（.cache/last-session.json）
│   │
│   ├── deploy/                  # 部署策略
│   │   ├── deploy-global.mjs    # settings.json 合併 / keybindings skip-if-exists
│   │   ├── deploy-project.mjs   # CLAUDE.md → ~/.claude/projects/
│   │   └── generate-claude-md.mjs # CLAUDE.md AI 生成（含靜態 fallback）
│   │
│   ├── detect/                  # 偵測引擎
│   │   ├── doctor.mjs           # 環境檢查 + 自動修復
│   │   ├── repo-detect.mjs      # 本機 repo 路徑偵測（fd / 文件夾 / Spotlight）
│   │   ├── repo-select.mjs      # GitHub 倉庫互動式選擇
│   │   ├── skill-detect.mjs     # 技術棧偵測引擎（stacks/*/detect.json）
│   │   └── tech-detect-api.mjs  # 多生態 API 查詢（npm / PHP / Python / Go）
│   │
│   ├── external/                # 外部服務封裝
│   │   ├── ai-generate.mjs      # AI 技能內容生成（scan.mjs 用）
│   │   ├── claude-cli.mjs       # Claude CLI 封裝（streaming + JSON）
│   │   ├── github.mjs           # GitHub API（REST + GraphQL 批次）
│   │   └── source-sync.mjs      # ECC Source 同步（快取 + 過濾 + 寫入）
│   │
│   ├── install/                 # 安裝處理器
│   │   ├── index.mjs            # runTarget() dispatcher
│   │   ├── install-claude.mjs   # commands / agents / rules / hooks 安裝
│   │   ├── install-modules.mjs  # zsh 模組安裝
│   │   ├── build-plugin.mjs     # .plugin 打包
│   │   ├── common.mjs           # selectItems / buildCmdArgs
│   │   ├── hooks-merge.mjs      # hooks 衝突偵測與合併
│   │   └── manifest.mjs         # plugin manifest 版本追蹤
│   │
│   ├── phases/                  # 安裝流程 Phase 拆分
│   │   ├── phase-analyze.mjs    # 自動分析（Pipeline + 路徑偵測 + 計畫生成）
│   │   ├── phase-plan.mjs       # 安裝計畫展示 + 確認/調整/精簡
│   │   ├── phase-execute.mjs    # 安裝執行（listr2 8 步）
│   │   └── phase-complete.mjs   # 完成（報告 + 引導 + session + Slack）
│   │
│   ├── slack/                   # Slack 整合
│   │   ├── slack-notify.mjs     # DM 通知（透過 Claude CLI MCP）
│   │   └── slack-setup.mjs      # 互動式 Slack 通知設定精靈
│   │
│   └── report.mjs               # HTML 安裝報告（ECharts + 5 Tab）
│
├── claude/                      # Claude Code 配置
│   ├── commands/                # 15 個 slash commands
│   ├── agents/                  # 13 個 agents
│   ├── rules/                   # 6 個規則
│   ├── hooks/                   # slack-dispatch.sh
│   ├── hooks.json               # 8 個 hooks 定義
│   ├── settings-template.json   # settings 模板
│   └── keybindings-template.json # 快捷鍵模板
│
├── ecc/                         # ECC 外部資源（GitHub Actions 自動同步）
│   └── everything-claude-code/  # 97 個檔案（60 cmd + 28 agent + 9 rule）
│
├── scripts/
│   ├── build-claude-dev-plugin.sh
│   ├── build-slack-plugin.sh
│   └── generate-workspace.sh
│
├── zsh/                         # zsh 環境模組
│   ├── zshrc                    # ~/.zshrc 模板
│   ├── modules/                 # 10 個獨立模組
│   └── install.sh               # 安裝腳本
│
├── .cache/                      # 快取（gitignored）
│   ├── repo-ai/                 # Per-repo AI 分類快取
│   ├── taxonomy/                # awesome-* 查表索引
│   ├── sources/                 # ECC 來源快取
│   ├── stacks/                  # 技能庫（每次 setup 重新生成）
│   ├── translations.json        # ECC 繁體中文翻譯快取
│   ├── last-session.json        # 上次安裝 session
│   └── audit/                   # 決策審計鏈（JSONL）
│
└── docs/
    ├── architecture.md          # 架構全覽
    └── refactor-plan-v2.md      # v2 重構方案
```

---

## Claude Code 配置

### Slash Commands（15 個）

| 指令                | 說明                              |
| ------------------- | --------------------------------- |
| `/auto-setup`       | 自動檢測專案環境並推薦配置        |
| `/code-review`      | 深度程式碼審查（嚴重度分級）      |
| `/pr-workflow`      | 分支 → commit → PR 全流程         |
| `/test-gen`         | 自動生成單元測試                  |
| `/draft-slack`      | 生成結構化 Slack 訊息（9 種場景） |
| `/slack-formatting` | Slack mrkdwn 格式指南             |
| `/review-slack`     | 檢查 Slack 訊息格式               |
| `/tdd`              | 測試驅動開發流程引導              |
| `/build-fix`        | 分析並修復 build 錯誤             |
| `/simplify`         | 簡化過度複雜的代碼                |
| `/refactor-clean`   | 清潔式重構（不改行為）            |
| `/e2e`              | 生成端對端測試                    |
| `/test-coverage`    | 提升測試覆蓋率                    |
| `/multi-frontend`   | 多前端專案協調                    |
| `/changeset`        | 生成 changeset / CHANGELOG        |

### Agents（13 個）

| Agent            | 模型   | 讀/寫 | 用途               |
| ---------------- | ------ | ----- | ------------------ |
| `@explorer`      | haiku  | 唯讀  | 快速搜索 codebase  |
| `@planner`       | sonnet | 唯讀  | 設計方案、拆解任務 |
| `@coder`         | sonnet | 讀寫  | 實作功能           |
| `@tester`        | sonnet | 讀寫  | 生成測試、跑測試   |
| `@reviewer`      | sonnet | 唯讀  | 深度 code review   |
| `@refactor`      | sonnet | 讀寫  | 重構優化           |
| `@debugger`      | sonnet | 讀寫  | 定位修復 bug       |
| `@documenter`    | sonnet | 讀寫  | 生成文件           |
| `@deployer`      | sonnet | 讀寫  | PR + Release       |
| `@monitor`       | haiku  | 唯讀  | 日誌分析、效能檢查 |
| `@security`      | sonnet | 唯讀  | 安全掃描           |
| `@migrator`      | sonnet | 讀寫  | 版本遷移           |
| `@perf-analyzer` | sonnet | 唯讀  | 效能分析           |

### Rules（6 個）

| Rule                  | 說明                                   |
| --------------------- | -------------------------------------- |
| `code-style`          | 格式、命名、函式設計規範               |
| `git-workflow`        | Conventional Commits + branch 命名     |
| `slack-mrkdwn`        | Slack mrkdwn 格式規範                  |
| `project-conventions` | 專案開發慣例（TypeScript / Vue / API） |
| `testing`             | 測試策略與覆蓋率規範                   |
| `performance`         | AI 模型選擇與 Context 管理策略         |

### Hooks（8 個，可個別選擇）

| Hook                   | 說明                              |
| ---------------------- | --------------------------------- |
| 自動格式化（prettier） | 寫檔後自動 prettier               |
| 自動格式化（eslint）   | 寫檔後自動 eslint                 |
| 檔案保護               | 阻止修改 .env、lock 等            |
| 危險命令攔截           | 阻止 rm -rf /、force push main 等 |
| Context 壓縮提示       | 壓縮時保留重要資訊                |
| 任務完成檢查           | 停止前確認任務完成                |
| macOS 通知             | 任務完成後系統通知                |
| 空提示檢查             | 阻止發送空白提示                  |

---

## 技術棧分析 Pipeline

```
repos fetch + ECC fetch（並行）
  → per-repo AI 分類（並行，各自快取）
  → awesome-* 查表驗證（1373 套件，80%+ 覆蓋率）
  → 跨 repo 整合去重（多數決仲裁）
  → 開發者畫像（AI 推斷角色）
  → 技術棧預選（主力 repo + 共用 + AI 核心分類）
  → ECC 規則匹配推薦（即時）
  → 決策審計鏈（JSONL）
```

### 快取策略

| 快取          | 位置                       | 失效條件                  |
| ------------- | -------------------------- | ------------------------- |
| Per-repo AI   | `.cache/repo-ai/`          | 該 repo deps 改變         |
| Taxonomy 索引 | `.cache/taxonomy/`         | `pnpm run taxonomy:build` |
| ECC 來源      | `.cache/sources/`          | 1h TTL 或 SHA 改變        |
| ECC 翻譯      | `.cache/translations.json` | 手動清除                  |
| 審計鏈        | `.cache/audit/`            | 保留最近 10 次            |
| Session       | `.cache/last-session.json` | 手動清除                  |
| Stacks        | `.cache/stacks/`           | 每次 setup 重新生成       |

---

## Slack 通知

setup 時可選擇啟用 Slack 通知，安裝完成後自動發送 DM 或頻道訊息。

**三種模式：**

| 模式    | 說明                                                     |
| ------- | -------------------------------------------------------- |
| Channel | 建立專屬頻道（如 `alvin-bian-notify`），所有通知集中管理 |
| DM      | 私發給自己，零配置立即可用                               |
| 關閉    | 不啟用通知                                               |

通知透過 Claude CLI 的 Slack MCP 發送，不需要 Bot Token。

---

## zsh 環境模組

### 模組清單

| 模組        | 說明                                     |
| ----------- | ---------------------------------------- |
| aliases     | 編輯器偵測 + 通用 aliases                |
| completion  | zsh 補全（menu select）                  |
| fzf         | 模糊搜尋（Ctrl+R / Ctrl+T）              |
| git         | Git aliases + delta + lazygit            |
| history     | 歷史記錄（50k + 去重 + 專案分離）        |
| keybindings | Alt/Ctrl 方向鍵                          |
| nvm         | Node 版本管理（lazy load）               |
| plugins     | autosuggestions + syntax-highlighting    |
| pnpm        | PNPM PATH                                |
| tools       | bat / eza / zoxide / fd / ripgrep / tldr |

### 依賴工具

```bash
# setup 會自動安裝，也可手動：
brew install fzf zoxide bat eza fd git-delta lazygit tldr ripgrep \
  zsh-autosuggestions zsh-syntax-highlighting
```

---

## 配置

### .env

首次執行時自動從 `.env.template` 建立。主要配置：

```bash
# AI 模型（per-repo 分類）
AI_REPO_MODEL=sonnet
AI_REPO_EFFORT=low
AI_REPO_TIMEOUT=60000
AI_REPO_CACHE=true

# ECC 翻譯（背景，haiku 足夠）
AI_ECC_MODEL=haiku
AI_ECC_TIMEOUT=90000

# 開發者畫像
AI_PROFILE_MODEL=haiku

# GitHub
GITHUB_ORG=
GH_API_TIMEOUT=15000

# ECC 外部來源
ECC_SOURCES=everything-claude-code|affaan-m/everything-claude-code|10

# AI 並發數
AI_CONCURRENCY=3

# Slack 通知
SLACK_NOTIFY_CHANNEL=
SLACK_NOTIFY_MODE=dm
```

### config.json

首次 `pnpm run setup` 時自動建立。定義安裝目標、步驟和 ECC 來源。

---

## 範例輸出

### setup 完成後的 dist/preview/ 結構

```
dist/preview/
├── claude/
│   ├── commands/          # 15 個
│   ├── agents/            # 13 個
│   ├── rules/             # 6 個
│   └── hooks.json
└── zsh/
    ├── modules/*.zsh      # 10 個
    └── zshrc
```

### .cache/stacks/ 技能庫範例

```
.cache/stacks/
├── vue/
│   ├── detect.json        # { "detect": { "deps": ["vue"] } }
│   ├── code-review.md     # Vue 組件審查 checklist
│   ├── test-gen.md        # Vue Test Utils 測試模式
│   └── code-style.md      # Vue SFC 命名慣例
├── nuxt/
│   ├── detect.json
│   └── code-review.md     # Nuxt SSR 審查要點
└── typescript/
    ├── detect.json
    └── ...
```

### 開發者畫像範例

```
ℹ 開發者畫像：

  👤 Vue 前端工程師
  🎯 核心技能: Vue / Nuxt SSR / TypeScript / 狀態管理（Pinia / Vuex）
  🏷️  電商平台 · 金流整合 · 多語系
  💡 專注 Vue 生態系的電商前端工程師，橫跨 SSR 應用與行動會員平台開發。
  🚀 即將根據你的技術棧，打造專屬的 Claude Code 技能庫
```

---

## 故障排除

```bash
# 環境檢查
pnpm run doctor

# 還原到上次備份
pnpm run restore

# 還原到首次 setup 前的原始狀態
pnpm run restore-original

# 重建分類索引
pnpm run taxonomy:build

# 清除所有快取（重新分析）
rm -rf .cache/
```

### 常見問題

**Q: `gh auth login` 失敗？**
```bash
gh auth login --web
```

**Q: Claude CLI 未安裝？**
```bash
npm install -g @anthropic-ai/claude-code
```

**Q: pnpm 找不到？**
```bash
corepack enable
corepack prepare pnpm@latest --activate
```

**Q: nvm 找不到？**
```bash
brew install nvm
# 然後重開終端或 source ~/.zshrc
```

**Q: 想移除所有 ab-dotfiles 安裝的配置？**
```bash
pnpm run uninstall
# 只移除 ab-dotfiles 管理的項目，保留用戶自訂配置
# 完全還原到安裝前：pnpm run restore-original
```
