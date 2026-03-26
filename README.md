# ab-dotfiles

開發環境統一管理工具。自動偵測技術棧、整合 Claude Code 配置、zsh 環境模組、工作區生成。

---

## 目錄結構

```
ab-dotfiles/
├── package.json               # pnpm 腳本入口
├── bin/
│   ├── setup.mjs              # 統一互動式安裝 CLI（@clack/prompts）
│   ├── scan.mjs               # 全自動技術棧掃描 & stacks/ 生成
│   └── restore.mjs            # 還原備份
│
├── lib/
│   ├── skill-detect.mjs       # 技術棧偵測引擎（detect.json 匹配）
│   └── doctor.mjs             # 環境健康檢查
│
├── stacks/                    # 技術棧技能庫（scan 自動生成）
│   └── {tech}/                # 每個技術一個目錄
│       ├── detect.json        # 偵測規則（deps / files / languages）
│       ├── code-review.md     # 審查 checklist
│       ├── test-gen.md        # 測試模式與範例
│       └── code-style.md      # 命名慣例與格式規範
│
├── claude/                    # Claude Code 設定（唯一 source of truth）
│   ├── commands/              # Slash commands（7 個）
│   ├── agents/                # 自定義 agents（explorer、reviewer）
│   ├── rules/                 # 規範檔案（git-workflow / code-style / slack-mrkdwn）
│   └── hooks.json             # Hooks（PostToolUse / PreToolUse / SessionStart / Stop）
│
├── zsh/                       # zsh 環境模組（brew 原生）
│   ├── zshrc                  # ~/.zshrc 模板（~25 行，glob 載入子模組）
│   ├── install.sh             # zsh 環境模組安裝腳本（互動式 / --all / --modules）
│   ├── fix-env.sh             # 開發環境修復工具
│   └── modules/               # 10 個獨立模組（字母順序動態載入）
│       ├── aliases.zsh        # 編輯器偵測 + open -e + gh / uv + 通用 aliases
│       ├── completion.zsh     # zsh 補全（compinit + menu select）
│       ├── fzf.zsh            # FZF key-bindings + fd + bat 預覽
│       ├── git.zsh            # Git aliases + delta + lazygit
│       ├── history.zsh        # 歷史記錄（50k + 去重 + 跨 session）
│       ├── keybindings.zsh    # 按鍵綁定（Alt/Ctrl+←/→、↑↓前綴搜尋）
│       ├── nvm.zsh            # Node 版本管理（lazy load + .nvmrc 自動切換）
│       ├── plugins.zsh        # autosuggestions + syntax-highlighting + starship
│       ├── pnpm.zsh           # PNPM PATH
│       └── tools.zsh          # 現代 CLI（bat / eza / zoxide / fd / ripgrep / tldr）
│
├── scripts/                        # 構建 & 安裝腳本
│   ├── install-claude.sh           # 安裝到 ~/.claude/（支援 --commands/--agents/--hooks）
│   ├── build-claude-dev-plugin.sh  # 打包 ab-claude-dev.plugin
│   ├── build-slack-plugin.sh       # 打包 ab-slack-message.plugin
│   ├── build-plugin.sh             # 智慧打包
│   ├── generate-workspace.sh       # 自動掃描 git repos 生成工作區
│   └── auto-update.sh              # 從 GitHub 拉取最新並針對性部署
│
└── dist/                           # 構建輸出（gitignored）
    ├── ab-dotfiles.plugin          # 智慧打包
    ├── ab-claude-dev.plugin        # Claude Code 配置包
    └── ab-slack-message.plugin     # Slack 格式工具
```

---

## 快速開始

```bash
pnpm install          # 安裝依賴（首次）
pnpm run setup        # 互動式安裝精靈（自動建立 config.json）
```

> `config.json` 已加入 `.gitignore`，不會被追蹤。`pnpm run setup` 會引導你完成所有設定。

---

## pnpm 指令

| 指令                 | 說明                                                          |
| -------------------- | ------------------------------------------------------------- |
| `pnpm run setup`     | 互動式安裝精靈 — 選擇 claude-dev / Slack 工具 / zsh 環境模組  |
| `pnpm run scan`      | 全自動技術棧掃描，生成 stacks/ 目錄（`--init` 重建 / `--no-ai` 離線） |
| `pnpm run restore`   | 還原備份（從 dist/backup/ 恢復先前設定）                      |
| `pnpm run doctor`    | 環境健康檢查（node / pnpm / gh CLI / 依賴版本）               |
| `pnpm run workspace` | 掃描 git repos，生成 .code-workspace 工作區檔案               |

setup 支援 flag：
```bash
pnpm run setup -- --all      # 全部自動安裝
pnpm run setup -- --manual   # 手動模式（只生成到 dist/preview/，不自動部署）
pnpm run setup -- --claude   # 只安裝 Claude 開發規則
pnpm run setup -- --slack    # 只安裝 Slack 格式工具
pnpm run setup -- --zsh      # 只安裝 zsh 環境模組
```

### 安裝模式

| 模式 | 說明 |
|------|------|
| 自動（預設） | 直接部署到 `~/.claude/` / `~/.zsh/`，同時備份到 `dist/preview/` |
| 手動 | 只生成到 `dist/preview/`，用戶自行複製部署 |

手動模式下生成的檔案結構：
```
dist/preview/
├── claude/
│   ├── commands/    → cp -r dist/preview/claude/* ~/.claude/
│   ├── agents/
│   ├── rules/
│   └── hooks.json
└── zsh/
    ├── modules/     → cp dist/preview/zsh/modules/*.zsh ~/.zsh/modules/
    └── zshrc        → cp dist/preview/zsh/zshrc ~/.zshrc
```

