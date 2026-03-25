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
pnpm install          # 安裝依賴（首次）
pnpm run setup        # 互動式安裝精靈
```

---

## pnpm 指令

| 指令 | 說明 |
|------|------|
| `pnpm run setup` | 互動式安裝精靈 — 選擇 Claude / Zsh / 全部 |
| `pnpm run build` | 智慧打包插件（自動整合專案上下文） |
| `pnpm run deploy` | install Claude 設定 + 智慧打包插件 |
| `pnpm run update` | 從 GitHub 拉取最新，針對性部署變更 |
| `pnpm run hooks` | 安裝 git post-merge hook（pull 後自動更新） |
| `pnpm run workspace` | 掃描 git repos，生成工作區 |
| `pnpm run fix` | 修復開發環境（node/pnpm 衝突等） |

setup 支援 flag：
```bash
pnpm run setup -- --all / --claude / --zsh
```

---

## 智慧打包（build）

`pnpm run build` 執行時自動偵測專案上下文，整合既有配置再打包：

```
執行 pnpm run build
  ↓
① git pull 拿最新 ab-dotfiles 模板
② 偵測當前目錄：
   CLAUDE.md 存在？         → 提取規則嵌入 plugin.json
   .claude/commands/ 存在？  → 專案自訂指令（優先於同名模板）
   .claude/agents/ 存在？    → 專案自訂 agents
   package.json 存在？       → 偵測技術棧，過濾相關 commands
③ 合併：專案配置 > ab-dotfiles 模板
④ 打包 dist/ab-dotfiles.plugin
```

### 範例：從任意專案目錄打包

```bash
# 在 KKday b2c-web 專案中執行
cd ~/projects/b2c-web
pnpm run -C ~/Documents/MyProjects/ab-dotfiles build

# 或設定 alias：dotbuild → 隨時快速打包
```

### 技術棧自動偵測

| 偵測到 | 包含的 commands |
|--------|----------------|
| vue | code-review / kkday-conventions / test-gen |
| typescript | code-review / kkday-conventions / test-gen |
| php | code-review / kkday-conventions |
| 無特定技術棧 | 全部 commands |

所有專案都包含：`auto-setup` / `pr-workflow` / `draft-slack` / `slack-formatting`

---

## GitHub 同步（按需）

更新不使用定時排程，只在需要時觸發：

| 方式 | 命令 |
|------|------|
| 手動更新 | `pnpm run update` |
| git pull 後自動 | `pnpm run hooks` 安裝一次即可 |
| 預覽變更 | `pnpm run update -- --dry-run` |

針對性更新邏輯（只更新有改動的部分）：
```
claude/commands/xxx.md 變更  →  只更新 ~/.claude/commands/xxx.md
claude/agents/xxx.md 變更    →  只更新 ~/.claude/agents/xxx.md
claude/hooks.json 變更       →  只 merge hooks
zsh/modules/xxx.zsh 變更     →  只更新 ~/.zsh/modules/xxx.zsh
zsh/zshrc 變更               →  備份後更新 ~/.zshrc
```

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
