# ab-dotfiles

Alvin Bian 的個人開發環境設定腳本。新機器初始化、Claude Code CLI 全域設定、Zsh 環境配置一鍵完成。

## 腳本清單

| 腳本 | 說明 |
|------|------|
| `setup-zsh.sh` | Zsh / Oh-My-Zsh 環境設定、plugins、aliases |
| `fix-dev-env.sh` | 開發環境問題修復（Node、pnpm、PHP 等） |
| `install-to-claude-code.sh` | Claude Code CLI 全域指令 & hooks 安裝（ab-claude-code + ab-slack-message） |

## 新機器初始化順序

```bash
# 1. clone 這個 repo
git clone git@github.com:AlvinBian/ab-dotfiles.git ~/scripts

# 2. 設定 Zsh 環境
bash ~/scripts/setup-zsh.sh

# 3. 修復開發環境
bash ~/scripts/fix-dev-env.sh

# 4. 安裝 Claude Code CLI 全域設定
bash ~/scripts/install-to-claude-code.sh
```

## Claude Code CLI 安裝後可用的指令

安裝完成後，在任何專案的 `claude` CLI 中輸入：

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

Subagents（對話中直接說）：
- `用 explorer agent 掃描...` → Haiku 模型快速掃描，省 token
- `用 reviewer agent 審查...` → Sonnet 深度程式碼審查

## 新增腳本

將 `.sh` 腳本放入此目錄，`chmod +x` 後 commit 即可。
