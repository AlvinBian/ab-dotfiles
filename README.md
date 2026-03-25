# ab-dotfiles

Alvin Bian 的個人開發環境設定腳本。新機器初始化、Claude Code CLI 全域設定、Zsh 環境配置一鍵完成。

## 本機專案目錄

| 路徑 | 用途 |
|------|------|
| `~/Kkday/Projects/kkday-b2c-web` | KKday B2C Web（Nuxt 3 + Vue + TypeScript） |
| `~/Kkday/Projects/kkday-member-ci` | KKday Member CI（CodeIgniter + Vue 2.7 + TypeScript） |
| `~/Documents/MyProjects/ab-flash` | 個人專案 ab-flash（Python） |
| `~/Documents/MyProjects/Study/` | 學習 / 練習專案 |

## 腳本清單

| 腳本 | 說明 |
|------|------|
| `setup-zsh.sh` | Zsh / Oh-My-Zsh 環境設定、plugins、aliases |
| `fix-dev-env.sh` | 開發環境問題修復（Node、pnpm、PHP 等） |
| `install-to-claude-code.sh` | Claude Code CLI 全域指令 & hooks 安裝（CLI / VSCode / JetBrains） |
| `build-cowork-plugin.sh` | 打包 ab-dotfiles.plugin，供 Cowork Desktop App 安裝 |

## 新機器初始化順序

```bash
# 1. clone 這個 repo
git clone git@github.com:AlvinBian/ab-dotfiles.git ~/Documents/MyProjects/ab-dotfiles

# 2. 設定 Zsh 環境
bash ~/Documents/MyProjects/ab-dotfiles/setup-zsh.sh

# 3. 修復開發環境
bash ~/Documents/MyProjects/ab-dotfiles/fix-dev-env.sh

# 4-a. Claude Code CLI / VSCode / JetBrains
bash ~/Documents/MyProjects/ab-dotfiles/install-to-claude-code.sh

# 4-b. Cowork Desktop App
bash ~/Documents/MyProjects/ab-dotfiles/build-cowork-plugin.sh
# → 將 ~/Documents/MyProjects/ab-dotfiles/ab-dotfiles.plugin 拖入 Cowork 安裝
```

## Claude Code 全客戶端共用

```
~/Documents/MyProjects/ab-dotfiles/claude-commands/*.md   ← 唯一 source of truth
~/Documents/MyProjects/ab-dotfiles/claude-agents/*.md
~/Documents/MyProjects/ab-dotfiles/claude-hooks.json
         │
         ├── install-to-claude-code.sh → ~/.claude/  → ✅ CLI + VSCode + JetBrains
         └── build-cowork-plugin.sh    → ab-dotfiles.plugin → ✅ Cowork
```

## 可用指令（安裝後）

| 指令 | 功能 |
|------|------|
| `/code-review` | KKday Vue/TS/PHP 程式碼審查 |
| `/pr-workflow` | 分支 → commit → 發 PR 完整流程 |
| `/test-gen` | 自動生成 Vitest / Jest / PHPUnit 測試 |
| `/kkday-conventions` | KKday 開發規範速查 |
| `/auto-setup` | 新專案環境自動偵測與設定 |
| `/draft-slack` | 生成符合 mrkdwn 格式的 Slack 訊息 |
| `/review-slack` | 審查 Slack 訊息格式 |
| `/slack-formatting` | Slack mrkdwn 語法完整參考 |

Subagents：`explorer`（Haiku，省 token 掃描）、`reviewer`（Sonnet，深度審查）

## 更新 skill 流程

```bash
# 修改 claude-commands/ 或 claude-agents/ 後：
bash ~/Documents/MyProjects/ab-dotfiles/install-to-claude-code.sh   # CLI/VSCode 立即生效
bash ~/Documents/MyProjects/ab-dotfiles/build-cowork-plugin.sh      # 重新打包 → 拖入 Cowork
git add -A && git commit -m "..." && git push
```
