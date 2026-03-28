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

| 工具 | 最低版本 | 安裝方式 |
|------|---------|---------|
| macOS | — | — |
| Homebrew | — | `/bin/bash -c "$(curl -fsSL ...)"` |
| nvm | — | `brew install nvm` |
| Node.js | 18+ | `nvm install 22` |
| pnpm | 9+ | `corepack enable && corepack prepare pnpm@latest --activate` |
| gh CLI | — | `brew install gh` → `gh auth login` |
| Claude Code | — | `npm install -g @anthropic-ai/claude-code` |

`pnpm run doctor` 可檢查以上工具是否就緒。

### 平台支援

目前只支援 **macOS + zsh**。Linux / WSL 尚未測試，歡迎提 issue 或 PR。

---

## 安全說明

setup 會修改以下檔案/目錄，**每次安裝前自動備份**：

| 修改目標 | 動作 | 備份位置 |
|---------|------|---------|
| `~/.claude/commands/` | 寫入 slash commands | `dist/backup/{timestamp}/claude/commands` |
| `~/.claude/agents/` | 寫入 agents | `dist/backup/{timestamp}/claude/agents` |
| `~/.claude/rules/` | 寫入 rules | `dist/backup/{timestamp}/claude/rules` |
| `~/.claude/hooks.json` | 寫入 hooks | `dist/backup/{timestamp}/claude/hooks.json` |
| `~/.zshrc` | 替換為模組化版本 | `dist/backup/{timestamp}/zshrc` |
| `~/.zsh/modules/` | 寫入 zsh 模組 | `dist/backup/{timestamp}/zsh/modules` |

不想直接部署？用 `--manual` 模式：

```bash
pnpm run setup -- --manual
# 只生成到 dist/preview/，不動任何系統檔案
# 確認無誤後手動複製：
#   cp -r dist/preview/claude/* ~/.claude/
#   cp dist/preview/zsh/modules/*.zsh ~/.zsh/modules/
```

還原：`pnpm run restore`（互動式選擇備份版本）

---

## 功能概覽

```
pnpm run setup
  │
  ├─ 連結 GitHub → 選擇倉庫
  ├─ Per-repo AI 技術棧分析（並行）
  ├─ Taxonomy 查表分類（awesome-nodejs/php，1300+ 套件）
  ├─ 跨 repo 整合去重
  ├─ 開發者畫像（AI 推斷角色）
  ├─ 技術棧選擇（預選 + 確認）
  ├─ ECC 外部資源（AI 推薦 + 選擇）
  ├─ 生成 stacks/ 技能庫
  ├─ 安裝 Claude Code 配置（commands / agents / rules / hooks）
  ├─ 安裝 zsh 環境模組
  └─ 生成 HTML 報告
```

---

## 指令

| 指令 | 說明 |
|------|------|
| `pnpm run setup` | 互動式安裝精靈 |
| `pnpm run setup -- --all` | 全部自動安裝 |
| `pnpm run setup -- --manual` | 手動模式（只生成到 dist/preview/） |
| `pnpm run scan` | 技術棧掃描，生成 stacks/ |
| `pnpm run restore` | 從備份還原 |
| `pnpm run doctor` | 環境健康檢查 |
| `pnpm run workspace` | 生成 .code-workspace |
| `pnpm run taxonomy:build` | 重建 awesome-* 分類索引 |

---

## 目錄結構

```
ab-dotfiles/
├── bin/
│   ├── setup.mjs                # 安裝精靈
│   ├── scan.mjs                 # 技術棧掃描
│   └── restore.mjs              # 還原備份
│
├── lib/
│   ├── pipeline/                # 分析 Pipeline
│   │   ├── pipeline-runner.mjs  # Orchestrator
│   │   ├── repo-analyzer.mjs    # Per-repo AI 分類
│   │   ├── merge-dedup.mjs      # 跨 repo 整合去重
│   │   ├── tech-select-ui.mjs   # 技術棧選擇 UI
│   │   ├── ecc-select-ui.mjs    # ECC 選擇 UI
│   │   ├── profile-generator.mjs # 開發者畫像
│   │   ├── audit-trail.mjs      # 決策審計鏈
│   │   └── pipeline-cache.mjs   # 統一快取
│   ├── taxonomy/                # 分類引擎
│   │   ├── classify.mjs         # 查表分類（零 AI）
│   │   ├── build.mjs            # 從 awesome-* 建構索引
│   │   └── categories.json      # 標準分類定義
│   ├── claude-cli.mjs           # Claude CLI 封裝（streaming）
│   ├── github.mjs               # GitHub API（GraphQL）
│   └── ...
│
├── claude/                      # Claude Code 配置
│   ├── commands/                # 7 個 slash commands
│   ├── agents/                  # 10 個 agents
│   ├── rules/                   # 3 個規則
│   └── hooks.json               # 4 個 hooks
│
├── stacks/                      # 技能庫（setup 生成）
│   └── {tech}/
│       ├── detect.json          # 偵測規則
│       ├── code-review.md       # 審查 checklist
│       ├── test-gen.md          # 測試模式
│       └── code-style.md        # 命名慣例
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
│   └── audit/                   # 決策審計鏈
│
└── docs/
    └── scaffold-plan.md         # 腳手架方案規劃
```

---

## Claude Code 配置

### Slash Commands（7 個）

