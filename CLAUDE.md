# ab-dotfiles

開發環境統一管理工具 — AI 驅動的技術棧偵測、Claude Code 技能庫生成、ZSH 環境模組。

## 技術棧

- **Node.js 18+** — 運行環境，pnpm@9.15.5 作為包管理器
- **@clack/prompts** — CLI 互動提示，提供友善的設置流程
- **listr2** — 任務列表管理，展示安裝步驟進度
- **TypeScript/ESM** — 使用 `.mjs` 原生模組，無 bundler 依賴

## 架構要點

1. **模組化安裝** — 三大目標（Claude Code、Slack、ZSH）各自獨立，按需選擇
2. **外源抓取** — 支持從 GitHub 倉庫（如 everything-claude-code）動態導入 commands/agents/rules
3. **Plugin 打包** — 構建獨立的 Claude Code plugin 檔案（ab-claude-dev.plugin），含上下文
4. **ZSH 模組系統** — bin/ 包含 setup/restore/status 等核心指令，zsh/ 包含環境模組
5. **智能檢測** — `doctor` 和 `scan` 自動探測技術棧並推薦對應規則

## 開發規範

- **分支命名** — `<type>/<TICKET>-<short-desc>`（如 `feat/PROJ-100-add-setup`）
- **Commit 格式** — Conventional Commits，使用 changeset 管理版本
- **版本發布** — `pnpm run release` 自動打 Git tag
- **Plugin 構建** — 修改 commands/agents/rules 後需重新執行 `pnpm run setup`

## 常用指令

```bash
pnpm run setup       # 完整設置流程（交互式選擇目標）
pnpm run status      # 檢查已安裝的組件
pnpm run scan        # 掃描系統技術棧並推薦規則
pnpm run restore     # 還原為上次備份
pnpm run doctor      # 環境診斷與依賴檢查
pnpm run workspace   # 生成工作區配置
pnpm run hooks       # 管理 git hooks
```