---

## zsh 環境模組

### 架構設計

```
~/.zshrc（由 zsh/zshrc 部署，~25 行）
  └── 動態載入 ~/.zsh/modules/*.zsh（字母順序）
        ├── aliases.zsh      ← 編輯器偵測 + open -e + 通用 aliases
        ├── completion.zsh   ← zsh 補全（compinit + menu select）
        ├── fzf.zsh          ← FZF key-bindings + fd + bat 預覽
        ├── git.zsh          ← Git aliases + delta + lazygit
        ├── history.zsh      ← 歷史記錄 50k + dedup + share
        ├── keybindings.zsh  ← Alt/Ctrl+←/→、↑↓前綴搜尋
        ├── nvm.zsh          ← Node 版本管理（lazy load）
        ├── plugins.zsh      ← autosuggestions + syntax-highlighting
        ├── pnpm.zsh         ← PNPM PATH
        └── tools.zsh        ← bat / eza / zoxide / fd / ripgrep / tldr
```

### 依賴工具（brew 安裝）

| 工具                    | 用途                                |
| ----------------------- | ----------------------------------- |
| fzf                     | 模糊搜尋（Ctrl+R / Ctrl+T / Alt+C） |
| zoxide                  | 智慧目錄跳轉（`cd` → `z`）          |
| bat                     | 語法高亮 pager（`cat` → `bat`）     |
| eza                     | 現代 ls（`ls` / `ll` / `lt`）       |
| fd                      | 快速搜尋（`find` → `fd`）           |
| git-delta               | diff 語法高亮                       |
| lazygit                 | TUI git 介面（`lg`）                |
| tldr                    | 簡化版 man page（`help`）           |
| ripgrep                 | 快速全文搜尋                        |
| zsh-autosuggestions     | 歷史自動提示                        |
| zsh-syntax-highlighting | 指令語法高亮                        |

### 安裝

```bash
# 互動式選擇模組
zsh zsh/install.sh

# 全部安裝
zsh zsh/install.sh --all

# 指定模組（由 setup.mjs 呼叫）
zsh zsh/install.sh --modules "nvm,git,plugins,tools,aliases"
```

---

## Claude Code 設定

### 覆蓋範圍

| 工具                         | 安裝方式                                                          |
| ---------------------------- | ----------------------------------------------------------------- |
| Claude Code CLI              | `pnpm run setup -- --claude`                                      |
| Kiro / Cursor / VS Code 插件 | `pnpm run setup -- --claude`                                      |
| Cowork（開發規則）           | `pnpm run setup -- --claude` → 拖入 `dist/ab-claude-dev.plugin`   |
| Cowork（Slack 工具）         | `pnpm run setup -- --slack` → 拖入 `dist/ab-slack-message.plugin` |

### Slash Commands（7 個）

| 指令                 | 說明                                                  |
| -------------------- | ----------------------------------------------------- |
| `/auto-setup`        | 自動檢測專案環境並推薦配置（CLAUDE.md / rules / MCP） |
| `/code-review`       | 規範深度審查（嚴重度分級）                             |
| `/pr-workflow`       | 分支 → commit → PR 描述 → 發 PR 全流程                |
| `/test-gen`          | 自動生成 Vitest / Jest 單元測試                       |
| `/slack-formatting`  | Slack mrkdwn 格式化規範                               |
| `/draft-slack`       | 生成結構化 Slack 訊息草稿                             |
| `/review-slack`      | 檢查 Slack 訊息格式合規                               |

### Agents（2 個）

| Agent       | 說明                                                            |
| ----------- | --------------------------------------------------------------- |
| `@explorer` | 快速掃描 codebase，動態探索所有本地 git 專案（Haiku，省 token） |
| `@reviewer` | 深度程式碼審查，規範合規（Sonnet）                   |

兩個 agent 均使用 `find ~ -maxdepth 6 -name .git` **動態發現**本地所有 git repos，無硬編碼路徑。

### Hooks

| Hook 事件                 | 功能                                         |
| ------------------------- | -------------------------------------------- |
| PostToolUse（Edit/Write） | 自動執行 Prettier（TS/Vue/JS），PHP 語法檢查 |
| PreToolUse（Edit/Write）  | 保護受保護檔案（.env、lock 檔等）            |
| SessionStart              | Context 壓縮後提示保留關鍵上下文             |
| Stop                      | 確認所有任務完成再結束 session               |

---

## 工作區自動生成

`scripts/generate-workspace.sh` 掃描 `~/Documents/MyProjects/` 所有同級 git 專案（含 Study/ 子目錄），自動輸出 `.code-workspace` 檔供 Kiro / Cursor / VS Code 開啟。

```bash
pnpm run workspace
# → ~/Documents/MyProjects/MyProjects.code-workspace
```

---

## Cowork Plugin 更新流程

```bash
# 修改 claude/commands/ 或 claude/agents/ 後重新安裝並打包

# Claude 開發規則 plugin
pnpm run setup -- --claude
# → dist/ab-claude-dev.plugin 拖入 Cowork Desktop App

# Slack 格式工具 plugin
pnpm run setup -- --slack
# → dist/ab-slack-message.plugin 拖入 Cowork Desktop App
```

---

## 需求

- macOS（Homebrew）
- Node.js ≥ 18
- pnpm ≥ 9
- zsh（macOS 預設）
