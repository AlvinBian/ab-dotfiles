# ab-dotfiles

Alvin Bian 個人開發工具包。統一管理 Claude Code 全域設定、KKday 開發規範、zsh 環境模組、工作區自動生成。

---

## 目錄結構

```
ab-dotfiles/
├── package.json               # pnpm 腳本入口
├── bin/
│   └── setup.mjs              # 統一互動式安裝 CLI（@clack/prompts）
│
├── claude/                    # Claude Code 設定（唯一 source of truth）
│   ├── commands/              # Slash commands（8 個）
│   ├── agents/                # 自定義 agents（explorer、reviewer）
│   ├── rules/                 # 規範檔案（git-workflow / code-style / kkday-conventions / slack-mrkdwn）
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
│   ├── generate-workspace.sh       # 自動掃描 git repos 生成工作區
│   ├── auto-update.sh              # 從 GitHub 拉取最新並針對性部署
│   ├── fetch-kkday-context.sh      # 抓取 KKday repos 上下文，打包專屬 plugin
│   └── setup-hooks.sh              # 安裝 git post-merge hook
│
└── dist/                           # 構建輸出（gitignored）
    ├── ab-dotfiles.plugin          # 智慧打包（pnpm run build）
    ├── ab-claude-dev.plugin        # 個人開發工具包（pnpm run build:dev）
    └── ab-slack-message.plugin     # Slack 格式工具（pnpm run build:slack）
```

---

## 快速開始

```bash
pnpm install          # 安裝依賴（首次）
pnpm run setup        # 互動式安裝精靈
```

---

## pnpm 指令

| 指令                 | 說明                                                          |
| -------------------- | ------------------------------------------------------------- |
| `pnpm run setup`     | 互動式安裝精靈 — 選擇 claude-dev / Slack 工具 / zsh 環境模組  |
| `pnpm run build`     | 智慧打包（依當前專案上下文合併）→ `ab-dotfiles.plugin`        |
| `pnpm run build:dev`   | 打包個人開發工具包（含 KKday 上下文）→ `ab-claude-dev.plugin`   |
| `pnpm run build:slack` | 打包 Slack 格式工具 → `ab-slack-message.plugin`                 |
| `pnpm run build:all`   | 同時打包 `ab-claude-dev.plugin` + `ab-slack-message.plugin`     |
| `pnpm run deploy`      | install Claude 設定 到 `~/.claude/` + 打包 `ab-claude-dev.plugin` |
| `pnpm run update`    | 從 GitHub 拉取最新，針對性部署變更                            |
| `pnpm run hooks`     | 安裝 git post-merge hook（pull 後自動更新）                   |
| `pnpm run workspace` | 掃描 git repos，生成工作區                                    |
| `pnpm run context`   | 抓取 KKday repos 上下文，打包專屬 plugin                      |
| `pnpm run fix`       | 修復開發環境（node/pnpm 衝突等）                              |

setup 支援 flag：
```bash
pnpm run setup -- --all     # 全部安裝
pnpm run setup -- --claude  # 只安裝 Claude 開發規則
pnpm run setup -- --slack   # 只安裝 Slack 格式工具
pnpm run setup -- --zsh     # 只安裝 zsh 環境模組
```

---

## 打包 Plugin（build）

| 指令                   | 輸出                      | 說明                                               |
| ---------------------- | ------------------------- | -------------------------------------------------- |
| `pnpm run build`       | `ab-dotfiles.plugin`      | 智慧打包：偵測當前專案 CLAUDE.md / tech stack 合併 |
| `pnpm run build:dev`   | `ab-claude-dev.plugin`    | 固定打包全部工具 + 自動整合 KKday repos 上下文     |
| `pnpm run build:slack` | `ab-slack-message.plugin` | Slack 格式工具（3 skills + slack-mrkdwn rule）     |
| `pnpm run build:all`   | 兩個 plugin               | 同時打包 dev + slack                               |

`pnpm run build:dev` 打包內容：

| 類型      | 來源                                                                   |
| --------- | ---------------------------------------------------------------------- |
| skills    | `claude/commands/` 全部（8 個）                                        |
| agents    | `claude/agents/` 全部（2 個）                                          |
| hooks     | `claude/hooks.json`                                                    |
| rules     | `claude/rules/` 全部（4 個）+ `~/.claude/rules/` 補全（不重複）       |
| CLAUDE.md | `ab.config.json` kkday_repos（需要 gh CLI 登入，離線自動跳過）         |

---

## GitHub 同步（按需）

更新不使用定時排程，只在需要時觸發：

| 方式            | 命令                           |
| --------------- | ------------------------------ |
| 手動更新        | `pnpm run update`              |
| git pull 後自動 | `pnpm run hooks` 安裝一次即可  |
| 預覽變更        | `pnpm run update -- --dry-run` |

針對性更新邏輯（只更新有改動的部分）：
```
claude/commands/xxx.md 變更  →  只更新 ~/.claude/commands/xxx.md
claude/agents/xxx.md 變更    →  只更新 ~/.claude/agents/xxx.md
claude/hooks.json 變更       →  只 merge hooks
zsh/modules/xxx.zsh 變更     →  只更新 ~/.zsh/modules/xxx.zsh
zsh/zshrc 變更               →  備份後更新 ~/.zshrc
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

### Slash Commands（8 個）

| 指令                 | 說明                                                  |
| -------------------- | ----------------------------------------------------- |
| `/auto-setup`        | 自動檢測專案環境並推薦配置（CLAUDE.md / rules / MCP） |
| `/code-review`       | KKday 規範深度審查（Vue/TS/PHP，嚴重度分級）          |
| `/kkday-conventions` | Vue/TS/PHP 開發規範查詢                               |
| `/pr-workflow`       | 分支 → commit → PR 描述 → 發 PR 全流程                |
| `/test-gen`          | 自動生成 Vitest / Jest 單元測試                       |
| `/slack-formatting`  | Slack mrkdwn 格式化規範                               |
| `/draft-slack`       | 生成結構化 Slack 訊息草稿                             |
| `/review-slack`      | 檢查 Slack 訊息格式合規                               |

### Agents（2 個）

| Agent       | 說明                                                            |
| ----------- | --------------------------------------------------------------- |
| `@explorer` | 快速掃描 codebase，動態探索所有本地 git 專案（Haiku，省 token） |
| `@reviewer` | 深度程式碼審查，KKday Vue/TS/PHP 規範合規（Sonnet）             |

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
