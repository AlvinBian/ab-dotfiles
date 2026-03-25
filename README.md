# ab-dotfiles

Alvin Bian 個人開發工具包。管理 Claude Code 全域設定、KKday 開發規範、自動生成 Kiro / VS Code 工作區。

## 目錄結構

```
ab-dotfiles/
├── package.json              # pnpm 腳本入口
│
├── claude/                   # Claude Code 設定（唯一 source of truth）
│   ├── commands/             # Slash commands（/code-review、/pr-workflow 等）
│   ├── agents/               # 自定義 agents（explorer、reviewer）
│   └── hooks.json            # Hooks 設定（Prettier、lint、env 保護）
│
├── scripts/                  # 構建 & 安裝腳本
│   ├── install-claude.sh     # 安裝到 ~/.claude/（CLI / VSCode / JetBrains）
│   ├── build-plugin.sh       # 打包成 Cowork .plugin
│   ├── generate-workspace.sh # 生成 Kiro / VS Code 工作區
│   ├── setup-zsh.sh          # Zsh 環境初始化
│   └── fix-env.sh            # 開發環境修復
│
└── dist/                     # 構建輸出（gitignored）
    └── ab-dotfiles.plugin
```

## pnpm 指令

```bash
# 安裝 Claude Code 設定（CLI / VSCode / JetBrains 共用）
pnpm run install:claude

# 配置 Zsh 環境
pnpm run install:zsh

# 修復開發環境（node / pnpm 衝突等）
pnpm run install:env

# 全部一起安裝
pnpm run install:all

# 打包成 Cowork Desktop App 的 .plugin 檔
pnpm run build:plugin

# install:claude + build:plugin 一鍵完成
pnpm run deploy

# 生成 Kiro / VS Code 工作區（掃描 MyProjects/ 同級所有 git 專案）
pnpm run workspace

# 生成並立即用預設程式開啟工作區
pnpm run workspace:open
```

## 工作區生成

`scripts/generate-workspace.sh` 掃描 `~/Documents/MyProjects/` 所有同級 git 專案，
自動輸出 `MyProjects.code-workspace`，可直接在 Kiro 或 VS Code 開啟。

```bash
pnpm run workspace
# → ~/Documents/MyProjects/MyProjects.code-workspace

open ~/Documents/MyProjects/MyProjects.code-workspace
```

## Claude Code 覆蓋範圍

| 工具             | 方式                              |
| --------------- | --------------------------------- |
| Claude Code CLI  | `pnpm run install:claude`         |
| VS Code 插件     | `pnpm run install:claude`         |
| JetBrains 插件   | `pnpm run install:claude`         |
| Cowork Desktop   | `pnpm run build:plugin` + 拖入   |

## 更新流程

修改 `claude/commands/` 或 `claude/agents/` 後：

```bash
# CLI / VSCode 立即生效 + 重新打包 Cowork plugin
pnpm run deploy

# 將 dist/ab-dotfiles.plugin 拖入 Cowork Desktop App 重新安裝
```

## Slash Commands

| 指令                    | 說明                         |
| ---------------------- | ---------------------------- |
| `/auto-setup`          | 自動檢測專案環境並推薦配置    |
| `/code-review`         | KKday 規範深度審查            |
| `/kkday-conventions`   | Vue/TS/PHP 開發規範查詢       |
| `/pr-workflow`         | PR 分支→commit→發 PR 全流程  |
| `/test-gen`            | 自動生成 Vitest/Jest 測試     |
| `/slack-formatting`    | Slack mrkdwn 格式化           |
| `/draft-slack`         | 生成結構化 Slack 訊息         |
| `/review-slack`        | 檢查 Slack 訊息格式           |

## Agents

- **explorer** — 快速掃描 codebase，動態探索所有本地 git 專案（Haiku 省 token）
- **reviewer** — 深度程式碼審查，KKday Vue/TS/PHP 規範合規
