# ab-dotfiles

Alvin Bian 個人開發工具包。管理 Claude Code 全域設定、KKday 開發規範、自動生成 Kiro / VS Code 工作區。

## 目錄結構

```
ab-dotfiles/
├── package.json              # pnpm 腳本入口
├── claude-commands/          # Slash commands（/code-review、/pr-workflow 等）
├── claude-agents/            # 自定義 agents（explorer、reviewer）
├── claude-hooks.json         # Hooks 設定（Prettier、lint、env 保護）
├── install-to-claude-code.sh # 安裝到 Claude Code CLI / VSCode
├── build-cowork-plugin.sh    # 打包成 Cowork .plugin 檔
├── generate-workspace.sh     # 自動生成 Kiro / VS Code 工作區
├── setup-zsh.sh              # Zsh 環境初始化
└── fix-dev-env.sh            # 開發環境修復工具
```

## 快速開始

```bash
# 安裝依賴（可選，只需 pnpm scripts）
pnpm install

# 安裝到 Claude Code CLI / VSCode / JetBrains
pnpm run install:claude

# 打包成 Cowork Desktop App 的 .plugin 檔
pnpm run build:plugin

# 一鍵同時部署 CLI + Cowork
pnpm run deploy

# 生成 Kiro / VS Code 工作區（掃描同級所有 git 專案）
pnpm run workspace
```

## 工作區生成

`generate-workspace.sh` 會掃描 `~/Documents/MyProjects/` 下所有 git 專案（含 Study/ 子目錄），
自動輸出 `MyProjects.code-workspace`，可直接在 Kiro 或 VS Code 開啟。

```bash
pnpm run workspace
# → 輸出：~/Documents/MyProjects/MyProjects.code-workspace

# 用 Kiro 開啟
open ~/Documents/MyProjects/MyProjects.code-workspace
```

## Claude Code 覆蓋範圍

| 工具            | 方式                            |
| -------------- | ------------------------------- |
| Claude Code CLI | `pnpm run install:claude`       |
| VS Code 插件    | `pnpm run install:claude`       |
| JetBrains 插件  | `pnpm run install:claude`       |
| Cowork Desktop | `pnpm run build:plugin` + 拖入  |

## 更新流程

修改 `claude-commands/` 或 `claude-agents/` 後：

```bash
# 1. CLI / VSCode 立即生效
pnpm run install:claude

# 2. 重新打包 Cowork plugin
pnpm run build:plugin

# 3. 將 ab-dotfiles.plugin 拖入 Cowork Desktop App 重新安裝
```

## Slash Commands

| 指令               | 說明                         |
| ----------------- | ---------------------------- |
| `/auto-setup`     | 自動檢測專案環境並推薦配置    |
| `/code-review`    | KKday 規範深度審查            |
| `/kkday-conventions` | Vue/TS/PHP 開發規範查詢    |
| `/pr-workflow`    | PR 分支→commit→發 PR 全流程  |
| `/test-gen`       | 自動生成 Vitest/Jest 測試     |
| `/slack-formatting` | Slack mrkdwn 格式化         |
| `/draft-slack`    | 生成結構化 Slack 訊息         |
| `/review-slack`   | 檢查 Slack 訊息格式           |

## Agents

- **explorer** — 快速掃描 codebase，動態探索所有本地 git 專案（Haiku 省 token）
- **reviewer** — 深度程式碼審查，KKday Vue/TS/PHP 規範合規
