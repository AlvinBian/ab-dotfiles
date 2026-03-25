# ab-dotfiles

Alvin Bian 個人開發工具包。統一管理 Claude Code 全域設定、KKday 開發規範、Zsh 模組化環境（Zinit + Powerlevel10k）、Kiro / VS Code 工作區自動生成。

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
│   └── hooks.json             # Hooks（PostToolUse / PreToolUse / SessionStart / Stop）
│
├── zsh/                       # Zsh 模組化環境（Zinit + p10k 架構）
│   ├── zshrc                  # ~/.zshrc 模板（含 p10k instant prompt）
│   ├── install.sh             # Zsh 安裝腳本（互動式 / --all / --modules）
│   ├── fix-env.sh             # 開發環境修復工具
│   └── modules/               # 8 個獨立模組（字母順序動態載入）
│       ├── zinit.zsh          # 插件管理核心 + p10k + fzf-tab + bindkey
│       ├── nvm.zsh            # Node 版本管理（lazy load）
│       ├── pnpm.zsh           # PNPM PATH
│       ├── history.zsh        # 歷史記錄（50k + 去重 + 跨 session）
│       ├── fzf.zsh            # FZF 環境設定（fd + bat 整合）
│       ├── tools.zsh          # 現代 CLI（bat / eza / zoxide / fd / tldr）
│       ├── git.zsh            # Git aliases + delta + lazygit
│       └── aliases.zsh        # 編輯器偵測 + 通用 aliases
│
├── scripts/                   # 構建 & 安裝腳本
│   ├── install-claude.sh      # 安裝到 ~/.claude/（支援 --commands/--agents/--hooks）
│   ├── build-plugin.sh        # 打包成 Cowork .plugin
│   └── generate-workspace.sh  # 自動掃描 git repos 生成工作區
│
└── dist/                      # 構建輸出（gitignored）
    └── ab-dotfiles.plugin
```

---

## 快速開始

```bash
# 安裝依賴
pnpm install

# 互動式安裝精靈（選擇 Claude / Zsh / 全部）
pnpm run setup

# 非互動式：全部安裝
pnpm run setup:all
```

---

## pnpm 指令

| 指令 | 說明 |
|------|------|
| `pnpm run setup` | 互動式安裝精靈（@clack/prompts TUI） |
| `pnpm run setup:all` | 全部安裝（非互動） |
| `pnpm run setup:claude` | 只安裝 Claude 設定 |
| `pnpm run setup:zsh` | 只安裝 Zsh 環境 |
| `pnpm run install:claude` | 直接執行 install-claude.sh（全部） |
| `pnpm run install:zsh` | 直接執行 zsh/install.sh --all |
| `pnpm run build:plugin` | 打包 dist/ab-dotfiles.plugin |
| `pnpm run deploy` | install:claude + build:plugin 一鍵完成 |
| `pnpm run workspace` | 生成 Kiro / VS Code 工作區 |
| `pnpm run workspace:open` | 生成並立即開啟工作區 |
| `pnpm run fix:env` | 修復開發環境（node/pnpm 衝突等） |

---

## Zsh 環境（Zinit + Powerlevel10k）

### 架構設計

```
~/.zshrc (由 zsh/zshrc 部署)
  └── 動態載入 ~/.zsh/modules/*.zsh（字母順序）
        ├── aliases.zsh
        ├── fzf.zsh
        ├── git.zsh
        ├── history.zsh
        ├── nvm.zsh
        ├── pnpm.zsh
        ├── tools.zsh
        └── zinit.zsh  ← 最後載入，啟動插件
```

### 插件清單（zinit.zsh 管理）

| 插件 | 說明 |
|------|------|
| romkatv/powerlevel10k | Prompt 主題，取代 Starship，支援 instant prompt |
| fast-syntax-highlighting | 語法高亮（比原版快 3-5x） |
| zsh-completions | 額外補全定義 |
| zsh-autosuggestions | 歷史自動提示 |
| Aloxaf/fzf-tab | Tab 補全整合 fzf 預覽視窗 |

### 安裝

```bash
# 互動式選擇模組
zsh zsh/install.sh

# 全部安裝
zsh zsh/install.sh --all

# 指定模組（由 setup.mjs 呼叫）
zsh zsh/install.sh --modules "zinit,nvm,git,tools,aliases"
```

### 首次設定 Powerlevel10k

```bash
# 安裝完成後重啟 terminal，Zinit 自動安裝 p10k
exec zsh

# 執行設定精靈（選擇 prompt 樣式）
p10k configure
# 設定完成後 ~/.p10k.zsh 自動被 zinit.zsh 載入
```

---

## Claude Code 設定

### 覆蓋範圍

| 工具 | 安裝方式 |
|------|---------|
| Claude Code CLI | `pnpm run install:claude` |
| Kiro / VS Code 插件 | `pnpm run install:claude` |
| Cowork Desktop App | `pnpm run build:plugin` → 拖入安裝 |

### Slash Commands（8 個）

| 指令 | 說明 |
|------|------|
| `/auto-setup` | 自動檢測專案環境並推薦配置（CLAUDE.md / rules / MCP） |
| `/code-review` | KKday 規範深度審查（Vue/TS/PHP，嚴重度分級） |
| `/kkday-conventions` | Vue/TS/PHP 開發規範查詢 |
| `/pr-workflow` | 分支 → commit → PR 描述 → 發 PR 全流程 |
| `/test-gen` | 自動生成 Vitest / Jest 單元測試 |
| `/slack-formatting` | Slack mrkdwn 格式化規範 |
| `/draft-slack` | 生成結構化 Slack 訊息草稿 |
| `/review-slack` | 檢查 Slack 訊息格式合規 |

### Agents（2 個）

| Agent | 說明 |
|-------|------|
| `@explorer` | 快速掃描 codebase，動態探索所有本地 git 專案（Haiku，省 token） |
| `@reviewer` | 深度程式碼審查，KKday Vue/TS/PHP 規範合規（Sonnet） |

兩個 agent 均使用 `find ~ -maxdepth 6 -name .git` **動態發現**本地所有 git repos，無硬編碼路徑。

### Hooks

| Hook 事件 | 功能 |
|-----------|------|
| PostToolUse（Edit/Write） | 自動執行 Prettier（TS/Vue/JS），PHP 語法檢查 |
| PreToolUse（Edit/Write） | 保護受保護檔案（.env、lock 檔等） |
| SessionStart | Context 壓縮後提示保留關鍵上下文 |
| Stop | 確認所有任務完成再結束 session |

---

## 工作區自動生成

`scripts/generate-workspace.sh` 掃描 `~/Documents/MyProjects/` 所有同級 git 專案（含 Study/ 子目錄），自動輸出 `.code-workspace` 檔供 Kiro / VS Code 開啟。

```bash
pnpm run workspace
# → ~/Documents/MyProjects/MyProjects.code-workspace

pnpm run workspace:open
# → 生成後立即用預設程式開啟
```

---

## Cowork Plugin 更新流程

```bash
# 1. 修改 claude/commands/ 或 claude/agents/
# 2. 一鍵重新安裝 CLI + 打包 plugin
pnpm run deploy

# 3. 將 dist/ab-dotfiles.plugin 拖入 Cowork Desktop App 重新安裝
```

---

## 需求

- macOS（Homebrew）
- Node.js ≥ 18
- pnpm ≥ 9
- zsh（macOS 預設）