| 指令 | 說明 |
|------|------|
| `/auto-setup` | 自動檢測專案環境並推薦配置 |
| `/code-review` | 深度程式碼審查（嚴重度分級） |
| `/pr-workflow` | 分支 → commit → PR 全流程 |
| `/test-gen` | 自動生成單元測試 |
| `/draft-slack` | 生成結構化 Slack 訊息（9 種場景） |
| `/slack-formatting` | Slack mrkdwn 格式指南 |
| `/review-slack` | 檢查 Slack 訊息格式 |

### Agents（10 個）

| Agent | 模型 | 讀/寫 | 用途 |
|-------|------|-------|------|
| `@explorer` | haiku | 唯讀 | 快速搜索 codebase |
| `@planner` | sonnet | 唯讀 | 設計方案、拆解任務 |
| `@coder` | sonnet | 讀寫 | 實作功能 |
| `@tester` | sonnet | 讀寫 | 生成測試、跑測試 |
| `@reviewer` | sonnet | 唯讀 | 深度 code review |
| `@refactor` | sonnet | 讀寫 | 重構優化 |
| `@debugger` | sonnet | 讀寫 | 定位修復 bug |
| `@documenter` | sonnet | 讀寫 | 生成文件 |
| `@deployer` | sonnet | 讀寫 | PR + Release |
| `@monitor` | haiku | 唯讀 | 日誌分析、效能檢查 |

### Hooks（4 個，可個別選擇）

| Hook | 說明 |
|------|------|
| 自動格式化 | 寫檔後 prettier / php -l |
| 檔案保護 | 阻止修改 .env、lock 等 |
| Context 壓縮提示 | 壓縮時保留重要資訊 |
| 任務完成檢查 | 停止前確認任務完成 |

---

## 技術棧分析 Pipeline

```
repos fetch + ECC fetch（並行）
  → per-repo AI 分類（並行，各自快取）
  → awesome-* 查表驗證（1373 套件，80%+ 覆蓋率）
  → 跨 repo 整合去重（多數決仲裁）
  → 開發者畫像（AI 推斷角色）
  → 技術棧預選（主力 repo + 共用 + AI 核心分類）
  → ECC AI 推薦（背景並行）
  → 決策審計鏈（JSONL）
```

### 快取策略

| 快取 | 位置 | 失效條件 |
|------|------|---------|
| Per-repo AI | `.cache/repo-ai/` | 該 repo deps 改變 |
| Taxonomy 索引 | `.cache/taxonomy/` | `pnpm run taxonomy:build` |
| ECC 來源 | `.cache/sources/` | 1h TTL or SHA 改變 |
| 審計鏈 | `.cache/audit/` | 保留最近 10 次 |

---

## zsh 環境模組

### 模組清單

| 模組 | 說明 |
|------|------|
| aliases | 編輯器偵測 + 通用 aliases |
| completion | zsh 補全（menu select） |
| fzf | 模糊搜尋（Ctrl+R / Ctrl+T） |
| git | Git aliases + delta + lazygit |
| history | 歷史記錄（50k + 去重） |
| keybindings | Alt/Ctrl 方向鍵 |
| nvm | Node 版本管理（lazy load） |
| plugins | autosuggestions + syntax-highlighting |
| pnpm | PNPM PATH |
| tools | bat / eza / zoxide / fd / ripgrep / tldr |

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

# GitHub
GITHUB_ORG=
GH_API_TIMEOUT=15000

# ECC 外部來源
ECC_SOURCES=everything-claude-code|affaan-m/everything-claude-code|10

# AI 並發數
AI_CONCURRENCY=3
```

### config.json

首次 `pnpm run setup` 時自動建立。定義安裝目標和步驟。

---

## 範例輸出

### setup 完成後的 dist/preview/ 結構

```
dist/preview/
├── claude/
│   ├── commands/
│   │   ├── auto-setup.md
│   │   ├── code-review.md
│   │   ├── draft-slack.md
│   │   ├── pr-workflow.md
│   │   ├── review-slack.md
│   │   ├── slack-formatting.md
│   │   └── test-gen.md
│   ├── agents/
│   │   ├── coder.md
│   │   ├── debugger.md
│   │   ├── deployer.md
│   │   ├── documenter.md
│   │   ├── explorer.md
│   │   ├── monitor.md
│   │   ├── planner.md
│   │   ├── refactor.md
│   │   ├── reviewer.md
│   │   └── tester.md
│   ├── rules/
│   │   ├── code-style.md
│   │   ├── git-workflow.md
│   │   └── slack-mrkdwn.md
│   └── hooks.json
└── zsh/
    ├── modules/*.zsh (10 個)
    └── zshrc
```

### stacks/ 技能庫範例

```
stacks/
├── vue/
│   ├── detect.json        # { "detect": { "deps": ["vue"] } }
│   ├── code-review.md     # Vue 組件審查 checklist
│   ├── test-gen.md         # Vue Test Utils 測試模式
│   └── code-style.md       # Vue SFC 命名慣例
├── nuxt/
│   ├── detect.json
│   ├── code-review.md     # Nuxt SSR 審查要點
│   └── ...
└── typescript/
    ├── detect.json
    └── ...
```

### 開發者畫像範例

```
ℹ 開發者畫像：

  Vue 前端工程師

  核心技能: Vue / Nuxt SSR / TypeScript / 狀態管理（Pinia / Vuex）
  + 電商平台 · 金流整合 · 多語系

  專注 Vue 生態系的電商前端工程師，橫跨 SSR 應用與行動會員平台開發。

  即將根據你的技術棧，打造專屬的 Claude Code 技能庫
```

---

## 故障排除

```bash
# 環境檢查
pnpm run doctor

# 還原到上次備份
pnpm run restore

# 重建分類索引
pnpm run taxonomy:build

# 清除所有快取
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
