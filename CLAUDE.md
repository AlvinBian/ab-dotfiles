# ab-dotfiles

AI 驅動的開發環境統一管理工具 — 自動化技術棧偵測、Claude Code 技能庫生成、ZSH 環境配置。

## 技術棧

- **Node.js 18+** — 運行環境，pnpm@9.15.5 包管理器
- **@clack/prompts** — 交互式 CLI 提示與流程引導
- **listr2** — 平行任務管理與進度展示（8 步部署）
- **Anthropic Claude API** — AI 技術棧分類與內容生成
- **GitHub API** — 倉庫偵測、代碼分析與 ECC 同步

## 架構要點

1. **Pipeline 設計** — Fetch → Per-repo AI 分類（並行、快取） → Taxonomy 查表（1373 套件） → 跨 repo 去重 → 決策執行
2. **三層快取策略** — Content-addressed AI 快取 + Awesome-* 分類索引 + ECC 來源 TTL 管理
3. **智能規則推薦** — 開發者畫像推斷 + ECC 規則即時匹配 + 決策審計鏈（JSONL）
4. **模組化部署** — Claude Code（commands/agents/rules/hooks）+ ZSH（10 模組）+ Slack 通知

## 開發規範

- **分支命名** — `<type>/<TICKET>-<short-desc>`（如 `feat/SETUP-100-add-cache`）
- **Commit 格式** — Conventional Commits，changeset 管理版本
- **發布流程** — `pnpm run release` 自動打 tag、commit 並推送

## 常用指令

```bash
pnpm run setup        # 互動式完整安裝與部署
pnpm run scan         # 技術棧掃描 + 技能庫生成
pnpm run doctor       # 環境診斷與依賴檢查
pnpm run status       # 配置健康狀態檢查
pnpm run restore      # 備份還原（互動式選版本）
pnpm run taxonomy:build # 重建套件分類索引
```
